import { scaleAroundAnchor } from '../../engine/anchor';
import { FONT } from './constants';
import type { AnchorPoint } from '../../core/types';

interface BoxRendererProps {
  props: Record<string, unknown>;
}

export function BoxRenderer({ props }: BoxRendererProps) {
  const {
    x = 0,
    y = 0,
    w: rawW = 140,
    h: rawH = 50,
    _layoutW,
    _layoutH,
    fill = '#1a1d24',
    stroke = '#22d3ee',
    strokeWidth = 1.5,
    radius = 8,
    text,
    textColor = '#e2e5ea',
    textSize = 13,
    opacity = 1,
    scale = 1,
    bold = false,
    anchor = 'center',
    textOffset,
  } = props as Record<string, number | string | boolean | number[] | undefined>;

  const w = (_layoutW as number) || (rawW as number);
  const h = (_layoutH as number) || (rawH as number);

  const { outerTranslate, innerTransform } = scaleAroundAnchor(
    x as number, y as number, scale as number, anchor as AnchorPoint,
    (w as number) / 2, (h as number) / 2,
  );

  return (
    <g transform={outerTranslate} opacity={opacity as number}>
      <g transform={innerTransform}>
        <rect
          x={-(w as number) / 2}
          y={-(h as number) / 2}
          width={w as number}
          height={h as number}
          rx={radius as number}
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
            fontWeight={bold ? 700 : 400}
          >
            {text as string}
          </text>
        )}
      </g>
    </g>
  );
}
