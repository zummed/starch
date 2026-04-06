import { z } from 'zod';
import type { Node } from '../../../types/node';
import { createNode } from '../../../types/node';
import { parseColor } from '../../../types/color';
import type { HslColor } from '../../../types/properties';
import { dsl } from '../../../dsl/dslMeta';

export const noteProps = dsl(z.object({
  text: z.string().describe('Note text').optional(),
  w: z.number().min(1).describe('Width').optional(),
  h: z.number().min(1).describe('Height').optional(),
  color: z.string().describe('Color (stroke; fill derived)').optional(),
}), {
  positional: [
    { keys: ['text'], format: 'quoted' },
    { keys: ['w', 'h'], format: 'dimension' },
  ],
  kwargs: ['color'],
});

const DEFAULT_STROKE: HslColor = { h: 50, s: 60, l: 25 };
const DEFAULT_FILL: HslColor = { h: 50, s: 50, l: 45 };

export function noteTemplate(id: string, props: Record<string, unknown>): Node {
  const w = (props.w as number) ?? 140;
  const h = (props.h as number) ?? 80;
  const text = props.text as string | undefined;
  const foldSize = 12;

  let stroke: HslColor = DEFAULT_STROKE;
  let fill: HslColor = DEFAULT_FILL;

  if (props.colour || props.color) {
    const raw = (props.colour ?? props.color) as unknown;
    stroke = typeof raw === 'string' ? parseColor(raw) : (raw as HslColor);
    fill = { h: stroke.h, s: Math.round(stroke.s * 0.85), l: Math.min(stroke.l + 20, 90) };
  }

  const children: Node[] = [
    createNode({
      id: `${id}.bg`,
      rect: { w, h, radius: 2 },
      fill,
      stroke: { color: stroke, width: 2 },
    }),
    createNode({
      id: `${id}.fold`,
      path: {
        points: [
          [w / 2 - foldSize, -h / 2],
          [w / 2, -h / 2 + foldSize],
          [w / 2 - foldSize, -h / 2 + foldSize],
        ],
        closed: true,
      },
      fill: stroke,
    }),
  ];

  if (text !== undefined) {
    children.push(
      createNode({
        id: `${id}.label`,
        text: { content: text, size: 12, align: 'start' },
        fill: { h: 0, s: 0, l: 10 },
        transform: { x: -w / 2 + 8, y: -h / 2 + 10 },
      }),
    );
  }

  return createNode({
    id,
    children,
    ...(props.transform ? { transform: props.transform as any } : {}),
    ...(props.opacity !== undefined ? { opacity: props.opacity as number } : {}),
    ...(props.style ? { style: props.style as string } : {}),
  });
}
