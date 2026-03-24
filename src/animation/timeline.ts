import { z } from 'zod';
import type { AnimConfig, KeyframeBlock, TrackKeyframe, Tracks, EasingName, PropertyChange } from '../types/animation';
import type { Node } from '../types/node';
import { computeLayoutPlacements, registerStrategy, getStrategy } from '../layout/registry';
import { flexStrategy } from '../layout/flex';
import { absoluteStrategy } from '../layout/absolute';
import { evaluateAllTracks } from './evaluator';
import { applyTrackValues } from './applyTracks';
import { resolveCameraView } from './cameraExpansion';
import { isColor } from '../types/color';
import { getPropertySchema } from '../types/schemaRegistry';

// Ensure layout strategies are available for slot expansion
function ensureStrategies(): void {
  if (!getStrategy('flex')) registerStrategy('flex', flexStrategy);
  if (!getStrategy('absolute')) registerStrategy('absolute', absoluteStrategy);
}

function isPropertyChange(value: unknown): value is PropertyChange {
  return typeof value === 'object' && value !== null && 'value' in value;
}

function isSubObjectShorthand(value: unknown): boolean {
  return typeof value === 'object' && value !== null
    && !isPropertyChange(value) && !Array.isArray(value)
    && !isColor(value);
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
    // Deep-clone mutable geometry so layout auto-sizing doesn't leak back to originals
    if (clone.rect) clone.rect = { ...clone.rect };
    if (clone.id === nodeId) {
      clone.layout = { ...clone.layout, slot: slotValue };
    }
    return clone;
  }
  return nodes.map(cloneNode);
}

/**
 * Compute layout state for a given slot assignment.
 * Returns the mover's position and all container sizes (after auto-sizing).
 */
interface SlotLayoutState {
  x: number;
  y: number;
  containerSizes: Map<string, { w: number; h: number }>;
}

function computeSlotLayoutState(
  nodes: Node[],
  nodeId: string,
  slotValue: string,
): SlotLayoutState | null {
  ensureStrategies();
  const cloned = cloneWithSlot(nodes, nodeId, slotValue);
  const placements = computeLayoutPlacements(cloned);
  const p = placements.find(r => r.nodeId === nodeId);
  if (!p) return null;

  // Read auto-sized container dimensions from the cloned tree
  const containerSizes = new Map<string, { w: number; h: number }>();
  for (const n of cloned) {
    if (n.layout?.type && n.rect) {
      containerSizes.set(n.id, { w: n.rect.w, h: n.rect.h });
    }
  }

  return { x: p.targetX, y: p.targetY, containerSizes };
}

function getInitialValue(nodes: Node[], trackPath: string): unknown {
  const segments = trackPath.split('.');
  let current: Node | undefined;
  let propStart = 0;

  for (let i = 0; i < segments.length; i++) {
    if (i === 0) {
      current = nodes.find(n => n.id === segments[0]);
      propStart = 1;
      continue;
    }
    if (current) {
      const child = current.children.find(c => c.id === segments[i]);
      if (child) {
        current = child;
        propStart = i + 1;
      } else {
        break;
      }
    }
  }

  if (!current) return undefined;

  let value: unknown = current;
  for (let i = propStart; i < segments.length; i++) {
    if (value && typeof value === 'object') {
      value = (value as any)[segments[i]];
    } else {
      return undefined;
    }
  }
  return value;
}

/**
 * Look up the Zod schema default for a track path.
 * Track paths are like "box.transform.rotation" — strip the node ID prefix(es)
 * to get the schema path "transform.rotation", then check for a Zod .default().
 */
function getSchemaDefault(trackPath: string): unknown {
  const segments = trackPath.split('.');

  // Try progressively longer node-ID prefixes: the property path starts after the node ID(s).
  for (let i = 1; i < segments.length; i++) {
    const schemaPath = segments.slice(i).join('.');
    const schema = getPropertySchema(schemaPath);
    if (schema) {
      // Unwrap Optional → Default chain
      let s: z.ZodType = schema;
      if (s instanceof z.ZodOptional) {
        s = (s as any)._def.innerType;
      }
      if (s instanceof z.ZodDefault) {
        const dv = (s as any)._def.defaultValue;
        return typeof dv === 'function' ? dv() : dv;
      }
      return undefined;
    }
  }
  return undefined;
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

  // Prepend initial-value keyframes for tracks that don't start at time 0
  if (nodes) {
    for (const [path, keyframes] of tracks) {
      if (keyframes.length > 0 && keyframes[0].time > 0) {
        let initial = getInitialValue(nodes, path);
        // If property doesn't exist on node, look up Zod schema default
        if (initial === undefined) {
          initial = getSchemaDefault(path);
        }
        if (initial !== undefined) {
          keyframes.unshift({ time: 0, value: initial, easing: 'linear' });
        }
      }
    }
  }

  // Expand slot tracks into transform.x/y tracks
  const animatedSlotNodeIds = new Set<string>();

  if (nodes) {
    const slotTracks: string[] = [];
    for (const [path] of tracks) {
      if (path.endsWith('.layout.slot')) {
        slotTracks.push(path);
      }
    }

    // Collect container size keyframes across all slot tracks
    const containerSizeKfs = new Map<string, { wKfs: TrackKeyframe[]; hKfs: TrackKeyframe[] }>();

    for (const slotPath of slotTracks) {
      const nodeId = slotPath.replace(/\.layout\.slot$/, '');
      const slotKeyframes = tracks.get(slotPath)!;

      const xPath = `${nodeId}.transform.x`;
      const yPath = `${nodeId}.transform.y`;

      if (!tracks.has(xPath)) tracks.set(xPath, []);
      if (!tracks.has(yPath)) tracks.set(yPath, []);

      const xTrack = tracks.get(xPath)!;
      const yTrack = tracks.get(yPath)!;

      for (const kf of slotKeyframes) {
        const slotValue = kf.value as string;
        const state = computeSlotLayoutState(nodes, nodeId, slotValue);
        if (state) {
          xTrack.push({ time: kf.time, value: state.x, easing: kf.easing });
          yTrack.push({ time: kf.time, value: state.y, easing: kf.easing });

          // Record container sizes at this keyframe time
          for (const [cId, size] of state.containerSizes) {
            if (!containerSizeKfs.has(cId)) {
              containerSizeKfs.set(cId, { wKfs: [], hKfs: [] });
            }
            const entry = containerSizeKfs.get(cId)!;
            entry.wKfs.push({ time: kf.time, value: size.w, easing: kf.easing });
            entry.hKfs.push({ time: kf.time, value: size.h, easing: kf.easing });
          }
        }
      }

      xTrack.sort((a, b) => a.time - b.time);
      yTrack.sort((a, b) => a.time - b.time);

      // Keep slot track (membership updates at render time for container sizing)
      animatedSlotNodeIds.add(nodeId);
    }

    // Emit container size tracks
    for (const [cId, { wKfs, hKfs }] of containerSizeKfs) {
      const wPath = `${cId}.rect.w`;
      const hPath = `${cId}.rect.h`;
      if (!tracks.has(wPath)) tracks.set(wPath, wKfs);
      if (!tracks.has(hPath)) tracks.set(hPath, hKfs);
    }
  }

  // ── Camera track expansion (second pass) ──────────────────────────
  // Camera settings resolve into rect + transform tracks. This runs after
  // all other tracks are built so we can evaluate node positions at each
  // keyframe time.
  if (nodes) {
    const cameraNodes = nodes.filter(n => n.camera);
    if (cameraNodes.length > 0) {
      const defaultVB = { x: 0, y: 0, w: 800, h: 600 };

      // Collect all unique keyframe times across the entire timeline
      const globalTimes = new Set<number>();
      for (const [, kfs] of tracks) {
        for (const kf of kfs) globalTimes.add(kf.time);
      }
      // Always include t=0 so static cameras get a rect
      globalTimes.add(0);

      for (const camNode of cameraNodes) {
        const camPrefix = `${camNode.id}.camera.`;
        const hasCamTracks = [...tracks.keys()].some(k => k.startsWith(camPrefix));
        if (!hasCamTracks && !camNode.camera) continue;

        const camTrackEntries = [...tracks.entries()].filter(([k]) => k.startsWith(camPrefix));

        // Use camera track times when available, otherwise use all keyframe
        // times so the camera re-evaluates when referenced nodes move
        // (e.g. camera following a moving target)
        const allTimes = hasCamTracks
          ? new Set(camTrackEntries.flatMap(([, kfs]) => kfs.map(kf => kf.time)))
          : globalTimes;
        const sortedTimes = [...allTimes].sort((a, b) => a - b);

        const xPath = `${camNode.id}.transform.x`;
        const yPath = `${camNode.id}.transform.y`;
        const wPath = `${camNode.id}.rect.w`;
        const hPath = `${camNode.id}.rect.h`;

        const xKfs: TrackKeyframe[] = [];
        const yKfs: TrackKeyframe[] = [];
        const wKfs: TrackKeyframe[] = [];
        const hKfs: TrackKeyframe[] = [];

        for (const time of sortedTimes) {
          // Evaluate all tracks at this time to get animated node positions
          const values = evaluateAllTracks(tracks, time);
          const animated = applyTrackValues(nodes, values);

          // Find the camera node in the animated tree and resolve its view
          const animatedCam = animated.find(n => n.id === camNode.id);
          if (!animatedCam) continue;

          const view = resolveCameraView(animatedCam, animated, defaultVB);

          // Find the easing at this time from camera tracks
          let easing: EasingName = globalEasing;
          for (const [, kfs] of camTrackEntries) {
            const kf = kfs.find(k => Math.abs(k.time - time) < 0.001);
            if (kf) { easing = kf.easing; break; }
          }

          xKfs.push({ time, value: view.x, easing });
          yKfs.push({ time, value: view.y, easing });
          wKfs.push({ time, value: view.w, easing });
          hKfs.push({ time, value: view.h, easing });
        }

        // Write camera-derived tracks. These overwrite any manually authored
        // cam.transform.x/y or cam.rect.w/h tracks — camera nodes' rect and
        // position are fully managed by the camera system.
        if (xKfs.length > 0) {
          tracks.set(xPath, xKfs);
          tracks.set(yPath, yKfs);
          tracks.set(wPath, wKfs);
          tracks.set(hPath, hKfs);
        }
      }
    }
  }

  return { tracks, animatedSlotNodeIds };
}
