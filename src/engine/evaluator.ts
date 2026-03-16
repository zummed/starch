import type { SceneObject, Tracks, Chapter, EffectInstance } from '../core/types';
import { interpolate } from './interpolate';
import { computeLayout } from './layout';
import { applyEffects } from './effects';
import {
  quadPoint, autoCurveControl, splineEndpoint,
  catmullRomClosedPoint,
} from './bezier';

interface BlendState {
  fromX: number;
  fromY: number;
  targetX: number;
  targetY: number;
  startTime: number;
  endTime: number;
  easing: string;
}

interface EvaluatorFn {
  (
    objects: Record<string, SceneObject>,
    tracks: Tracks,
    time: number,
  ): Record<string, Record<string, unknown>>;
  reset: () => void;
}

/**
 * Create a stateful evaluator that tracks position blending across frames.
 */
export function createEvaluator(effects: EffectInstance[] = []): EvaluatorFn {
  const blendMap = new Map<string, BlendState>();

  const evaluate = (
    objects: Record<string, SceneObject>,
    tracks: Tracks,
    time: number,
  ): Record<string, Record<string, unknown>> => {
    // Step 1: Start with base props
    const result: Record<string, Record<string, unknown>> = {};
    for (const [id, obj] of Object.entries(objects)) {
      result[id] = { ...obj.props as Record<string, unknown> };
    }

    // Step 2: Apply animated values
    for (const [key, keyframes] of Object.entries(tracks)) {
      const dotIdx = key.indexOf('.');
      const target = key.slice(0, dotIdx);
      const prop = key.slice(dotIdx + 1);
      if (result[target]) {
        const val = interpolate(keyframes, time);
        if (val !== undefined) result[target][prop] = val;
      }
    }

    // Step 2b: Apply effects (additive, time-decaying)
    if (effects.length > 0) {
      applyEffects(effects, result, time);
    }

    // Step 3: Run layout
    computeLayout(objects, result);

    // Step 3b: Position blending — smooth transitions when layout positions change
    for (const [id] of Object.entries(objects)) {
      const props = result[id];
      if (!props) continue;
      const layoutX = props.x as number;
      const layoutY = props.y as number;

      const existing = blendMap.get(id);
      if (existing) {
        // Check if layout target changed
        if (Math.abs(existing.targetX - layoutX) > 0.01 || Math.abs(existing.targetY - layoutY) > 0.01) {
          // New blend: from current blended position to new layout target
          const progress = existing.endTime > existing.startTime
            ? Math.min(1, (time - existing.startTime) / (existing.endTime - existing.startTime))
            : 1;
          const currentX = existing.fromX + (existing.targetX - existing.fromX) * progress;
          const currentY = existing.fromY + (existing.targetY - existing.fromY) * progress;

          // Find the keyframe window that caused this change
          const groupTrack = tracks[`${id}.group`];
          let blendStart = time;
          let blendEnd = time + 0.5; // default 0.5s blend
          let blendEasing = 'linear';
          if (groupTrack) {
            // Find the surrounding keyframe pair
            for (let i = 0; i < groupTrack.length - 1; i++) {
              if (groupTrack[i].time <= time && groupTrack[i + 1].time >= time - 0.01) {
                blendStart = groupTrack[i].time;
                blendEnd = groupTrack[i + 1].time;
                blendEasing = groupTrack[i + 1].easing;
                break;
              }
            }
          }
          blendMap.set(id, { fromX: currentX, fromY: currentY, targetX: layoutX, targetY: layoutY, startTime: blendStart, endTime: Math.max(blendEnd, blendStart + 0.01), easing: blendEasing });
        }
        // Apply blend
        const blend = blendMap.get(id)!;
        const dur = blend.endTime - blend.startTime;
        const t = dur > 0 ? Math.min(1, (time - blend.startTime) / dur) : 1;
        props.x = blend.fromX + (blend.targetX - blend.fromX) * t;
        props.y = blend.fromY + (blend.targetY - blend.fromY) * t;
        if (t >= 1) blendMap.delete(id);
      } else {
        // First frame for this item — record position, no blend
        blendMap.set(id, { fromX: layoutX, fromY: layoutY, targetX: layoutX, targetY: layoutY, startTime: time, endTime: time, easing: 'linear' });
      }
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
    blendMap.clear();
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
    const isClosed = tp.closed as boolean;

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
