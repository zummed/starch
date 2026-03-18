import type { AnchorPoint, NamedAnchor } from '../core/types';

/**
 * Map a named anchor to its natural exit direction unit vector.
 * Float anchors compute direction from center. Returns null for 'center'.
 */
export function anchorDirection(
  anchor: AnchorPoint | undefined,
): { dx: number; dy: number } | null {
  if (!anchor || anchor === 'center') return null;

  if (typeof anchor === 'object' && 'x' in anchor) {
    // Float anchor: direction from center (0.5, 0.5)
    const dx = anchor.x - 0.5;
    const dy = anchor.y - 0.5;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { dx: dx / len, dy: dy / len };
  }

  const COMPASS: Record<string, string> = {
    N: 'top', NE: 'topright', E: 'right', SE: 'bottomright',
    S: 'bottom', SW: 'bottomleft', W: 'left', NW: 'topleft',
  };
  const resolved = COMPASS[anchor] ?? anchor;

  let dx = 0, dy = 0;
  if (resolved.includes('left')) dx = -1;
  if (resolved.includes('right')) dx = 1;
  if (resolved.includes('top')) dy = -1;
  if (resolved.includes('bottom')) dy = 1;
  if (dx !== 0 && dy !== 0) {
    const len = Math.sqrt(dx * dx + dy * dy);
    dx /= len; dy /= len;
  }
  return dx === 0 && dy === 0 ? null : { dx, dy };
}

/**
 * Build SVG path `d` attribute for a cubic bezier, drawn up to parameter t.
 * Uses De Casteljau subdivision.
 */
export function cubicPathD(
  sx: number, sy: number,
  c1x: number, c1y: number,
  c2x: number, c2y: number,
  ex: number, ey: number,
  t: number,
): string {
  if (t >= 1) return `M ${sx} ${sy} C ${c1x} ${c1y} ${c2x} ${c2y} ${ex} ${ey}`;
  // De Casteljau left-half subdivision at t
  const pt = cubicPoint(sx, sy, c1x, c1y, c2x, c2y, ex, ey, t);
  const lc1x = sx + (c1x - sx) * t;
  const lc1y = sy + (c1y - sy) * t;
  const midx = c1x + (c2x - c1x) * t;
  const midy = c1y + (c2y - c1y) * t;
  const lc2x = lc1x + (midx - lc1x) * t;
  const lc2y = lc1y + (midy - lc1y) * t;
  return `M ${sx} ${sy} C ${lc1x} ${lc1y} ${lc2x} ${lc2y} ${pt.x} ${pt.y}`;
}

/**
 * Auto-select exit/entry anchor names for a curved line.
 * Returns null for axis-aligned chords (where a simple perpendicular arc is better).
 *
 * For diagonal chords, picks L-curve anchors based on the quadrant (dx*dy sign)
 * and bend sign. This ensures curves route smoothly around objects rather than
 * through the center of a layout.
 */
export function autoAnchors(
  sx: number, sy: number,
  ex: number, ey: number,
  bendSign: number,
): { exitAnchor: NamedAnchor; entryAnchor: NamedAnchor } | null {
  const cdx = ex - sx;
  const cdy = ey - sy;
  const absDx = Math.abs(cdx);
  const absDy = Math.abs(cdy);

  // Axis-aligned chords: skip auto-anchors, use perpendicular arc instead
  const minAxis = Math.min(absDx, absDy);
  const maxAxis = Math.max(absDx, absDy);
  if (maxAxis === 0 || minAxis / maxAxis < 0.2) return null;

  const h: NamedAnchor = cdx >= 0 ? 'right' : 'left';
  const v: NamedAnchor = cdy >= 0 ? 'bottom' : 'top';
  const invH: NamedAnchor = cdx >= 0 ? 'left' : 'right';
  const invV: NamedAnchor = cdy >= 0 ? 'top' : 'bottom';

  // dx*dy sign determines quadrant type, bend sign selects orientation
  const sameSign = cdx * cdy > 0;

  if (bendSign < 0) {
    // Negative bend: route "outside"
    return sameSign
      ? { exitAnchor: v, entryAnchor: invH }   // Q1/Q3: exit vertical, enter opposite horizontal
      : { exitAnchor: h, entryAnchor: invV };   // Q2/Q4: exit horizontal, enter opposite vertical
  } else {
    // Positive bend: route the other way
    return sameSign
      ? { exitAnchor: h, entryAnchor: invV }
      : { exitAnchor: v, entryAnchor: invH };
  }
}

/**
 * Evaluate position on a closed Catmull-Rom spline at parameter t.
 * t wraps: 0 and 1 are the same point (first point), 0.5 is halfway around.
 */
export function catmullRomClosedPoint(
  pts: Array<{ x: number; y: number }>,
  t: number,
): { x: number; y: number } {
  const n = pts.length;
  if (n < 3) return pts[0] ?? { x: 0, y: 0 };

  const wt = ((t % 1) + 1) % 1;
  const totalT = wt * n;
  const segIdx = Math.min(Math.floor(totalT), n - 1);
  const localT = totalT - segIdx;

  const p0 = pts[(segIdx - 1 + n) % n];
  const p1 = pts[segIdx];
  const p2 = pts[(segIdx + 1) % n];
  const p3 = pts[(segIdx + 2) % n];

  const c1x = p1.x + (p2.x - p0.x) / 6;
  const c1y = p1.y + (p2.y - p0.y) / 6;
  const c2x = p2.x - (p3.x - p1.x) / 6;
  const c2y = p2.y - (p3.y - p1.y) / 6;

  return cubicPoint(p1.x, p1.y, c1x, c1y, c2x, c2y, p2.x, p2.y, localT);
}

/** Evaluate a quadratic bezier at parameter t (0–1) */
export function quadPoint(
  sx: number, sy: number,
  cx: number, cy: number,
  ex: number, ey: number,
  t: number,
): { x: number; y: number } {
  const u = 1 - t;
  return {
    x: u * u * sx + 2 * u * t * cx + t * t * ex,
    y: u * u * sy + 2 * u * t * cy + t * t * ey,
  };
}

/** Tangent direction of a quadratic bezier at parameter t */
export function quadTangent(
  sx: number, sy: number,
  cx: number, cy: number,
  ex: number, ey: number,
  t: number,
): { tx: number; ty: number } {
  const u = 1 - t;
  const tx = 2 * u * (cx - sx) + 2 * t * (ex - cx);
  const ty = 2 * u * (cy - sy) + 2 * t * (ey - cy);
  const len = Math.sqrt(tx * tx + ty * ty) || 1;
  return { tx: tx / len, ty: ty / len };
}

/** Evaluate a cubic bezier at parameter t (0–1) */
export function cubicPoint(
  sx: number, sy: number,
  c1x: number, c1y: number,
  c2x: number, c2y: number,
  ex: number, ey: number,
  t: number,
): { x: number; y: number } {
  const u = 1 - t;
  return {
    x: u*u*u*sx + 3*u*u*t*c1x + 3*u*t*t*c2x + t*t*t*ex,
    y: u*u*u*sy + 3*u*u*t*c1y + 3*u*t*t*c2y + t*t*t*ey,
  };
}

/** Tangent direction of a cubic bezier at parameter t */
export function cubicTangent(
  sx: number, sy: number,
  c1x: number, c1y: number,
  c2x: number, c2y: number,
  ex: number, ey: number,
  t: number,
): { tx: number; ty: number } {
  const u = 1 - t;
  const tx = 3*u*u*(c1x-sx) + 6*u*t*(c2x-c1x) + 3*t*t*(ex-c2x);
  const ty = 3*u*u*(c1y-sy) + 6*u*t*(c2y-c1y) + 3*t*t*(ey-c2y);
  const len = Math.sqrt(tx * tx + ty * ty) || 1;
  return { tx: tx / len, ty: ty / len };
}

/**
 * Compute a quadratic bezier control point by offsetting the midpoint
 * perpendicular to the line by `bend` pixels.
 */
export function autoCurveControl(
  sx: number, sy: number,
  ex: number, ey: number,
  bend: number,
): { cx: number; cy: number } {
  const mx = (sx + ex) / 2;
  const my = (sy + ey) / 2;
  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  // Perpendicular: rotate direction 90° clockwise
  const px = dy / len;
  const py = -dx / len;
  return { cx: mx + px * bend, cy: my + py * bend };
}

/**
 * Build SVG path `d` attribute for a quadratic bezier, drawn up to parameter t.
 * Subdivides the curve at t using De Casteljau's algorithm.
 */
export function quadPathD(
  sx: number, sy: number,
  cx: number, cy: number,
  ex: number, ey: number,
  t: number,
): string {
  if (t >= 1) return `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`;
  // De Casteljau subdivision at t — left half control point
  const lcx = sx + (cx - sx) * t;
  const lcy = sy + (cy - sy) * t;
  const pt = quadPoint(sx, sy, cx, cy, ex, ey, t);
  return `M ${sx} ${sy} Q ${lcx} ${lcy} ${pt.x} ${pt.y}`;
}

/**
 * Build SVG path for a closed Catmull-Rom spline (wrapping indices for smooth join).
 * Supports partial drawing via parameter t (0–1).
 */
export function closedSplinePathD(
  pts: Array<{ x: number; y: number }>,
  t: number = 1,
): string {
  const n = pts.length;
  if (n < 3) return '';

  const segments: Array<{
    p0: { x: number; y: number }; c1: { x: number; y: number };
    c2: { x: number; y: number }; p1: { x: number; y: number };
  }> = [];

  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    segments.push({
      p0: p1,
      c1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
      c2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
      p1: p2,
    });
  }

  const segProgress = t * n;
  const fullSegments = Math.floor(segProgress);
  const partialT = segProgress - fullSegments;

  let d = `M ${segments[0].p0.x} ${segments[0].p0.y}`;

  for (let i = 0; i < Math.min(fullSegments, n); i++) {
    const s = segments[i];
    d += ` C ${s.c1.x} ${s.c1.y} ${s.c2.x} ${s.c2.y} ${s.p1.x} ${s.p1.y}`;
  }

  if (fullSegments < n && partialT > 0) {
    const s = segments[fullSegments];
    const pt = cubicPoint(s.p0.x, s.p0.y, s.c1.x, s.c1.y, s.c2.x, s.c2.y, s.p1.x, s.p1.y, partialT);
    const lc1x = s.p0.x + (s.c1.x - s.p0.x) * partialT;
    const lc1y = s.p0.y + (s.c1.y - s.p0.y) * partialT;
    const midx = s.c1.x + (s.c2.x - s.c1.x) * partialT;
    const midy = s.c1.y + (s.c2.y - s.c1.y) * partialT;
    const lc2x = lc1x + (midx - lc1x) * partialT;
    const lc2y = lc1y + (midy - lc1y) * partialT;
    d += ` C ${lc1x} ${lc1y} ${lc2x} ${lc2y} ${pt.x} ${pt.y}`;
  }

  return d;
}

/**
 * Convert an array of waypoints into Catmull-Rom-style cubic bezier segments.
 * Input: [start, ...waypoints, end] — all points the spline passes through.
 * Returns the SVG path `d` string.
 */
export function splinePathD(
  points: Array<{ x: number; y: number }>,
  t: number,
): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    const pt = { x: points[0].x + (points[1].x - points[0].x) * t,
                 y: points[0].y + (points[1].y - points[0].y) * t };
    return `M ${points[0].x} ${points[0].y} L ${pt.x} ${pt.y}`;
  }

  const segments: Array<{
    p0: { x: number; y: number }; c1: { x: number; y: number };
    c2: { x: number; y: number }; p1: { x: number; y: number };
  }> = [];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    segments.push({
      p0: p1,
      c1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
      c2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
      p1: p2,
    });
  }

  const totalSegments = segments.length;
  const segProgress = t * totalSegments;
  const fullSegments = Math.floor(segProgress);
  const partialT = segProgress - fullSegments;

  let d = `M ${segments[0].p0.x} ${segments[0].p0.y}`;

  for (let i = 0; i < Math.min(fullSegments, totalSegments); i++) {
    const s = segments[i];
    d += ` C ${s.c1.x} ${s.c1.y} ${s.c2.x} ${s.c2.y} ${s.p1.x} ${s.p1.y}`;
  }

  if (fullSegments < totalSegments && partialT > 0) {
    const s = segments[fullSegments];
    const pt = cubicPoint(s.p0.x, s.p0.y, s.c1.x, s.c1.y, s.c2.x, s.c2.y, s.p1.x, s.p1.y, partialT);
    const lc1x = s.p0.x + (s.c1.x - s.p0.x) * partialT;
    const lc1y = s.p0.y + (s.c1.y - s.p0.y) * partialT;
    const midx = s.c1.x + (s.c2.x - s.c1.x) * partialT;
    const midy = s.c1.y + (s.c2.y - s.c1.y) * partialT;
    const lc2x = lc1x + (midx - lc1x) * partialT;
    const lc2y = lc1y + (midy - lc1y) * partialT;
    d += ` C ${lc1x} ${lc1y} ${lc2x} ${lc2y} ${pt.x} ${pt.y}`;
  }

  return d;
}

/**
 * Get the point and tangent at the end of a spline drawn to progress t.
 * Used for arrowhead positioning and direction.
 */
export function splineEndpoint(
  points: Array<{ x: number; y: number }>,
  t: number,
): { x: number; y: number; tx: number; ty: number } {
  if (points.length < 2) return { x: 0, y: 0, tx: 1, ty: 0 };
  if (points.length === 2) {
    const dx = points[1].x - points[0].x;
    const dy = points[1].y - points[0].y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return {
      x: points[0].x + dx * t,
      y: points[0].y + dy * t,
      tx: dx / len, ty: dy / len,
    };
  }

  const segments: Array<{
    p0: { x: number; y: number }; c1: { x: number; y: number };
    c2: { x: number; y: number }; p1: { x: number; y: number };
  }> = [];

  for (let i = 0; i < points.length - 1; i++) {
    const pm1 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    segments.push({
      p0: p1,
      c1: { x: p1.x + (p2.x - pm1.x) / 6, y: p1.y + (p2.y - pm1.y) / 6 },
      c2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
      p1: p2,
    });
  }

  const totalSegments = segments.length;
  const segProgress = t * totalSegments;
  const segIdx = Math.min(Math.floor(segProgress), totalSegments - 1);
  const localT = totalSegments === 1 ? t : Math.min(segProgress - segIdx, 1);
  const s = segments[segIdx];

  const pt = cubicPoint(s.p0.x, s.p0.y, s.c1.x, s.c1.y, s.c2.x, s.c2.y, s.p1.x, s.p1.y, localT);
  const tan = cubicTangent(s.p0.x, s.p0.y, s.c1.x, s.c1.y, s.c2.x, s.c2.y, s.p1.x, s.p1.y, localT);

  return { x: pt.x, y: pt.y, tx: tan.tx, ty: tan.ty };
}

// ── Polyline with rounded corners ──

interface PolySegment {
  type: 'line' | 'arc';
  x1: number; y1: number;
  x2: number; y2: number;
  // For arc: control point
  cx?: number; cy?: number;
  length: number;
}

function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

/**
 * Build polyline segments with rounded corners.
 */
function buildPolySegments(
  points: Array<{ x: number; y: number }>,
  radius: number,
): PolySegment[] {
  if (points.length < 2) return [];
  if (points.length === 2 || radius <= 0) {
    // No corners to round
    const segs: PolySegment[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p = points[i], q = points[i + 1];
      segs.push({ type: 'line', x1: p.x, y1: p.y, x2: q.x, y2: q.y, length: dist(p.x, p.y, q.x, q.y) });
    }
    return segs;
  }

  const segs: PolySegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p = points[i], q = points[i + 1];

    // Before this segment's end, check for rounding
    let endX = q.x, endY = q.y;
    if (i < points.length - 2) {
      // There's a corner at q
      const r = points[i + 2];
      const dPQ = dist(p.x, p.y, q.x, q.y);
      const dQR = dist(q.x, q.y, r.x, r.y);
      const maxR = Math.min(dPQ / 2, dQR / 2, radius);

      if (maxR > 0.5) {
        // Shorten this segment to stop at the arc start
        const nPQ = { x: (q.x - p.x) / dPQ, y: (q.y - p.y) / dPQ };
        const nQR = { x: (r.x - q.x) / dQR, y: (r.y - q.y) / dQR };
        const arcStart = { x: q.x - nPQ.x * maxR, y: q.y - nPQ.y * maxR };
        const arcEnd = { x: q.x + nQR.x * maxR, y: q.y + nQR.y * maxR };

        // Compute actual start of this line segment
        let startX = p.x, startY = p.y;
        if (i > 0) {
          // Previous corner already shortened the start
          const prev = points[i - 1];
          const dPrev = dist(prev.x, prev.y, p.x, p.y);
          const maxRPrev = Math.min(dPrev / 2, dPQ / 2, radius);
          if (maxRPrev > 0.5) {
            const nPrevP = { x: (p.x - prev.x) / dPrev, y: (p.y - prev.y) / dPrev };
            startX = p.x + nPrevP.x * 0; // already handled
            startY = p.y + nPrevP.y * 0;
          }
        }

        endX = arcStart.x;
        endY = arcStart.y;

        // Line segment to arc start
        const lineLen = dist(startX, startY, endX, endY);
        if (lineLen > 0.1) {
          segs.push({ type: 'line', x1: startX, y1: startY, x2: endX, y2: endY, length: lineLen });
        }

        // Arc segment (quadratic bezier through corner)
        const arcLen = dist(arcStart.x, arcStart.y, arcEnd.x, arcEnd.y); // approximation
        segs.push({
          type: 'arc',
          x1: arcStart.x, y1: arcStart.y,
          x2: arcEnd.x, y2: arcEnd.y,
          cx: q.x, cy: q.y,
          length: arcLen,
        });
        continue;
      }
    }

    // Compute actual start (may be shortened by previous corner's arc)
    let startX = p.x, startY = p.y;
    if (i > 0) {
      const prevSeg = segs[segs.length - 1];
      if (prevSeg && prevSeg.type === 'arc') {
        startX = prevSeg.x2;
        startY = prevSeg.y2;
      }
    }

    const lineLen = dist(startX, startY, endX, endY);
    if (lineLen > 0.1) {
      segs.push({ type: 'line', x1: startX, y1: startY, x2: endX, y2: endY, length: lineLen });
    }
  }

  return segs;
}

/**
 * Generate SVG path for a polyline with rounded corners, clipped by progress.
 */
export function polylinePathD(
  points: Array<{ x: number; y: number }>,
  radius: number,
  progress: number,
): string {
  const segs = buildPolySegments(points, radius);
  if (segs.length === 0) return '';

  const totalLen = segs.reduce((s, seg) => s + seg.length, 0);
  const drawLen = totalLen * Math.max(0, Math.min(1, progress));

  let d = `M ${segs[0].x1} ${segs[0].y1}`;
  let cumLen = 0;

  for (const seg of segs) {
    if (cumLen >= drawLen) break;
    const remaining = drawLen - cumLen;

    if (remaining >= seg.length) {
      // Draw full segment
      if (seg.type === 'line') {
        d += ` L ${seg.x2} ${seg.y2}`;
      } else {
        d += ` Q ${seg.cx} ${seg.cy} ${seg.x2} ${seg.y2}`;
      }
      cumLen += seg.length;
    } else {
      // Partial segment
      const t = remaining / seg.length;
      if (seg.type === 'line') {
        const x = seg.x1 + (seg.x2 - seg.x1) * t;
        const y = seg.y1 + (seg.y2 - seg.y1) * t;
        d += ` L ${x} ${y}`;
      } else {
        // Partial quadratic bezier — use De Casteljau
        const ax = seg.x1 + (seg.cx! - seg.x1) * t;
        const ay = seg.y1 + (seg.cy! - seg.y1) * t;
        const bx = seg.cx! + (seg.x2 - seg.cx!) * t;
        const by = seg.cy! + (seg.y2 - seg.cy!) * t;
        const px = ax + (bx - ax) * t;
        const py = ay + (by - ay) * t;
        d += ` Q ${ax} ${ay} ${px} ${py}`;
      }
      break;
    }
  }

  return d;
}

/**
 * Get position and tangent at progress along a polyline with rounded corners.
 */
export function polylineEndpoint(
  points: Array<{ x: number; y: number }>,
  radius: number,
  progress: number,
): { x: number; y: number; tx: number; ty: number } {
  const segs = buildPolySegments(points, radius);
  if (segs.length === 0) return { x: 0, y: 0, tx: 1, ty: 0 };

  const totalLen = segs.reduce((s, seg) => s + seg.length, 0);
  const drawLen = totalLen * Math.max(0, Math.min(1, progress));

  let cumLen = 0;
  for (const seg of segs) {
    if (cumLen + seg.length >= drawLen || seg === segs[segs.length - 1]) {
      const remaining = drawLen - cumLen;
      const t = seg.length > 0 ? Math.min(1, remaining / seg.length) : 1;

      if (seg.type === 'line') {
        const x = seg.x1 + (seg.x2 - seg.x1) * t;
        const y = seg.y1 + (seg.y2 - seg.y1) * t;
        const len = dist(seg.x1, seg.y1, seg.x2, seg.y2);
        const tx = len > 0 ? (seg.x2 - seg.x1) / len : 1;
        const ty = len > 0 ? (seg.y2 - seg.y1) / len : 0;
        return { x, y, tx, ty };
      } else {
        // Quadratic bezier tangent
        const ax = seg.x1 + (seg.cx! - seg.x1) * t;
        const ay = seg.y1 + (seg.cy! - seg.y1) * t;
        const bx = seg.cx! + (seg.x2 - seg.cx!) * t;
        const by = seg.cy! + (seg.y2 - seg.cy!) * t;
        const px = ax + (bx - ax) * t;
        const py = ay + (by - ay) * t;
        // Tangent direction
        const tdx = bx - ax;
        const tdy = by - ay;
        const tlen = Math.sqrt(tdx * tdx + tdy * tdy);
        return { x: px, y: py, tx: tlen > 0 ? tdx / tlen : 1, ty: tlen > 0 ? tdy / tlen : 0 };
      }
    }
    cumLen += seg.length;
  }

  const last = points[points.length - 1];
  return { x: last.x, y: last.y, tx: 1, ty: 0 };
}
