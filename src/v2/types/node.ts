import { z } from 'zod';
import {
  HslColorSchema, StrokeSchema, TransformSchema, DashSchema,
  LayoutSchema, LayoutHintSchema, SizeSchema,
} from './properties';
import type { HslColor, Stroke, Transform, Dash, Layout, LayoutHint, Size } from './properties';

// ─── Geometry Schemas ───────────────────────────────────────────

export const RectGeomSchema = z.object({
  w: z.number().min(0).describe('Width'),
  h: z.number().min(0).describe('Height'),
  radius: z.number().min(0).describe('Corner radius').optional(),
});

export const EllipseGeomSchema = z.object({
  rx: z.number().min(0).describe('Horizontal radius'),
  ry: z.number().min(0).describe('Vertical radius'),
});

export const TextGeomSchema = z.object({
  content: z.string().describe('Text content'),
  size: z.number().min(1).describe('Font size'),
  lineHeight: z.number().min(0).describe('Line height').optional(),
  align: z.enum(['start', 'middle', 'end']).describe('Text alignment').optional(),
  bold: z.boolean().describe('Bold text').optional(),
  mono: z.boolean().describe('Monospace font').optional(),
});

export const PointRefSchema = z.union([
  z.string(),
  z.tuple([z.number(), z.number()]),
  z.tuple([z.string(), z.number(), z.number()]),
]);

export const PathGeomSchema = z.object({
  points: z.array(z.tuple([z.number(), z.number()])).describe('Path points').optional(),
  from: PointRefSchema.describe('Start endpoint').optional(),
  to: PointRefSchema.describe('End endpoint').optional(),
  fromAnchor: z.union([z.string(), z.tuple([z.number(), z.number()])]).describe('Start anchor').optional(),
  toAnchor: z.union([z.string(), z.tuple([z.number(), z.number()])]).describe('End anchor').optional(),
  closed: z.boolean().describe('Close the path').optional(),
  smooth: z.boolean().describe('Catmull-Rom spline').optional(),
  bend: z.number().min(-5).max(5).describe('Curve bend amount').optional(),
  route: z.array(PointRefSchema).describe('Waypoints (coords, IDs, or ID+offset)').optional(),
  radius: z.number().min(0).describe('Corner radius for routed paths').optional(),
  drawProgress: z.number().min(0).max(1).describe('Draw progress (0-1)').optional(),
  gap: z.number().min(0).describe('Gap between edge and line endpoint').optional(),
  fromGap: z.number().min(0).describe('Gap at start endpoint').optional(),
  toGap: z.number().min(0).describe('Gap at end endpoint').optional(),
});

export const ImageGeomSchema = z.object({
  src: z.string().describe('Image source URL'),
  fit: z.enum(['contain', 'cover', 'fill']).describe('Image fit mode').optional(),
  padding: z.number().min(0).describe('Image padding').optional(),
  w: z.number().min(0).describe('Width'),
  h: z.number().min(0).describe('Height'),
});

export const CameraSchema = z.object({
  target: PointRefSchema.describe('Camera target').optional(),
  zoom: z.number().min(0).describe('Zoom level').optional(),
  fit: z.array(z.string()).describe('Fit to object IDs').optional(),
});

// ─── Node Schema ────────────────────────────────────────────────

export const NodeSchema: z.ZodType<NodeInput> = z.object({
  id: z.string().describe('Unique identifier'),
  children: z.lazy(() => z.array(NodeSchema)).describe('Child nodes').optional(),
  visible: z.boolean().describe('Visibility').optional(),

  // Geometry (at most one)
  rect: RectGeomSchema.describe('Rectangle geometry').optional(),
  ellipse: EllipseGeomSchema.describe('Ellipse geometry').optional(),
  text: TextGeomSchema.describe('Text geometry').optional(),
  path: PathGeomSchema.describe('Path geometry').optional(),
  image: ImageGeomSchema.describe('Image geometry').optional(),

  // Visual properties
  fill: HslColorSchema.describe('Fill color (HSL)').optional(),
  stroke: StrokeSchema.describe('Stroke color and width').optional(),
  opacity: z.number().min(0).max(1).describe('Opacity (0-1)').optional(),

  // Transform
  transform: TransformSchema.describe('Position and orientation').optional(),

  // Non-inheritable
  depth: z.number().describe('Z-order depth').optional(),
  dash: DashSchema.describe('Dash pattern').optional(),
  size: SizeSchema.describe('Explicit size for layout').optional(),
  layout: LayoutSchema.describe('Layout strategy').optional(),
  layoutHint: LayoutHintSchema.describe('Layout hints for parent strategy').optional(),

  // Styling
  style: z.string().describe('Style name reference').optional(),

  // Camera
  camera: CameraSchema.describe('Camera settings').optional(),

  // Template
  template: z.string().describe('Template name').optional(),
  props: z.record(z.string(), z.unknown()).describe('Template props').optional(),
});

// ─── Derived Types ──────────────────────────────────────────────

export type RectGeom = z.infer<typeof RectGeomSchema>;
export type EllipseGeom = z.infer<typeof EllipseGeomSchema>;
export type TextGeom = z.infer<typeof TextGeomSchema>;
export type PointRef = z.infer<typeof PointRefSchema>;
export type PathGeom = z.infer<typeof PathGeomSchema>;
export type ImageGeom = z.infer<typeof ImageGeomSchema>;

// NodeInput matches what users/parsers provide (optional children, optional visible)
export interface NodeInput {
  id: string;
  children?: NodeInput[];
  visible?: boolean;
  rect?: RectGeom;
  ellipse?: EllipseGeom;
  text?: TextGeom;
  path?: PathGeom;
  image?: ImageGeom;
  fill?: HslColor;
  stroke?: Stroke;
  opacity?: number;
  transform?: Transform;
  depth?: number;
  dash?: Dash;
  size?: Size;
  layout?: Layout;
  layoutHint?: LayoutHint;
  style?: string;
  camera?: { target?: PointRef; zoom?: number; fit?: string[] };
  template?: string;
  props?: Record<string, unknown>;
}

// Node is the runtime type with resolved defaults
export interface Node {
  id: string;
  children: Node[];
  visible: boolean;
  rect?: RectGeom;
  ellipse?: EllipseGeom;
  text?: TextGeom;
  path?: PathGeom;
  image?: ImageGeom;
  fill?: HslColor;
  stroke?: Stroke;
  opacity?: number;
  transform?: Transform;
  depth?: number;
  dash?: Dash;
  size?: Size;
  layout?: Layout;
  layoutHint?: LayoutHint;
  style?: string;
  camera?: { target?: PointRef; zoom?: number; fit?: string[] };
  _ownKeys?: Set<string>;
  _styleKeys?: Set<string>;
  _isStyle?: boolean;
}

export function createNode(input: NodeInput): Node {
  return {
    ...input,
    children: (input.children as Node[]) ?? [],
    visible: input.visible ?? true,
    _ownKeys: new Set(Object.keys(input).filter(k => k !== 'id' && k !== 'children')),
  };
}
