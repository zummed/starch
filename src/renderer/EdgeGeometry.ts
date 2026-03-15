import type { SceneObject, AnchorPoint } from '../core/types';
import { scaledCenter, anchorWorldPosition } from '../engine/anchor';

export interface ObjectBounds {
  x: number;
  y: number;
  hw: number;
  hh: number;
  type: 'box' | 'circle';
}

export function getObjectBounds(
  id: string,
  objects: Record<string, SceneObject>,
  allProps: Record<string, Record<string, unknown>>,
): ObjectBounds {
  const obj = objects[id];
  const p = allProps[id];
  if (!obj || !p)
    return { x: 0, y: 0, hw: 0, hh: 0, type: 'box' };

  const type = obj.type;
  const scale = (p.scale as number) || 1;
  const anchor = p.anchor as AnchorPoint | undefined;
  const px = (p.x as number) || 0;
  const py = (p.y as number) || 0;

  if (type === 'circle') {
    const r = (p.r as number) || 20;
    const { cx, cy } = scaledCenter(px, py, scale, anchor, r, r);
    return { x: cx, y: cy, hw: r * scale + 4, hh: r * scale + 4, type: 'circle' };
  }
  if (type === 'table') {
    const cols = (p.cols as string[]) || [];
    const rows = (p.rows as string[][]) || [];
    const cw = (p.colWidth as number) || 100;
    const rh = (p.rowHeight as number) || 30;
    const hw = (cols.length * cw) / 2;
    const hh = ((rows.length + 1) * rh) / 2;
    const { cx, cy } = scaledCenter(px, py, scale, anchor, hw, hh);
    return { x: cx, y: cy, hw: hw * scale + 4, hh: hh * scale + 4, type: 'box' };
  }
  // box, text, group, etc.
  const hw = ((p.w as number) || 140) / 2;
  const hh = ((p.h as number) || 50) / 2;
  const { cx, cy } = scaledCenter(px, py, scale, anchor, hw, hh);
  return { x: cx, y: cy, hw: hw * scale + 4, hh: hh * scale + 4, type: 'box' };
}

export function edgePoint(
  bounds: ObjectBounds,
  angle: number,
): { x: number; y: number } {
  const { hw, hh, type } = bounds;

  if (type === 'circle') {
    return {
      x: bounds.x + Math.cos(angle) * hw,
      y: bounds.y + Math.sin(angle) * hh,
    };
  }

  // Rectangle edge intersection
  const tanA = Math.tan(angle);
  const candidates: Array<{ x: number; y: number; d: number }> = [];

  // Right edge
  let y = tanA * hw;
  if (Math.abs(y) <= hh) {
    candidates.push({
      x: bounds.x + hw,
      y: bounds.y + y,
      d: Math.abs(Math.cos(angle)) > 0 ? hw / Math.abs(Math.cos(angle)) : Infinity,
    });
  }
  // Left edge
  y = -tanA * hw;
  if (Math.abs(y) <= hh) {
    candidates.push({
      x: bounds.x - hw,
      y: bounds.y - y,
      d: Math.abs(Math.cos(angle)) > 0 ? hw / Math.abs(Math.cos(angle)) : Infinity,
    });
  }
  // Bottom edge
  const x1 = hh / (tanA || 0.001);
  if (Math.abs(x1) <= hw) {
    candidates.push({
      x: bounds.x + x1,
      y: bounds.y + hh,
      d: hh / Math.abs(Math.sin(angle) || 0.001),
    });
  }
  // Top edge
  const x2 = -hh / (tanA || 0.001);
  if (Math.abs(x2) <= hw) {
    candidates.push({
      x: bounds.x + x2,
      y: bounds.y - hh,
      d: hh / Math.abs(Math.sin(angle) || 0.001),
    });
  }

  if (candidates.length === 0) {
    return { x: bounds.x + Math.cos(angle) * hw, y: bounds.y + Math.sin(angle) * hh };
  }

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const valid = candidates.filter((c) => {
    const dx = c.x - bounds.x;
    const dy = c.y - bounds.y;
    return dx * cos + dy * sin > -0.01;
  });

  if (valid.length === 0) return candidates[0];
  valid.sort((a, b) => a.d - b.d);
  return valid[0];
}

/**
 * Compute an edge point at a specific named anchor on an object,
 * rather than auto-routing based on angle.
 */
export function edgePointAtAnchor(
  id: string,
  targetAnchor: AnchorPoint,
  objects: Record<string, SceneObject>,
  allProps: Record<string, Record<string, unknown>>,
): { x: number; y: number } {
  const obj = objects[id];
  const p = allProps[id];
  if (!obj || !p) return { x: 0, y: 0 };

  const px = (p.x as number) || 0;
  const py = (p.y as number) || 0;
  const scale = (p.scale as number) || 1;
  const anchor = p.anchor as AnchorPoint | undefined;

  let hw: number, hh: number;
  if (obj.type === 'circle') {
    const r = (p.r as number) || 20;
    hw = r;
    hh = r;
  } else if (obj.type === 'table') {
    const cols = (p.cols as string[]) || [];
    const rows = (p.rows as string[][]) || [];
    hw = (cols.length * ((p.colWidth as number) || 100)) / 2;
    hh = ((rows.length + 1) * ((p.rowHeight as number) || 30)) / 2;
  } else {
    hw = ((p.w as number) || 140) / 2;
    hh = ((p.h as number) || 50) / 2;
  }

  return anchorWorldPosition(px, py, scale, anchor, targetAnchor, hw, hh);
}
