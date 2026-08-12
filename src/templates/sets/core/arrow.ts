import { z } from 'zod';
import type { Node, PointRef } from '../../../types/node';
import { createNode, PointRefSchema } from '../../../types/node';
import { parseColor } from '../../../types/color';
import type { HslColor } from '../../../types/properties';
import { AnchorSchema } from '../../../types/properties';
import type { AnchorPoint } from '../../../types/anchor';
import { dsl } from '../../../dsl/dslMeta';
import type { TextMeasurer } from '../../../text/measure';
import { pathLabelNode, type LabelBacking } from './pathLabel';

export const arrowProps = dsl(z.object({
  from: z.string().describe('Start point (node ID or x,y)'),
  to: z.string().describe('End point (node ID or x,y)'),
  label: z.string().describe('Label text').optional(),
  labelSize: z.number().describe('Label font size').optional(),
  labelBg: z.enum(['halo', 'plate', 'none']).describe('Label backing — close-fitting halo (default), opaque plate, or none').optional(),
  labelMaxWidth: z.number().describe('Wrap the label at this width in pixels').optional(),
  arrow: z.boolean().describe('Show end arrowhead').optional(),
  arrowStart: z.boolean().describe('Show start arrowhead').optional(),
  smooth: z.boolean().describe('Smooth curves').optional(),
  bend: z.number().describe('Bend amount').optional(),
  dashed: z.boolean().describe('Dashed line').optional(),
  gap: z.number().describe('Gap from node edge').optional(),
  color: z.string().describe('Color').optional(),
  colour: z.string().describe('Alias for color').optional(),
  strokeWidth: z.number().min(0).describe('Outline width in pixels').optional(),
  drawProgress: z.number().min(0).max(1).describe('Animated draw progress — 0 hides the line, 1 fully drawn').optional(),
  radius: z.number().min(0).describe('Corner rounding radius for routed polylines in pixels').optional(),
  closed: z.boolean().describe('Close the route into a loop').optional(),
  fromAnchor: AnchorSchema.describe('Anchor on the start node — named ("N","E",...) or an (x, y) tuple').optional(),
  toAnchor: AnchorSchema.describe('Anchor on the end node — named ("N","E",...) or an (x, y) tuple').optional(),
  route: z.array(PointRefSchema).describe('Waypoints between from and to — set by the `a -> x -> b` form').optional(),
  stroke: z.string().describe('Outline colour, overriding the one derived from color').optional(),
}), {
  positional: [
    { keys: ['route'], format: 'arrow' },
  ],
  kwargs: ['label', 'labelSize', 'labelBg', 'labelMaxWidth', 'bend', 'gap', 'color'],
  flags: ['arrow', 'arrowStart', 'smooth', 'dashed'],
});

const ARROW_SIZE = 8;

export function arrowTemplate(id: string, props: Record<string, unknown>, measure?: TextMeasurer): Node {
  const from = props.from as PointRef;
  const to = props.to as PointRef;
  const fromAnchor = props.fromAnchor as AnchorPoint | undefined;
  const toAnchor = props.toAnchor as AnchorPoint | undefined;
  const smooth = (props.smooth as boolean) ?? false;
  const bend = props.bend as number | undefined;
  const route = props.route as PointRef[] | undefined;
  const radius = props.radius as number | undefined;
  const closed = (props.closed as boolean) ?? false;
  const drawProgress = props.drawProgress as number | undefined;
  const label = props.label as string | undefined;
  const labelSize = (props.labelSize as number) ?? 11;
  const arrow = (props.arrow as boolean) ?? true;
  const arrowStart = (props.arrowStart as boolean) ?? false;
  const dashed = (props.dashed as boolean) ?? false;
  const gap = (props.gap as number) ?? 4;

  let stroke: HslColor = { h: 0, s: 0, l: 60 };
  // A named colour arrives as a string and needs parsing — arrow was the one
  // shape that took the object form only, so `arrow color=steelblue` drew a
  // default grey line and said nothing. Every sample arrow was the wrong
  // colour. `line`, `box` and the rest have always parsed strings here.
  if (props.colour || props.color) {
    const raw = (props.colour ?? props.color) as unknown;
    stroke = typeof raw === 'string' ? parseColor(raw) : raw as HslColor;
  }
  if (props.stroke) {
    stroke = typeof props.stroke === 'string' ? parseColor(props.stroke) : props.stroke as HslColor;
  }
  const strokeWidth = (props.strokeWidth as number) ?? 2;

  const children: Node[] = [];

  // Route path
  children.push(createNode({
    id: `${id}.route`,
    path: {
      route: route ? [from, ...route, to] : [from, to],
      smooth, closed,
      ...(fromAnchor ? { fromAnchor } : {}),
      ...(toAnchor ? { toAnchor } : {}),
      ...(bend !== undefined ? { bend } : {}),
      ...(radius !== undefined ? { radius } : {}),
      ...(drawProgress !== undefined ? { drawProgress } : {}),
      ...(arrow ? { toGap: gap + ARROW_SIZE } : { toGap: gap }),
      ...(arrowStart ? { fromGap: gap + ARROW_SIZE } : { fromGap: gap }),
    },
    stroke: { color: stroke, width: strokeWidth },
    ...(dashed ? { dash: { pattern: 'dashed', length: 8, gap: 4 } } : {}),
  }));

  // End arrowhead — points forward from path end toward target
  if (arrow) {
    children.push(createNode({
      id: `${id}.headEnd`,
      path: {
        points: [[0, -ARROW_SIZE / 2], [ARROW_SIZE, 0], [0, ARROW_SIZE / 2]],
        closed: true,
      },
      fill: stroke,
      transform: { pathFollow: `${id}.route`, pathProgress: 1.0 },
    }));
  }

  // Start arrowhead — points backward from path start toward source
  if (arrowStart) {
    children.push(createNode({
      id: `${id}.headStart`,
      path: {
        points: [[0, -ARROW_SIZE / 2], [-ARROW_SIZE, 0], [0, ARROW_SIZE / 2]],
        closed: true,
      },
      fill: stroke,
      transform: { pathFollow: `${id}.route`, pathProgress: 0.0 },
    }));
  }

  // Label, riding the midpoint of the route
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
