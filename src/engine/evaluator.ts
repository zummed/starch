import type { SceneObject, Tracks, Chapter, EffectInstance, EasingName } from '../core/types';
import { interpolate } from './interpolate';
import { applyEasing } from './easing';
import { computeLayout } from './layout';
import { applyEffects } from './effects';
import {
  quadPoint, autoCurveControl, splineEndpoint,
  catmullRomClosedPoint,
} from './bezier';

interface EvaluatorFn {
  (
    objects: Record<string, SceneObject>,
    tracks: Tracks,
    time: number,
  ): Record<string, Record<string, unknown>>;
  reset: () => void;
}

/**
 * Get sorted block times from tracks (unique keyframe times across all tracks).
 */
function getBlockTimes(tracks: Tracks): number[] {
  const times = new Set<number>();
  for (const keyframes of Object.values(tracks)) {
    for (const kf of keyframes) times.add(kf.time);
  }
  return [...times].sort((a, b) => a - b);
}

/**
 * Compute base props + animated values at a specific time (no layout/effects).
 */
function computePropsAt(
  objects: Record<string, SceneObject>,
  tracks: Tracks,
  time: number,
): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};
  for (const [id, obj] of Object.entries(objects)) {
    result[id] = { ...obj.props as Record<string, unknown> };
    // Create sub-element entries for textblock lines with defaults from parent
    if (obj.type === 'textblock') {
      const p = obj.props as Record<string, unknown>;
      const lines = p.lines as string[] | undefined;
      const lineDefaults = p._lineDefaults as Record<number, Record<string, unknown>> | undefined;
      if (lines) {
        for (let i = 0; i < lines.length; i++) {
          result[`${id}.line${i}`] = {
            text: lines[i],
            color: p.color,
            opacity: 1,
            bold: p.bold,
            size: p.size,
            ...(lineDefaults?.[i] || {}),
          };
        }
      }
    }
  }
  for (const [key, keyframes] of Object.entries(tracks)) {
    // Split at last dot: "snippet.line0.opacity" → target="snippet.line0", prop="opacity"
    const dotIdx = key.lastIndexOf('.');
    const target = key.slice(0, dotIdx);
    const prop = key.slice(dotIdx + 1);
    if (result[target] !== undefined) {
      const val = interpolate(keyframes, time);
      if (val !== undefined) result[target][prop] = val;
    }
  }
  return result;
}

/**
 * Create a stateless evaluator. Layout position changes are blended
 * between adjacent block times, so scrubbing and easing work correctly.
 */
export function createEvaluator(effects: EffectInstance[] = []): EvaluatorFn {
  let cachedBlockTimes: number[] | null = null;

  const evaluate = (
    objects: Record<string, SceneObject>,
    tracks: Tracks,
    time: number,
  ): Record<string, Record<string, unknown>> => {
    if (!cachedBlockTimes) {
      cachedBlockTimes = getBlockTimes(tracks);
    }

    // Step 1+2: Compute base props + animated values at current time
    const result = computePropsAt(objects, tracks, time);

    // Step 3: Layout with position blending
    // Find the block window we're in: [prevBlockTime, nextBlockTime]
    let prevBlock = 0;
    let nextBlock = cachedBlockTimes[cachedBlockTimes.length - 1] || 0;
    for (const bt of cachedBlockTimes) {
      if (bt <= time) prevBlock = bt;
      if (bt > time) { nextBlock = bt; break; }
    }

    const inTransition = time > prevBlock && time < nextBlock && prevBlock !== nextBlock;

    if (inTransition) {
      // Two-pass layout: compute positions at block boundaries, then blend.
      // "from" = layout at prevBlock, "to" = layout at nextBlock.
      // This gives smooth blending regardless of when discrete props snap.
      const fromResult = computePropsAt(objects, tracks, prevBlock);
      computeLayout(objects, fromResult);

      const toResult = computePropsAt(objects, tracks, nextBlock);
      computeLayout(objects, toResult);

      // Also compute layout at current time for non-grouped objects and container sizing
      computeLayout(objects, result);

      // Blend positions of all grouped objects between block boundary states
      const dur = nextBlock - prevBlock;
      const rawT = dur > 0 ? (time - prevBlock) / dur : 1;

      for (const [id] of Object.entries(objects)) {
        const fromProps = fromResult[id];
        const toProps = toResult[id];
        const currentProps = result[id];
        if (!fromProps || !toProps || !currentProps) continue;

        // Find per-object easing from its tracks at nextBlock
        let objEasing: EasingName = 'easeInOut';
        for (const [key, kfs] of Object.entries(tracks)) {
          if (!key.startsWith(id + '.')) continue;
          for (const kf of kfs) {
            if (Math.abs(kf.time - nextBlock) < 0.001 && kf.easing !== 'linear') {
              objEasing = kf.easing;
              break;
            }
          }
          if (objEasing !== 'easeInOut') break;
        }
        const t = applyEasing(rawT, objEasing);

        // Blend positions for grouped objects
        if (fromProps.group || toProps.group) {
          const fromX = fromProps.x as number;
          const fromY = fromProps.y as number;
          const toX = toProps.x as number;
          const toY = toProps.y as number;
          if (Math.abs(fromX - toX) > 0.01 || Math.abs(fromY - toY) > 0.01) {
            currentProps.x = fromX + (toX - fromX) * t;
            currentProps.y = fromY + (toY - fromY) * t;
          }
        }

        // Blend container sizes (_layoutW, _layoutH)
        if (fromProps.direction || toProps.direction) {
          const fromW = (fromProps._layoutW as number) || 0;
          const fromH = (fromProps._layoutH as number) || 0;
          const toW = (toProps._layoutW as number) || 0;
          const toH = (toProps._layoutH as number) || 0;
          if (Math.abs(fromW - toW) > 0.01) {
            currentProps._layoutW = fromW + (toW - fromW) * t;
          }
          if (Math.abs(fromH - toH) > 0.01) {
            currentProps._layoutH = fromH + (toH - fromH) * t;
          }
        }
      }
    } else {
      computeLayout(objects, result);
    }

    // Step 3c: Apply effects (after layout so shake offsets aren't overwritten)
    if (effects.length > 0) {
      applyEffects(effects, result, time);
    }

    // Step 4: Cascade parent transforms
    applyTransformCascade(objects, result);

    // Step 5: Resolve follow positions
    for (const id of Object.keys(objects)) {
      const props = result[id];
      const follow = props.follow as string | undefined;
      if (!follow || !objects[follow]) continue;
      const t = (props.pathProgress as number) ?? 0;
      const target = objects[follow];
      const tp = result[follow];
      const pos = resolveFollowPosition(target, tp, result, t);
      if (pos) {
        props.x = pos.x;
        props.y = pos.y;
      }
    }

    return result;
  };

  evaluate.reset = () => {
    cachedBlockTimes = null;
  };

  return evaluate;
}

/**
 * Apply parent opacity/scale/rotation to children based on cascade settings.
 */
function applyTransformCascade(
  objects: Record<string, SceneObject>,
  allProps: Record<string, Record<string, unknown>>,
): void {
  // Build parent map from group properties
  const parentMap = new Map<string, string>();
  for (const [id] of Object.entries(objects)) {
    const props = allProps[id];
    const groupId = props?.group as string | undefined;
    if (groupId && objects[groupId]) {
      parentMap.set(id, groupId);
    }
  }

  // For each child, apply parent transforms (walk up the chain)
  for (const [id] of Object.entries(objects)) {
    let parentId = parentMap.get(id);
    while (parentId) {
      const parentProps = allProps[parentId];
      if (!parentProps) break;

      const childProps = allProps[id];
      if (!childProps) break;

      // Opacity cascade
      const cascadeOpacity = (parentProps.cascadeOpacity as boolean) ?? true;
      if (cascadeOpacity) {
        const parentOpacity = (parentProps.opacity as number) ?? 1;
        const childOpacity = (childProps.opacity as number) ?? 1;
        childProps.opacity = parentOpacity * childOpacity;
      }

      // Scale cascade
      const cascadeScale = (parentProps.cascadeScale as boolean) ?? true;
      if (cascadeScale) {
        const parentScale = (parentProps.scale as number) ?? 1;
        if (parentScale !== 1) {
          const childScale = (childProps.scale as number) ?? 1;
          childProps.scale = parentScale * childScale;
          // Scale child position relative to parent origin
          const px = (parentProps.x as number) ?? 0;
          const py = (parentProps.y as number) ?? 0;
          const cx = (childProps.x as number) ?? 0;
          const cy = (childProps.y as number) ?? 0;
          childProps.x = px + (cx - px) * parentScale;
          childProps.y = py + (cy - py) * parentScale;
        }
      }

      // Rotation cascade
      const cascadeRotation = (parentProps.cascadeRotation as boolean) ?? true;
      if (cascadeRotation) {
        const parentRotation = (parentProps.rotation as number) ?? 0;
        if (parentRotation !== 0) {
          const childRotation = (childProps.rotation as number) ?? 0;
          childProps.rotation = parentRotation + childRotation;
          // Rotate child position around parent origin
          const px = (parentProps.x as number) ?? 0;
          const py = (parentProps.y as number) ?? 0;
          const cx = (childProps.x as number) ?? 0;
          const cy = (childProps.y as number) ?? 0;
          const rad = (parentRotation * Math.PI) / 180;
          const dx = cx - px;
          const dy = cy - py;
          childProps.x = px + dx * Math.cos(rad) - dy * Math.sin(rad);
          childProps.y = py + dx * Math.sin(rad) + dy * Math.cos(rad);
        }
      }

      // Inherit fill from parent when child fill is transparent/none
      const childFill = childProps.fill as string | undefined;
      if (childFill === 'transparent' || childFill === 'none') {
        const parentFill = parentProps.fill as string | undefined;
        if (parentFill && parentFill !== 'transparent' && parentFill !== 'none') {
          childProps.fill = parentFill;
        }
      }

      parentId = parentMap.get(parentId);
    }
  }
}

// ── Follow position resolution (unchanged from original) ──

function resolveFollowPosition(
  target: SceneObject,
  tp: Record<string, unknown>,
  allProps: Record<string, Record<string, unknown>>,
  t: number,
): { x: number; y: number } | null {
  if (target.type === 'path') {
    const pts = tp.points as Array<{ x: number; y: number }> | undefined;
    if (!pts || pts.length < 2) return null;
    const closed = tp.closed as boolean;
    const smooth = tp.smooth as boolean;

    if (smooth && closed && pts.length >= 3) {
      return catmullRomClosedPoint(pts, t);
    }
    if (closed) {
      const n = pts.length;
      const wt = ((t % 1) + 1) % 1;
      const totalT = wt * n;
      const segIdx = Math.min(Math.floor(totalT), n - 1);
      const localT = totalT - segIdx;
      const p1 = pts[segIdx];
      const p2 = pts[(segIdx + 1) % n];
      return { x: p1.x + (p2.x - p1.x) * localT, y: p1.y + (p2.y - p1.y) * localT };
    }
    const ep = splineEndpoint(pts, Math.max(0, Math.min(1, t)));
    return { x: ep.x, y: ep.y };
  }

  if (target.type === 'line') {
    const bend = tp.bend;
    const route = tp.route as Array<unknown> | undefined;
    const isClosed = tp.closed as boolean;

    // Closed route loop
    if (isClosed && route && route.length > 0) {
      const pts = route.map(r => {
        if (Array.isArray(r) && typeof (r as unknown[])[0] === 'number') return { x: (r as number[])[0], y: (r as number[])[1] };
        if (typeof r === 'string' && allProps[r]) return { x: allProps[r].x as number, y: allProps[r].y as number };
        if (Array.isArray(r) && typeof (r as unknown[])[0] === 'string') {
          const id = (r as [string, number, number])[0];
          const p = allProps[id];
          if (p) return { x: (p.x as number) + (r as [string, number, number])[1], y: (p.y as number) + (r as [string, number, number])[2] };
        }
        return null;
      }).filter((p): p is { x: number; y: number } => p !== null);
      if (pts.length >= 3) return catmullRomClosedPoint(pts, t);
    }

    // Legacy: closed bend array (backward compat)
    if (isClosed && Array.isArray(bend)) {
      return catmullRomClosedPoint(bend as Array<{ x: number; y: number }>, t);
    }

    const clamped = Math.max(0, Math.min(1, t));
    let sx: number, sy: number, ex: number, ey: number;
    const from = tp.from as string | undefined;
    const to = tp.to as string | undefined;
    if (from && to && allProps[from] && allProps[to]) {
      sx = allProps[from].x as number ?? 0;
      sy = allProps[from].y as number ?? 0;
      ex = allProps[to].x as number ?? 0;
      ey = allProps[to].y as number ?? 0;
    } else {
      sx = tp.x1 as number ?? 0;
      sy = tp.y1 as number ?? 0;
      ex = tp.x2 as number ?? 0;
      ey = tp.y2 as number ?? 0;
    }

    if (typeof bend === 'number' && bend !== 0) {
      const { cx, cy } = autoCurveControl(sx, sy, ex, ey, bend);
      return quadPoint(sx, sy, cx, cy, ex, ey, clamped);
    }
    if (Array.isArray(bend)) {
      const allPts = [{ x: sx, y: sy }, ...(bend as Array<{ x: number; y: number }>), { x: ex, y: ey }];
      const ep = splineEndpoint(allPts, clamped);
      return { x: ep.x, y: ep.y };
    }
    return { x: sx + (ex - sx) * clamped, y: sy + (ey - sy) * clamped };
  }

  return null;
}

/**
 * Legacy function signature for backwards compatibility during migration.
 */
export function evaluateAnimatedProps(
  objects: Record<string, SceneObject>,
  tracks: Tracks,
  time: number,
): Record<string, Record<string, unknown>> {
  const evaluate = createEvaluator();
  return evaluate(objects, tracks, time);
}

/**
 * Find which chapter is active at the given time.
 */
export function getActiveChapter(
  chapters: Chapter[],
  time: number,
): Chapter | undefined {
  if (!chapters || chapters.length === 0) return undefined;
  const sorted = [...chapters].sort((a, b) => a.time - b.time);
  let active: Chapter | undefined;
  for (const ch of sorted) {
    if (time >= ch.time) {
      active = ch;
    } else {
      break;
    }
  }
  return active;
}
