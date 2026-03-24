import { z } from 'zod';
import { NAMED_ANCHORS } from './anchor';

// ─── Anchor Schema ──────────────────────────────────────────────

export const AnchorSchema = z.union([
  z.enum(NAMED_ANCHORS).describe('Named anchor position (compass direction)'),
  z.tuple([z.number().min(-1).max(1), z.number().min(-1).max(1)]).describe('Relative anchor [x, y] where 0,0 is center and -1..1 maps to bounding box edges'),
]);

// ─── Color Schemas ──────────────────────────────────────────────

export const HslColorSchema = z.object({
  h: z.number().min(0).max(360).describe('Hue angle in degrees (number, 0-360)'),
  s: z.number().min(0).max(100).describe('Saturation percentage (number, 0-100)'),
  l: z.number().min(0).max(100).describe('Lightness percentage (number, 0-100)'),
  a: z.number().min(0).max(1).describe('Alpha transparency (number, 0-1, default 1)').optional(),
});

export const RgbColorSchema = z.object({
  r: z.number().int().min(0).max(255).describe('Red channel (integer, 0-255)'),
  g: z.number().int().min(0).max(255).describe('Green channel (integer, 0-255)'),
  b: z.number().int().min(0).max(255).describe('Blue channel (integer, 0-255)'),
  a: z.number().min(0).max(1).describe('Alpha transparency (number, 0-1, default 1)').optional(),
});

export const NamedAlphaColorSchema = z.object({
  name: z.string().describe('CSS named color (string)'),
  a: z.number().min(0).max(1).describe('Alpha transparency (number, 0-1)'),
});

export const HexAlphaColorSchema = z.object({
  hex: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).describe('Hex color string (#xxx or #xxxxxx)'),
  a: z.number().min(0).max(1).describe('Alpha transparency (number, 0-1)'),
});

export const ColorSchema = z.union([
  z.string(),
  RgbColorSchema,
  HslColorSchema,
  NamedAlphaColorSchema,
  HexAlphaColorSchema,
]);

// ─── Property Sub-Object Schemas ────────────────────────────────

export const StrokeSchema = z.object({
  color: ColorSchema.describe('Stroke color — string, RGB, HSL, named+alpha, or hex+alpha'),
  width: z.number().min(0).max(20).describe('Stroke width in pixels (number, 0-20, default 1)').optional(),
});

export const TransformSchema = z.object({
  x: z.number().describe('X position in pixels (number)').default(0),
  y: z.number().describe('Y position in pixels (number)').default(0),
  rotation: z.number().describe('Rotation angle in degrees (number)').default(0),
  scale: z.number().min(0).max(10).describe('Uniform scale factor (number, 0-10, default 1)').default(1),
  anchor: AnchorSchema.describe('Pivot point — named anchor string or [x, y] tuple').optional(),
  pathFollow: z.string().describe('ID of a path node to follow (string)').optional(),
  pathProgress: z.number().min(0).max(1).describe('Position along followed path (number, 0-1)').optional(),
});

export const DashSchema = z.object({
  pattern: z.string().describe('Dash style — "solid", "dashed", "dotted", or custom SVG dasharray string'),
  length: z.number().min(0).max(50).describe('Dash segment length in pixels (number, 0-50, default depends on pattern)').optional(),
  gap: z.number().min(0).max(50).describe('Gap between dashes in pixels (number, 0-50, default depends on pattern)').optional(),
});

export const LayoutSchema = z.object({
  type: z.string().describe('Layout strategy — "flex", "absolute", "grid", or "circular" (string)').optional(),
  direction: z.enum(['row', 'column']).describe('Layout flow direction — "row" or "column" (default "row")').optional(),
  gap: z.number().min(0).max(100).describe('Spacing between children in pixels (number, 0-100)').optional(),
  justify: z.enum(['start', 'center', 'end', 'spaceBetween', 'spaceAround']).describe('Main-axis alignment — "start", "center", "end", "spaceBetween", or "spaceAround"').optional(),
  align: z.enum(['start', 'center', 'end', 'stretch']).describe('Cross-axis alignment — "start", "center", "end", or "stretch"').optional(),
  wrap: z.boolean().describe('Whether children wrap to next line (boolean, default false)').optional(),
  padding: z.number().min(0).max(100).describe('Inner padding in pixels (number, 0-100)').optional(),
  grow: z.number().min(0).describe('Flex grow factor (number, >= 0)').optional(),
  order: z.number().describe('Layout order hint (number)').optional(),
  alignSelf: z.enum(['start', 'center', 'end', 'stretch']).describe('Per-child cross-axis alignment override').optional(),
  slot: z.string().describe('Container ID for layout slot membership — animatable to move between containers (string)').optional(),
});

// ─── Derived Types ──────────────────────────────────────────────

export type HslColor = z.infer<typeof HslColorSchema>;
export type RgbColor = z.infer<typeof RgbColorSchema>;
export type NamedAlphaColor = z.infer<typeof NamedAlphaColorSchema>;
export type HexAlphaColor = z.infer<typeof HexAlphaColorSchema>;
export type Color = z.infer<typeof ColorSchema>;
export type Stroke = z.infer<typeof StrokeSchema>;
export type Transform = z.infer<typeof TransformSchema>;
export type TransformInput = z.input<typeof TransformSchema>;
export type Dash = z.infer<typeof DashSchema>;
export type Layout = z.infer<typeof LayoutSchema>;
