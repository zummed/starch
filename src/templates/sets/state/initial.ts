import { z } from 'zod';
import type { Node } from '../../../types/node';
import { createNode } from '../../../types/node';
import { parseColor } from '../../../types/color';
import type { HslColor } from '../../../types/properties';

export const stateInitialProps = z.object({
  color: z.string().describe('Color').optional(),
  r: z.number().min(1).describe('Radius').optional(),
});

export function stateInitialTemplate(id: string, props: Record<string, unknown>): Node {
  const r = (props.r as number) ?? 8;
  let fill: HslColor = { h: 0, s: 0, l: 80 };
  if (props.colour || props.color) {
    const raw = (props.colour ?? props.color) as unknown;
    fill = typeof raw === 'string' ? parseColor(raw) : raw as HslColor;
  }
  return createNode({
    id,
    children: [
      createNode({ id: `${id}.dot`, ellipse: { rx: r, ry: r }, fill }),
    ],
    ...(props.transform ? { transform: props.transform as any } : {}),
  });
}
