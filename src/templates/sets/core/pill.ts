import { z } from 'zod';
import type { Node } from '../../../types/node';
import { createNode } from '../../../types/node';
import { parseColor } from '../../../types/color';
import type { HslColor } from '../../../types/properties';

export const pillProps = z.object({
  text: z.string().describe('Label text').optional(),
  color: z.string().describe('Color (sets stroke + faded fill)').optional(),
  w: z.number().min(1).describe('Width').optional(),
  h: z.number().min(1).describe('Height').optional(),
});

export function pillTemplate(id: string, props: Record<string, unknown>): Node {
  const w = (props.w as number) ?? 80;
  const h = (props.h as number) ?? 30;
  const radius = Math.min(w, h) / 2;
  const text = props.text as string | undefined;

  let fill: HslColor | undefined;
  let stroke: HslColor | undefined;

  if (props.colour || props.color) {
    const raw = (props.colour ?? props.color) as unknown;
    stroke = typeof raw === 'string' ? parseColor(raw) : (raw as HslColor);
    fill = { h: stroke.h, s: stroke.s, l: stroke.l, a: 0.15 };
  }

  const children: Node[] = [
    createNode({
      id: `${id}.bg`,
      rect: { w, h, radius },
      ...(fill ? { fill } : {}),
      ...(stroke ? { stroke: { color: stroke, width: 2 } } : {}),
    }),
  ];

  if (text !== undefined) {
    children.push(
      createNode({
        id: `${id}.label`,
        text: { content: text, size: 12, align: 'middle' },
        fill: { h: 0, s: 0, l: 90 },
        transform: { x: w / 2, y: h / 2 },
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
