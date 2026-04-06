# DSL AST: Schema-Driven Grammar with Single Source of Truth

## Problem

The current system has multiple layers that each independently know about the DSL format: a hand-written parser (1400 lines), a generator (613 lines), a schema renderer (1117 lines), a completion source, a decoration system, and click/hover handlers. Adding a new property requires touching multiple files. Completions don't understand positional context ("what comes next?") because the flat span array has no tree structure.

The zod schemas describe the JSON data model but know nothing about how properties render in the DSL. This means the DSL grammar is implicit — spread across parser, generator, and completion code — rather than explicit in one place.

## Solution

Annotate the existing zod schemas with DSL rendering/parsing hints using a `dsl()` helper. From these annotated schemas, build a proper AST (Abstract Syntax Tree) that maps every text position to its schema node. The AST drives parsing, rendering, completions, click handling, hover tooltips, and decorations — all from one source.

## DSL Hint Primitives

Every DSL syntax pattern reduces to a small set of primitives:

| Primitive | Example | Description |
|-----------|---------|-------------|
| `keyword` | `rect`, `fill`, `stroke`, `at`, `animate` | Fixed string introducing a construct |
| `dimension` | `140x80` | Two numeric fields joined by `x` |
| `spaced` | `hsl 210 80 50` | Space-separated positional values |
| `joined` | `50,75` | Values joined by a separator (comma) |
| `arrow` | `a -> b -> c` | Values separated by `->` |
| `kwarg` | `radius=8`, `width=2` | `key=value` pair |
| `flag` | `smooth`, `bold`, `loop` | Bare keyword = boolean true |
| `sigil` | `@primary` | Prefix character + value |
| `quoted` | `"hello world"` | Quoted string |
| `tuples` | `(10,20) (30,40)` | Space-separated parenthesized coordinate tuples |

## The `.dsl()` Annotation API

A `dsl()` helper attaches DSL metadata to zod schemas using a WeakMap (no zod fork required):

```typescript
// src/dsl/dslMeta.ts

interface PositionalHint {
  keys: string[];
  format?: 'dimension' | 'spaced' | 'joined' | 'arrow' | 'quoted' | 'tuples';
  separator?: string;
  suffix?: string;
  keyword?: string;          // intermediate keyword before this positional (e.g., 'at' in chapter)
  fallbackToKwarg?: boolean; // when subset of keys present, emit as kwargs instead
  transform?: 'double';      // value transformation (e.g., radius → diameter for ellipse)
}

interface DslHints {
  keyword?: string;
  positional?: PositionalHint[];
  kwargs?: string[];
  flags?: string[];
  sigil?: { key: string; prefix: string };  // e.g., { key: 'style', prefix: '@' }
  children?: Record<string, 'block' | 'inline'>;
  record?: {                 // for dynamic-keyed maps (e.g., keyframe changes)
    key: string;             // the field name containing the record
    entryHints: DslHints;    // how each entry renders
  };
  variants?: Array<{         // for schemas with multiple DSL forms based on which fields are present
    when: string;            // field name whose presence triggers this variant
    hints: DslHints;         // the hints for this variant
  }>;
}

const dslRegistry = new WeakMap<z.ZodType, DslHints>();

function dsl<T extends z.ZodType>(schema: T, hints: DslHints): T {
  dslRegistry.set(schema, hints);
  return schema;
}

function getDsl(schema: z.ZodType): DslHints | undefined {
  return dslRegistry.get(schema);
}
```

### Key additions over the initial design:

- **`sigil`** — for `@styleName` syntax
- **`record`** — for dynamic-keyed maps (keyframe changes)
- **`variants`** — for schemas with multiple DSL forms (path as connection vs explicit path)
- **`fallbackToKwarg`** — for positional fields that become kwargs when a sibling is absent (transform `at x=100`)
- **`transform: 'double'`** — for ellipse where schema stores radius but DSL uses diameter
- **`keyword` on positional** — for intermediate keywords (chapter `"name" at 3.5`)
- **`quoted` and `tuples` formats** — for string values and coordinate point lists

Every field in a zod object schema appears in exactly one of `positional`, `kwargs`, `flags`, `sigil`, `children`, or `record`. If it appears in none, it doesn't exist in the DSL.

### Schema Annotations

```typescript
// ─── Geometry ─────────────────────────────────────────────────

const RectGeomSchema = dsl(z.object({
  w: z.number(), h: z.number(), radius: z.number().optional(),
}), {
  keyword: 'rect',
  positional: [{ keys: ['w', 'h'], format: 'dimension' }],
  kwargs: ['radius'],
});

const EllipseGeomSchema = dsl(z.object({
  rx: z.number(), ry: z.number(),
}), {
  keyword: 'ellipse',
  positional: [{ keys: ['rx', 'ry'], format: 'dimension', transform: 'double' }],
});

const TextGeomSchema = dsl(z.object({
  content: z.string(),
  size: z.number().optional(), lineHeight: z.number().optional(),
  align: z.enum(['start', 'middle', 'end']).optional(),
  bold: z.boolean().optional(), mono: z.boolean().optional(),
}), {
  keyword: 'text',
  positional: [{ keys: ['content'], format: 'quoted' }],
  kwargs: ['size', 'lineHeight', 'align'],
  flags: ['bold', 'mono'],
});

const ImageGeomSchema = dsl(z.object({
  src: z.string(), w: z.number(), h: z.number(),
  fit: z.string().optional(),
}), {
  keyword: 'image',
  positional: [{ keys: ['src'], format: 'quoted' }, { keys: ['w', 'h'], format: 'dimension' }],
  kwargs: ['fit'],
});

const CameraSchema = dsl(z.object({
  look: z.string().optional(), zoom: z.number().optional(),
  ratio: z.number().optional(), active: z.boolean().optional(),
}), {
  keyword: 'camera',
  kwargs: ['look', 'zoom', 'ratio'],
  flags: ['active'],
});

// ─── Path Variants ────────────────────────────────────────────
// Path has three incompatible DSL forms depending on which fields are present.

const PathGeomSchema = dsl(z.object({
  route: z.array(PointRefSchema).optional(),
  points: z.array(z.tuple([z.number(), z.number()])).optional(),
  fromAnchor: AnchorSchema.optional(), toAnchor: AnchorSchema.optional(),
  smooth: z.boolean().optional(), closed: z.boolean().optional(),
  bend: z.number().optional(), radius: z.number().optional(),
  gap: z.number().optional(), fromGap: z.number().optional(),
  toGap: z.number().optional(), drawProgress: z.number().optional(),
}), {
  variants: [
    {
      when: 'route',   // Connection: a -> b -> c
      hints: {
        positional: [{ keys: ['route'], format: 'arrow' }],
        flags: ['smooth', 'closed'],
        kwargs: ['bend', 'radius', 'gap', 'fromGap', 'toGap', 'drawProgress'],
      },
    },
    {
      when: 'points',  // Explicit path: path (10,20) (30,40)
      hints: {
        keyword: 'path',
        positional: [{ keys: ['points'], format: 'tuples' }],
        flags: ['closed', 'smooth'],
      },
    },
  ],
  // Shared flags/kwargs apply to all variants
  flags: ['smooth', 'closed'],
  kwargs: ['bend', 'radius', 'gap', 'fromGap', 'toGap', 'drawProgress'],
});

// ─── Properties ───────────────────────────────────────────────

const StrokeSchema = dsl(z.object({
  color: ColorSchema, width: z.number().optional(),
}), {
  keyword: 'stroke',
  positional: [{ keys: ['color'] }],
  kwargs: ['width'],
});

const HslColorSchema = dsl(z.object({
  h: z.number(), s: z.number(), l: z.number(), a: z.number().optional(),
}), {
  keyword: 'hsl',
  positional: [{ keys: ['h', 's', 'l'], format: 'spaced' }],
  kwargs: ['a'],
});

const RgbColorSchema = dsl(z.object({
  r: z.number(), g: z.number(), b: z.number(), a: z.number().optional(),
}), {
  keyword: 'rgb',
  positional: [{ keys: ['r', 'g', 'b'], format: 'spaced' }],
  kwargs: ['a'],
});

const NamedAlphaColorSchema = dsl(z.object({
  name: z.string(), a: z.number(),
}), {
  positional: [{ keys: ['name'] }],
  kwargs: ['a'],
});

const HexAlphaColorSchema = dsl(z.object({
  hex: z.string(), a: z.number(),
}), {
  positional: [{ keys: ['hex'] }],
  kwargs: ['a'],
});

// String colors (named, hex) have no hints — they're plain values.
// The union dispatch uses keyword presence as discriminant (see Union Dispatch section).

const TransformSchema = dsl(z.object({
  x: z.number().optional(), y: z.number().optional(),
  rotation: z.number().optional(), scale: z.number().optional(),
  anchor: AnchorSchema.optional(),
  pathFollow: z.string().optional(), pathProgress: z.number().optional(),
}), {
  keyword: 'at',
  positional: [{ keys: ['x', 'y'], format: 'joined', separator: ',', fallbackToKwarg: true }],
  kwargs: ['rotation', 'scale', 'anchor', 'pathFollow', 'pathProgress'],
});

const LayoutSchema = dsl(z.object({
  type: z.string().optional(), direction: z.string().optional(),
  gap: z.number().optional(), justify: z.string().optional(),
  align: z.string().optional(), wrap: z.boolean().optional(),
  padding: z.number().optional(), grow: z.number().optional(),
  order: z.number().optional(), alignSelf: z.string().optional(),
  slot: z.string().optional(),
}), {
  keyword: 'layout',
  positional: [{ keys: ['type'] }, { keys: ['direction'] }],
  kwargs: ['gap', 'justify', 'align', 'wrap', 'padding', 'grow', 'order', 'alignSelf', 'slot'],
});

const DashSchema = dsl(z.object({
  pattern: z.string(), length: z.number().optional(), gap: z.number().optional(),
}), {
  keyword: 'dash',
  positional: [{ keys: ['pattern'] }],
  kwargs: ['length', 'gap'],
});

// ─── Node Line ────────────────────────────────────────────────
// The node line is structurally special — it has an ID prefix, an exclusive geometry choice,
// and a property bag that can be inline or block depending on FormatHints.

const NodeSchema = dsl(z.object({
  id: z.string(),
  // Geometry (exclusive choice — at most one present)
  rect: RectGeomSchema.optional(),
  ellipse: EllipseGeomSchema.optional(),
  text: TextGeomSchema.optional(),
  path: PathGeomSchema.optional(),
  image: ImageGeomSchema.optional(),
  camera: CameraSchema.optional(),
  // Visual properties
  fill: ColorSchema.optional(),
  stroke: StrokeSchema.optional(),
  opacity: z.number().optional(),
  visible: z.boolean().optional(),
  depth: z.number().optional(),
  dash: DashSchema.optional(),
  // Transform
  transform: TransformSchema.optional(),
  // Layout
  layout: LayoutSchema.optional(),
  // Style reference
  style: z.string().optional(),
  // Children
  children: z.array(z.lazy(() => NodeSchema)).optional(),
  // Non-DSL fields (template, props) — absent from hints, not emitted
}), {
  nodeId: 'id',  // special: renders as the DSL node ID prefix
  geometry: ['rect', 'ellipse', 'text', 'path', 'image', 'camera'],  // exclusive choice
  sigil: { key: 'style', prefix: '@' },
  // Properties that can appear inline on the node line:
  inlineProps: ['fill', 'stroke', 'opacity', 'visible', 'depth', 'transform'],
  // Properties that get promoted to indented block lines in block mode:
  blockProps: ['fill', 'stroke', 'dash', 'layout'],
  // Layout hint props that stay inline even in block mode:
  inlineLayoutHints: ['grow', 'order', 'alignSelf', 'slot'],
  kwargs: ['opacity', 'depth'],
  flags: ['visible'],
  children: { children: 'block' },
});
// Note: FormatHints determines at runtime whether a node is inline or block.
// In inline mode, all inlineProps render on the node line.
// In block mode, blockProps are promoted to indented child lines.

// ─── Animation ────────────────────────────────────────────────

const ChapterSchema = dsl(z.object({
  name: z.string(), time: z.number(),
}), {
  keyword: 'chapter',
  positional: [{ keys: ['name'], format: 'quoted' }, { keys: ['time'], keyword: 'at' }],
});

const KeyframeBlockSchema = dsl(z.object({
  time: z.number(),
  plus: z.number().optional(),
  easing: EasingNameSchema.optional(),
  changes: z.record(z.string(), ChangeValueSchema).optional(),
}), {
  positional: [{ keys: ['time'] }],  // or '+N' if plus is present
  kwargs: ['easing'],
  record: {
    key: 'changes',
    // Each change entry renders as either:
    //   path: value           (property change)
    //   nodeId effectName     (effect)
    //   nodeId effectName amplitude=2  (effect with params)
    // Discriminated by: isEffectKey(path) → no dot in key
    entryHints: {
      positional: [{ keys: ['_key'] }, { keys: ['_value'] }],
    },
  },
});

const AnimConfigSchema = dsl(z.object({
  duration: z.number(),
  loop: z.boolean().optional(),
  autoKey: z.boolean().optional(),
  easing: EasingNameSchema.optional(),
  keyframes: z.array(KeyframeBlockSchema).optional(),
  chapters: z.array(ChapterSchema).optional(),
}), {
  keyword: 'animate',
  positional: [{ keys: ['duration'], suffix: 's' }],
  flags: ['loop', 'autoKey'],
  kwargs: ['easing'],
  children: { keyframes: 'block', chapters: 'block' },
});
```

## Union Dispatch

When the AST builder encounters a union type (like `ColorSchema`), it must decide which branch to use:

**Rendering (model → text):** The concrete value is known, so dispatch by inspecting the value:
- `typeof value === 'string'` → plain string (named color or hex)
- `'h' in value` → HslColorSchema
- `'r' in value` → RgbColorSchema
- `'name' in value && 'a' in value` → NamedAlphaColorSchema
- `'hex' in value && 'a' in value` → HexAlphaColorSchema

**Parsing (text → model):** Use keyword presence as a lookahead discriminant:
- Next token is `hsl` → HslColorSchema
- Next token is `rgb` → RgbColorSchema
- Next token is a known color name or hex string → plain string
- No keyword match → try each branch in order (like zod's runtime union resolution)

This generalizes: **if a union member has a `keyword` hint, that keyword is the parse-time discriminant.** For unions without keywords (e.g., `AnchorSchema` = enum | tuple, `PointRefSchema` = string | tuple), use structural detection:
- Token starts with `(` → tuple branch
- Token is a string → string/enum branch

The walker has a `dispatchUnion(schema, tokenOrValue)` function that encodes these rules. For each union type in the schema set, the dispatch is deterministic and derived from the hints.

## Node Line Structure

The node line is the most complex DSL construct. Its `dsl()` annotation uses extended fields not available on regular schemas:

- **`nodeId`** — identifies the field used as the DSL node ID prefix (`box:`)
- **`geometry`** — lists the exclusive-choice geometry fields. The walker emits/parses exactly one.
- **`inlineProps` / `blockProps`** — determines which properties render inline vs as indented blocks. `FormatHints` toggles between modes at runtime per node.
- **`inlineLayoutHints`** — layout sub-fields (`grow`, `order`, `alignSelf`, `slot`) that stay inline even in block mode

The walker for a node line follows this order:
1. Emit/consume `nodeId` + `:`
2. Emit/consume the active geometry (exclusive choice from `geometry` list)
3. If inline mode: emit/consume `sigil`, `inlineProps` (fill, stroke, transform, etc.), `kwargs` (opacity, depth), `flags`
4. If block mode: emit/consume `sigil`, `kwargs`, `flags`, `inlineLayoutHints` on the header line; then `blockProps` (fill, stroke, dash, layout) as indented child lines
5. Emit/consume `children` as indented child node lines

`FormatHints` is passed as a runtime parameter to the walker, not baked into the schema annotation. The annotation defines the default structure; FormatHints overrides the inline/block choice per node ID.

## FormatHints Integration

`FormatHints` remains a runtime concept, not a static annotation:

```typescript
interface FormatHints {
  nodes: Record<string, { display: 'inline' | 'block' }>;
}
```

The walker accepts `FormatHints` as a parameter. When rendering a node:
1. Check `formatHints.nodes[nodeId]?.display`
2. If `'block'`, promote `blockProps` to indented child lines
3. If `'inline'` or absent, render all props on the node header line
4. Heuristic fallback: if property count > 6, default to block

When parsing, the parser detects inline vs block by checking whether the next line is indented relative to the node header. If indented, the node is in block mode. The parsed FormatHints are recorded for round-trip preservation.

## Transform Edge Cases

The `at` keyword has partial-position behavior:
- Both x and y present: `at 50,75` (joined positional)
- Only x: `at x=50` (fallback to kwarg)
- Only y: `at y=75` (fallback to kwarg)
- Neither x nor y, but extras present: emit only extras with no `at` keyword

The `fallbackToKwarg: true` flag on the positional hint handles this:
- If ALL keys in the positional group are present → use the positional format
- If only SOME keys are present → emit present keys as kwargs
- If NO keys are present → suppress the keyword entirely

The walker checks which keys are present before deciding the emission strategy.

## The AST

```typescript
interface AstNode {
  schema: z.ZodType;        // the zod schema this node was built from
  schemaPath: string;        // e.g., "rect.w"
  modelPath: string;         // e.g., "objects.box.rect.w"
  from: number;              // start position in text
  to: number;                // end position in text
  value?: unknown;           // parsed/model value for leaf nodes
  children: AstNode[];       // child nodes
  parent?: AstNode;          // back-reference for walking up
  dslRole: DslRole;          // what syntax role this node plays
}

type DslRole =
  | 'keyword'      // fixed string like 'rect', 'fill'
  | 'value'        // a leaf value (number, string, color name)
  | 'kwarg-key'    // the key part of key=value
  | 'kwarg-value'  // the value part of key=value
  | 'flag'         // boolean keyword like 'smooth'
  | 'sigil'        // @ prefix
  | 'separator'    // x, comma, ->, =
  | 'compound'     // container node (rect, stroke, node line, etc.)
  | 'document'     // root
  | 'section'      // metadata, images, styles, objects, animate
```

### Example AST

For `box: rect 140x80 fill red`:

```
Document (0-26)
└── Section 'objects' (0-26)
    └── NodeLine compound (0-25, schemaPath:'', modelPath:'objects.box')
        ├── NodeId 'box' value (0-3)
        ├── Geometry compound (5-16, schemaPath:'rect', modelPath:'objects.box.rect')
        │   ├── 'rect' keyword (5-9)
        │   ├── '140' value (10-13, schemaPath:'rect.w')
        │   ├── 'x' separator (13-14)
        │   └── '80' value (14-16, schemaPath:'rect.h')
        └── Fill compound (17-25, schemaPath:'fill', modelPath:'objects.box.fill')
            ├── 'fill' keyword (17-21)
            └── 'red' value (22-25, schemaPath:'fill')
```

## The AST Builder

Two entry points, same AST output:

**`buildAstFromModel(model, formatHints)`** — for rendering. Walks the model data, looks up each value's schema + `getDsl()` hints, creates AST nodes, assigns text positions as it emits text. Returns `{ ast: AstNode, text: string }`.

**`buildAstFromText(text)`** — for parsing. Tokenizes text, then walks the expected schema structure consuming tokens. Each consumed token becomes an AST node with positions from the token stream. Returns `{ ast: AstNode, model: any, formatHints: FormatHints }`.

### Shared vs Separate Logic

The core schema walk is shared: given a schema with DSL hints, process `keyword` → `positional` → `kwargs` → `flags` → `children` in order. However, the two directions differ in important ways:

**Rendering** never backtracks — you know the concrete value and emit deterministically.

**Parsing** may need lookahead and error recovery:
- Union dispatch requires peeking at the next token
- Optional fields may be absent — the parser must detect "this token doesn't match, skip to next hint"
- Malformed input needs graceful recovery (skip to next line)

The shared part is the **walk order and structural logic** (what hints exist, in what order). The direction-specific part is the **token strategy** (emit text vs consume tokens). This is implemented as a strategy pattern:

```typescript
interface WalkStrategy {
  emitKeyword(keyword: string): void;
  emitValue(value: unknown, schema: z.ZodType): void;
  consumeKeyword(keyword: string): boolean;
  consumeValue(schema: z.ZodType): { value: unknown; from: number; to: number } | null;
  // etc.
}
```

The shared walker calls strategy methods. The emit strategy writes text; the consume strategy reads tokens. Error recovery logic lives in the consume strategy, not in the shared walker.

## Completions

Completions are a tree query with position-aware context:

1. Find the deepest AST node containing the cursor
2. Determine context:
   - **Inside a compound's text range** → suggest missing fields for that compound
   - **Between sibling nodes / on a new line** → suggest what the parent scope expects (new node, new section keyword, etc.)
   - **After a keyword, before positional** → suggest based on expected type (colors for fill, dimensions for rect, etc.)
3. For each missing/expected field, the zod schema provides the type → generate suggestions

Position signals for context:
- Same line, after existing properties → continuing current node
- New line, same indent → new sibling (new node or block property)
- New line, deeper indent → child node or block property
- Blank line → new top-level construct

## Integration

**ModelManager:**
- Holds `_ast: AstNode` alongside `_json` and `_model`
- `setText()` → `buildAstFromText(text)` → extracts model + AST + formatHints
- `getDisplayResult()` → `buildAstFromModel(model, hints)` → returns `{ ast, text }`
- `updateProperty(path, value)` → mutates model → rebuilds AST
- Exposes `get ast(): AstNode`

**V2Editor:**
- AST root stored in a CodeMirror StateField (replaces spanField)
- Click: `ast.nodeAt(pos)` → walk up to compound → open popup
- Hover: `ast.nodeAt(pos)` → show schema description
- Completions: `ast.completionsAt(pos)` → schema-driven suggestions
- Decorations: derived from AST leaf nodes

**PropertyPopup:**
- Receives AST node reference instead of schemaPath + modelPath strings
- Walks AST to find compound children, their schemas, their values
- Widgets still call `onPropertyChange(modelPath, value)`

## What Gets Replaced

| Current File | Lines | Replaced By |
|-------------|-------|-------------|
| `src/dsl/generator.ts` | 613 | `buildAstFromModel` (AST→text) |
| `src/dsl/parser.ts` | ~1400 | `buildAstFromText` (text→AST→model) |
| `src/editor/schemaRenderer.ts` | 1117 | `buildAstFromModel` |
| `src/editor/schemaDecorations.ts` | 62 | AST node positions directly |
| `src/editor/schemaCompletionSource.ts` | 138 | `ast.completionsAt(pos)` |
| `src/editor/dslLinter.ts` | ~80 | Schema-driven validation during parse |
| `src/editor/dslBuilder.ts` | 37 | AST builder handles text emission |
| `src/editor/schemaSpan.ts` | 16 | AST nodes carry positions |

**Stays (modified):**
- `src/types/properties.ts`, `src/types/node.ts`, `src/types/animation.ts` — gain `dsl()` annotations
- `src/editor/modelManager.ts` — holds AST, simplified API
- `src/app/components/V2Editor.tsx` — queries AST instead of spans
- `src/editor/popups/PropertyPopup.tsx` — receives AST nodes
- `src/dsl/formatHints.ts` — inline/block hints for node rendering
- Widget components — unchanged

**Net effect:** ~3300 lines of format-specific code replaced by one schema-driven system. The zod schemas gain ~150-250 lines of `dsl()` annotations.

## Key Invariants

1. **Single source of truth** — every DSL behavior (parsing, rendering, completions, validation, click targets) derives from the annotated zod schema. No parallel definitions.
2. **Every field appears once** — each field in a zod schema is in exactly one of `positional`, `kwargs`, `flags`, `sigil`, `children`, or `record`. If a field has no DSL annotation, it doesn't appear in the DSL.
3. **AST preserves tree structure** — every node knows its parent, children, text range, schema path, and model path.
4. **Bidirectional** — the same schema walk order produces AST from model (rendering) or from text (parsing). Direction-specific logic (emit vs consume) is isolated in strategy objects.
5. **Model paths use node IDs** — `objects.box.rect.w` not `objects.0.rect.w`. Stable across reordering.
6. **Union dispatch is deterministic** — keyword hints serve as parse-time discriminants. Non-keyword unions use structural detection (token type).
7. **FormatHints are runtime, not schema** — inline/block is a per-node-per-render decision, not a static annotation.
