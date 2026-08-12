import { z } from 'zod';
import { NAMED_ANCHORS } from './anchor';
import { dsl } from '../dsl/dslMeta';

// ─── Anchor Schema ──────────────────────────────────────────────

export const AnchorSchema = z.union([
  z.enum(NAMED_ANCHORS).describe('Named anchor position (compass direction)'),
  z.tuple([z.number().min(-1).max(1), z.number().min(-1).max(1)]).describe('Relative anchor (x, y) where 0,0 is center and -1..1 maps to bounding box edges'),
]);

// ─── Color Schemas ──────────────────────────────────────────────

export const HslColorSchema = dsl(z.object({
  h: z.number().min(0).max(360).describe('Hue angle in degrees (number, 0-360)'),
  s: z.number().min(0).max(100).describe('Saturation percentage (number, 0-100)'),
  l: z.number().min(0).max(100).describe('Lightness percentage (number, 0-100)'),
  a: z.number().min(0).max(1).describe('Alpha transparency (number, 0-1, default 1)').optional(),
}), {
  keyword: 'hsl',
  positional: [{ keys: ['h', 's', 'l'], format: 'spaced' }],
  kwargs: ['a'],
});

export const RgbColorSchema = dsl(z.object({
  r: z.number().int().min(0).max(255).describe('Red channel (integer, 0-255)'),
  g: z.number().int().min(0).max(255).describe('Green channel (integer, 0-255)'),
  b: z.number().int().min(0).max(255).describe('Blue channel (integer, 0-255)'),
  a: z.number().min(0).max(1).describe('Alpha transparency (number, 0-1, default 1)').optional(),
}), {
  keyword: 'rgb',
  positional: [{ keys: ['r', 'g', 'b'], format: 'spaced' }],
  kwargs: ['a'],
});

export const NamedAlphaColorSchema = dsl(z.object({
  name: z.string().describe('CSS named color (string)'),
  a: z.number().min(0).max(1).describe('Alpha transparency (number, 0-1)'),
}), {
  positional: [{ keys: ['name'] }],
  kwargs: ['a'],
});

export const HexAlphaColorSchema = dsl(z.object({
  hex: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).describe('Hex color string (#xxx or #xxxxxx)'),
  a: z.number().min(0).max(1).describe('Alpha transparency (number, 0-1)'),
}), {
  positional: [{ keys: ['hex'] }],
  kwargs: ['a'],
});

export const ColorSchema = z.union([
  z.string(),
  RgbColorSchema,
  HslColorSchema,
  NamedAlphaColorSchema,
  HexAlphaColorSchema,
]);

// ─── Property Sub-Object Schemas ────────────────────────────────

export const StrokeSchema = dsl(z.object({
  color: ColorSchema.describe('Stroke color — string, RGB, HSL, named+alpha, or hex+alpha'),
  width: z.number().min(0).max(20).describe('Stroke width in pixels (number, 0-20, default 1)').optional(),
}), {
  keyword: 'stroke',
  positional: [{ keys: ['color'], format: 'color' }],
  kwargs: ['width'],
});

export const TransformSchema = dsl(z.object({
  x: z.number().describe('X of the object\'s centre in pixels — `at x,y` places the centre, not a corner').default(0),
  y: z.number().describe('Y of the object\'s centre in pixels — `at x,y` places the centre, not a corner').default(0),
  rotation: z.number().describe('Rotation angle in degrees (number)').default(0),
  scale: z.number().min(0).max(10).describe('Uniform scale factor (number, 0-10, default 1)').default(1),
  anchor: AnchorSchema.describe('Pivot point — named anchor string or (x, y) tuple').optional(),
  pathFollow: z.string().describe('ID of a path node to follow (string)').optional(),
  pathProgress: z.number().min(0).max(1).describe('Position along followed path (number, 0-1)').optional(),
}), {
  keyword: 'at',
  keywordOmittable: true,
  positional: [{ keys: ['x', 'y'], format: 'joined', separator: ',', fallbackToKwarg: true }],
  kwargs: ['rotation', 'scale', 'anchor', 'pathFollow', 'pathProgress'],
});

export const DashSchema = dsl(z.object({
  pattern: z.string().describe('Dash style — "solid", "dashed", "dotted", or custom SVG dasharray string'),
  length: z.number().min(0).max(50).describe('Dash segment length in pixels (number, 0-50, default depends on pattern)').optional(),
  gap: z.number().min(0).max(50).describe('Gap between dashes in pixels (number, 0-50, default depends on pattern)').optional(),
}), {
  keyword: 'dash',
  positional: [{ keys: ['pattern'] }],
  kwargs: ['length', 'gap'],
});

/**
 * Layout schemas: one container schema + one child-hints schema per
 * strategy, plus a universal schema for properties valid regardless of
 * strategy. Fields with identical type + semantics across more than one
 * strategy (e.g. `gap`) share a single const below — that shared reference
 * is what lets mergeLayoutShapes() recognize the overlap as legitimate
 * rather than a conflicting redefinition.
 */
const gapField = z.number().min(0).max(200).describe('Spacing between children in pixels (number, 0-200)').optional();
const paddingField = z.number().min(0).max(200).describe('Inner padding in pixels (number, 0-200)').optional();
const alignField = z.enum(['start', 'center', 'end', 'stretch']).describe('Cross-axis alignment — "start", "center", "end", or "stretch"').optional();
const alignSelfField = z.enum(['start', 'center', 'end', 'stretch']).describe('Per-child cross-axis alignment override').optional();
const orderField = z.number().describe('Layout order hint (number)').optional();

export const LayoutUniversalSchema = z.object({
  slot: z.string().describe('Container ID for layout slot membership — animatable to move between containers (string)').optional(),
  skip: z.boolean().describe('Exclude this node from its parent layout flow (structural child, e.g. a template background)').optional(),
});

export const FlexContainerSchema = z.object({
  direction: z.enum(['row', 'column']).describe('Layout flow direction — "row" or "column" (default "row")').optional(),
  gap: gapField,
  justify: z.enum(['start', 'center', 'end', 'spaceBetween', 'spaceAround']).describe('Main-axis alignment — "start", "center", "end", "spaceBetween", or "spaceAround"').optional(),
  align: alignField,
  padding: paddingField,
});

export const FlexChildHintsSchema = z.object({
  grow: z.number().min(0).describe('Flex grow factor (number, >= 0)').optional(),
  order: orderField,
  alignSelf: alignSelfField,
});

// Absolute is an explicit no-op strategy — it contributes no container
// config and accepts no child hints.
export const AbsoluteContainerSchema = z.object({});
export const AbsoluteChildHintsSchema = z.object({});

export const GridContainerSchema = z.object({
  columns: z.number().int().min(1).describe('Number of grid columns (integer, >= 1)').optional(),
  rows: z.number().int().min(1).describe('Number of grid rows (integer, >= 1)').optional(),
  gap: gapField,
  colGap: z.number().min(0).describe('Column gap override (number)').optional(),
  rowGap: z.number().min(0).describe('Row gap override (number)').optional(),
  padding: paddingField,
  align: alignField,
});

export const GridChildHintsSchema = z.object({
  gridCol: z.number().int().min(1).describe('Grid column placement (1-based)').optional(),
  gridRow: z.number().int().min(1).describe('Grid row placement (1-based)').optional(),
  colSpan: z.number().int().min(1).describe('Number of columns to span').optional(),
  rowSpan: z.number().int().min(1).describe('Number of rows to span').optional(),
  alignSelf: alignSelfField,
});

export const CircularContainerSchema = z.object({
  radius: z.number().min(0).describe('Circle radius in pixels (number)').optional(),
  startAngle: z.number().describe('Starting angle in degrees (number)').optional(),
  sweep: z.number().describe('Angular sweep in degrees (number, default 360)').optional(),
});

export const CircularChildHintsSchema = z.object({
  order: orderField,
});

/**
 * One record, keyed by strategy name, mapping to that strategy's container
 * and child-hints schemas — the one definition every other consumer derives
 * from (LayoutSchema's merged shape, LAYOUT_STRATEGY_NAMES, validation's
 * allowed-key sets, completions). Lives here rather than in layout/ so
 * schema code never has to import the layout module. dag is future work
 * (see docs/design-layout-system.md) — its schema props land together with
 * the strategy that implements it.
 */
export const LAYOUT_STRATEGY_SCHEMAS = {
  flex: { container: FlexContainerSchema, childHints: FlexChildHintsSchema },
  absolute: { container: AbsoluteContainerSchema, childHints: AbsoluteChildHintsSchema },
  grid: { container: GridContainerSchema, childHints: GridChildHintsSchema },
  circular: { container: CircularContainerSchema, childHints: CircularChildHintsSchema },
} as const;

export type LayoutStrategyName = keyof typeof LAYOUT_STRATEGY_SCHEMAS;
export const LAYOUT_STRATEGY_NAMES = Object.keys(LAYOUT_STRATEGY_SCHEMAS) as [LayoutStrategyName, ...LayoutStrategyName[]];

type ShapeOf<S> = S extends z.ZodObject<infer Shape, any> ? Shape : Record<string, never>;
type MergedShape<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Rest]
  ? ShapeOf<Head> & MergedShape<Rest>
  : Record<string, never>;

/**
 * Merge layout sub-schemas' shapes into one, preserving each field's literal
 * key/type so the composed LayoutSchema (and its inferred Layout type) stay
 * assignment-compatible with the old flat schema. Throws at module load if
 * two schemas contribute the same key via different schema objects — a
 * legitimate overlap (e.g. `gap` on both flex and grid) must go through a
 * shared field const above so both sides pass in the identical reference.
 */
function mergeLayoutShapes<T extends z.ZodObject<any>[]>(...schemas: T): MergedShape<T> {
  const merged: Record<string, z.ZodType> = {};
  for (const schema of schemas) {
    for (const [key, field] of Object.entries(schema.shape as Record<string, z.ZodType>)) {
      const existing = merged[key];
      if (existing && existing !== field) {
        throw new Error(`LayoutSchema: key "${key}" is defined by more than one schema with a different definition — use a shared field const instead`);
      }
      merged[key] = field;
    }
  }
  return merged as MergedShape<T>;
}

const LAYOUT_POSITIONAL_KEYS = ['type', 'direction'];

const layoutShape = {
  type: z.enum(LAYOUT_STRATEGY_NAMES).describe('Layout strategy — "flex", "absolute", "grid", or "circular"').optional(),
  ...LayoutUniversalSchema.shape,
  ...mergeLayoutShapes(
    FlexContainerSchema, FlexChildHintsSchema,
    AbsoluteContainerSchema, AbsoluteChildHintsSchema,
    GridContainerSchema, GridChildHintsSchema,
    CircularContainerSchema, CircularChildHintsSchema,
  ),
};

export const LayoutSchema = dsl(z.object(layoutShape), {
  keyword: 'layout',
  positional: [{ keys: ['type'] }, { keys: ['direction'] }],
  kwargs: Object.keys(layoutShape).filter(k => !LAYOUT_POSITIONAL_KEYS.includes(k)),
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

// ─── Per-Strategy Config Resolvers ───────────────────────────────
// Turn an optional Layout bag into a fully-defaulted container config, so
// strategies read their container properties once instead of scattering
// `layout.x ?? fallback` reads. Defaults below are numerically identical to
// the ones the strategies used to inline.

export interface ResolvedFlexContainer {
  direction: 'row' | 'column';
  gap: number;
  justify: 'start' | 'center' | 'end' | 'spaceBetween' | 'spaceAround';
  align: 'start' | 'center' | 'end' | 'stretch';
  padding: number;
}

export function resolveFlexContainer(layout: Layout | undefined): ResolvedFlexContainer {
  return {
    direction: layout?.direction ?? 'column',
    gap: layout?.gap ?? 0,
    justify: layout?.justify ?? 'start',
    align: layout?.align ?? 'start',
    padding: layout?.padding ?? 0,
  };
}

export interface ResolvedGridContainer {
  columns: number;
  rows: number | undefined;
  gap: number;
  colGap: number;
  rowGap: number;
  padding: number;
  align: 'start' | 'center' | 'end' | 'stretch';
}

export function resolveGridContainer(layout: Layout | undefined): ResolvedGridContainer {
  const gap = layout?.gap ?? 0;
  return {
    columns: layout?.columns ?? 1,
    rows: layout?.rows,
    gap,
    colGap: layout?.colGap ?? gap,
    rowGap: layout?.rowGap ?? gap,
    padding: layout?.padding ?? 0,
    align: layout?.align ?? 'stretch',
  };
}

export interface ResolvedCircularContainer {
  radius: number;
  startAngle: number;
  sweep: number;
}

export function resolveCircularContainer(layout: Layout | undefined): ResolvedCircularContainer {
  return {
    radius: layout?.radius ?? 100,
    startAngle: layout?.startAngle ?? 0,
    sweep: layout?.sweep ?? 360,
  };
}
