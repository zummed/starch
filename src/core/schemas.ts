import { z } from 'zod';
import type { ObjectType } from './types/base';
import { resolveColourShortcut } from './colours';

// ─── Anchor Schema ──────────────────────────────────────────────

const NamedAnchorSchema = z.enum([
  'center', 'top', 'bottom', 'left', 'right',
  'topleft', 'topright', 'bottomleft', 'bottomright',
  'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW',
]);

const FloatAnchorSchema = z.object({ x: z.number(), y: z.number() });

const AnchorSchema = z.union([NamedAnchorSchema, FloatAnchorSchema]);

// ─── Base Schema ────────────────────────────────────────────────

const BaseSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  scale: z.number().default(1),
  anchor: AnchorSchema.default('center'),
  colour: z.string().optional(),
  fill: z.string().optional(),
  stroke: z.string().optional(),
  text: z.string().optional(),
  textColor: z.string().optional(),
  textSize: z.number().optional(),
  textOffset: z.tuple([z.number(), z.number()]).optional(),
  depth: z.number().optional(),
  visible: z.boolean().default(true),
  follow: z.string().optional(),
  pathProgress: z.number().optional(),
}).passthrough();

// ─── Shape Schemas ──────────────────────────────────────────────

export const BoxSchema = BaseSchema.extend({
  w: z.number().default(120),
  h: z.number().default(40),
  radius: z.number().default(8),
  strokeWidth: z.number().default(1.5),
  bold: z.boolean().default(false),
}).passthrough();

export const CircleSchema = BaseSchema.extend({
  r: z.number().default(30),
  strokeWidth: z.number().default(1.5),
}).passthrough();

export const LabelSchema = BaseSchema.extend({
  text: z.string(),
  color: z.string().optional(),
  size: z.number().default(14),
  bold: z.boolean().default(false),
  align: z.enum(['start', 'middle', 'end']).default('middle'),
}).passthrough();

export const LineSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  fromAnchor: AnchorSchema.optional(),
  toAnchor: AnchorSchema.optional(),
  x1: z.number().optional(),
  y1: z.number().optional(),
  x2: z.number().optional(),
  y2: z.number().optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().default(1.5),
  dashed: z.boolean().default(false),
  arrow: z.boolean().default(true),
  label: z.string().optional(),
  labelColor: z.string().optional(),
  labelSize: z.number().default(11),
  labelRotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  progress: z.number().min(0).max(1).default(1),
  bend: z.union([
    z.number(),
    z.array(z.object({ x: z.number(), y: z.number() })),
  ]).optional(),
  closed: z.boolean().default(false),
  colour: z.string().optional(),
  textOffset: z.tuple([z.number(), z.number()]).optional(),
}).passthrough();

export const TableSchema = BaseSchema.extend({
  cols: z.array(z.string()),
  rows: z.array(z.array(z.string())).default([]),
  colWidth: z.number().default(100),
  rowHeight: z.number().default(30),
  headerFill: z.string().optional(),
  headerColor: z.string().optional(),
  strokeWidth: z.number().default(1),
}).passthrough();

export const PathSchema = z.object({
  points: z.array(z.object({ x: z.number(), y: z.number() })),
  closed: z.boolean().default(false),
  stroke: z.string().optional(),
  strokeWidth: z.number().default(1),
  visible: z.boolean().default(false),
  opacity: z.number().min(0).max(1).default(1),
  colour: z.string().optional(),
}).passthrough();

export const GroupSchema = BaseSchema.extend({
  children: z.array(z.string()).default([]),
  direction: z.enum(['row', 'column']).optional(),
  gap: z.number().default(0),
  justify: z.enum(['start', 'center', 'end', 'spread']).default('center'),
  align: z.enum(['start', 'center', 'end']).default('center'),
  padding: z.number().default(0),
  rotation: z.number().default(0),
  strokeWidth: z.number().default(2),
  radius: z.number().default(0),
}).passthrough();

// ─── Schema Registry ────────────────────────────────────────────

const SCHEMAS: Record<string, z.ZodType> = {
  box: BoxSchema,
  circle: CircleSchema,
  label: LabelSchema,
  line: LineSchema,
  table: TableSchema,
  path: PathSchema,
  group: GroupSchema,
};

/**
 * Parse raw props through the appropriate Zod schema for a given type,
 * applying defaults and resolving the `colour` shortcut.
 */
export function parseShape(
  type: ObjectType,
  rawProps: Record<string, unknown>,
): Record<string, unknown> {
  const schema = SCHEMAS[type];
  if (!schema) return rawProps;

  const parsed = schema.parse(rawProps);
  return resolveColourShortcut(parsed as Record<string, unknown>);
}

export const VALID_TYPES = new Set<string>([
  'box', 'circle', 'label', 'table', 'line', 'path', 'group',
]);

export const SCHEMA_METADATA = {
  types: [...VALID_TYPES],
  props: {
    base: ['x', 'y', 'opacity', 'scale', 'anchor', 'colour', 'fill', 'stroke', 'text', 'textColor', 'textSize', 'textOffset', 'depth', 'visible', 'follow', 'pathProgress'],
    box: ['w', 'h', 'radius', 'strokeWidth', 'bold'],
    circle: ['r', 'strokeWidth'],
    label: ['text', 'color', 'size', 'bold', 'align'],
    line: ['from', 'to', 'fromAnchor', 'toAnchor', 'x1', 'y1', 'x2', 'y2', 'stroke', 'strokeWidth', 'dashed', 'arrow', 'label', 'labelColor', 'labelSize', 'opacity', 'progress', 'bend', 'colour', 'textOffset'],
    table: ['cols', 'rows', 'colWidth', 'rowHeight', 'headerFill', 'headerColor', 'strokeWidth'],
    path: ['points', 'closed', 'stroke', 'strokeWidth', 'visible', 'opacity', 'colour'],
    group: ['children', 'direction', 'gap', 'justify', 'align', 'padding', 'rotation', 'strokeWidth', 'radius'],
  },
  easing: [
    'linear', 'easeIn', 'easeOut', 'easeInOut',
    'easeInCubic', 'easeOutCubic', 'easeInOutCubic',
    'easeInQuart', 'easeOutQuart', 'easeInOutQuart',
    'easeInBack', 'easeOutBack',
    'bounce', 'elastic', 'spring', 'snap', 'step',
  ],
  anchors: [
    'center', 'top', 'bottom', 'left', 'right',
    'topleft', 'topright', 'bottomleft', 'bottomright',
    'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW',
  ],
  align: ['start', 'center', 'end'],
  justify: ['start', 'center', 'end', 'spread'],
  direction: ['row', 'column'],
  keyframeProps: ['time', 'target', 'prop', 'value', 'easing'],
  animateProps: ['duration', 'loop', 'keyframes', 'chapters'],
  shorthandProps: ['at', 'size'],
} as const;
