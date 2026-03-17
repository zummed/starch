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
    image,
    imageFit = 'contain',
    imagePadding = 2,
  } = props as Record<string, number | string | boolean | number[] | undefined>;

  const tx = (x as number) + ((textOffset as unknown as [number, number])?.[0] || 0);
  const ty = (y as number) + ((textOffset as unknown as [number, number])?.[1] || 0);
  const imgSize = (size as number) * 1.4;
  const imgPad = imagePadding as number;

  if (!image) {
    return (
      <text
        x={tx}
        y={ty}
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

  return (
    <g opacity={opacity as number}>
      <image
        href={image as string}
        x={tx - imgSize / 2}
        y={ty - imgSize / 2}
        width={imgSize - imgPad * 2}
        height={imgSize - imgPad * 2}
        preserveAspectRatio={
          imageFit === 'cover' ? 'xMidYMid slice' :
          imageFit === 'fill' ? 'none' : 'xMidYMid meet'
        }
      />
      {text && (
        <text
          x={tx + imgSize / 2 + 4}
          y={ty}
          textAnchor="start"
          dominantBaseline="middle"
          fill={color as string}
          fontSize={size as number}
          fontFamily={FONT}
          fontWeight={bold ? 700 : 400}
        >
          {text as string}
        </text>
      )}
    </g>
  );
}
