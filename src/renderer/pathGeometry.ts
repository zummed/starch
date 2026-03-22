/**
 * Path geometry: converts path descriptions into PathSegment arrays.
 * Handles straight lines, quadratic bends, Catmull-Rom splines,
 * polylines with corner rounding, and edge snapping.
 */
import type { PathSegment } from './backend';
import type { Node, PathGeom } from '../types/node';

// ─── Catmull-Rom → Cubic Bezier ─────────────────────────────────

function catmullRomToCubicSegments(points: [number, number][], closed: boolean): PathSegment[] {
  if (points.length < 2) return [];
  if (points.length === 2) {
    return [
      { type: 'moveTo', x: points[0][0], y: points[0][1] },
      { type: 'lineTo', x: points[1][0], y: points[1][1] },
    ];
  }

  const tension = 0.5;
  const segments: PathSegment[] = [{ type: 'moveTo', x: points[0][0], y: points[0][1] }];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    segments.push({
      type: 'cubicTo',
      cx1: p1[0] + (p2[0] - p0[0]) * tension / 3,
      cy1: p1[1] + (p2[1] - p0[1]) * tension / 3,
      cx2: p2[0] - (p3[0] - p1[0]) * tension / 3,
      cy2: p2[1] - (p3[1] - p1[1]) * tension / 3,
      x: p2[0],
      y: p2[1],
    });
  }

  if (closed) segments.push({ type: 'close' });
  return segments;
}

// ─── Polyline with corner rounding ──────────────────────────────

function polylineSegments(points: [number, number][], radius: number, closed: boolean): PathSegment[] {
  if (points.length < 2) return [];
  if (radius <= 0 || points.length === 2) {
    const segs: PathSegment[] = [{ type: 'moveTo', x: points[0][0], y: points[0][1] }];
    for (let i = 1; i < points.length; i++) {
      segs.push({ type: 'lineTo', x: points[i][0], y: points[i][1] });
    }
    if (closed) segs.push({ type: 'close' });
    return segs;
  }

  const segs: PathSegment[] = [];
  segs.push({ type: 'moveTo', x: points[0][0], y: points[0][1] });

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    // Direction vectors
    const dx1 = curr[0] - prev[0], dy1 = curr[1] - prev[1];
    const dx2 = next[0] - curr[0], dy2 = next[1] - curr[1];
    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1) || 1;
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;

    // Limit radius to half the shortest segment
    const r = Math.min(radius, len1 / 2, len2 / 2);

    // Points where the rounding starts and ends
    const startX = curr[0] - (dx1 / len1) * r;
    const startY = curr[1] - (dy1 / len1) * r;
    const endX = curr[0] + (dx2 / len2) * r;
    const endY = curr[1] + (dy2 / len2) * r;

    segs.push({ type: 'lineTo', x: startX, y: startY });
    segs.push({ type: 'quadTo', cx: curr[0], cy: curr[1], x: endX, y: endY });
  }

  segs.push({ type: 'lineTo', x: points[points.length - 1][0], y: points[points.length - 1][1] });
  if (closed) segs.push({ type: 'close' });
  return segs;
}

// ─── Edge Snapping ──────────────────────────────────────────────

export function getNodeBounds(node: Node): { cx: number; cy: number; hw: number; hh: number; isEllipse: boolean } {
  const cx = node.transform?.x ?? 0;
  const cy = node.transform?.y ?? 0;

  if (node.ellipse) {
    return { cx, cy, hw: node.ellipse.rx, hh: node.ellipse.ry, isEllipse: true };
  }
  if (node.rect) {
    return { cx, cy, hw: node.rect.w / 2, hh: node.rect.h / 2, isEllipse: false };
  }
  if (node.image) {
    return { cx, cy, hw: node.image.w / 2, hh: node.image.h / 2, isEllipse: false };
  }
  // Composition: find bounds from children's geometry
  if (node.children.length > 0) {
    let maxHw = 0, maxHh = 0;
    for (const child of node.children) {
      if (child.rect) {
        maxHw = Math.max(maxHw, child.rect.w / 2);
        maxHh = Math.max(maxHh, child.rect.h / 2);
      } else if (child.ellipse) {
        maxHw = Math.max(maxHw, child.ellipse.rx);
        maxHh = Math.max(maxHh, child.ellipse.ry);
      } else if (child.image) {
        maxHw = Math.max(maxHw, child.image.w / 2);
        maxHh = Math.max(maxHh, child.image.h / 2);
      }
    }
    if (maxHw > 0 || maxHh > 0) {
      return { cx, cy, hw: maxHw, hh: maxHh, isEllipse: false };
    }
  }
  return { cx, cy, hw: 0, hh: 0, isEllipse: false };
}

/**
 * Find where a ray from center at the given angle intersects the object edge.
 */
export function edgePoint(
  bounds: { cx: number; cy: number; hw: number; hh: number; isEllipse: boolean },
  angle: number,
): [number, number] {
  if (bounds.hw === 0 && bounds.hh === 0) return [bounds.cx, bounds.cy];

  if (bounds.isEllipse) {
    return [
      bounds.cx + bounds.hw * Math.cos(angle),
      bounds.cy + bounds.hh * Math.sin(angle),
    ];
  }

  // Rect: find intersection with nearest edge
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const { hw, hh } = bounds;

  // Scale to unit square, then find intersection
  let tx = cos !== 0 ? hw / Math.abs(cos) : Infinity;
  let ty = sin !== 0 ? hh / Math.abs(sin) : Infinity;
  const t = Math.min(tx, ty);

  return [bounds.cx + cos * t, bounds.cy + sin * t];
}

// ─── Main conversion ────────────────────────────────────────────

export interface ResolvedPath {
  segments: PathSegment[];
  startPoint: [number, number] | null;
  endPoint: [number, number] | null;
  startTangent: [number, number] | null;
  endTangent: [number, number] | null;
}

function findNodeById(roots: Node[], id: string): Node | undefined {
  for (const root of roots) {
    if (root.id === id) return root;
    const found = findNodeById(root.children, id);
    if (found) return found;
  }
  return undefined;
}

function resolvePointRef(ref: unknown, roots: Node[]): [number, number] | null {
  if (typeof ref === 'string') {
    const node = findNodeById(roots, ref);
    if (!node) return null;
    return [node.transform?.x ?? 0, node.transform?.y ?? 0];
  }
  if (Array.isArray(ref)) {
    if (ref.length === 2 && typeof ref[0] === 'number') return [ref[0], ref[1]];
    if (ref.length === 3 && typeof ref[0] === 'string') {
      const node = findNodeById(roots, ref[0]);
      if (!node) return null;
      return [(node.transform?.x ?? 0) + ref[1], (node.transform?.y ?? 0) + ref[2]];
    }
  }
  return null;
}

const NAMED_ANCHOR_OFFSETS: Record<string, [number, number]> = {
  center: [0, 0],
  N: [0, -1], top: [0, -1],
  NE: [1, -1], topright: [1, -1],
  E: [1, 0], right: [1, 0],
  SE: [1, 1], bottomright: [1, 1],
  S: [0, 1], bottom: [0, 1],
  SW: [-1, 1], bottomleft: [-1, 1],
  W: [-1, 0], left: [-1, 0],
  NW: [-1, -1], topleft: [-1, -1],
};

function resolveAnchorOnBounds(
  anchor: string | [number, number] | undefined,
  bounds: { cx: number; cy: number; hw: number; hh: number },
): [number, number] | null {
  if (!anchor) return null;
  if (Array.isArray(anchor)) {
    return [bounds.cx + (anchor[0] - 0.5) * bounds.hw * 2, bounds.cy + (anchor[1] - 0.5) * bounds.hh * 2];
  }
  const offsets = NAMED_ANCHOR_OFFSETS[anchor];
  if (!offsets) return null;
  return [bounds.cx + offsets[0] * bounds.hw, bounds.cy + offsets[1] * bounds.hh];
}

/**
 * Convert an anchor to a far-away target point in that direction.
 * Used to determine which edge to snap to when an anchor biases the exit direction.
 */
function anchorDirection(
  anchor: string | [number, number],
  bounds: { cx: number; cy: number; hw: number; hh: number },
): [number, number] {
  const FAR = 10000;
  if (Array.isArray(anchor)) {
    // Float anchor [0-1, 0-1] → direction from center
    return [bounds.cx + (anchor[0] - 0.5) * FAR, bounds.cy + (anchor[1] - 0.5) * FAR];
  }
  const offsets = NAMED_ANCHOR_OFFSETS[anchor];
  if (!offsets || (offsets[0] === 0 && offsets[1] === 0)) {
    // center or unknown → no direction bias, return a point far to the right as fallback
    return [bounds.cx + FAR, bounds.cy];
  }
  return [bounds.cx + offsets[0] * FAR, bounds.cy + offsets[1] * FAR];
}

/**
 * If a point is inside the bounds, push it to the edge along the direction toward the target.
 */
function ensureOutsideBounds(
  point: [number, number],
  toward: [number, number],
  bounds: { cx: number; cy: number; hw: number; hh: number; isEllipse: boolean },
): [number, number] {
  const dx = Math.abs(point[0] - bounds.cx);
  const dy = Math.abs(point[1] - bounds.cy);
  if (dx < bounds.hw && dy < bounds.hh && (bounds.hw > 0 || bounds.hh > 0)) {
    // Point is inside — snap to edge in the direction of the target
    const angle = Math.atan2(toward[1] - bounds.cy, toward[0] - bounds.cx);
    return edgePoint(bounds, angle);
  }
  return point;
}

/**
 * Test if a point is inside bounds (rect or ellipse).
 */
function isInsideBounds(
  p: [number, number],
  bounds: { cx: number; cy: number; hw: number; hh: number; isEllipse: boolean },
): boolean {
  if (bounds.isEllipse) {
    const dx = (p[0] - bounds.cx) / bounds.hw;
    const dy = (p[1] - bounds.cy) / bounds.hh;
    return dx * dx + dy * dy <= 1;
  }
  return Math.abs(p[0] - bounds.cx) <= bounds.hw && Math.abs(p[1] - bounds.cy) <= bounds.hh;
}

/**
 * Find intersection of a line segment with bounds boundary.
 * Returns the parameter t (0-1) of the intersection, or null if none.
 * For rect: checks all 4 edges. For ellipse: solves quadratic.
 */
/**
 * Find intersection of a line segment with bounds boundary.
 * mode 'last': returns the largest t (last exit — for start clipping)
 * mode 'first': returns the smallest t (first entry — for end clipping)
 */
function segmentBoundsIntersection(
  a: [number, number], b: [number, number],
  bounds: { cx: number; cy: number; hw: number; hh: number; isEllipse: boolean },
  mode: 'first' | 'last' = 'last',
): number | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];

  if (bounds.isEllipse) {
    // Parametric: (a + t*d - c)^2 / r^2 = 1
    const ox = a[0] - bounds.cx, oy = a[1] - bounds.cy;
    const A = (dx * dx) / (bounds.hw * bounds.hw) + (dy * dy) / (bounds.hh * bounds.hh);
    const B = 2 * ((ox * dx) / (bounds.hw * bounds.hw) + (oy * dy) / (bounds.hh * bounds.hh));
    const C = (ox * ox) / (bounds.hw * bounds.hw) + (oy * oy) / (bounds.hh * bounds.hh) - 1;
    const disc = B * B - 4 * A * C;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    const t1 = (-B - sq) / (2 * A);
    const t2 = (-B + sq) / (2 * A);
    // Return intersection based on mode
    const valid = [t1, t2].filter(t => t >= 0 && t <= 1);
    if (valid.length === 0) return null;
    if (valid.length === 1) return valid[0];
    return mode === 'last' ? Math.max(...valid) : Math.min(...valid);
    return null;
  }

  // Rect: check 4 edges
  let bestT: number | null = null;
  const edges: Array<{ axis: 'x' | 'y'; val: number }> = [
    { axis: 'x', val: bounds.cx - bounds.hw },
    { axis: 'x', val: bounds.cx + bounds.hw },
    { axis: 'y', val: bounds.cy - bounds.hh },
    { axis: 'y', val: bounds.cy + bounds.hh },
  ];
  for (const edge of edges) {
    let t: number;
    if (edge.axis === 'x') {
      if (Math.abs(dx) < 1e-10) continue;
      t = (edge.val - a[0]) / dx;
    } else {
      if (Math.abs(dy) < 1e-10) continue;
      t = (edge.val - a[1]) / dy;
    }
    if (t < 0 || t > 1) continue;
    // Check the other axis is within bounds
    const px = a[0] + t * dx;
    const py = a[1] + t * dy;
    if (Math.abs(px - bounds.cx) <= bounds.hw + 0.01 && Math.abs(py - bounds.cy) <= bounds.hh + 0.01) {
      if (bestT === null) bestT = t;
      else if (mode === 'last' && t > bestT) bestT = t;
      else if (mode === 'first' && t < bestT) bestT = t;
    }
  }
  return bestT;
}

/**
 * Clip a point list at object bounds.
 * 'start': trims points from the beginning until the path exits the bounds.
 * 'end': trims points from the end until the path enters the bounds.
 */
function clipPathFromBounds(
  points: [number, number][],
  bounds: { cx: number; cy: number; hw: number; hh: number; isEllipse: boolean },
  gap: number,
  side: 'start' | 'end',
): [number, number][] {
  if (points.length < 2) return points;

  if (side === 'start') {
    // Walk forward, find the first segment that exits the bounds
    for (let i = 0; i < points.length - 1; i++) {
      const aInside = isInsideBounds(points[i], bounds);
      const bInside = isInsideBounds(points[i + 1], bounds);

      if (aInside && !bInside) {
        // This segment crosses the boundary — find intersection
        const t = segmentBoundsIntersection(points[i], points[i + 1], bounds, 'last');
        if (t !== null) {
          const ix = points[i][0] + t * (points[i + 1][0] - points[i][0]);
          const iy = points[i][1] + t * (points[i + 1][1] - points[i][1]);
          let clipPoint: [number, number] = [ix, iy];
          // Apply gap: push outward along the segment direction
          if (gap > 0) {
            const dx = points[i + 1][0] - points[i][0];
            const dy = points[i + 1][1] - points[i][1];
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            clipPoint = [ix + (dx / len) * gap, iy + (dy / len) * gap];
          }
          return [clipPoint, ...points.slice(i + 1)];
        }
      }
      if (!aInside) {
        // Already outside — apply gap if at start
        if (i === 0 && gap > 0) {
          const dx = points[0][0] - bounds.cx;
          const dy = points[0][1] - bounds.cy;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          return [[points[0][0] + (dx / len) * gap, points[0][1] + (dy / len) * gap], ...points.slice(1)];
        }
        return points.slice(i);
      }
    }
    // All points inside — return last point
    return [points[points.length - 1]];
  }

  // side === 'end'
  // Walk backward, find the last segment that enters the bounds
  for (let i = points.length - 1; i > 0; i--) {
    const aInside = isInsideBounds(points[i], bounds);
    const bInside = isInsideBounds(points[i - 1], bounds);

    if (aInside && !bInside) {
      const t = segmentBoundsIntersection(points[i - 1], points[i], bounds, 'first');
      if (t !== null) {
        const ix = points[i - 1][0] + t * (points[i][0] - points[i - 1][0]);
        const iy = points[i - 1][1] + t * (points[i][1] - points[i - 1][1]);
        let clipPoint: [number, number] = [ix, iy];
        if (gap > 0) {
          const dx = points[i - 1][0] - points[i][0];
          const dy = points[i - 1][1] - points[i][1];
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          clipPoint = [ix + (dx / len) * gap, iy + (dy / len) * gap];
        }
        return [...points.slice(0, i), clipPoint];
      }
    }
    if (!aInside) {
      if (i === points.length - 1 && gap > 0) {
        const last = points[points.length - 1];
        const dx = last[0] - bounds.cx;
        const dy = last[1] - bounds.cy;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        return [...points.slice(0, -1), [last[0] + (dx / len) * gap, last[1] + (dy / len) * gap]];
      }
      return points.slice(0, i + 1);
    }
  }
  return [points[0]];
}

function applyGap(point: [number, number], toward: [number, number], gap: number): [number, number] {
  const dx = toward[0] - point[0];
  const dy = toward[1] - point[1];
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return [point[0] + (dx / len) * gap, point[1] + (dy / len) * gap];
}

/**
 * Convert a PathGeom into resolved PathSegments with start/end tangent info.
 */
export function resolvePathGeometry(path: PathGeom, allRoots: Node[]): ResolvedPath {
  // Resolve endpoints
  let rawPoints: [number, number][] | null = null;

  if (path.points && path.points.length > 0) {
    // Resolve each point — may be [x,y], "objectId", or ["objectId", dx, dy]
    const resolved: [number, number][] = [];
    for (const pt of path.points) {
      const r = resolvePointRef(pt, allRoots);
      if (r) resolved.push(r);
    }
    rawPoints = resolved.length > 0 ? resolved : null;
  } else if (path.from || path.to) {
    const fromCenter = path.from ? resolvePointRef(path.from, allRoots) : null;
    const toCenter = path.to ? resolvePointRef(path.to, allRoots) : null;
    if (!fromCenter || !toCenter) return { segments: [], startPoint: null, endPoint: null, startTangent: null, endTangent: null };

    // Resolve route waypoints
    const waypoints: [number, number][] = [];
    if (path.route) {
      for (const wp of path.route) {
        const resolved = resolvePointRef(wp, allRoots);
        if (resolved) waypoints.push(resolved);
      }
    }

    // Resolve anchor positions (or use center)
    let fromPoint = fromCenter;
    let toPoint = toCenter;

    if (path.fromAnchor && typeof path.from === 'string') {
      const fromNode = findNodeById(allRoots, path.from);
      if (fromNode) {
        const anchor = resolveAnchorOnBounds(path.fromAnchor, getNodeBounds(fromNode));
        if (anchor) fromPoint = anchor;
      }
    }
    if (path.toAnchor && typeof path.to === 'string') {
      const toNode = findNodeById(allRoots, path.to);
      if (toNode) {
        const anchor = resolveAnchorOnBounds(path.toAnchor, getNodeBounds(toNode));
        if (anchor) toPoint = anchor;
      }
    }

    // Build full unclipped path
    rawPoints = [fromPoint, ...waypoints, toPoint];

    // Clip: trim the path at source and target object boundaries
    const fromGap = path.fromGap ?? path.gap ?? 0;
    const toGap = path.toGap ?? path.gap ?? 0;

    if (typeof path.from === 'string') {
      const fromNode = findNodeById(allRoots, path.from);
      if (fromNode) {
        const bounds = getNodeBounds(fromNode);
        if (bounds.hw > 0 || bounds.hh > 0) {
          rawPoints = clipPathFromBounds(rawPoints, bounds, fromGap, 'start');
        }
      }
    }
    if (typeof path.to === 'string') {
      const toNode = findNodeById(allRoots, path.to);
      if (toNode) {
        const bounds = getNodeBounds(toNode);
        if (bounds.hw > 0 || bounds.hh > 0) {
          rawPoints = clipPathFromBounds(rawPoints, bounds, toGap, 'end');
        }
      }
    }
  }

  if (!rawPoints || rawPoints.length < 2) {
    return { segments: [], startPoint: null, endPoint: null, startTangent: null, endTangent: null };
  }

  // Convert to segments based on mode
  let segments: PathSegment[];

  if (rawPoints.length === 2 && path.bend && path.bend !== 0) {
    // Quadratic bend
    const [from, to] = rawPoints;
    const mx = (from[0] + to[0]) / 2;
    const my = (from[1] + to[1]) / 2;
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const cx = mx + nx * path.bend * 50;
    const cy = my + ny * path.bend * 50;

    segments = [
      { type: 'moveTo', x: from[0], y: from[1] },
      { type: 'quadTo', cx, cy, x: to[0], y: to[1] },
    ];
    if (path.closed) segments.push({ type: 'close' });
  } else if (path.smooth) {
    // Catmull-Rom spline
    segments = catmullRomToCubicSegments(rawPoints, path.closed ?? false);
  } else if (path.radius && path.radius > 0) {
    // Polyline with rounded corners
    segments = polylineSegments(rawPoints, path.radius, path.closed ?? false);
  } else {
    // Straight line segments
    segments = [{ type: 'moveTo', x: rawPoints[0][0], y: rawPoints[0][1] }];
    for (let i = 1; i < rawPoints.length; i++) {
      segments.push({ type: 'lineTo', x: rawPoints[i][0], y: rawPoints[i][1] });
    }
    if (path.closed) segments.push({ type: 'close' });
  }

  // Extract start/end points and tangents
  const startPoint = rawPoints[0];
  const endPoint = rawPoints[rawPoints.length - 1];

  const startTangent: [number, number] = rawPoints.length >= 2
    ? [rawPoints[1][0] - rawPoints[0][0], rawPoints[1][1] - rawPoints[0][1]]
    : [1, 0];
  const endTangent: [number, number] = rawPoints.length >= 2
    ? [rawPoints[rawPoints.length - 1][0] - rawPoints[rawPoints.length - 2][0],
       rawPoints[rawPoints.length - 1][1] - rawPoints[rawPoints.length - 2][1]]
    : [1, 0];

  return { segments, startPoint, endPoint, startTangent, endTangent };
}
