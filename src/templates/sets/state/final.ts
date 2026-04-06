import { z } from 'zod';
import type { Node } from '../../../types/node';
import { createNode } from '../../../types/node';
import { parseColor } from '../../../types/color';
import type { HslColor } from '../../../types/properties';

export const stateFinalProps = z.object({
  color: z.string().describe('Color').optional(),
  r: z.number().min(1).describe('Radius').optional(),
});

export function stateFinalTemplate(id: string, props: Record<string, unknown>): Node {
  const r = (props.r as number) ?? 10;
  let color: HslColor = { h: 0, s: 0, l: 80 };
  if (props.colour || props.color) {
    const raw = (props.colour ?? props.color) as unknown;
    color = typeof raw === 'string' ? parseColor(raw) : raw as HslColor;
  }
  return createNode({
    id,
    children: [
      createNode({ id: `${id}.outer`, ellipse: { rx: r, ry: r }, stroke: { color, width: 2 } }),
      createNode({ id: `${id}.inner`, ellipse: { rx: r * 0.6, ry: r * 0.6 }, fill: color }),
    ],
    ...(props.transform ? { transform: props.transform as any } : {}),
  });
}
