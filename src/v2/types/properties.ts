import { z } from 'zod';

// ─── Property Sub-Object Schemas ────────────────────────────────

export const HslColorSchema = z.object({
  h: z.number().min(0).max(360).describe('Hue (degrees)'),
  s: z.number().min(0).max(100).describe('Saturation (%)'),
  l: z.number().min(0).max(100).describe('Lightness (%)'),
});

export const StrokeSchema = z.object({
  h: z.number().min(0).max(360).describe('Hue (degrees)'),
  s: z.number().min(0).max(100).describe('Saturation (%)'),
  l: z.number().min(0).max(100).describe('Lightness (%)'),
  width: z.number().min(0).max(20).describe('Stroke width'),
});

export const TransformSchema = z.object({
  x: z.number().min(-2000).max(2000).describe('X position').optional(),
  y: z.number().min(-2000).max(2000).describe('Y position').optional(),
  rotation: z.number().min(-360).max(360).describe('Rotation (degrees)').optional(),
  scale: z.number().min(0).max(10).describe('Scale factor').optional(),
  anchor: z.union([z.string(), z.tuple([z.number(), z.number()])]).describe('Pivot point').optional(),
  pathFollow: z.string().describe('Path node ID to follow').optional(),
  pathProgress: z.number().min(0).max(1).describe('Position along path (0-1)').optional(),
});

export const DashSchema = z.object({
  pattern: z.string().describe('Dash pattern (solid, dashed, dotted, or SVG dasharray)'),
  length: z.number().min(0).max(50).describe('Dash length'),
  gap: z.number().min(0).max(50).describe('Gap between dashes'),
});

export const LayoutSchema = z.object({
  type: z.string().describe('Layout strategy (flex, absolute, grid, circular)'),
  direction: z.enum(['row', 'column']).describe('Layout direction').optional(),
  gap: z.number().min(0).max(100).describe('Gap between children').optional(),
  justify: z.enum(['start', 'center', 'end', 'spaceBetween', 'spaceAround']).describe('Main axis alignment').optional(),
  align: z.enum(['start', 'center', 'end', 'stretch']).describe('Cross axis alignment').optional(),
  wrap: z.boolean().describe('Wrap children').optional(),
  padding: z.number().min(0).max(100).describe('Inner padding').optional(),
});

export const LayoutHintSchema = z.record(z.string(), z.union([z.number(), z.string(), z.boolean()]));

export const SizeSchema = z.object({
  w: z.number().min(0).max(2000).describe('Width'),
  h: z.number().min(0).max(2000).describe('Height'),
});

// ─── Derived Types ──────────────────────────────────────────────

export type HslColor = z.infer<typeof HslColorSchema>;
export type Stroke = z.infer<typeof StrokeSchema>;
export type Transform = z.infer<typeof TransformSchema>;
export type Dash = z.infer<typeof DashSchema>;
export type Layout = z.infer<typeof LayoutSchema>;
export type LayoutHint = z.infer<typeof LayoutHintSchema>;
export type Size = z.infer<typeof SizeSchema>;
