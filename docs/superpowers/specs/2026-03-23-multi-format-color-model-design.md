# Multi-Format Color Model

## Context

Colors are currently normalized to HSL (`{ h, s, l, a? }`) at parse time. This is lossy — `fill red`, `fill #ff0000`, and `fill 0 100 50` all become the same HSL object. Users think in RGB, hex, and named colors, not HSL. The model should preserve the user's chosen format and only convert to HSL internally for interpolation and rendering.

This is a breaking change. Bare numbers (`fill 255 0 0`) flip from HSL to RGB. Existing content needs an `hsl` prefix added to bare-number colors. Existing JSON stroke objects need restructuring.

## Color Union Type

The model stores colors as a tagged union. Discrimination is runtime-only (TypeScript cannot narrow between the two string subtypes):

```typescript
type RgbColor = { r: number; g: number; b: number; a?: number };
type HslColor = { h: number; s: number; l: number; a?: number };
type NamedAlphaColor = { name: string; a: number };
type HexAlphaColor = { hex: string; a: number };

type Color = string | RgbColor | HslColor | NamedAlphaColor | HexAlphaColor;
```

Runtime discrimination logic for the `isColor` type guard:
1. `typeof color === 'string'` → string starting with `#` is hex, otherwise named
2. Object with `r`, `g`, `b` → RGB
3. Object with `h`, `s`, `l` → HSL
4. Object with `name` + `a` → named + alpha
5. Object with `hex` + `a` → hex + alpha

String colors without alpha are plain strings (`"red"`, `"#ff0000"`). When alpha is needed, they promote to objects (`{ name: "red", a: 0.5 }`, `{ hex: "#ff0000", a: 0.5 }`). This keeps the common no-alpha case simple.

`Node.fill` changes from `HslColor` to `Color`. `Node.stroke` changes from `HslColor & { width? }` to `Stroke` (see below).

## Validation

Zod schemas enforce:
- RGB: `r`, `g`, `b` integers 0–255. `a` optional 0–1.
- HSL: `h` 0–360, `s` 0–100, `l` 0–100. `a` optional 0–1.
- Named: validated via `z.string().refine(name => resolveNamedColor(name) !== null)` — rejects unknown names at parse time for both DSL and JSON paths.
- Hex: must match `#` followed by 3 or 6 hex digits.
- Stroke: `z.object({ color: ColorSchema, width: z.number().optional() })`.

## DSL Syntax

| Format | Syntax | With alpha |
|--------|--------|------------|
| Named | `fill red` | `fill red a=0.5` |
| Hex | `fill #ff0000` | `fill #ff0000 a=0.5` |
| RGB (default) | `fill 255 0 0` or `fill rgb 255 0 0` | `fill 255 0 0 a=0.5` |
| HSL | `fill hsl 210 70 45` | `fill hsl 210 70 45 a=0.5` |

Bare three-number values default to RGB. The `rgb` prefix is optional. The `hsl` prefix is required.

Hex tokens are stored verbatim, including 3-char shorthands (`#f00` stays `#f00`).

### Parser dispatch for `tryParseColor`

```
tryParseColor(s):
  if identifier 'hsl' followed by three numbers:
    consume 'hsl', consume three numbers → HslColor { h, s, l }
  if identifier 'rgb' followed by three numbers:
    consume 'rgb', consume three numbers → RgbColor { r, g, b }
  if three consecutive numbers (no prefix):
    consume three numbers → RgbColor { r, g, b }        // bare = RGB
  if hexColor token:
    consume token → store verbatim as string "#..."
  if identifier matching a known color name:
    consume token → store as string "red"
  then: if next tokens are 'a' '=' number, consume and attach alpha
  else: return null (not a color)
```

The same dispatch applies in `parseKeyframeValue` — it delegates to `tryParseColor` which handles all formats including `rgb`/`hsl` prefixes.

## JSON Representation

```json
"fill": "red"
"fill": "#ff0000"
"fill": { "r": 255, "g": 0, "b": 0 }
"fill": { "h": 210, "s": 70, "l": 45 }
"fill": { "name": "red", "a": 0.5 }
"fill": { "hex": "#ff0000", "a": 0.5 }
"fill": { "r": 255, "g": 0, "b": 0, "a": 0.5 }
"fill": { "h": 210, "s": 70, "l": 45, "a": 0.5 }
```

## Stroke Restructured

Currently stroke mixes color fields with width: `{ h, s, l, width }`.

New structure separates them:

```typescript
type Stroke = { color: Color; width?: number };
```

DSL stays natural:
```
stroke red width=2
stroke #ff0000 width=2
stroke rgb 255 0 0 width=2
stroke hsl 210 70 45 width=2
```

JSON:
```json
"stroke": { "color": "red", "width": 2 }
"stroke": { "color": { "r": 255, "g": 0, "b": 0 }, "width": 2 }
```

Stroke DSL parsing: `a=` after the color sets the color's alpha (`stroke.color.a`), `width=` sets `stroke.width`. The parser must route these to different nesting levels.

## Background

The `background` property stays as a plain string (hex or CSS color string). It is not part of the `Color` union — it passes through to the renderer as-is.

## Named Color Lookup

Two lookup tables currently exist:
- `src/dsl/colorNames.ts` — 12 basic colors (used by DSL parser/generator)
- `src/types/color.ts` — ~140 CSS named colors (used by `parseColor`)

Consolidate to a single canonical table in `src/types/color.ts` exporting:
- `resolveNamedColor(name: string): RgbColor | null` — the single lookup function
- `rgbToName(color: RgbColor): string | null` — reverse lookup for generator

The 12-color table in `colorNames.ts` is removed. The DSL parser and generator use the canonical table.

### Generator dispatch for `formatColor`

```
formatColor(color: Color):
  if typeof color === 'string' and starts with '#': return color       // "#ff0000"
  if typeof color === 'string': return color                           // "red"
  if 'name' in color: return color.name + formatAlpha(color.a)        // "red a=0.5"
  if 'hex' in color: return color.hex + formatAlpha(color.a)          // "#ff0000 a=0.5"
  if 'r' in color:
    name = rgbToName(color)
    if name: return name + formatAlpha(color.a)                        // "white a=0.5"
    return `rgb ${color.r} ${color.g} ${color.b}` + formatAlpha(color.a)  // "rgb 255 0 0"
    // Note: bare numbers (no 'rgb' prefix) only for JSON→DSL when no ambiguity
  if 'h' in color:
    return `hsl ${color.h} ${color.s} ${color.l}` + formatAlpha(color.a)  // "hsl 210 70 45"
```

`formatStroke` wraps `formatColor(stroke.color)` and appends `width=N` if present.

`formatKeyframeChange` must use `isColor()` to detect any `Color` variant (not just HSL objects) and call `formatColor` for both direct values and easing-wrapped `PropertyChange` values.

## Conversion Utilities

All in `src/types/color.ts`:

```typescript
colorToHsl(color: Color): HslColor    // for interpolation
colorToRgba(color: Color): RgbaColor   // for rendering
isColor(value: unknown): value is Color // shared type guard
```

`colorToRgba` throws on unrecognized named colors (validated at parse time, so this is a defensive error, not a user-facing one).

## Animation

### Interpolation

`interpolateValue` resolves any `Color` to HSL via `colorToHsl`, then calls `lerpHsl`. The result is an ephemeral HSL object — users never see intermediate values.

`lerpHsl` is updated to interpolate alpha: if either input has `a`, the output lerps `a` (defaulting missing `a` to 1.0).

### Keyframe colors

Animation keyframes use the same color formats:
```
animate 5s
  0 a.fill: red
  2 a.fill: blue
  4 a.fill: rgb 255 128 0
```

`parseKeyframeValue` must handle `rgb`/`hsl` prefix keywords followed by three numbers, in addition to named colors, hex tokens, and bare RGB triplets.

### Sub-component animation

`fill.h`, `fill.s`, `fill.l`, `fill.r`, etc. are no longer valid animation paths since `fill` is now a tagged union, not always an HSL object. Only whole-color animation is supported: `a.fill: red`.

The track path walker (`src/tree/walker.ts`) treats `fill` as a leaf (move from `SUB_OBJECT_KEYS` to a new `COLOR_KEYS` set). `stroke` becomes a sub-object with two leaves: `stroke.color` (color leaf, not recursed into) and `stroke.width` (numeric leaf). The walker emits paths like `node.fill`, `node.stroke.color`, `node.stroke.width` — never `node.fill.h` or `node.stroke.color.r`.

### Timeline guard

`isHslObject` in `timeline.ts` becomes `isColor` — prevents any `Color` object from being expanded as sub-object shorthand.

## Migration

### 1. DSL bare numbers: HSL → RGB
```
// Before
fill 210 70 45

// After
fill hsl 210 70 45
```

### 2. JSON stroke restructure
```json
// Before
"stroke": { "h": 240, "s": 100, "l": 50, "width": 2 }

// After
"stroke": { "color": { "h": 240, "s": 100, "l": 50 }, "width": 2 }
```

### 3. Backwards-compatible: JSON fill HSL objects still valid
Existing `"fill": { "h": 210, "s": 70, "l": 45 }` remains valid — it's now interpreted as an HSL color in the union rather than the only color type. Not a breaking change.

## Files Affected

| Area | Files | Change |
|------|-------|--------|
| Types | `src/types/properties.ts` | New `Color` union type, Zod schemas, restructured `Stroke` |
| Type utils | `src/types/color.ts` | `colorToHsl()`, `colorToRgba()`, `isColor()`, consolidated named-color table, `lerpHsl` alpha fix |
| Node type | `src/types/node.ts` | `fill: Color`, `stroke: Stroke` |
| DSL parser | `src/dsl/parser.ts` | `tryParseColor()` returns tagged `Color`, handle `rgb`/`hsl` prefixes, bare numbers → RGB, keyframe colors |
| DSL generator | `src/dsl/generator.ts` | `formatColor()` preserves original format, `formatStroke()` handles nested color |
| JSON parser | `src/parser/parser.ts` | Accept `Color` union in JSON input, migrate old stroke format |
| Tokenizer | `src/dsl/tokenizer.ts` | `rgb`/`hsl` handled as identifiers (no tokenizer change needed) |
| Renderer | `src/renderer/emitter.ts` | Use `colorToRgba()` instead of `hslToRgba()` |
| Renderer | `src/renderer/colorConvert.ts` | Add `rgbToRgba()`, update exports |
| Animation | `src/animation/interpolate.ts` | Resolve `Color` to HSL via `colorToHsl` before `lerpHsl` |
| Animation | `src/animation/timeline.ts` | `isHslObject` guard → `isColor` guard |
| Track walker | `src/tree/walker.ts` | `fill` and `stroke.color` are leaf values, no sub-component paths |
| Color names | `src/dsl/colorNames.ts` | Remove — consolidated into `color.ts` |
| Samples | `src/samples/index.ts` | Update all HSL bare-number colors to use `hsl` prefix or convert to RGB |
| Tests | `src/__tests__/` | Update all color-related tests |
| Editor | `src/editor/dslCursorPath.ts` | Update color keyword detection for `rgb`/`hsl` prefixes |
