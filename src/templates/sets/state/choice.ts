import { z } from 'zod';
import type { Node } from '../../../types/node';
import { createNode } from '../../../types/node';
import { parseColor } from '../../../types/color';
import type { HslColor } from '../../../types/properties';

export const stateChoiceProps = z.object({
  color: z.string().describe('Color').optional(),
  size: z.number().min(1).describe('Diamond size').optional(),
});

export function stateChoiceTemplate(id: string, props: Record<string, unknown>): Node {
  const size = (props.size as number) ?? 20;
  let fill: HslColor = { h: 30, s: 30, l: 20 };
  let stroke: HslColor = { h: 30, s: 50, l: 50 };
  if (props.colour || props.color) {
    const raw = (props.colour ?? props.color) as unknown;
    const hsl = typeof raw === 'string' ? parseColor(raw) : raw as HslColor;
    stroke = hsl;
    fill = { ...hsl, a: 0.15 };
  }
  return createNode({
    id,
    children: [
      createNode({
        id: `${id}.diamond`,
        path: { points: [[size, 0], [size * 2, size], [size, size * 2], [0, size]], closed: true },
        fill,
        stroke: { color: stroke, width: 2 },
      }),
    ],
    ...(props.transform ? { transform: props.transform as any } : {}),
  });
}
