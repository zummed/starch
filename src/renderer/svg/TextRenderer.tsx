import { FONT } from './constants';

interface TextRendererProps {
  props: Record<string, unknown>;
}

export function TextRenderer({ props }: TextRendererProps) {
  const {
    x = 0,
    y = 0,
    text = '',
    color = '#e2e5ea',
    size = 14,
    bold = false,
    opacity = 1,
    align = 'middle',
  } = props as Record<string, number | string | boolean | undefined>;

  return (
    <text
      x={x as number}
      y={y as number}
      textAnchor={align as 'start' | 'middle' | 'end'}
      dominantBaseline="middle"
      fill={color as string}
      fontSize={size as number}
      fontFamily={FONT}
      fontWeight={bold ? 700 : 400}
      opacity={opacity as number}
    >
      {text as string}
    </text>
  );
}
