import { z } from 'zod';
import type { Node } from '../../../types/node';
import { createNode } from '../../../types/node';
import { parseColor } from '../../../types/color';
import type { HslColor } from '../../../types/properties';
import { dsl } from '../../../dsl/dslMeta';

export const circleProps = dsl(z.object({
  text: z.string().describe('Label text').optional(),
  r: z.number().min(1).describe('Radius').optional(),
  textSize: z.number().min(1).describe('Font size').optional(),
  color: z.string().describe('Color').optional(),
}), {
  positional: [
    { keys: ['text'], format: 'quoted' },
    { keys: ['r'], format: 'spaced' },
  ],
  kwargs: ['textSize', 'color'],
});

export function circleTemplate(id: string, props: Record<string, unknown>): Node {
  const r = (props.r as number) ?? 30;
  const text = props.text as string | undefined;
  const textSize = (props.textSize as number) ?? 14;

  let fill: HslColor | undefined;
  let stroke: HslColor | undefined;

  if (props.colour || props.color) {
    const raw = (props.colour ?? props.color) as unknown;
    stroke = typeof raw === 'string' ? parseColor(raw) : raw as HslColor;
    fill = { h: stroke.h, s: Math.round(stroke.s * 0.35), l: Math.round(stroke.l * 0.15) };
  }
  if (props.fill) fill = typeof props.fill === 'string' ? parseColor(props.fill) : props.fill as HslColor;
  if (props.stroke) stroke = typeof props.stroke === 'string' ? parseColor(props.stroke) : props.stroke as HslColor;

  const children: Node[] = [
    createNode({
      id: `${id}.shape`,
      ellipse: { rx: r, ry: r },
      ...(fill ? { fill } : {}),
      ...(stroke ? { stroke: { color: stroke, width: (props.strokeWidth as number) ?? 2 } } : {}),
    }),
  ];

  if (text) {
    children.push(createNode({
      id: `${id}.label`,
      text: { content: text, size: textSize, align: 'middle' },
      fill: { h: 0, s: 0, l: 90 },
    }));
  }

  return createNode({
    id,
    children,
    ...(props.transform ? { transform: props.transform as any } : {}),
    ...(props.opacity !== undefined ? { opacity: props.opacity as number } : {}),
    ...(props.style ? { style: props.style as string } : {}),
  });
}
