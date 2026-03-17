import type { SceneObject } from '../core/types';
import { applyEasing } from './easing';
import type { EasingName } from '../core/types';

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CameraBlendInfo {
  fromProps: Record<string, unknown>;
  toProps: Record<string, unknown>;
  fromAllProps: Record<string, Record<string, unknown>>;
  toAllProps: Record<string, Record<string, unknown>>;
  rawT: number;
  easing: EasingName;
}

/**
 * Compute the bounding box of objects for fit mode.
 */
function computeFitBounds(
  fit: 'all' | string[],
  allProps: Record<string, Record<string, unknown>>,
  objects: Record<string, SceneObject>,
): { cx: number; cy: number; boundsW: number; boundsH: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  const ids = fit === 'all'
    ? Object.keys(objects).filter(id => objects[id].type !== 'camera')
    : fit;

  for (const id of ids) {
    const p = allProps[id];
    if (!p) continue;
    const x = (p.x as number) ?? 0;
    const y = (p.y as number) ?? 0;

    let hw = 70, hh = 23;
    const obj = objects[id];
    if (obj) {
      switch (obj.type) {
        case 'box': {
          const w = (p._layoutW as number) || (p.w as number) || 140;
          const h = (p._layoutH as number) || (p.h as number) || 46;
          hw = w / 2; hh = h / 2; break;
        }
        case 'circle': {
          const r = (p.r as number) || 30;
          hw = r; hh = r; break;
        }
        case 'table': {
          const cols = (p.cols as string[]) || [];
          const rows = (p.rows as string[][]) || [];
          hw = ((cols.length * ((p.colWidth as number) || 100))) / 2;
          hh = (((rows.length + 1) * ((p.rowHeight as number) || 30))) / 2;
          break;
        }
        case 'label': {
          const text = (p.text as string) || '';
          const fontSize = (p.size as number) || 14;
          hw = text.length * fontSize * 0.35;
          hh = fontSize * 0.7;
          break;
        }
        case 'textblock': {
          const lines = (p.lines as string[]) || [];
          const fontSize = (p.size as number) || 14;
          const lh = ((p.lineHeight as number) || 1.5) * fontSize;
          const pad = (p.padding as number) || 12;
          const maxLen = lines.reduce((m, l) => Math.max(m, l.length), 0);
          hw = (maxLen * fontSize * 0.35 + pad) || 70;
          hh = (lines.length * lh / 2 + pad) || 20;
          break;
        }
        case 'camera': case 'path': continue;
      }
    }

    minX = Math.min(minX, x - hw);
    minY = Math.min(minY, y - hh);
    maxX = Math.max(maxX, x + hw);
    maxY = Math.max(maxY, y + hh);
  }

  if (!isFinite(minX)) return { cx: 400, cy: 250, boundsW: 800, boundsH: 500 };
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, boundsW: maxX - minX, boundsH: maxY - minY };
}

/**
 * Resolve a single set of camera props to a viewBox (no blending).
 */
function resolveSingle(
  camProps: Record<string, unknown>,
  allProps: Record<string, Record<string, unknown>>,
  objects: Record<string, SceneObject>,
  vw: number,
  vh: number,
): ViewBox {
  let zoom = (camProps.zoom as number) || 1;
  let cx: number;
  let cy: number;

  const fit = camProps.fit as 'all' | string[] | undefined;

  if (fit) {
    const bounds = computeFitBounds(fit, allProps, objects);
    cx = bounds.cx;
    cy = bounds.cy;
    const padding = 20;
    const fitZoom = Math.min(vw / (bounds.boundsW + padding), vh / (bounds.boundsH + padding));
    zoom = Math.max(0.01, isFinite(fitZoom) ? fitZoom : 1);
  } else if (typeof camProps.target === 'string') {
    const tp = allProps[camProps.target as string];
    cx = (tp?.x as number) ?? 400;
    cy = (tp?.y as number) ?? 250;
  } else if (Array.isArray(camProps.target)) {
    const t = camProps.target as number[];
    cx = t[0] ?? 400;
    cy = t[1] ?? 250;
  } else {
    cx = 400; cy = 250;
  }

  const w = vw / zoom;
  const h = vh / zoom;
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
}

/**
 * Interpolate between two viewBoxes.
 */
function lerpViewBox(a: ViewBox, b: ViewBox, t: number): ViewBox {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    width: a.width + (b.width - a.width) * t,
    height: a.height + (b.height - a.height) * t,
  };
}

/**
 * Resolve camera properties into a viewBox.
 * When blendInfo is provided, computes viewBoxes at both block boundaries
 * and interpolates between them — ensuring ALL camera changes (target,
 * zoom, fit) animate smoothly with easing.
 */
export function resolveCamera(
  cameraProps: Record<string, unknown>,
  allProps: Record<string, Record<string, unknown>>,
  objects: Record<string, SceneObject>,
  viewportWidth: number,
  viewportHeight: number,
  blendInfo?: CameraBlendInfo,
): ViewBox {
  if (blendInfo) {
    const fromVB = resolveSingle(blendInfo.fromProps, blendInfo.fromAllProps, objects, viewportWidth, viewportHeight);
    const toVB = resolveSingle(blendInfo.toProps, blendInfo.toAllProps, objects, viewportWidth, viewportHeight);
    const t = applyEasing(blendInfo.rawT, blendInfo.easing);
    return lerpViewBox(fromVB, toVB, t);
  }

  return resolveSingle(cameraProps, allProps, objects, viewportWidth, viewportHeight);
}

/**
 * Find the first camera object in the scene.
 */
export function findCamera(
  objects: Record<string, SceneObject>,
  animatedProps: Record<string, Record<string, unknown>>,
): { id: string; props: Record<string, unknown> } | null {
  for (const [id, obj] of Object.entries(objects)) {
    if (obj.type === 'camera') {
      return { id, props: animatedProps[id] || obj.props as Record<string, unknown> };
    }
  }
  return null;
}
