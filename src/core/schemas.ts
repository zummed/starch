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
  rotation: z.number().default(0),
  direction: z.enum(['row', 'column']).default('column'),
  gap: z.number().default(12),
  justify: z.enum(['start', 'center', 'end', 'spaceBetween', 'spaceAround']).default('start'),
  align: z.enum(['start', 'center', 'end', 'stretch']).default('start'),
  wrap: z.boolean().default(false),
  padding: z.number().default(12),
  paddingTop: z.number().optional(),
  paddingRight: z.number().optional(),
  paddingBottom: z.number().optional(),
  paddingLeft: z.number().optional(),
  group: z.string().optional(),
  order: z.number().default(0),
  grow: z.number().default(0),
  shrink: z.number().default(0),
  alignSelf: z.enum(['start', 'center', 'end', 'stretch']).optional(),
  cascadeOpacity: z.boolean().default(true),
  cascadeScale: z.boolean().default(true),
  cascadeRotation: z.boolean().default(true),
  at: z.string().optional(),
}).passthrough();

// ─── Shape Schemas ──────────────────────────────────────────────

export const BoxSchema = BaseSchema.extend({
  w: z.number().default(140),
  h: z.number().default(46),
  radius: z.number().default(8),
  strokeWidth: z.number().default(1.5),
  bold: z.boolean().default(false),
  image: z.string().optional(),
  imageFit: z.enum(['contain', 'cover', 'fill']).default('contain'),
  imagePadding: z.number().default(4),
}).passthrough();

export const CircleSchema = BaseSchema.extend({
  r: z.number().default(30),
  strokeWidth: z.number().default(1.5),
  image: z.string().optional(),
  imageFit: z.enum(['contain', 'cover', 'fill']).default('contain'),
  imagePadding: z.number().default(4),
}).passthrough();

export const LabelSchema = BaseSchema.extend({
  text: z.string().default(''),
  color: z.string().optional(),
  size: z.number().default(14),
  image: z.string().optional(),
  imageFit: z.enum(['contain', 'cover', 'fill']).default('contain'),
  imagePadding: z.number().default(2),
  bold: z.boolean().default(false),
  align: z.enum(['start', 'middle', 'end']).default('middle'),
}).passthrough();

// PointRef: object ID, [x, y], or ["objectId", dx, dy]
const PointRefSchema = z.union([
  z.string(),
  z.tuple([z.number(), z.number()]),
  z.tuple([z.string(), z.number(), z.number()]),
]);

export const LineSchema = z.object({
  from: PointRefSchema.optional(),
  to: PointRefSchema.optional(),
  fromAnchor: AnchorSchema.optional(),
  toAnchor: AnchorSchema.optional(),
  x1: z.number().optional(),
  y1: z.number().optional(),
  x2: z.number().optional(),
  y2: z.number().optional(),
  route: z.array(PointRefSchema).optional(),
  smooth: z.boolean().default(true),
  stroke: z.string().optional(),
  strokeWidth: z.number().default(1.5),
  dashed: z.boolean().default(false),
  arrow: z.boolean().default(true),
  arrowStart: z.boolean().default(false),
  label: z.string().optional(),
  labelColor: z.string().optional(),
  labelSize: z.number().default(11),
  labelRotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  progress: z.number().min(0).max(1).default(1),
  bend: z.number().optional(),
  radius: z.number().default(0),
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

export const CameraSchema = z.object({
  target: PointRefSchema.default([400, 250]),
  zoom: z.number().default(1),
  fit: z.union([z.literal('all'), z.array(z.string())]).optional(),
}).passthrough();

export const TextblockSchema = BaseSchema.extend({
  lines: z.array(z.string()).default([]),
  color: z.string().default('#e2e5ea'),
  size: z.number().default(14),
  lineHeight: z.number().default(1.5),
  align: z.enum(['start', 'middle', 'end']).default('start'),
  mono: z.boolean().default(false),
  bold: z.boolean().default(false),
  syntax: z.string().optional(),
  background: z.string().optional(),
  padding: z.number().default(12),
  radius: z.number().default(8),
}).passthrough();

export const PointSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  visible: z.boolean().default(false),
}).passthrough();

// ─── Schema Registry ────────────────────────────────────────────

const SCHEMAS: Record<string, z.ZodType> = {
  box: BoxSchema,
  circle: CircleSchema,
  label: LabelSchema,
  line: LineSchema,
  table: TableSchema,
  path: PathSchema,
  camera: CameraSchema,
  textblock: TextblockSchema,
  point: PointSchema,
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
  'box', 'circle', 'label', 'table', 'line', 'path', 'camera', 'textblock', 'code', 'point',
]);

export const SCHEMA_METADATA = {
  types: [...VALID_TYPES],
  props: {
    base: ['x', 'y', 'opacity', 'scale', 'anchor', 'colour', 'fill', 'stroke', 'text', 'textColor', 'textSize', 'textOffset', 'depth', 'visible', 'follow', 'pathProgress', 'rotation', 'direction', 'gap', 'justify', 'align', 'wrap', 'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'group', 'order', 'grow', 'shrink', 'alignSelf', 'cascadeOpacity', 'cascadeScale', 'cascadeRotation', 'at'],
    box: ['w', 'h', 'radius', 'strokeWidth', 'bold', 'textAlign', 'textVAlign', 'image', 'imageFit', 'imagePadding'],
    circle: ['r', 'strokeWidth', 'image', 'imageFit', 'imagePadding'],
    label: ['text', 'color', 'size', 'bold', 'align', 'image', 'imageFit', 'imagePadding'],
    line: ['from', 'to', 'fromAnchor', 'toAnchor', 'x1', 'y1', 'x2', 'y2', 'route', 'smooth', 'radius', 'stroke', 'strokeWidth', 'dashed', 'arrow', 'arrowStart', 'label', 'labelColor', 'labelSize', 'opacity', 'progress', 'bend', 'colour', 'textOffset'],
    table: ['cols', 'rows', 'colWidth', 'rowHeight', 'headerFill', 'headerColor', 'strokeWidth'],
    path: ['points', 'closed', 'stroke', 'strokeWidth', 'visible', 'opacity', 'colour'],
    camera: ['target', 'zoom', 'fit'],
    textblock: ['lines', 'color', 'size', 'lineHeight', 'align', 'mono', 'bold', 'syntax', 'background', 'padding', 'radius'],
  },
  easing: [
    'linear', 'easeIn', 'easeOut', 'easeInOut',
    'easeInCubic', 'easeOutCubic', 'easeInOutCubic',
    'easeInQuart', 'easeOutQuart', 'easeInOutQuart',
    'easeInBack', 'easeOutBack',
    'bounce', 'elastic', 'spring', 'snap', 'step', 'cut',
  ],
  anchors: [
    'center', 'top', 'bottom', 'left', 'right',
    'topleft', 'topright', 'bottomleft', 'bottomright',
    'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW',
  ],
  align: ['start', 'center', 'end', 'stretch'],
  justify: ['start', 'center', 'end', 'spaceBetween', 'spaceAround'],
  direction: ['row', 'column'],
  keyframeProps: ['time', 'easing', 'autoKey', 'changes'],
  animateProps: ['duration', 'loop', 'autoKey', 'easing', 'keyframes', 'chapters'],
  shorthandProps: ['at', 'size'],
  effects: ['pulse', 'flash', 'shake', 'glow'],
  topLevel: ['name', 'description', 'background', 'viewport', 'styles', 'objects', 'animate', 'images'],
} as const;
