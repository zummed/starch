import type { SceneObject, AnchorPoint, PointRef } from '../../core/types';
import { getObjectBounds, edgePoint, edgePointAtAnchor } from '../EdgeGeometry';
import { resolvePointRef } from '../resolvePointRef';
import { FONT } from './constants';
import {
  anchorDirection, autoAnchors,
  cubicPoint, cubicTangent, cubicPathD,
  splinePathD, splineEndpoint, closedSplinePathD,
  polylinePathD, polylineEndpoint,
} from '../../engine/bezier';

const DEBUG_STROKE = '#ef4444';

interface LineRendererProps {
  id: string;
  props: Record<string, unknown>;
  objects: Record<string, SceneObject>;
  allProps: Record<string, Record<string, unknown>>;
  debug?: boolean;
}

export function LineRenderer({ props, objects, allProps, debug = false }: LineRendererProps) {
  const {
    from,
    to,
    fromAnchor,
    toAnchor,
    x1: explicitX1,
    y1: explicitY1,
    x2: explicitX2,
    y2: explicitY2,
    stroke = '#4a4f59',
    strokeWidth = 1.5,
    dashed = false,
    label,
    labelColor = '#8a8f98',
    labelSize = 11,
    labelRotation = 0,
    opacity = 1,
    progress = 1,
    arrow = true,
    textOffset,
    bend,
    route,
    smooth = true,
    radius = 0,
    closed = false,
    visible = true,
    arrowStart = false,
  } = props as Record<string, unknown>;

  const isDebugOnly = !visible && debug;

  const bendVal = typeof bend === 'number' ? bend : undefined;
  const routeRefs = (route as PointRef[] | undefined) ?? [];
  const hasRoute = routeRefs.length > 0;
  const isCurve = !hasRoute && typeof bendVal === 'number' && bendVal !== 0;

  // ── Resolve effective anchors ──
  let effFrom = fromAnchor as AnchorPoint | undefined;
  let effTo = toAnchor as AnchorPoint | undefined;

  // Auto-pick anchors for simple curves between objects
  const fromIsObjId = typeof from === 'string' && objects[from as string];
  const toIsObjId = typeof to === 'string' && objects[to as string];

  if (isCurve && fromIsObjId && toIsObjId) {
    const fromB = getObjectBounds(from as string, objects, allProps);
    const toB = getObjectBounds(to as string, objects, allProps);
    if (!effFrom || !effTo) {
      const auto = autoAnchors(fromB.x, fromB.y, toB.x, toB.y, bendVal as number);
      if (auto) {
        if (!effFrom) effFrom = auto.exitAnchor;
        if (!effTo) effTo = auto.entryAnchor;
      }
    }
  }

  // ── Resolve route waypoints ──
  const routePoints = routeRefs
    .map(r => resolvePointRef(r, allProps))
    .filter((p): p is { x: number; y: number } => p !== null);

  // ── Compute endpoints (supports PointRef: string, [x,y], ["id", dx, dy]) ──
  let sx: number, sy: number, ex: number, ey: number;

  // Resolve from
  if (fromIsObjId) {
    const fromB = getObjectBounds(from as string, objects, allProps);
    const fromPt = effFrom ? edgePointAtAnchor(from as string, effFrom, objects, allProps) : null;
    if (fromPt) { sx = fromPt.x; sy = fromPt.y; }
    else {
      // Angle toward first route point or to endpoint
      const target = routePoints[0] || (toIsObjId
        ? { x: getObjectBounds(to as string, objects, allProps).x, y: getObjectBounds(to as string, objects, allProps).y }
        : resolvePointRef(to as PointRef, allProps) || { x: (explicitX2 as number) || 100, y: (explicitY2 as number) || 100 });
      const angle = Math.atan2(target.y - fromB.y, target.x - fromB.x);
      const s = edgePoint(fromB, angle);
      sx = s.x; sy = s.y;
    }
  } else if (from) {
    const p = resolvePointRef(from as PointRef, allProps);
    sx = p?.x ?? ((explicitX1 as number) || 0);
    sy = p?.y ?? ((explicitY1 as number) || 0);
  } else {
    sx = (explicitX1 as number) || 0;
    sy = (explicitY1 as number) || 0;
  }

  // Resolve to
  if (toIsObjId) {
    const toB = getObjectBounds(to as string, objects, allProps);
    const toPt = effTo ? edgePointAtAnchor(to as string, effTo, objects, allProps) : null;
    if (toPt) { ex = toPt.x; ey = toPt.y; }
    else {
      const source = routePoints.length > 0 ? routePoints[routePoints.length - 1] : { x: sx, y: sy };
      const angle = Math.atan2(source.y - toB.y, source.x - toB.x);
      const e = edgePoint(toB, angle);
      ex = e.x; ey = e.y;
    }
  } else if (to) {
    const p = resolvePointRef(to as PointRef, allProps);
    ex = p?.x ?? ((explicitX2 as number) || 100);
    ey = p?.y ?? ((explicitY2 as number) || 100);
  } else {
    ex = (explicitX2 as number) || 100;
    ey = (explicitY2 as number) || 100;
  }

  // ── Compute curve geometry ──
  const prog = Math.max(0, Math.min(1, progress as number));
  const arrowSize = 8;
  const tOff = (textOffset as [number, number]) || [0, 0];

  const exitDir = anchorDirection(effFrom);
  const entryDir = anchorDirection(effTo);
  const hasAnchorDirs = exitDir !== null || entryDir !== null;

  let aex: number, aey: number, nx: number, ny: number, mx: number, my: number;
  let pathD: string | null = null;

  const isClosedSpline = Boolean(closed) && hasRoute;

  if (isClosedSpline) {
    // Closed loop through route points
    const pts = routePoints;
    pathD = closedSplinePathD(pts, prog);
    aex = 0; aey = 0; nx = 0; ny = 0; mx = 0; my = 0;
  } else if (hasRoute) {
    // Routed line through waypoints
    const allPts = [{ x: sx, y: sy }, ...routePoints, { x: ex, y: ey }];
    if (smooth) {
      // Catmull-Rom spline through waypoints
      pathD = splinePathD(allPts, prog);
      const ep = splineEndpoint(allPts, prog);
      aex = ep.x; aey = ep.y; nx = ep.tx; ny = ep.ty;
      const mid = splineEndpoint(allPts, 0.5);
      mx = mid.x + tOff[0]; my = mid.y + tOff[1];
    } else {
      // Polyline with rounded corners
      pathD = polylinePathD(allPts, radius as number, prog);
      const ep = polylineEndpoint(allPts, radius as number, prog);
      aex = ep.x; aey = ep.y; nx = ep.tx; ny = ep.ty;
      const mid = polylineEndpoint(allPts, radius as number, 0.5);
      mx = mid.x + tOff[0]; my = mid.y + tOff[1];
    }
  } else if (hasAnchorDirs) {
    // Cubic bezier with anchor-directed tangents
    const chordDx = ex - sx;
    const chordDy = ey - sy;
    const chordLen = Math.sqrt(chordDx * chordDx + chordDy * chordDy) || 1;

    const edir = exitDir || { dx: chordDx / chordLen, dy: chordDy / chordLen };
    const ndir = entryDir || { dx: -chordDx / chordLen, dy: -chordDy / chordLen };

    // Auto-anchors use chord/3 for smooth curves; explicit anchors can use bend as distance
    const autoAnchorsActive = isCurve && (!fromAnchor || !toAnchor);
    const dist = autoAnchorsActive
      ? chordLen / 3
      : (typeof bendVal === 'number' && bendVal !== 0 ? Math.abs(bendVal) : chordLen / 3);

    const c1x = sx + edir.dx * dist;
    const c1y = sy + edir.dy * dist;
    const c2x = ex + ndir.dx * dist;
    const c2y = ey + ndir.dy * dist;

    pathD = cubicPathD(sx, sy, c1x, c1y, c2x, c2y, ex, ey, prog);
    const ep = cubicPoint(sx, sy, c1x, c1y, c2x, c2y, ex, ey, prog);
    const tan = cubicTangent(sx, sy, c1x, c1y, c2x, c2y, ex, ey, prog);
    aex = ep.x; aey = ep.y; nx = tan.tx; ny = tan.ty;
    const mid = cubicPoint(sx, sy, c1x, c1y, c2x, c2y, ex, ey, 0.5);
    mx = mid.x + tOff[0]; my = mid.y + tOff[1];
  } else if (isCurve) {
    // Perpendicular-arc curve for axis-aligned or anchor-less bends
    const chordDx = ex - sx;
    const chordDy = ey - sy;
    const chordLen = Math.sqrt(chordDx * chordDx + chordDy * chordDy) || 1;
    // Perpendicular offset: rotate chord 90° clockwise, scale by bend
    const px = chordDy / chordLen;
    const py = -chordDx / chordLen;
    const offset = bendVal as number;
    const cmx = (sx + ex) / 2 + px * offset;
    const cmy = (sy + ey) / 2 + py * offset;
    // Quadratic bezier with midpoint control
    const qPathD = (t: number) => {
      if (t >= 1) return `M ${sx} ${sy} Q ${cmx} ${cmy} ${ex} ${ey}`;
      const lcx = sx + (cmx - sx) * t;
      const lcy = sy + (cmy - sy) * t;
      const u = 1 - t;
      const ptx = u * u * sx + 2 * u * t * cmx + t * t * ex;
      const pty = u * u * sy + 2 * u * t * cmy + t * t * ey;
      return `M ${sx} ${sy} Q ${lcx} ${lcy} ${ptx} ${pty}`;
    };
    pathD = qPathD(prog);
    const u = 1 - prog;
    aex = u * u * sx + 2 * u * prog * cmx + prog * prog * ex;
    aey = u * u * sy + 2 * u * prog * cmy + prog * prog * ey;
    const ttx = 2 * (1 - prog) * (cmx - sx) + 2 * prog * (ex - cmx);
    const tty = 2 * (1 - prog) * (cmy - sy) + 2 * prog * (ey - cmy);
    const tlen = Math.sqrt(ttx * ttx + tty * tty) || 1;
    nx = ttx / tlen; ny = tty / tlen;
    const midPt = { x: 0.25 * sx + 0.5 * cmx + 0.25 * ex, y: 0.25 * sy + 0.5 * cmy + 0.25 * ey };
    mx = midPt.x + tOff[0]; my = midPt.y + tOff[1];
  } else {
    // Straight line
    const dx = ex - sx;
    const dy = ey - sy;
    const len = Math.sqrt(dx * dx + dy * dy);
    nx = len > 0 ? dx / len : 0;
    ny = len > 0 ? dy / len : 0;
    const drawLen = len * prog;
    aex = sx + nx * drawLen;
    aey = sy + ny * drawLen;
    mx = (sx + aex) / 2 + tOff[0];
    my = (sy + aey) / 2 + tOff[1];
  }

  const drawStroke = isDebugOnly ? DEBUG_STROKE : stroke as string;
  const drawOpacity = isDebugOnly ? 0.5 : opacity as number;
  const drawDash = isDebugOnly ? '4 4' : (dashed ? '6 4' : 'none');

  // Start tangent (for start arrowhead) — points from start outward
  const snx = sx !== ex || sy !== ey ? (ex - sx) / (Math.sqrt((ex-sx)**2 + (ey-sy)**2) || 1) : 1;
  const sny = sx !== ex || sy !== ey ? (ey - sy) / (Math.sqrt((ex-sx)**2 + (ey-sy)**2) || 1) : 0;

  // Shorten line end when dashed + arrow to avoid dashes poking past arrowhead
  const hasEndArrow = !isDebugOnly && Boolean(arrow) && !isClosedSpline && prog > 0.1;
  const hasStartArrow = !isDebugOnly && Boolean(arrowStart) && !isClosedSpline;
  const shortenEnd = dashed && hasEndArrow ? arrowSize : 0;
  const lineEndX = aex - nx * shortenEnd;
  const lineEndY = aey - ny * shortenEnd;

  return (
    <g opacity={drawOpacity}>
      {pathD ? (
        <path
          d={pathD}
          fill="none"
          stroke={drawStroke}
          strokeWidth={strokeWidth as number}
          strokeDasharray={drawDash}
        />
      ) : (
        <line
          x1={sx}
          y1={sy}
          x2={lineEndX}
          y2={lineEndY}
          stroke={drawStroke}
          strokeWidth={strokeWidth as number}
          strokeDasharray={drawDash}
        />
      )}
      {hasEndArrow && (
        <polygon
          points={`${aex},${aey} ${aex - nx * arrowSize - ny * 4},${aey - ny * arrowSize + nx * 4} ${aex - nx * arrowSize + ny * 4},${aey - ny * arrowSize - nx * 4}`}
          fill={stroke as string}
        />
      )}
      {hasStartArrow && (
        <polygon
          points={`${sx},${sy} ${sx + snx * arrowSize - sny * 4},${sy + sny * arrowSize + snx * 4} ${sx + snx * arrowSize + sny * 4},${sy + sny * arrowSize - snx * 4}`}
          fill={stroke as string}
        />
      )}
      {!isDebugOnly && Boolean(label) && prog > 0.4 && (
        <g transform={`rotate(${labelRotation as number}, ${mx}, ${my})`}>
          <rect
            x={mx - (label as string).length * 3.3 - 6}
            y={my - 9}
            width={(label as string).length * 6.6 + 12}
            height={18}
            rx={4}
            fill="#0e1117"
            opacity={0.85}
          />
          <text
            x={mx}
            y={my}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={labelColor as string}
            fontSize={labelSize as number}
            fontFamily={FONT}
          >
            {label as string}
          </text>
        </g>
      )}
    </g>
  );
}
