import { scaleAroundAnchor } from '../../engine/anchor';
import { FONT } from './constants';
import type { AnchorPoint } from '../../core/types';

interface TableRendererProps {
  props: Record<string, unknown>;
}

export function TableRenderer({ props }: TableRendererProps) {
  const {
    x = 0,
    y = 0,
    cols = [],
    rows = [],
    fill = '#1a1d24',
    stroke = '#2a2d35',
    headerFill = '#14161c',
    textColor = '#c9cdd4',
    headerColor = '#e2e5ea',
    textSize = 12,
    colWidth = 100,
    rowHeight = 30,
    opacity = 1,
    scale = 1,
    strokeWidth = 1,
    anchor = 'center',
  } = props as Record<string, unknown>;

  const colsArr = cols as string[];
  const rowsArr = rows as string[][];
  const cw = colWidth as number;
  const rh = rowHeight as number;
  const totalW = colsArr.length * cw;
  const totalH = (rowsArr.length + 1) * rh;

  const { outerTranslate, innerTransform } = scaleAroundAnchor(
    x as number, y as number, scale as number, anchor as AnchorPoint,
    totalW / 2, totalH / 2,
  );

  return (
    <g transform={outerTranslate} opacity={opacity as number}>
      <g transform={innerTransform}>
        {/* Header */}
        <rect
          x={-totalW / 2}
          y={-totalH / 2}
          width={totalW}
          height={rh}
          rx={6}
          fill={headerFill as string}
          stroke={stroke as string}
          strokeWidth={strokeWidth as number}
        />
        {colsArr.map((col, ci) => (
          <text
            key={ci}
            x={-totalW / 2 + ci * cw + cw / 2}
            y={-totalH / 2 + rh / 2 + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={headerColor as string}
            fontSize={textSize as number}
            fontWeight={700}
            fontFamily={FONT}
          >
            {col}
          </text>
        ))}
        {/* Data rows */}
        {rowsArr.map((row, ri) => (
          <g key={ri}>
            <rect
              x={-totalW / 2}
              y={-totalH / 2 + (ri + 1) * rh}
              width={totalW}
              height={rh}
              fill={fill as string}
              stroke={stroke as string}
              strokeWidth={strokeWidth as number}
              rx={ri === rowsArr.length - 1 ? 6 : 0}
            />
            {row.map((cell, ci) => (
              <text
                key={ci}
                x={-totalW / 2 + ci * cw + cw / 2}
                y={-totalH / 2 + (ri + 1) * rh + rh / 2 + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={textColor as string}
                fontSize={textSize as number}
                fontFamily={FONT}
              >
                {cell}
              </text>
            ))}
          </g>
        ))}
        {/* Outer border */}
        <rect
          x={-totalW / 2}
          y={-totalH / 2}
          width={totalW}
          height={totalH}
          rx={6}
          fill="none"
          stroke={stroke as string}
          strokeWidth={(strokeWidth as number) + 0.5}
        />
      </g>
    </g>
  );
}
