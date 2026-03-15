import { scaleAroundAnchor } from '../../engine/anchor';
import { FONT } from './constants';
import type { AnchorPoint } from '../../core/types';

interface CircleRendererProps {
  props: Record<string, unknown>;
}

export function CircleRenderer({ props }: CircleRendererProps) {
  const {
    x = 0,
    y = 0,
    r = 20,
    fill = '#1a1d24',
    stroke = '#22d3ee',
    strokeWidth = 1.5,
    text,
    textColor = '#e2e5ea',
    textSize = 12,
    opacity = 1,
    scale = 1,
    anchor = 'center',
    textOffset,
  } = props as Record<string, number | string | boolean | number[] | undefined>;

  const { outerTranslate, innerTransform } = scaleAroundAnchor(
    x as number, y as number, scale as number, anchor as AnchorPoint,
    r as number, r as number,
  );

  return (
    <g transform={outerTranslate} opacity={opacity as number}>
      <g transform={innerTransform}>
        <circle
          cx={0}
          cy={0}
          r={r as number}
          fill={fill as string}
          stroke={stroke as string}
          strokeWidth={strokeWidth as number}
        />
        {text && (
          <text
            x={0 + ((textOffset as unknown as [number, number])?.[0] || 0)}
            y={1 + ((textOffset as unknown as [number, number])?.[1] || 0)}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={textColor as string}
            fontSize={textSize as number}
            fontFamily={FONT}
          >
            {text as string}
          </text>
        )}
      </g>
    </g>
  );
}
