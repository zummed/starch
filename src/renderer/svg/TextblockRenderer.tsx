import { scaleAroundAnchor } from '../../engine/anchor';
import type { AnchorPoint } from '../../core/types';
import { tokenizeLine } from './syntax';

const MONO_FONT = "'JetBrains Mono', 'Fira Code', monospace";
const SANS_FONT = "'Inter', 'system-ui', sans-serif";

interface TextblockRendererProps {
  id: string;
  props: Record<string, unknown>;
  allProps: Record<string, Record<string, unknown>>;
}

export function TextblockRenderer({ id, props, allProps }: TextblockRendererProps) {
  const {
    x = 0, y = 0,
    lines = [],
    color = '#e2e5ea',
    size = 14,
    lineHeight = 1.5,
    align = 'start',
    mono = false,
    bold = false,
    opacity = 1,
    scale = 1,
    anchor = 'center',
    background,
    padding = 0,
    radius = 0,
    syntax,
  } = props as Record<string, number | string | boolean | string[] | undefined>;

  const lineArr = (lines as string[]) || [];
  const fontSize = size as number;
  const lh = (lineHeight as number) * fontSize;
  const font = mono ? MONO_FONT : SANS_FONT;
  const pad = padding as number;

  // Estimate block dimensions for anchor/background
  const blockH = lineArr.length * lh + pad * 2;
  const blockW = Math.max(...lineArr.map(l => l.length * fontSize * 0.6), 100) + pad * 2;

  const { outerTranslate, innerTransform } = scaleAroundAnchor(
    x as number, y as number, scale as number, anchor as AnchorPoint,
    blockW / 2, blockH / 2,
  );

  const textAnchor = align === 'end' ? 'end' : align === 'middle' ? 'middle' : 'start';
  const textX = align === 'end' ? blockW / 2 - pad : align === 'middle' ? 0 : -blockW / 2 + pad;

  return (
    <g transform={outerTranslate} opacity={opacity as number}>
      <g transform={innerTransform}>
        {background && (
          <rect
            x={-blockW / 2}
            y={-blockH / 2}
            width={blockW}
            height={blockH}
            rx={radius as number}
            fill={background as string}
          />
        )}
        {lineArr.map((lineText, i) => {
          const lineProps = allProps[`${id}.line${i}`] || {};
          const lineOpacity = (lineProps.opacity as number) ?? 1;
          const lineColor = (lineProps.color as string) || undefined;
          const lineSize = (lineProps.size as number) || fontSize;
          const lineBold = (lineProps.bold as boolean) ?? (bold as boolean);
          const lineTextOverride = (lineProps.text as string) ?? lineText;

          // Syntax highlighting: tokenize into coloured spans
          const useSyntax = syntax && mono && !lineColor;
          const tokens = useSyntax
            ? tokenizeLine(lineTextOverride, syntax as string, color as string)
            : null;

          return (
            <text
              key={i}
              x={textX}
              y={-blockH / 2 + pad + lh * 0.7 + i * lh}
              textAnchor={textAnchor}
              dominantBaseline="auto"
              fill={lineColor || (color as string)}
              fontSize={lineSize}
              fontFamily={font}
              fontWeight={lineBold ? 700 : 400}
              opacity={lineOpacity}
              style={{ whiteSpace: 'pre' }}
            >
              {tokens
                ? tokens.map((tok, j) => (
                    <tspan key={j} fill={tok.color}>{tok.text}</tspan>
                  ))
                : lineTextOverride
              }
            </text>
          );
        })}
      </g>
    </g>
  );
}
