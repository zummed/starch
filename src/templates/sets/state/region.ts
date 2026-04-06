import { z } from 'zod';
import type { Node } from '../../../types/node';
import { createNode } from '../../../types/node';
import { parseColor } from '../../../types/color';
import type { HslColor } from '../../../types/properties';

export const stateRegionProps = z.object({
  label: z.string().describe('Region label'),
  color: z.string().describe('Color').optional(),
  w: z.number().min(1).describe('Width').optional(),
  h: z.number().min(1).describe('Height').optional(),
  direction: z.enum(['row', 'column']).describe('Layout direction').optional(),
  gap: z.number().min(0).describe('Gap between children').optional(),
});

export function stateRegionTemplate(id: string, props: Record<string, unknown>): Node {
  const label = (props.label as string) ?? '';
  const w = (props.w as number) ?? 300;
  const h = (props.h as number) ?? 200;
  const direction = (props.direction as 'row' | 'column') ?? 'row';
  const gap = (props.gap as number) ?? 16;

  let stroke: HslColor = { h: 0, s: 0, l: 50 };
  let fill: HslColor = { h: 0, s: 0, l: 15, a: 0.3 };
  if (props.colour || props.color) {
    const raw = (props.colour ?? props.color) as unknown;
    const hsl = typeof raw === 'string' ? parseColor(raw) : raw as HslColor;
    stroke = hsl;
    fill = { ...hsl, a: 0.08 };
  }

  return createNode({
    id,
    children: [
      createNode({
        id: `${id}.bg`,
        rect: { w, h, radius: 8 },
        fill,
        stroke: { color: stroke, width: 1 },
        dash: { pattern: 'dashed', length: 6, gap: 4 },
      }),
      createNode({
        id: `${id}.title`,
        text: { content: label, size: 11, bold: true, align: 'start' },
        fill: { h: 0, s: 0, l: 70 },
        transform: { x: 10, y: 14 },
      }),
    ],
    layout: { type: 'flex', direction, gap, padding: 30 },
    ...(props.transform ? { transform: props.transform as any } : {}),
    ...(props.opacity !== undefined ? { opacity: props.opacity as number } : {}),
    ...(props.style ? { style: props.style as string } : {}),
  });
}
