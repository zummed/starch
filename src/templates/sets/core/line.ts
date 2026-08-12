import { z } from 'zod';
import type { Node, PointRef } from '../../../types/node';
import { createNode, PointRefSchema } from '../../../types/node';
import { parseColor } from '../../../types/color';
import type { HslColor } from '../../../types/properties';
import { dsl } from '../../../dsl/dslMeta';
import type { TextMeasurer } from '../../../text/measure';
import { pathLabelNode, type LabelBacking } from './pathLabel';

export const lineProps = dsl(z.object({
  from: z.string().describe('Start point'),
  to: z.string().describe('End point'),
  label: z.string().describe('Label text').optional(),
  labelSize: z.number().describe('Label font size').optional(),
  labelBg: z.enum(['halo', 'plate', 'none']).describe('Label backing — close-fitting halo (default), opaque plate, or none').optional(),
  labelMaxWidth: z.number().describe('Wrap the label at this width in pixels').optional(),
  arrow: z.boolean().describe('Show arrowhead').optional(),
  smooth: z.boolean().describe('Smooth curves').optional(),
  bend: z.number().describe('Bend amount').optional(),
  dashed: z.boolean().describe('Dashed line').optional(),
  color: z.string().describe('Color').optional(),
  colour: z.string().describe('Alias for color').optional(),
  strokeWidth: z.number().min(0).describe('Outline width in pixels').optional(),
  drawProgress: z.number().min(0).max(1).describe('Animated draw progress — 0 hides the line, 1 fully drawn').optional(),
  route: z.array(PointRefSchema).describe('Waypoints between from and to — set by the `a -> x -> b` form').optional(),
  stroke: z.string().describe('Outline colour, overriding the one derived from color').optional(),
}), {
  positional: [
    { keys: ['route'], format: 'arrow' },
  ],
  kwargs: ['label', 'labelSize', 'labelBg', 'labelMaxWidth', 'bend', 'color'],
  flags: ['arrow', 'smooth', 'dashed'],
});

export function lineTemplate(id: string, props: Record<string, unknown>, measure?: TextMeasurer): Node {
  const from = props.from as PointRef;
  const to = props.to as PointRef;
  const smooth = (props.smooth as boolean) ?? false;
  const bend = props.bend as number | undefined;
  const route = props.route as [number, number][] | undefined;
  const progress = props.drawProgress as number | undefined;
  const label = props.label as string | undefined;
  const labelSize = (props.labelSize as number) ?? 11;
  const arrow = (props.arrow as boolean) ?? false;
  const dashed = (props.dashed as boolean) ?? false;

  let stroke: HslColor = { h: 0, s: 0, l: 60 };
  if (props.colour || props.color) {
    const raw = (props.colour ?? props.color) as unknown;
    stroke = typeof raw === 'string' ? parseColor(raw) : raw as HslColor;
  }
  if (props.stroke) {
    stroke = typeof props.stroke === 'string' ? parseColor(props.stroke) : props.stroke as HslColor;
  }
  const strokeWidth = (props.strokeWidth as number) ?? 2;

  const children: Node[] = [
    createNode({
      id: `${id}.route`,
      path: {
        route: route ? [from, ...route, to] : [from, to],
        smooth,
        ...(bend !== undefined ? { bend } : {}),
        ...(progress !== undefined ? { drawProgress: progress } : {}),
      },
      stroke: { color: stroke, width: strokeWidth },
      ...(dashed ? { dash: { pattern: 'dashed', length: 8, gap: 4 } } : {}),
    }),
  ];

  if (arrow) {
    children.push(createNode({
      id: `${id}.arrowEnd`,
      path: { points: [[0, -4], [8, 0], [0, 4]], closed: true },
      fill: stroke,
      transform: { pathFollow: `${id}.route`, pathProgress: 1.0 },
    }));
  }

  if (label) {
    children.push(pathLabelNode(
      `${id}.label`,
      label,
      { path: `${id}.route`, progress: 0.5 },
      {
        size: labelSize,
        backing: (props.labelBg as LabelBacking) ?? 'halo',
        maxWidth: props.labelMaxWidth as number | undefined,
      },
      measure,
    ));
  }

  return createNode({
    id,
    children,
    ...(props.opacity !== undefined ? { opacity: props.opacity as number } : {}),
    ...(props.style ? { style: props.style as string } : {}),
  });
}
