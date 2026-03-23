# Multi-Format Color Model

## Context

Colors are currently normalized to HSL (`{ h, s, l, a? }`) at parse time. This is lossy — `fill red`, `fill #ff0000`, and `fill 0 100 50` all become the same HSL object. Users think in RGB, hex, and named colors, not HSL. The model should preserve the user's chosen format and only convert to HSL internally for interpolation and rendering.

This is a breaking change. Bare numbers (`fill 255 0 0`) flip from HSL to RGB. Existing content needs an `hsl` prefix added to bare-number colors.

## Color Union Type

The model stores colors as a tagged union. In TypeScript:

```typescript
type NamedColor = string;                                    // "red", "blue", etc.
type HexColor = string;                                      // "#ff0000", "#f00"
type RgbColor = { r: number; g: number; b: number; a?: number };
type HslColor = { h: number; s: number; l: number; a?: number };
type NamedAlphaColor = { name: string; a: number };
type HexAlphaColor = { hex: string; a: number };

type Color = NamedColor | HexColor | RgbColor | HslColor | NamedAlphaColor | HexAlphaColor;
```

Discrimination:
- `string` starting with `#` → hex
- `string` not starting with `#` → named
- Object with `r`, `g`, `b` → RGB
- Object with `h`, `s`, `l` → HSL
- Object with `name` → named + alpha
- Object with `hex` → hex + alpha

## DSL Syntax

| Format | Syntax | With alpha |
|--------|--------|------------|
| Named | `fill red` | `fill red a=0.5` |
| Hex | `fill #ff0000` | `fill #ff0000 a=0.5` |
| RGB (default) | `fill 255 0 0` or `fill rgb 255 0 0` | `fill 255 0 0 a=0.5` |
| HSL | `fill hsl 210 70 45` | `fill hsl 210 70 45 a=0.5` |

Bare three-number values default to RGB. The `rgb` prefix is optional. The `hsl` prefix is required.

## JSON Representation

```json
// Named
"fill": "red"

// Hex
"fill": "#ff0000"

// RGB
"fill": { "r": 255, "g": 0, "b": 0 }

// HSL
"fill": { "h": 210, "s": 70, "l": 45 }

// Named with alpha
"fill": { "name": "red", "a": 0.5 }

// Hex with alpha
"fill": { "hex": "#ff0000", "a": 0.5 }

// RGB/HSL with alpha
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

## Conversion Points

The model preserves the user's format. Conversion to HSL happens only at two internal points:

1. **Animation interpolation** — `interpolateValue` resolves any `Color` to HSL, calls `lerpHsl`, returns an ephemeral HSL result. Users never see intermediate values.
2. **Rendering** — the emitter converts any `Color` to RGBA for the backend.

A shared `colorToHsl(color: Color): HslColor` utility handles all format conversions.

## Keyframe Colors

Animation keyframes use the same color formats:
```
animate 5s
  0 a.fill: red
  2 a.fill: blue
  4 a.fill: rgb 255 128 0
```

Keyframe color values are stored in the user's format. The interpolation layer converts to HSL on the fly.

## Migration

Breaking change: bare numbers switch from HSL to RGB. Existing documents need `hsl` prefix added to bare-number colors:

```
// Before
fill 210 70 45

// After
fill hsl 210 70 45
```

## Files Affected

| Area | Files | Change |
|------|-------|--------|
| Types | `src/types/properties.ts` | New `Color` union type, restructured `Stroke` |
| Type utils | `src/types/color.ts` | `colorToHsl()`, `colorToRgba()`, type guards |
| DSL parser | `src/dsl/parser.ts` | `tryParseColor()` returns tagged color, handle `rgb`/`hsl` prefixes, bare numbers → RGB |
| DSL generator | `src/dsl/generator.ts` | `formatColor()` preserves original format |
| JSON parser | `src/parser/parser.ts` | Accept new color union in JSON input |
| Tokenizer | `src/dsl/tokenizer.ts` | Recognize `rgb`/`hsl` as keywords (or handle as identifiers) |
| Renderer | `src/renderer/emitter.ts` | Use `colorToRgba()` instead of `hslToRgba()` |
| Renderer | `src/renderer/colorConvert.ts` | Add `rgbToRgba()`, update exports |
| Animation | `src/animation/interpolate.ts` | Resolve `Color` to HSL before `lerpHsl` |
| Animation | `src/animation/timeline.ts` | `isHslObject` guard → `isColorObject` guard |
| Color names | `src/dsl/colorNames.ts` | Keep `nameToHsl`, add `nameToRgb` or route through `colorToHsl` |
| Samples | `src/samples/index.ts` | Update all HSL bare-number colors to use `hsl` prefix or RGB |
| Tests | `src/__tests__/` | Update all color-related tests |
| Editor | `src/editor/dslCursorPath.ts` | Update color keyword detection |
