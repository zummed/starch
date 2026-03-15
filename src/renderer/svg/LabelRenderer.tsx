import { FONT } from './constants';

interface LabelRendererProps {
  props: Record<string, unknown>;
}

export function LabelRenderer({ props }: LabelRendererProps) {
  const {
    x = 0,
    y = 0,
    text = '',
    color = '#e2e5ea',
    size = 14,
    bold = false,
    opacity = 1,
    align = 'middle',
    textOffset,
  } = props as Record<string, number | string | boolean | number[] | undefined>;

  return (
    <text
      x={(x as number) + ((textOffset as unknown as [number, number])?.[0] || 0)}
      y={(y as number) + ((textOffset as unknown as [number, number])?.[1] || 0)}
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
