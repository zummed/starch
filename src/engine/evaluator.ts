import type { SceneObject, Tracks, Chapter } from '../core/types';
import { interpolate } from './interpolate';
import {
  quadPoint, autoCurveControl, splineEndpoint,
  catmullRomClosedPoint,
} from './bezier';

/**
 * Walk all animation tracks at the given time and produce a snapshot
 * of animated props for every object.
 */
export function evaluateAnimatedProps(
  objects: Record<string, SceneObject>,
  tracks: Tracks,
  time: number,
): Record<string, Record<string, unknown>> {
  // Start with base props
  const result: Record<string, Record<string, unknown>> = {};
  for (const [id, obj] of Object.entries(objects)) {
    result[id] = { ...obj.props };
  }

  // Apply animated values
  for (const [key, keyframes] of Object.entries(tracks)) {
    const dotIdx = key.indexOf('.');
    const target = key.slice(0, dotIdx);
    const prop = key.slice(dotIdx + 1);
    if (result[target]) {
      const val = interpolate(keyframes, time);
      if (val !== undefined) result[target][prop] = val;
    }
  }

  // ── Resolve follow positions ──
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
}

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
    // Open path: use spline evaluation
    const ep = splineEndpoint(pts, Math.max(0, Math.min(1, t)));
    return { x: ep.x, y: ep.y };
  }

  if (target.type === 'line') {
    const bend = tp.bend;
    const isClosed = tp.closed as boolean;

    // Closed spline: bend points define the loop, use wrapping evaluation
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
 * Find which chapter is active at the given time.
 * Returns the last chapter whose time <= current time, or undefined if before all chapters.
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
