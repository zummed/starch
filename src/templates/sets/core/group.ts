import { z } from 'zod';
import type { Node } from '../../../types/node';
import { createNode } from '../../../types/node';
import { parseColor } from '../../../types/color';
import type { HslColor } from '../../../types/properties';

export const groupProps = z.object({
  label: z.string().describe('Group label').optional(),
  color: z.string().describe('Color').optional(),
  w: z.number().min(1).describe('Width').optional(),
  h: z.number().min(1).describe('Height').optional(),
  direction: z.enum(['row', 'column']).describe('Flex layout direction').optional(),
  gap: z.number().min(0).describe('Gap between children').optional(),
});

const DEFAULT_STROKE: HslColor = { h: 0, s: 0, l: 50 };
const DEFAULT_FILL: HslColor = { h: 0, s: 0, l: 15, a: 0.3 };

export function groupTemplate(id: string, props: Record<string, unknown>): Node {
  const w = (props.w as number) ?? 300;
  const h = (props.h as number) ?? 200;
  const label = props.label as string | undefined;
  const direction = (props.direction as 'row' | 'column') ?? 'row';
  const gap = (props.gap as number) ?? 16;

  let stroke: HslColor = DEFAULT_STROKE;
  let fill: HslColor = DEFAULT_FILL;

  if (props.colour || props.color) {
    const raw = (props.colour ?? props.color) as unknown;
    stroke = typeof raw === 'string' ? parseColor(raw) : (raw as HslColor);
    fill = { h: stroke.h, s: Math.round(stroke.s * 0.5), l: Math.round(stroke.l * 0.3), a: 0.3 };
  }

  const children: Node[] = [
    createNode({
      id: `${id}.bg`,
      rect: { w, h, radius: 6 },
      fill,
      stroke: { color: stroke, width: 2 },
      dash: { pattern: 'dashed' },
    }),
  ];

  if (label !== undefined) {
    children.push(
      createNode({
        id: `${id}.title`,
        text: { content: label, size: 11, align: 'start', bold: true },
        fill: { h: 0, s: 0, l: 80 },
        transform: { x: 10, y: 10 },
      }),
    );
  }

  return createNode({
    id,
    children,
    layout: { type: 'flex', direction, gap, padding: 30 },
    ...(props.transform ? { transform: props.transform as any } : {}),
    ...(props.opacity !== undefined ? { opacity: props.opacity as number } : {}),
    ...(props.style ? { style: props.style as string } : {}),
  });
}
