import type { AnimConfig, KeyframeBlock, TrackKeyframe, Tracks, EasingName, PropertyChange } from '../types/animation';
import type { Node } from '../types/node';
import { computeLayoutPlacements, registerStrategy, getStrategy } from '../layout/registry';
import { flexStrategy } from '../layout/flex';
import { absoluteStrategy } from '../layout/absolute';

// Ensure layout strategies are available for slot expansion
function ensureStrategies(): void {
  if (!getStrategy('flex')) registerStrategy('flex', flexStrategy);
  if (!getStrategy('absolute')) registerStrategy('absolute', absoluteStrategy);
}

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
interface SlotState {
  moverX: number;
  moverY: number;
  containerSizes: Map<string, { w: number; h: number }>;
}

function computeSlotState(
  nodes: Node[],
  nodeId: string,
  slotValue: string,
): SlotState | null {
  ensureStrategies();
  const cloned = cloneWithSlot(nodes, nodeId, slotValue);
  const placements = computeLayoutPlacements(cloned);
  const moverPlacement = placements.find(r => r.nodeId === nodeId);
  if (!moverPlacement) return null;

  // Compute content sizes for containers that have slot members
  const containerSizes = new Map<string, { w: number; h: number }>();
  const containerIds = new Set<string>();
  for (const n of cloned) {
    if (n.layout) containerIds.add(n.id);
  }

  for (const cId of containerIds) {
    // Count members in this container
    const members = cloned.filter(n => n.slot === cId);
    const directChildren = cloned.find(n => n.id === cId)?.children ?? [];
    const allMembers = [...directChildren, ...members];
    if (allMembers.length === 0) continue;

    const container = cloned.find(n => n.id === cId);
    if (!container?.layout) continue;

    const isRow = (container.layout.direction ?? 'column') === 'row';
    const gap = container.layout.gap ?? 0;
    const padding = container.layout.padding ?? 0;

    // Compute content extent
    let totalMain = 0;
    let maxCross = 0;
    for (const m of allMembers) {
      const mw = m.rect?.w ?? m.size?.w ?? 0;
      const mh = m.rect?.h ?? m.size?.h ?? 0;
      const mainSize = isRow ? mw : mh;
      const crossSize = isRow ? mh : mw;
      totalMain += mainSize;
      maxCross = Math.max(maxCross, crossSize);
    }
    totalMain += gap * Math.max(0, allMembers.length - 1);

    const contentW = isRow ? totalMain + padding * 2 : maxCross + padding * 2;
    const contentH = isRow ? maxCross + padding * 2 : totalMain + padding * 2;

    containerSizes.set(cId, { w: contentW, h: contentH });
  }

  return {
    moverX: moverPlacement.targetX,
    moverY: moverPlacement.targetY,
    containerSizes,
  };
}

export interface TimelineResult {
  tracks: Tracks;
  animatedSlotNodeIds: Set<string>;
}

export function buildTimeline(config: AnimConfig, nodes?: Node[]): TimelineResult {
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
  const animatedSlotNodeIds = new Set<string>();

  if (nodes) {
    const slotTracks: string[] = [];
    for (const [path] of tracks) {
      if (path.endsWith('.slot')) {
        slotTracks.push(path);
      }
    }

    // Track container size keyframes to generate
    const containerSizeTracks = new Map<string, { wTrack: TrackKeyframe[]; hTrack: TrackKeyframe[] }>();

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
        const state = computeSlotState(nodes, nodeId, slotValue);
        if (state) {
          xTrack.push({ time: kf.time, value: state.moverX, easing: kf.easing });
          yTrack.push({ time: kf.time, value: state.moverY, easing: kf.easing });

          // Generate container size keyframes for ALL containers that have layouts
          // (not just ones with current members — empty containers need size too)
          for (const n of nodes) {
            if (!n.layout) continue;
            const size = state.containerSizes.get(n.id);
            const cId = n.id;
            if (!containerSizeTracks.has(cId)) {
              containerSizeTracks.set(cId, { wTrack: [], hTrack: [] });
            }
            const ct = containerSizeTracks.get(cId)!;
            if (!ct.hTrack.some(k => k.time === kf.time)) {
              if (size) {
                ct.wTrack.push({ time: kf.time, value: size.w, easing: kf.easing });
                ct.hTrack.push({ time: kf.time, value: size.h, easing: kf.easing });
              } else {
                // Empty container — use its original rect size or minimum
                const origW = n.rect?.w ?? 0;
                const origH = n.rect?.h ?? 0;
                ct.wTrack.push({ time: kf.time, value: origW, easing: kf.easing });
                ct.hTrack.push({ time: kf.time, value: origH, easing: kf.easing });
              }
            }
          }
        }
      }

      xTrack.sort((a, b) => a.time - b.time);
      yTrack.sort((a, b) => a.time - b.time);

      tracks.delete(slotPath);
      animatedSlotNodeIds.add(nodeId);
    }

    // Apply container size tracks
    for (const [cId, ct] of containerSizeTracks) {
      const wPath = `${cId}.rect.h`;  // height changes for column layout
      const hPath = `${cId}.rect.w`;  // width for row layout — but we generate both
      // Actually just generate rect.w and rect.h for each container
      const rectWPath = `${cId}.rect.w`;
      const rectHPath = `${cId}.rect.h`;

      if (!tracks.has(rectWPath)) tracks.set(rectWPath, []);
      if (!tracks.has(rectHPath)) tracks.set(rectHPath, []);

      const wTrack = tracks.get(rectWPath)!;
      const hTrack = tracks.get(rectHPath)!;

      for (const kf of ct.wTrack) wTrack.push(kf);
      for (const kf of ct.hTrack) hTrack.push(kf);

      wTrack.sort((a, b) => a.time - b.time);
      hTrack.sort((a, b) => a.time - b.time);
    }
  }

  return { tracks, animatedSlotNodeIds };
}
