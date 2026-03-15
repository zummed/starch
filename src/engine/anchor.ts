import type { AnchorPoint, FloatAnchor, NamedAnchor } from '../core/types';

function isFloatAnchor(anchor: AnchorPoint): anchor is FloatAnchor {
  return typeof anchor === 'object' && 'x' in anchor && 'y' in anchor;
}

// Map compass names to equivalent legacy names
const COMPASS_MAP: Record<string, NamedAnchor> = {
  N: 'top',
  NE: 'topright',
  E: 'right',
  SE: 'bottomright',
  S: 'bottom',
  SW: 'bottomleft',
  W: 'left',
  NW: 'topleft',
};

/**
 * Resolve any anchor point to local-space offsets {ax, ay} relative to object center.
 * hw = half-width, hh = half-height of the object's bounding box.
 */
export function resolveAnchor(
  anchor: AnchorPoint | undefined,
  hw: number,
  hh: number,
): { ax: number; ay: number } {
  if (!anchor || anchor === 'center') return { ax: 0, ay: 0 };

  // Float-based anchor: (0,0) = top-left, (1,1) = bottom-right
  if (isFloatAnchor(anchor)) {
    return {
      ax: (anchor.x - 0.5) * 2 * hw,
      ay: (anchor.y - 0.5) * 2 * hh,
    };
  }

  // Resolve compass shorthand
  const resolved = COMPASS_MAP[anchor] ?? anchor;

  let ax = 0;
  let ay = 0;
  if (resolved.includes('top')) ay = -hh;
  if (resolved.includes('bottom')) ay = hh;
  if (resolved.includes('left')) ax = -hw;
  if (resolved.includes('right')) ax = hw;
  return { ax, ay };
}

/**
 * Compute SVG transform strings for rendering an object scaled around its anchor.
 * Returns two transform strings for nested <g> elements:
 *   outer: translate(x, y)
 *   inner: translate(ax*(1-s), ay*(1-s)) scale(s)
 */
export function scaleAroundAnchor(
  x: number,
  y: number,
  scale: number,
  anchor: AnchorPoint | undefined,
  hw: number,
  hh: number,
): { outerTranslate: string; innerTransform: string } {
  const { ax, ay } = resolveAnchor(anchor, hw, hh);
  return {
    outerTranslate: `translate(${x}, ${y})`,
    innerTransform: `translate(${ax * (1 - scale)}, ${ay * (1 - scale)}) scale(${scale})`,
  };
}

/**
 * Compute where the visual center ends up after scaling around an anchor.
 */
export function scaledCenter(
  x: number,
  y: number,
  scale: number,
  anchor: AnchorPoint | undefined,
  hw: number,
  hh: number,
): { cx: number; cy: number } {
  const { ax, ay } = resolveAnchor(anchor, hw, hh);
  return {
    cx: x + ax * (1 - scale),
    cy: y + ay * (1 - scale),
  };
}

/**
 * Compute the world-space position of a specific anchor point on an object.
 * Used for line endpoints targeting specific anchors.
 */
export function anchorWorldPosition(
  x: number,
  y: number,
  scale: number,
  objectAnchor: AnchorPoint | undefined,
  targetAnchor: AnchorPoint,
  hw: number,
  hh: number,
): { x: number; y: number } {
  // First find where the object center visually is (accounting for its own anchor + scale)
  const { cx, cy } = scaledCenter(x, y, scale, objectAnchor, hw, hh);
  // Then resolve the target anchor relative to the visual center
  const { ax, ay } = resolveAnchor(targetAnchor, hw * scale, hh * scale);
  return { x: cx + ax, y: cy + ay };
}
