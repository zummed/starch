import type { AnimConfig, KeyframeBlock, TrackKeyframe, Tracks, EasingName, PropertyChange } from '../types/animation';
import type { Node } from '../types/node';
import { computeLayoutPlacements, applyLayoutPlacements, collectLayoutChildren, findNode, worldToParentLocal, type LayoutResult } from '../layout';
import { evaluateAllTracks } from './evaluator';
import { applyTrackValues, cloneNodeTree, resolveTrackPath, getAtPropPath } from './applyTracks';
import { resolveCameraView } from './cameraExpansion';
import { isColor } from '../types/color';
import { getPropertySchema, getSchemaDefault as getZodDefault } from '../types/schemaRegistry';
import { measureTextNodes } from '../text/measurePass';
import { getTextMeasurer } from '../text/measure';

function isPropertyChange(value: unknown): value is PropertyChange {
  return typeof value === 'object' && value !== null && 'value' in value;
}

/** True for any `camera.look` shape that names node ids ('all', a single id, string[], or [id,dx,dy]) rather than plain [x,y] coordinates. */
function lookReferencesNodes(look: unknown): boolean {
  if (look === 'all' || typeof look === 'string') return true;
  if (Array.isArray(look)) return look.length > 0 && typeof look[0] !== 'number';
  return false;
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

/** Read a node tree's current value at a track path (undefined if unresolvable). */
function getInitialValue(nodes: Node[], trackPath: string): unknown {
  const resolved = resolveTrackPath(nodes, trackPath);
  return resolved ? getAtPropPath(resolved.node, resolved.propPath) : undefined;
}

/**
 * Look up the Zod schema default for a track path's property — but only
 * once the path's node prefix actually resolves to a real node (an
 * unresolvable path like a bare nested id must not silently fall back to
 * whatever schema field name happens to match the tail segment).
 */
function getSchemaDefault(nodes: Node[], trackPath: string): unknown {
  const resolved = resolveTrackPath(nodes, trackPath);
  if (!resolved) return undefined;
  const schema = getPropertySchema(resolved.propPath.join('.'));
  return schema ? getZodDefault(schema) : undefined;
}

export interface TimelineResult {
  tracks: Tracks;
  /**
   * Deep clone of the input tree with the static base layout solve
   * applied — every downstream frame is `applyTrackValues(baseNodes,
   * values)`, never the raw input, so the parser/editor tree (round-trip
   * emitters read it) keeps only authored values. Empty when `nodes` isn't
   * provided.
   */
  baseNodes: Node[];
  /** All node ids with system-emitted layout tracks (slot expansion) — render-time layout must skip these. */
  layoutAnimatedNodeIds: Set<string>;
  warnings: string[];
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
        // Pre-delay hold: the value the track was actually at when this
        // block starts. Pick the most recent keyframe by TIME (not array
        // position — nothing enforces blocks being pushed in time order),
        // and when this is the track's first-ever mention, fall back to
        // the node's real initial value instead of the block's own target
        // — otherwise the hold and the target are identical and the
        // "transition" silently happens before baseTime instead of during
        // the delay window.
        let lastValue: unknown;
        if (track.length > 0) {
          lastValue = track.reduce((latest, kf) => (kf.time > latest.time ? kf : latest)).value;
        } else if (nodes) {
          const initial = getInitialValue(nodes, path);
          lastValue = initial !== undefined ? initial : getSchemaDefault(nodes, path);
        }
        if (lastValue === undefined) lastValue = value;
        track.push({ time: baseTime, value: lastValue, easing });
        track.push({ time: baseTime + block.delay, value, easing });
      } else {
        track.push({ time: baseTime, value, easing });
      }
    }

    allPathsPerBlock.push(pathsInBlock);
  }

  // Warn about track paths that don't resolve to a real node. Styles,
  // cameras, and template internals are all ordinary nodes in the tree, so
  // a path that fails here is genuinely unaddressable — e.g. a bare
  // nested id like "n1.opacity" instead of "ring.n1.opacity".
  const warnings: string[] = [];
  if (nodes) {
    for (const path of tracks.keys()) {
      if (!resolveTrackPath(nodes, path)) {
        warnings.push(`Unknown animation target "${path}"`);
      }
    }
  }

  // Prepend initial-value keyframes for tracks that don't start at time 0.
  // Runs BEFORE autoKey (below) so hold keyframes inserted at intervening
  // block times see the track's true starting value instead of having
  // nothing to hold and leaving a gap that later lerps straight from t=0.
  if (nodes) {
    for (const [path, keyframes] of tracks) {
      if (keyframes.length > 0 && keyframes[0].time > 0) {
        let initial = getInitialValue(nodes, path);
        // If property doesn't exist on node, look up Zod schema default
        if (initial === undefined) {
          initial = getSchemaDefault(nodes, path);
        }
        if (initial !== undefined) {
          keyframes.unshift({ time: 0, value: initial, easing: 'linear' });
        }
      }
    }
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
          // Pick the previous keyframe by max TIME, not array position —
          // same rationale as the delay-hold fix above: nothing enforces
          // blocks being pushed in time order.
          const priorKfs = keyframes.filter(kf => kf.time < blockTime);
          const prevKf = priorKfs.length > 0
            ? priorKfs.reduce((latest, kf) => (kf.time > latest.time ? kf : latest))
            : undefined;
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

  // ── Base layout solve ───────────────────────────────────────────────
  // A deep clone, not a mutation of `nodes`: the parser/editor tree must
  // keep only authored values (round-trip emitters read it). Every
  // downstream pass (layout track expansion, camera expansion, and the
  // caller's per-frame render) evaluates against this solved tree instead.
  let baseNodes: Node[] = [];
  const layoutAnimatedNodeIds = new Set<string>();
  if (nodes) {
    baseNodes = cloneNodeTree(nodes);
    measureTextNodes(baseNodes, getTextMeasurer());
    const basePlacements = computeLayoutPlacements(baseNodes);
    applyLayoutPlacements(baseNodes, basePlacements);

    // ── Layout track expansion: whole-scene solve per affected time ────
    expandLayoutTracks(tracks, baseNodes, nodes, globalEasing, layoutAnimatedNodeIds);

    // Render-time layout used to run every frame, silently clobbering any
    // authored transform.x/y on a node the base solve actually placed
    // (`layout absolute` deliberately places nothing, so its children are
    // exempt). With layout gone from the render path those tracks would
    // start winning — replace-authored policy instead (same as camera/
    // layout expansion above): drop the track and say why. Nodes already
    // covered by system-emitted layout tracks are exempt — those already
    // replaced whatever was authored.
    const placedIds = new Set(basePlacements.map(p => p.nodeId));
    const containerOf = collectLayoutContainerOf(baseNodes, placedIds);
    for (const path of [...tracks.keys()]) {
      const resolved = resolveTrackPath(baseNodes, path);
      if (!resolved) continue;
      const info = containerOf.get(resolved.node.id);
      if (!info || layoutAnimatedNodeIds.has(resolved.node.id)) continue;
      const propJoined = resolved.propPath.join('.');
      if (propJoined !== 'transform.x' && propJoined !== 'transform.y') continue;
      tracks.delete(path);
      warnings.push(`Track "${path}" has no effect — "${resolved.node.id}" is positioned by the "${info.type}" layout of "${info.containerId}"`);
    }
  }

  // ── Camera track expansion (second pass) ──────────────────────────
  // Camera settings resolve into rect + transform tracks. This runs after
  // all other tracks are built so we can evaluate node positions at each
  // keyframe time.
  if (nodes) {
    const cameraNodes = baseNodes.filter(n => n.camera);
    if (cameraNodes.length > 0) {
      const defaultVB = { x: 0, y: 0, w: 800, h: 600 };

      // Collect all unique keyframe times across the entire timeline
      const globalTimes = new Set<number>();
      for (const [, kfs] of tracks) {
        for (const kf of kfs) globalTimes.add(kf.time);
      }
      // Always include t=0 so static cameras get a rect
      globalTimes.add(0);

      const warnedLookTargets = new Set<string>();

      for (const camNode of cameraNodes) {
        const camPrefix = `${camNode.id}.camera.`;
        const hasCamTracks = [...tracks.keys()].some(k => k.startsWith(camPrefix));
        if (!hasCamTracks && !camNode.camera) continue;

        const camTrackEntries = [...tracks.entries()].filter(([k]) => k.startsWith(camPrefix));

        // A camera that targets node ids (rather than plain coordinates)
        // must re-evaluate whenever ANY track moves, not just its own —
        // otherwise it only follows at its own keyframe times and drifts
        // off a target moving at other times (e.g. dense slot-expansion
        // tracks). Coordinate-only looks keep sampling at cam-track times.
        const lookTrack = tracks.get(`${camNode.id}.camera.look`);
        const followsNodes = lookReferencesNodes(camNode.camera?.look)
          || (lookTrack?.some(kf => lookReferencesNodes(kf.value)) ?? false);

        // Use camera track times when available, otherwise use all keyframe
        // times so the camera re-evaluates when referenced nodes move
        // (e.g. camera following a moving target). When the camera has its
        // own tracks AND follows node ids, union both — samples inserted
        // for follow-tracking (not an authored cam-track time) interpolate
        // linearly; authored cam-track times keep their looked-up easing.
        const camTimes = new Set(camTrackEntries.flatMap(([, kfs]) => kfs.map(kf => kf.time)));
        const allTimes = !hasCamTracks
          ? globalTimes
          : followsNodes
            ? new Set([...camTimes, ...globalTimes])
            : camTimes;
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
          const animated = applyTrackValues(baseNodes, values);

          // Find the camera node in the animated tree and resolve its view
          const animatedCam = animated.find(n => n.id === camNode.id);
          if (!animatedCam) continue;

          const view = resolveCameraView(animatedCam, animated, defaultVB);

          if (view.unresolvedLookId) {
            const warnKey = `${camNode.id} ${view.unresolvedLookId}`;
            if (!warnedLookTargets.has(warnKey)) {
              warnedLookTargets.add(warnKey);
              warnings.push(`camera "${camNode.id}" look target "${view.unresolvedLookId}" not found`);
            }
          }

          // Easing at this time: the authored cam-track keyframe's easing
          // when this time is one (default globalEasing when the camera has
          // no tracks at all); a densified follow-sample time — present only
          // because the union pulled in some other track's keyframe — has no
          // authored cam-track keyframe to look up, so it stays 'linear'.
          let easing: EasingName = hasCamTracks ? 'linear' : globalEasing;
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

  return { tracks, baseNodes, layoutAnimatedNodeIds, warnings };
}

const LAYOUT_TRIGGER_LEAF_PATHS = new Set(['rect.w', 'rect.h', 'ellipse.rx', 'ellipse.ry', 'text.content']);

/**
 * A track path is layout-relevant when it targets any `layout.*` property
 * (including `layout.slot`) or one of the geometry/content properties a
 * layout solve reads as a child's intrinsic size.
 */
function isLayoutTriggerPath(propPath: string[]): boolean {
  if (propPath[0] === 'layout') return true;
  return LAYOUT_TRIGGER_LEAF_PATHS.has(propPath.join('.'));
}

/** Every node's root-qualified dot path — the id chain resolveTrackPath expects. */
function buildQualifiedPathIndex(roots: Node[]): Map<string, string> {
  const index = new Map<string, string>();
  function walk(nodeList: Node[], prefix: string): void {
    for (const node of nodeList) {
      const path = prefix ? `${prefix}.${node.id}` : node.id;
      index.set(node.id, path);
      walk(node.children, path);
    }
  }
  walk(roots, '');
  return index;
}

/**
 * Every node id that participates in some container's layout flow: the
 * container itself, or one of its layout children (collectLayoutChildren —
 * structural children not skip-excluded, plus slot members declared
 * anywhere in the tree).
 */
function collectLayoutRelevantNodeIds(roots: Node[]): Set<string> {
  const ids = new Set<string>();
  function walk(nodeList: Node[]): void {
    for (const node of nodeList) {
      if (node.layout?.type) {
        ids.add(node.id);
        const { children } = collectLayoutChildren(node, roots);
        for (const c of children) ids.add(c.id);
      }
      walk(node.children);
    }
  }
  walk(roots);
  return ids;
}

/**
 * For every node actually placed by a layout solve, which container placed
 * it and with what strategy — used to explain a dropped authored position
 * track. Not the same set as collectLayoutRelevantNodeIds: a structural
 * layout child under `layout absolute` never receives a placement (the
 * strategy deliberately emits none), so it's absent here even though it's
 * layout-relevant for track-expansion triggering.
 */
function collectLayoutContainerOf(roots: Node[], placedIds: Set<string>): Map<string, { containerId: string; type: string }> {
  const map = new Map<string, { containerId: string; type: string }>();
  function walk(nodeList: Node[]): void {
    for (const node of nodeList) {
      if (node.layout?.type) {
        const { children } = collectLayoutChildren(node, roots);
        for (const c of children) {
          if (placedIds.has(c.id)) map.set(c.id, { containerId: node.id, type: node.layout.type! });
        }
      }
      walk(node.children);
    }
  }
  walk(roots);
  return map;
}

/**
 * Expand layout-relevant tracks (`layout.slot`, any other `layout.*` prop,
 * or a geometry/content property a layout solve reads as intrinsic child
 * size) into real x/y (and, for members whose size changes, rect/ellipse)
 * keyframes, plus container size keyframes for every layout container in
 * the tree — computed by running a full layout solve of the WHOLE scene at
 * every time any layout-relevant track changes. Solving the whole scene
 * together (rather than one mover at a time) is what fixes two movers
 * landing on the same grid cell, siblings snapping instead of reflowing,
 * and container auto-sizes that don't account for every mover present at
 * that moment.
 */
function expandLayoutTracks(
  tracks: Tracks,
  baseNodes: Node[],
  authoredNodes: Node[],
  globalEasing: EasingName,
  layoutAnimatedNodeIds: Set<string>,
): void {
  // Synthesized track paths must be root-qualified (resolveTrackPath only
  // matches a nested node once its full root-to-node id chain is walked —
  // see its docstring) — a bare node id only happens to work when the node
  // is itself a root, which every slot-animated sample so far has been.
  const qualifiedPathOf = buildQualifiedPathIndex(baseNodes);
  const qualify = (nodeId: string): string => qualifiedPathOf.get(nodeId) ?? nodeId;

  const relevantIds = collectLayoutRelevantNodeIds(baseNodes);
  const layoutPaths: string[] = [];
  const pathsByNodeId = new Map<string, string[]>();
  for (const path of tracks.keys()) {
    const resolved = resolveTrackPath(baseNodes, path);
    if (!resolved) continue;
    // `layout.slot` is always relevant regardless of base-tree
    // participation — it's how a free node (not yet any container's
    // layout child at t=0) JOINS a container's layout in the first place,
    // so gating it on current participation would make that join
    // unreachable. Every other trigger kind requires the node to already
    // participate: an isolated node's rect.w animating shouldn't force a
    // whole-scene layout solve.
    const isSlotPath = resolved.propPath.join('.') === 'layout.slot';
    if (!isSlotPath) {
      if (!relevantIds.has(resolved.node.id)) continue;
      if (!isLayoutTriggerPath(resolved.propPath)) continue;
    }
    layoutPaths.push(path);
    const arr = pathsByNodeId.get(resolved.node.id) ?? [];
    arr.push(path);
    pathsByNodeId.set(resolved.node.id, arr);
  }
  if (layoutPaths.length === 0) return;

  // Per-time solves must start from every layout participant's AUTHORED
  // size, not the base-solved size baked into baseNodes: strategies treat a
  // non-zero rect as explicit (containers skip auto-sizing, children report
  // it as intrinsic size), so the t=0 solve's sizes would freeze in — a
  // flex column never expanding for a slot mover joining it, a grow child
  // keeping its t=0 distributed width forever.
  const solveBase = cloneNodeTree(baseNodes);
  restoreAuthoredContainerRects(solveBase, authoredNodes);

  // Affected times: every time any layout-relevant track changes, always
  // including 0.
  const timeSet = new Set<number>([0]);
  for (const path of layoutPaths) {
    for (const kf of tracks.get(path)!) timeSet.add(kf.time);
  }
  const affectedTimes = [...timeSet].sort((a, b) => a - b);

  // System-owned synthesized keyframes, keyed by full track path, collected
  // across every affected time then sorted before installing.
  const synthesized = new Map<string, TrackKeyframe[]>();
  const pushKf = (path: string, kf: TrackKeyframe): void => {
    let arr = synthesized.get(path);
    if (!arr) { arr = []; synthesized.set(path, arr); }
    arr.push(kf);
  };
  const trackEasingAt = (path: string, time: number): EasingName | undefined =>
    tracks.get(path)?.find(kf => kf.time === time)?.easing;
  const nodeLayoutEasingAt = (nodeId: string, time: number): EasingName | undefined => {
    for (const path of pathsByNodeId.get(nodeId) ?? []) {
      const e = trackEasingAt(path, time);
      if (e) return e;
    }
    return undefined;
  };

  // One sample per affected time, kept around for the dense resize pass
  // below — a node that resizes at only SOME affected times still needs a
  // size keyframe at every one of them, which means revisiting every
  // time's solved clone a second time once we know which nodes resize at all.
  const samples: Array<{ T: number; triggerEasing: EasingName; clone: Node[]; placements: LayoutResult[] }> = [];
  const resizedNodeIds = new Set<string>();

  for (const T of affectedTimes) {
    // Easing for this instant: the easing of the layout-relevant keyframe(s)
    // that triggered it (a node's own keyframe at T wins below, per-node).
    let triggerEasing: EasingName | undefined;
    for (const path of layoutPaths) {
      const e = trackEasingAt(path, T);
      if (e) { triggerEasing = e; break; }
    }
    triggerEasing = triggerEasing ?? globalEasing;

    const values = evaluateAllTracks(tracks, T);

    // Slot semantics: a node whose slot track hasn't started yet at T keeps
    // its AUTHORED slot (usually absent, i.e. free) instead of the clamped
    // first-keyframe value evaluateAllTracks would otherwise return — this
    // is what stops a free node from teleporting into its target container
    // before its own track actually begins.
    for (const path of layoutPaths) {
      if (!path.endsWith('.layout.slot')) continue;
      const kfs = tracks.get(path)!;
      if (kfs.length > 0 && kfs[0].time > T) {
        const resolved = resolveTrackPath(baseNodes, path);
        values.set(path, resolved ? getAtPropPath(resolved.node, resolved.propPath) : undefined);
      }
    }

    const clone = applyTrackValues(solveBase, values);
    // computeLayoutPlacements auto-sizes containers by mutating `rect` in
    // place; give every node a fresh rect object first so that mutation
    // can't leak back into the pristine tree shared across these solves.
    isolateContainerRects(clone);
    measureTextNodes(clone, getTextMeasurer());
    const placements = computeLayoutPlacements(clone);
    samples.push({ T, triggerEasing, clone, placements });

    for (const p of placements) {
      const nodeId = p.nodeId;
      const easing = nodeLayoutEasingAt(nodeId, T) ?? triggerEasing;
      const { x, y } = p.isSlotMember
        ? worldToParentLocal(clone, nodeId, p.targetX, p.targetY)
        : { x: p.targetX, y: p.targetY };

      pushKf(`${qualify(nodeId)}.transform.x`, { time: T, value: x, easing });
      pushKf(`${qualify(nodeId)}.transform.y`, { time: T, value: y, easing });
      layoutAnimatedNodeIds.add(nodeId);

      if (p.targetW !== undefined || p.targetH !== undefined) {
        resizedNodeIds.add(nodeId);
      }
    }

    for (const c of collectContainerSizes(clone)) {
      pushKf(`${qualify(c.id)}.rect.w`, { time: T, value: c.w, easing: triggerEasing });
      pushKf(`${qualify(c.id)}.rect.h`, { time: T, value: c.h, easing: triggerEasing });
      layoutAnimatedNodeIds.add(c.id);
    }
  }

  // Resize tracks need to be as dense as x/y: a node resized at only SOME
  // affected times (e.g. a fixed grid-cell size) but merely repositioned at
  // others (e.g. sitting at its intrinsic size in a flex container) still
  // gets a keyframe at every affected time — the solved target when this
  // time resized it, else its actual current size — so the gap holds
  // instead of lerping straight from its last resized size to its next one.
  if (resizedNodeIds.size > 0) {
    for (const { T, triggerEasing, clone, placements } of samples) {
      const placementByNode = new Map(placements.map(p => [p.nodeId, p]));
      for (const nodeId of resizedNodeIds) {
        const target = findNode(clone, nodeId);
        if (!target) continue;
        const p = placementByNode.get(nodeId);
        const easing = nodeLayoutEasingAt(nodeId, T) ?? triggerEasing;
        if (target.rect) {
          const w = p?.targetW !== undefined ? p.targetW : target.rect.w;
          const h = p?.targetH !== undefined ? p.targetH : target.rect.h;
          pushKf(`${qualify(nodeId)}.rect.w`, { time: T, value: w, easing });
          pushKf(`${qualify(nodeId)}.rect.h`, { time: T, value: h, easing });
        } else if (target.ellipse) {
          const rx = p?.targetW !== undefined ? p.targetW / 2 : target.ellipse.rx;
          const ry = p?.targetH !== undefined ? p.targetH / 2 : target.ellipse.ry;
          pushKf(`${qualify(nodeId)}.ellipse.rx`, { time: T, value: rx, easing });
          pushKf(`${qualify(nodeId)}.ellipse.ry`, { time: T, value: ry, easing });
        }
      }
    }
  }

  // Install: layout-managed tracks are system-owned and REPLACE any
  // authored track at the same path (same policy as camera expansion
  // above). A node whose first affected time is after t=0 (e.g. a free
  // node that only joins a container partway through) gets its authored
  // pre-join value prepended, so it holds/lerps from there instead of a
  // single keyframe snapping it into place for the whole timeline.
  for (const [path, kfs] of synthesized) {
    kfs.sort((a, b) => a.time - b.time);
    if (kfs[0].time > 0) {
      let initial = getInitialValue(baseNodes, path);
      if (initial === undefined) initial = getSchemaDefault(baseNodes, path);
      if (initial !== undefined) kfs.unshift({ time: 0, value: initial, easing: 'linear' });
    }
    tracks.set(path, kfs);
  }
}

/**
 * Reset every layout participant's rect in `solveBase` — containers AND
 * their layout children — to what the author actually wrote (deleted when
 * they wrote none), so each per-time solve re-derives sizes from scratch
 * exactly like the base solve did. Children matter as much as containers:
 * a grow child's distributed width or a grid member's cell size baked in
 * by the base solve would otherwise read as the child's intrinsic size in
 * every later solve. Text measurement re-runs per time, so a measured rect
 * a restore removes comes back before the solve reads it.
 */
function restoreAuthoredContainerRects(solveBase: Node[], authoredNodes: Node[]): void {
  const authoredById = new Map<string, Node>();
  function index(nodeList: Node[]): void {
    for (const node of nodeList) {
      authoredById.set(node.id, node);
      index(node.children);
    }
  }
  index(authoredNodes);

  const relevant = collectLayoutRelevantNodeIds(solveBase);
  function walk(nodeList: Node[]): void {
    for (const node of nodeList) {
      if (relevant.has(node.id)) {
        const authored = authoredById.get(node.id);
        if (authored?.rect) node.rect = { ...authored.rect };
        else if (authored) delete (node as { rect?: unknown }).rect;
      }
      walk(node.children);
    }
  }
  walk(solveBase);
}

function isolateContainerRects(nodes: Node[]): void {
  for (const n of nodes) {
    if (n.rect) n.rect = { ...n.rect };
    isolateContainerRects(n.children);
  }
}

function collectContainerSizes(nodes: Node[]): Array<{ id: string; w: number; h: number }> {
  const sizes: Array<{ id: string; w: number; h: number }> = [];
  function walk(n: Node): void {
    if (n.layout?.type && n.rect) sizes.push({ id: n.id, w: n.rect.w, h: n.rect.h });
    for (const c of n.children) walk(c);
  }
  for (const n of nodes) walk(n);
  return sizes;
}
