import { z } from 'zod';
import type { Node } from '../../../types/node';
import { createNode } from '../../../types/node';
import { parseColor } from '../../../types/color';
import type { HslColor } from '../../../types/properties';
import { dsl } from '../../../dsl/dslMeta';

export const cardProps = dsl(z.object({
  title: z.string().describe('Card title'),
  body: z.string().describe('Body text').optional(),
  w: z.number().min(1).describe('Width').optional(),
  h: z.number().min(1).describe('Height').optional(),
  color: z.string().describe('Color (sets stroke + faded fill)').optional(),
}), {
  positional: [
    { keys: ['title'], format: 'quoted' },
    { keys: ['w', 'h'], format: 'dimension' },
  ],
  kwargs: ['body', 'color'],
});

export function cardTemplate(id: string, props: Record<string, unknown>): Node {
  const w = (props.w as number) ?? 180;
  const h = (props.h as number) ?? 100;
  const title = (props.title as string) ?? '';
  const body = props.body as string | undefined;

  const headerY = 20;
  const dividerY = 32;
  const bodyY = dividerY + 16;

  let stroke: HslColor = { h: 0, s: 0, l: 50 };
  let fill: HslColor = { h: 0, s: 0, l: 15 };

  if (props.colour || props.color) {
    const raw = (props.colour ?? props.color) as unknown;
    stroke = typeof raw === 'string' ? parseColor(raw) : (raw as HslColor);
    fill = { h: stroke.h, s: Math.round(stroke.s * 0.35), l: Math.round(stroke.l * 0.15) };
  }

  const children: Node[] = [
    createNode({
      id: `${id}.bg`,
      rect: { w, h, radius: 6 },
      fill,
      stroke: { color: stroke, width: 2 },
    }),
    createNode({
      id: `${id}.header`,
      text: { content: title, size: 14, align: 'middle', bold: true },
      fill: { h: 0, s: 0, l: 90 },
      transform: { x: w / 2, y: headerY },
    }),
    createNode({
      id: `${id}.divider`,
      path: {
        points: [
          [0, dividerY],
          [w, dividerY],
        ],
      },
      ...(stroke ? { stroke: { color: stroke, width: 1 } } : { stroke: { color: { h: 0, s: 0, l: 50 }, width: 1 } }),
    }),
  ];

  if (body !== undefined) {
    children.push(
      createNode({
        id: `${id}.body`,
        text: { content: body, size: 11, align: 'start' },
        fill: { h: 0, s: 0, l: 80 },
        transform: { x: 10, y: bodyY },
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
