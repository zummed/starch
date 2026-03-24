import { z } from 'zod';
import {
  ColorSchema, StrokeSchema, TransformSchema, DashSchema,
  LayoutSchema, AnchorSchema,
} from './properties';
import type { Color, Stroke, Transform, TransformInput, Dash, Layout } from './properties';

// ─── Geometry Schemas ───────────────────────────────────────────

export const RectGeomSchema = z.object({
  w: z.number().min(0).describe('Rectangle width in pixels (number, >= 0)').default(0),
  h: z.number().min(0).describe('Rectangle height in pixels (number, >= 0)').default(0),
  radius: z.number().min(0).describe('Corner radius in pixels (number, >= 0)').optional(),
});

export const EllipseGeomSchema = z.object({
  rx: z.number().min(0).describe('Horizontal radius in pixels (number, >= 0)'),
  ry: z.number().min(0).describe('Vertical radius in pixels (number, >= 0)'),
});

export const TextGeomSchema = z.object({
  content: z.string().describe('Text string to display (string)'),
  size: z.number().min(1).describe('Font size in pixels (number, >= 1, default 14)').optional(),
  lineHeight: z.number().min(0).describe('Line height multiplier (number, >= 0)').optional(),
  align: z.enum(['start', 'middle', 'end']).describe('Horizontal text alignment — "start", "middle", or "end" (default "middle")').optional(),
  bold: z.boolean().describe('Render text in bold (boolean, default false)').optional(),
  mono: z.boolean().describe('Render text in monospace font (boolean, default false)').optional(),
});

export const PointRefSchema = z.union([
  z.string().describe('Node ID to use as point reference'),
  z.tuple([z.number(), z.number()]).describe('Absolute [x, y] coordinate'),
  z.tuple([z.string(), z.number(), z.number()]).describe('Node ID with offset [id, dx, dy]'),
]);

export const PathGeomSchema = z.object({
  points: z.array(z.tuple([z.number(), z.number()])).describe('Ordered path vertices — array of [x, y] coordinate tuples').optional(),
  fromAnchor: AnchorSchema.describe('Anchor on start node — named ("N","E","S","W",...) or [-1..1, -1..1] tuple where 0,0 is center').optional(),
  toAnchor: AnchorSchema.describe('Anchor on end node — named ("N","E","S","W",...) or [-1..1, -1..1] tuple where 0,0 is center').optional(),
  closed: z.boolean().describe('Close the path into a loop (boolean, default false)').optional(),
  smooth: z.boolean().describe('Use Catmull-Rom spline interpolation (boolean, default false)').optional(),
  bend: z.number().min(-5).max(5).describe('Quadratic curve bend factor (number, -5 to 5, 0 = straight)').optional(),
  route: z.array(PointRefSchema).describe('Full path — first element is start, last is end, intermediates are waypoints').optional(),
  radius: z.number().min(0).describe('Corner rounding radius for routed polylines in pixels (number, >= 0)').optional(),
  drawProgress: z.number().min(0).max(1).describe('Animated draw progress — 0 hides path, 1 fully drawn (number, 0-1)').optional(),
  gap: z.number().min(0).describe('Gap between node edge and line endpoint in pixels (number, >= 0)').optional(),
  fromGap: z.number().min(0).describe('Gap at start endpoint in pixels, overrides gap (number, >= 0)').optional(),
  toGap: z.number().min(0).describe('Gap at end endpoint in pixels, overrides gap (number, >= 0)').optional(),
});

export const ImageGeomSchema = z.object({
  src: z.string().describe('Image source URL or data URI (string)'),
  fit: z.enum(['contain', 'cover', 'fill']).describe('Image fit mode — "contain", "cover", or "fill" (default "contain")').optional(),
  padding: z.number().min(0).describe('Padding around image in pixels (number, >= 0)').optional(),
  w: z.number().min(0).describe('Display width in pixels (number, >= 0)'),
  h: z.number().min(0).describe('Display height in pixels (number, >= 0)'),
});

export const CameraLookSchema = z.union([
  z.literal('all').describe('Fit all non-camera objects into view'),
  z.string().describe('Target a single node by its ID (string)'),
  z.tuple([z.number(), z.number()]).describe('Target absolute coordinates [x, y]'),
  z.tuple([z.string(), z.number(), z.number()]).describe('Target node with pixel offset [id, dx, dy]'),
  z.array(z.string()).describe('Fit to a set of node IDs (string[])'),
]);

export const CameraSchema = z.object({
  look: CameraLookSchema.describe('Camera look target — "all", node ID, [x,y], [id,dx,dy], or string[] of IDs').optional(),
  zoom: z.number().min(0).describe('Zoom level multiplier (number, > 0, default 1)').optional(),
  ratio: z.number().min(0).describe('Viewport aspect ratio width/height (number, > 0)').optional(),
  active: z.boolean().describe('Whether this camera is the active viewport (boolean, default false)').optional(),
});

// ─── Node Schema ────────────────────────────────────────────────

export const NodeSchema: z.ZodType<NodeInput> = z.object({
  id: z.string().describe('Unique node identifier (string, required)'),
  children: z.lazy(() => z.array(NodeSchema)).describe('Nested child nodes (array of Node)').optional(),
  visible: z.boolean().describe('Whether node is rendered (boolean, default true)').default(true),

  // Geometry (at most one)
  rect: RectGeomSchema.describe('Rectangle geometry — w, h, optional radius').optional(),
  ellipse: EllipseGeomSchema.describe('Ellipse geometry — rx, ry').optional(),
  text: TextGeomSchema.describe('Text geometry — content, size, alignment, font options').optional(),
  path: PathGeomSchema.describe('Path/connection geometry — points for shapes, route for connections').optional(),
  image: ImageGeomSchema.describe('Image geometry — src URL, w, h, fit mode').optional(),

  // Visual properties
  fill: ColorSchema.describe('Fill color — string, RGB, HSL, named+alpha, or hex+alpha (inherits from parent)').optional(),
  stroke: StrokeSchema.describe('Stroke — { color, width? } (inherits from parent)').optional(),
  opacity: z.number().min(0).max(1).describe('Node opacity, multiplied with parent (number, 0-1, default 1)').default(1),

  // Transform
  transform: TransformSchema.describe('Position, rotation, and scale transform').optional(),

  // Non-inheritable
  depth: z.number().describe('Z-order depth for sibling sorting (number, default 0)').optional(),
  dash: DashSchema.describe('Stroke dash pattern — pattern, length, gap').optional(),
  layout: LayoutSchema.describe('Layout strategy for positioning children').optional(),

  // Styling
  style: z.string().describe('Name of a style node whose properties serve as defaults (string)').optional(),

  // Camera
  camera: CameraSchema.describe('Camera settings — look target, zoom, ratio, active').optional(),

  // Template
  template: z.string().describe('Template name to instantiate (string)').optional(),
  props: z.record(z.string(), z.unknown()).describe('Props passed to template instantiation (Record<string, unknown>)').optional(),
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
  fill?: Color;
  stroke?: Stroke;
  opacity?: number;
  transform?: TransformInput;
  depth?: number;
  dash?: Dash;

  layout?: Layout;
  style?: string;
  camera?: { look?: PointRef | string[] | 'all'; zoom?: number; ratio?: number; active?: boolean };
  template?: string;
  props?: Record<string, unknown>;
}

// Node is the runtime type with resolved defaults.
// transform uses TransformInput because nodes don't go through Zod parsing at runtime;
// Zod defaults serve as the source of truth for schema-based lookups (e.g. animation timeline).
export interface Node {
  id: string;
  children: Node[];
  visible: boolean;
  rect?: RectGeom;
  ellipse?: EllipseGeom;
  text?: TextGeom;
  path?: PathGeom;
  image?: ImageGeom;
  fill?: Color;
  stroke?: Stroke;
  opacity?: number;
  transform?: TransformInput;
  depth?: number;
  dash?: Dash;

  layout?: Layout;
  style?: string;
  camera?: { look?: PointRef | string[] | 'all'; zoom?: number; ratio?: number; active?: boolean };
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
