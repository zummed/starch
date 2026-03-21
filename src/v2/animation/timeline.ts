import type { AnimConfig, KeyframeBlock, TrackKeyframe, Tracks, EasingName, PropertyChange } from '../types/animation';
import type { Node } from '../types/node';
import { computeLayoutPlacements, type LayoutResult } from '../layout/registry';

function isPropertyChange(value: unknown): value is PropertyChange {
  return typeof value === 'object' && value !== null && 'value' in value;
}

function isSubObjectShorthand(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !isPropertyChange(value) && !Array.isArray(value);
}

function expandChanges(
  changes: Record<string, unknown>,
  blockEasing: EasingName,
): Array<{ path: string; value: unknown; easing: EasingName }> {
  const result: Array<{ path: string; value: unknown; easing: EasingName }> = [];

  for (const [path, raw] of Object.entries(changes)) {
    if (isPropertyChange(raw)) {
      result.push({ path, value: raw.value, easing: raw.easing ?? blockEasing });
    } else if (isSubObjectShorthand(raw)) {
      const obj = raw as Record<string, unknown>;
      for (const [key, val] of Object.entries(obj)) {
        if (isPropertyChange(val)) {
          result.push({ path: `${path}.${key}`, value: val.value, easing: val.easing ?? blockEasing });
        } else {
          result.push({ path: `${path}.${key}`, value: val, easing: blockEasing });
        }
      }
    } else {
      result.push({ path, value: raw, easing: blockEasing });
    }
  }
  return result;
}

/**
 * Clone nodes and set a specific slot value on a node.
 */
function cloneWithSlot(nodes: Node[], nodeId: string, slotValue: string): Node[] {
  function cloneNode(n: Node): Node {
    const clone = { ...n, children: n.children.map(cloneNode) };
    if (clone.id === nodeId) {
      clone.slot = slotValue;
    }
    return clone;
  }
  return nodes.map(cloneNode);
}

/**
 * Find a node's layout position for a given slot assignment.
 */
function computeSlotPosition(
  nodes: Node[],
  nodeId: string,
  slotValue: string,
): { x: number; y: number } | null {
  const cloned = cloneWithSlot(nodes, nodeId, slotValue);
  const placements = computeLayoutPlacements(cloned);
  const p = placements.find(r => r.nodeId === nodeId);
  if (!p) return null;
  return { x: p.targetX, y: p.targetY };
}

export function buildTimeline(config: AnimConfig, nodes?: Node[]): Tracks {
  const tracks: Tracks = new Map();
  const globalEasing: EasingName = config.easing ?? 'linear';
  const autoKey = config.autoKey ?? true;

  // Resolve absolute times for all blocks
  const resolvedBlocks: Array<{ time: number; block: KeyframeBlock }> = [];
  let prevTime = 0;
  for (const block of config.keyframes) {
    let time = block.time;
    if (block.plus !== undefined) {
      time = prevTime + block.plus;
    }
    resolvedBlocks.push({ time, block });
    prevTime = time + (block.delay ?? 0);
  }

  // Track all paths seen per block for autoKey
  const allPathsPerBlock: Array<Set<string>> = [];

  // Process each block
  for (const { time: baseTime, block } of resolvedBlocks) {
    const blockEasing = block.easing ?? globalEasing;
    const entries = expandChanges(block.changes, blockEasing);
    const pathsInBlock = new Set<string>();

    for (const { path, value, easing } of entries) {
      pathsInBlock.add(path);

      if (!tracks.has(path)) {
        tracks.set(path, []);
      }
      const track = tracks.get(path)!;

      if (block.delay && block.delay > 0) {
        const lastValue = track.length > 0 ? track[track.length - 1].value : value;
        track.push({ time: baseTime, value: lastValue, easing });
        track.push({ time: baseTime + block.delay, value, easing });
      } else {
        track.push({ time: baseTime, value, easing });
      }
    }

    allPathsPerBlock.push(pathsInBlock);
  }

  // AutoKey: insert hold keyframes for tracks not mentioned in a block
  if (autoKey) {
    for (const [trackPath, keyframes] of tracks) {
      for (let i = 0; i < resolvedBlocks.length; i++) {
        const { time: blockTime } = resolvedBlocks[i];
        const blockAutoKey = resolvedBlocks[i].block.autoKey ?? autoKey;
        if (!blockAutoKey) continue;

        const pathsInBlock = allPathsPerBlock[i];
        if (!pathsInBlock.has(trackPath)) {
          const prevKf = keyframes.filter(kf => kf.time < blockTime).pop();
          if (prevKf && !keyframes.some(kf => kf.time === blockTime)) {
            keyframes.push({
              time: blockTime,
              value: prevKf.value,
              easing: prevKf.easing,
            });
          }
        }
      }
      keyframes.sort((a, b) => a.time - b.time);
    }
  }

  // Expand slot tracks into transform.x/y tracks
  if (nodes) {
    const slotTracks: string[] = [];
    for (const [path] of tracks) {
      if (path.endsWith('.slot')) {
        slotTracks.push(path);
      }
    }

    for (const slotPath of slotTracks) {
      const nodeId = slotPath.replace(/\.slot$/, '');
      const slotKeyframes = tracks.get(slotPath)!;

      const xPath = `${nodeId}.transform.x`;
      const yPath = `${nodeId}.transform.y`;

      if (!tracks.has(xPath)) tracks.set(xPath, []);
      if (!tracks.has(yPath)) tracks.set(yPath, []);

      const xTrack = tracks.get(xPath)!;
      const yTrack = tracks.get(yPath)!;

      for (const kf of slotKeyframes) {
        const slotValue = kf.value as string;
        const pos = computeSlotPosition(nodes, nodeId, slotValue);
        if (pos) {
          xTrack.push({ time: kf.time, value: pos.x, easing: kf.easing });
          yTrack.push({ time: kf.time, value: pos.y, easing: kf.easing });
        }
      }

      // Sort the generated tracks
      xTrack.sort((a, b) => a.time - b.time);
      yTrack.sort((a, b) => a.time - b.time);

      // Remove the slot track — it's been expanded
      tracks.delete(slotPath);
    }
  }

  return tracks;
}
