import type { SceneObject, AnchorPoint } from '../../core/types';
import { getObjectBounds, edgePoint, edgePointAtAnchor } from '../EdgeGeometry';
import { FONT } from './constants';

interface LineRendererProps {
  id: string;
  props: Record<string, unknown>;
  objects: Record<string, SceneObject>;
  allProps: Record<string, Record<string, unknown>>;
}

export function LineRenderer({ props, objects, allProps }: LineRendererProps) {
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
    opacity = 1,
    progress = 1,
    arrow = true,
  } = props as Record<string, unknown>;

  let sx: number, sy: number, ex: number, ey: number;

  if (from && to && objects[from as string] && objects[to as string]) {
    // If specific anchors are given, use them directly
    if (fromAnchor) {
      const pt = edgePointAtAnchor(from as string, fromAnchor as AnchorPoint, objects, allProps);
      sx = pt.x;
      sy = pt.y;
    } else {
      const fromB = getObjectBounds(from as string, objects, allProps);
      const toB = getObjectBounds(to as string, objects, allProps);
      const angle = Math.atan2(toB.y - fromB.y, toB.x - fromB.x);
      const start = edgePoint(fromB, angle);
      sx = start.x;
      sy = start.y;
    }

    if (toAnchor) {
      const pt = edgePointAtAnchor(to as string, toAnchor as AnchorPoint, objects, allProps);
      ex = pt.x;
      ey = pt.y;
    } else {
      const fromB = getObjectBounds(from as string, objects, allProps);
      const toB = getObjectBounds(to as string, objects, allProps);
      const angle = Math.atan2(toB.y - fromB.y, toB.x - fromB.x);
      const end = edgePoint(toB, angle + Math.PI);
      ex = end.x;
      ey = end.y;
    }
  } else {
    sx = (explicitX1 as number) || 0;
    sy = (explicitY1 as number) || 0;
    ex = (explicitX2 as number) || 100;
    ey = (explicitY2 as number) || 100;
  }

  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx = len > 0 ? dx / len : 0;
  const ny = len > 0 ? dy / len : 0;

  const prog = Math.max(0, Math.min(1, progress as number));
  const drawLen = len * prog;

  const aex = sx + nx * drawLen;
  const aey = sy + ny * drawLen;

  const arrowSize = 8;
  const mx = (sx + aex) / 2;
  const my = (sy + aey) / 2;

  return (
    <g opacity={opacity as number}>
      <line
        x1={sx}
        y1={sy}
        x2={aex}
        y2={aey}
        stroke={stroke as string}
        strokeWidth={strokeWidth as number}
        strokeDasharray={dashed ? '6 4' : 'none'}
      />
      {Boolean(arrow) && prog > 0.1 && (
        <polygon
          points={`${aex},${aey} ${aex - nx * arrowSize - ny * 4},${aey - ny * arrowSize + nx * 4} ${aex - nx * arrowSize + ny * 4},${aey - ny * arrowSize - nx * 4}`}
          fill={stroke as string}
        />
      )}
      {Boolean(label) && prog > 0.4 && (
        <g>
          <rect
            x={mx - (label as string).length * 3.3 - 6}
            y={my - 20}
            width={(label as string).length * 6.6 + 12}
            height={18}
            rx={4}
            fill="#0e1117"
            opacity={0.85}
          />
          <text
            x={mx}
            y={my - 10}
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
