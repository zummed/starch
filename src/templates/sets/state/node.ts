import { z } from 'zod';
import type { Node } from '../../../types/node';
import { createNode } from '../../../types/node';
import { parseColor } from '../../../types/color';
import type { HslColor } from '../../../types/properties';
import { dsl } from '../../../dsl/dslMeta';

export const stateNodeProps = dsl(z.object({
  name: z.string().describe('State name'),
  entry: z.string().describe('Entry action').optional(),
  exit: z.string().describe('Exit action').optional(),
  w: z.number().min(1).describe('Width').optional(),
  h: z.number().min(1).describe('Height').optional(),
  color: z.string().describe('Color').optional(),
}), {
  positional: [
    { keys: ['name'], format: 'quoted' },
    { keys: ['w', 'h'], format: 'dimension' },
  ],
  kwargs: ['entry', 'exit', 'w', 'h', 'color'],
});

export function stateNodeTemplate(id: string, props: Record<string, unknown>): Node {
  const name = (props.name as string) ?? id;
  const w = (props.w as number) ?? 140;
  const h = (props.h as number) ?? 60;
  const entry = props.entry as string | undefined;
  const exit = props.exit as string | undefined;

  let fill: HslColor = { h: 30, s: 30, l: 20 };
  let stroke: HslColor = { h: 30, s: 50, l: 50 };

  if (props.colour || props.color) {
    const raw = (props.colour ?? props.color) as unknown;
    const hsl = typeof raw === 'string' ? parseColor(raw) : raw as HslColor;
    stroke = hsl;
    fill = { ...hsl, a: 0.15 };
  }

  const children: Node[] = [
    createNode({
      id: `${id}.bg`,
      rect: { w, h, radius: 16 },
      fill,
      stroke: { color: stroke, width: 2 },
    }),
    createNode({
      id: `${id}.name`,
      text: { content: name, size: 14, bold: true, align: 'middle' },
      fill: { h: 0, s: 0, l: 90 },
      transform: { x: 0, y: entry || exit ? -h / 2 + 18 : 0 },
    }),
  ];

  if (entry || exit) {
    children.push(createNode({
      id: `${id}.divider`,
      path: { points: [[-w / 2 + 8, -h / 2 + 30], [w / 2 - 8, -h / 2 + 30]], closed: false },
      stroke: { color: stroke, width: 1 },
    }));
    let actionY = -h / 2 + 40;
    if (entry) {
      children.push(createNode({
        id: `${id}.entry`,
        text: { content: `entry / ${entry}`, size: 10, align: 'start' },
        fill: { h: 0, s: 0, l: 70 },
        transform: { x: -w / 2 + 12, y: actionY },
      }));
      actionY += 14;
    }
    if (exit) {
      children.push(createNode({
        id: `${id}.exit`,
        text: { content: `exit / ${exit}`, size: 10, align: 'start' },
        fill: { h: 0, s: 0, l: 70 },
        transform: { x: -w / 2 + 12, y: actionY },
      }));
    }
  }

  return createNode({
    id,
    children,
    ...(props.transform ? { transform: props.transform as any } : {}),
    ...(props.opacity !== undefined ? { opacity: props.opacity as number } : {}),
    ...(props.style ? { style: props.style as string } : {}),
  });
}
