# Multi-Format Color Model Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve user-chosen color formats (named, hex, RGB, HSL) in the model instead of normalizing to HSL at parse time.

**Architecture:** Introduce a `Color` tagged union type. The DSL/JSON parser stores colors in their original format. Conversion to HSL/RGBA happens only at interpolation and rendering time. Bare numbers switch from HSL to RGB. Stroke separates color from width.

**Tech Stack:** TypeScript, Zod, Vitest

**Spec:** `docs/superpowers/specs/2026-03-23-multi-format-color-model-design.md`

---

## Chunk 1: Foundation — Types and Color Utilities

### Task 1: Color union type and Zod schemas

**Files:**
- Modify: `src/types/properties.ts` (lines 5-55)
- Modify: `src/types/color.ts` (lines 3-105)

- [ ] **Step 1: Write failing tests for the new Color type**

In `src/__tests__/types/color.test.ts`, add a new `describe('isColor')` block after existing tests:

```typescript
import { isColor, colorToHsl, colorToRgba } from '../../types/color';

describe('isColor', () => {
  it('recognises named color string', () => {
    expect(isColor('red')).toBe(true);
  });
  it('recognises hex color string', () => {
    expect(isColor('#ff0000')).toBe(true);
  });
  it('recognises RGB object', () => {
    expect(isColor({ r: 255, g: 0, b: 0 })).toBe(true);
  });
  it('recognises HSL object', () => {
    expect(isColor({ h: 0, s: 100, l: 50 })).toBe(true);
  });
  it('recognises named+alpha object', () => {
    expect(isColor({ name: 'red', a: 0.5 })).toBe(true);
  });
  it('recognises hex+alpha object', () => {
    expect(isColor({ hex: '#ff0000', a: 0.5 })).toBe(true);
  });
  it('rejects plain numbers', () => {
    expect(isColor(42)).toBe(false);
  });
  it('rejects unrelated objects', () => {
    expect(isColor({ x: 1, y: 2 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — should fail (isColor not exported)**

Run: `npx vitest run src/__tests__/types/color.test.ts`
Expected: FAIL — `isColor` is not exported from `color.ts`

- [ ] **Step 3: Add Color type and Zod schemas to properties.ts**

Replace `HslColorSchema` and `StrokeSchema` in `src/types/properties.ts`. Keep `HslColor` type exported (used internally by lerpHsl). Add new types:

```typescript
import { z } from 'zod';

// ─── Color Types ───────────────────────────────────────────────

export const RgbColorSchema = z.object({
  r: z.number().int().min(0).max(255),
  g: z.number().int().min(0).max(255),
  b: z.number().int().min(0).max(255),
  a: z.number().min(0).max(1).optional(),
});

export const HslColorSchema = z.object({
  h: z.number().min(0).max(360),
  s: z.number().min(0).max(100),
  l: z.number().min(0).max(100),
  a: z.number().min(0).max(1).optional(),
});

export const NamedAlphaColorSchema = z.object({
  name: z.string(),
  a: z.number().min(0).max(1),
});

export const HexAlphaColorSchema = z.object({
  hex: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/),
  a: z.number().min(0).max(1),
});

export const ColorSchema = z.union([
  z.string(),  // named ("red") or hex ("#ff0000")
  RgbColorSchema,
  HslColorSchema,
  NamedAlphaColorSchema,
  HexAlphaColorSchema,
]);

export type RgbColor = z.infer<typeof RgbColorSchema>;
export type HslColor = z.infer<typeof HslColorSchema>;
export type NamedAlphaColor = z.infer<typeof NamedAlphaColorSchema>;
export type HexAlphaColor = z.infer<typeof HexAlphaColorSchema>;
export type Color = z.infer<typeof ColorSchema>;

// ─── Stroke ────────────────────────────────────────────────────

export const StrokeSchema = z.object({
  color: ColorSchema,
  width: z.number().optional(),
});

export type Stroke = z.infer<typeof StrokeSchema>;

// ... keep Transform, Dash, Layout, LayoutHint unchanged ...
```

- [ ] **Step 4: Add isColor, colorToHsl, colorToRgba to color.ts**

Rewrite `src/types/color.ts`. Keep `CSS_NAMED_COLOURS`, `lerpHsl`. Remove old `parseColor`. Add:

```typescript
import type { Color, HslColor, RgbColor } from './properties';

// ─── Named Color Table (consolidated) ──────────────────────────
// Keep existing CSS_NAMED_COLOURS map (hex strings)

export function resolveNamedColor(name: string): RgbColor | null {
  const hex = CSS_NAMED_COLOURS[name.toLowerCase()];
  if (!hex) return null;
  const [r, g, b] = hexToRgbTuple(hex);
  return { r, g, b };
}

export function rgbToName(color: RgbColor): string | null {
  // Only check the 12 common names for generator output
  const hex = `#${[color.r, color.g, color.b].map(c => c.toString(16).padStart(2, '0')).join('')}`;
  for (const [name, value] of Object.entries(CSS_NAMED_COLOURS)) {
    if (value === hex) return name;
  }
  return null;
}

// ─── Type Guard ────────────────────────────────────────────────

export function isColor(value: unknown): value is Color {
  if (typeof value === 'string') return true;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  if ('r' in obj && 'g' in obj && 'b' in obj) return true;
  if ('h' in obj && 's' in obj && 'l' in obj) return true;
  if ('name' in obj && 'a' in obj) return true;
  if ('hex' in obj && 'a' in obj) return true;
  return false;
}

// ─── Conversion ────────────────────────────────────────────────

export function colorToHsl(color: Color): HslColor {
  if (typeof color === 'string') {
    if (color.startsWith('#')) {
      const [r, g, b] = hexToRgbTuple(color);
      return rgbToHsl(r, g, b);
    }
    const rgb = resolveNamedColor(color);
    if (!rgb) throw new Error(`Unknown color: ${color}`);
    return rgbToHsl(rgb.r, rgb.g, rgb.b);
  }
  if ('h' in color && 's' in color && 'l' in color) {
    return { h: color.h, s: color.s, l: color.l, ...(color.a !== undefined ? { a: color.a } : {}) };
  }
  if ('r' in color && 'g' in color && 'b' in color) {
    const hsl = rgbToHsl(color.r, color.g, color.b);
    if (color.a !== undefined) hsl.a = color.a;
    return hsl;
  }
  if ('name' in color) {
    const rgb = resolveNamedColor(color.name);
    if (!rgb) throw new Error(`Unknown color: ${color.name}`);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    hsl.a = color.a;
    return hsl;
  }
  if ('hex' in color) {
    const [r, g, b] = hexToRgbTuple(color.hex);
    const hsl = rgbToHsl(r, g, b);
    hsl.a = color.a;
    return hsl;
  }
  throw new Error('Invalid color');
}

export function colorToRgba(color: Color): { r: number; g: number; b: number; a: number } {
  // Convert via HSL (reuse hslToRgba logic) or direct for RGB
  if (typeof color !== 'string' && 'r' in color && 'g' in color && 'b' in color) {
    return { r: color.r, g: color.g, b: color.b, a: color.a ?? 1 };
  }
  const hsl = colorToHsl(color);
  // Inline HSL→RGB conversion (from colorConvert.ts logic)
  const s = hsl.s / 100, l = hsl.l / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hsl.h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  const h = hsl.h;
  if (h < 60) { r1 = c; g1 = x; }
  else if (h < 120) { r1 = x; g1 = c; }
  else if (h < 180) { g1 = c; b1 = x; }
  else if (h < 240) { g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
    a: hsl.a ?? 1,
  };
}
```

Also update `lerpHsl` to interpolate alpha:

```typescript
export function lerpHsl(a: HslColor, b: HslColor, t: number): HslColor {
  // existing shortest-arc hue logic...
  const result: HslColor = {
    h: Math.round(h),
    s: Math.round(a.s + (b.s - a.s) * t),
    l: Math.round(a.l + (b.l - a.l) * t),
  };
  // Interpolate alpha if either has it
  if (a.a !== undefined || b.a !== undefined) {
    const aAlpha = a.a ?? 1;
    const bAlpha = b.a ?? 1;
    result.a = aAlpha + (bAlpha - aAlpha) * t;
  }
  return result;
}
```

- [ ] **Step 5: Run tests — isColor tests should pass**

Run: `npx vitest run src/__tests__/types/color.test.ts`
Expected: New `isColor` tests PASS. Some existing `parseColor` tests may fail (if `parseColor` was removed — update them to use `colorToHsl` instead).

- [ ] **Step 6: Write colorToHsl tests**

Add to `src/__tests__/types/color.test.ts`:

```typescript
describe('colorToHsl', () => {
  it('converts named color string', () => {
    expect(colorToHsl('red')).toEqual({ h: 0, s: 100, l: 50 });
  });
  it('converts hex string', () => {
    const hsl = colorToHsl('#ff0000');
    expect(hsl.h).toBeCloseTo(0, 0);
    expect(hsl.s).toBeCloseTo(100, 0);
    expect(hsl.l).toBeCloseTo(50, 0);
  });
  it('converts RGB object', () => {
    const hsl = colorToHsl({ r: 255, g: 0, b: 0 });
    expect(hsl.h).toBeCloseTo(0, 0);
    expect(hsl.s).toBeCloseTo(100, 0);
    expect(hsl.l).toBeCloseTo(50, 0);
  });
  it('passes through HSL object', () => {
    expect(colorToHsl({ h: 210, s: 70, l: 45 })).toEqual({ h: 210, s: 70, l: 45 });
  });
  it('preserves alpha on named+alpha', () => {
    const hsl = colorToHsl({ name: 'red', a: 0.5 });
    expect(hsl.a).toBe(0.5);
  });
  it('preserves alpha on hex+alpha', () => {
    const hsl = colorToHsl({ hex: '#ff0000', a: 0.3 });
    expect(hsl.a).toBe(0.3);
  });
  it('preserves alpha on RGB', () => {
    const hsl = colorToHsl({ r: 255, g: 0, b: 0, a: 0.7 });
    expect(hsl.a).toBe(0.7);
  });
  it('throws on unknown named color', () => {
    expect(() => colorToHsl('notacolor')).toThrow();
  });
});

describe('lerpHsl alpha', () => {
  it('interpolates alpha when both have it', () => {
    const result = lerpHsl({ h: 0, s: 100, l: 50, a: 0 }, { h: 0, s: 100, l: 50, a: 1 }, 0.5);
    expect(result.a).toBeCloseTo(0.5);
  });
  it('defaults missing alpha to 1', () => {
    const result = lerpHsl({ h: 0, s: 100, l: 50 }, { h: 0, s: 100, l: 50, a: 0.5 }, 0.5);
    expect(result.a).toBeCloseTo(0.75);
  });
  it('omits alpha when neither has it', () => {
    const result = lerpHsl({ h: 0, s: 100, l: 50 }, { h: 120, s: 100, l: 50 }, 0.5);
    expect(result.a).toBeUndefined();
  });
});
```

- [ ] **Step 7: Run tests — should pass**

Run: `npx vitest run src/__tests__/types/color.test.ts`

- [ ] **Step 8: Update Node type**

In `src/types/node.ts`, change:
- `fill?: HslColor` → `fill?: Color` (import `Color` from `./properties`)
- `stroke?: Stroke` (already `Stroke` type but its shape changes with the new schema)

Update both `NodeInputSchema` and `NodeSchema` to use `ColorSchema` for fill and the new `StrokeSchema` for stroke.

- [ ] **Step 9: Commit**

```bash
git add src/types/properties.ts src/types/color.ts src/types/node.ts src/__tests__/types/color.test.ts
git commit -m "feat: add Color union type, Zod schemas, colorToHsl, isColor, lerpHsl alpha"
```

---

### Task 2: Remove colorNames.ts and update imports

**Files:**
- Delete: `src/dsl/colorNames.ts`
- Modify: `src/dsl/parser.ts` (imports)
- Modify: `src/dsl/generator.ts` (imports)

- [ ] **Step 1: Update parser.ts imports**

Replace `import { nameToHsl, hexToHsl } from './colorNames'` with `import { resolveNamedColor, isColor } from '../types/color'` in `src/dsl/parser.ts`.

- [ ] **Step 2: Update generator.ts imports**

Replace `import { hslToName } from './colorNames'` with `import { rgbToName, isColor } from '../types/color'` in `src/dsl/generator.ts`.

- [ ] **Step 3: Delete colorNames.ts**

```bash
rm src/dsl/colorNames.ts
```

- [ ] **Step 4: Run type-check to find remaining import references**

```bash
npx tsc --noEmit 2>&1 | head -50
```

Fix any remaining imports of `colorNames.ts` across the codebase.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: consolidate color name tables into types/color.ts"
```

---

## Chunk 2: DSL Parser

### Task 3: Rewrite tryParseColor for multi-format colors

**Files:**
- Modify: `src/dsl/parser.ts` (lines 95-144 for tryParseColor, lines 1124-1148 for parseKeyframeValue)

- [ ] **Step 1: Write failing parser tests for new color formats**

Add to `src/__tests__/dsl/parser.test.ts` in the fill/stroke section:

```typescript
it('parses fill with bare RGB numbers (new default)', () => {
  const result = parseDsl('box: rect 10x10 fill 255 0 0');
  expect(result.objects[0].fill).toEqual({ r: 255, g: 0, b: 0 });
});

it('parses fill with rgb prefix', () => {
  const result = parseDsl('box: rect 10x10 fill rgb 255 128 0');
  expect(result.objects[0].fill).toEqual({ r: 255, g: 128, b: 0 });
});

it('parses fill with hsl prefix', () => {
  const result = parseDsl('box: rect 10x10 fill hsl 210 70 45');
  expect(result.objects[0].fill).toEqual({ h: 210, s: 70, l: 45 });
});

it('parses fill with named color as string', () => {
  const result = parseDsl('box: rect 10x10 fill red');
  expect(result.objects[0].fill).toBe('red');
});

it('parses fill with hex color as string', () => {
  const result = parseDsl('box: rect 10x10 fill #3B82F6');
  expect(result.objects[0].fill).toBe('#3B82F6');
});

it('parses fill with named color and alpha', () => {
  const result = parseDsl('box: rect 10x10 fill red a=0.5');
  expect(result.objects[0].fill).toEqual({ name: 'red', a: 0.5 });
});

it('parses fill with hex color and alpha', () => {
  const result = parseDsl('box: rect 10x10 fill #ff0000 a=0.5');
  expect(result.objects[0].fill).toEqual({ hex: '#ff0000', a: 0.5 });
});

it('parses fill with RGB and alpha', () => {
  const result = parseDsl('box: rect 10x10 fill 255 0 0 a=0.5');
  expect(result.objects[0].fill).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
});

it('parses fill with HSL and alpha', () => {
  const result = parseDsl('box: rect 10x10 fill hsl 210 70 45 a=0.5');
  expect(result.objects[0].fill).toEqual({ h: 210, s: 70, l: 45, a: 0.5 });
});
```

- [ ] **Step 2: Run tests — should fail**

Run: `npx vitest run src/__tests__/dsl/parser.test.ts`
Expected: New tests FAIL (parser still returns HSL objects for everything).

- [ ] **Step 3: Rewrite tryParseColor**

In `src/dsl/parser.ts`, replace `tryParseColor` (lines 95-144):

```typescript
function tryParseColor(s: TokenStream): Color | null {
  // HSL prefix: "hsl 210 70 45"
  if (s.is('identifier', 'hsl') && s.peek(1).type === 'number' && s.peek(2).type === 'number' && s.peek(3).type === 'number') {
    s.next(); // consume 'hsl'
    const h = parseFloat(s.next().value);
    const sat = parseFloat(s.next().value);
    const l = parseFloat(s.next().value);
    const result: Record<string, number> = { h, s: sat, l };
    if (s.is('identifier', 'a') && s.peek(1).type === 'equals') {
      s.next(); s.next();
      result.a = parseFloat(s.expect('number').value);
    }
    return result as any;
  }

  // RGB prefix: "rgb 255 0 0"
  if (s.is('identifier', 'rgb') && s.peek(1).type === 'number' && s.peek(2).type === 'number' && s.peek(3).type === 'number') {
    s.next(); // consume 'rgb'
    const r = parseFloat(s.next().value);
    const g = parseFloat(s.next().value);
    const b = parseFloat(s.next().value);
    const result: Record<string, number> = { r, g, b };
    if (s.is('identifier', 'a') && s.peek(1).type === 'equals') {
      s.next(); s.next();
      result.a = parseFloat(s.expect('number').value);
    }
    return result as any;
  }

  // Bare three numbers → RGB (new default)
  if (s.is('number') && s.peek(1).type === 'number' && s.peek(2).type === 'number') {
    const r = parseFloat(s.next().value);
    const g = parseFloat(s.next().value);
    const b = parseFloat(s.next().value);
    const result: Record<string, number> = { r, g, b };
    if (s.is('identifier', 'a') && s.peek(1).type === 'equals') {
      s.next(); s.next();
      result.a = parseFloat(s.expect('number').value);
    }
    return result as any;
  }

  // Hex color → store verbatim
  if (s.is('hexColor')) {
    const hex = s.next().value;
    if (s.is('identifier', 'a') && s.peek(1).type === 'equals') {
      s.next(); s.next();
      const a = parseFloat(s.expect('number').value);
      return { hex, a } as any;
    }
    return hex;
  }

  // Named color → store as string
  if (s.is('identifier')) {
    const name = s.peek().value;
    if (resolveNamedColor(name)) {
      s.next();
      if (s.is('identifier', 'a') && s.peek(1).type === 'equals') {
        s.next(); s.next();
        const a = parseFloat(s.expect('number').value);
        return { name, a } as any;
      }
      return name;
    }
    return null;
  }

  return null;
}
```

- [ ] **Step 4: Update parseKeyframeValue**

The existing `parseKeyframeValue` already calls `tryParseColor` (from earlier work in this branch). The rewritten `tryParseColor` now returns `Color` instead of `HslColor`, so no structural change is needed — it just returns different shapes now.

Verify the `hsl`/`rgb` prefix handling works in keyframes by checking that `tryParseColor` is called before the generic identifier fallback.

- [ ] **Step 5: Run parser tests — new tests should pass**

Run: `npx vitest run src/__tests__/dsl/parser.test.ts`

- [ ] **Step 6: Update existing parser tests that expect HSL objects**

Many existing tests like `expect(obj.fill).toEqual({ h: 0, s: 0, l: 100 })` for `fill white` now need to be `expect(obj.fill).toBe('white')`. Update all tests in the fill/stroke/animation sections.

Key tests to update:
- `parses fill with named color` (line 143): `{ h: 0, s: 0, l: 100 }` → `'white'`
- `parses fill with hex color` (line 148): HSL object → `'#3B82F6'`
- `parses fill with HSL` (line 133): `{ h: 210, s: 70, l: 45 }` — still three numbers, now becomes `{ r: 210, g: 70, b: 45 }` (breaking! — these tests used HSL values as bare numbers, now they're RGB)
- `parses fill with HSL and alpha` (line 138): same issue
- `parses stroke` (line 156): HSL fields → nested `{ color: ..., width: ... }`
- Animation keyframe tests (lines 487+): update expectations

- [ ] **Step 7: Update stroke parsing**

The stroke parser needs to build `{ color: Color, width?: number }` instead of a flat HSL+width object. Find all stroke-related parsing code and restructure.

In the inline props parsing section, after parsing the color for stroke:
```typescript
// Old: node.stroke = { ...colorResult, width };
// New: node.stroke = { color: colorResult, width };
```

Similarly for block property parsing of stroke.

- [ ] **Step 8: Run all parser tests**

Run: `npx vitest run src/__tests__/dsl/parser.test.ts`
Expected: All pass.

- [ ] **Step 9: Commit**

```bash
git add src/dsl/parser.ts src/__tests__/dsl/parser.test.ts
git commit -m "feat: rewrite tryParseColor for multi-format Color union"
```

---

### Task 4: Update JSON parser

**Files:**
- Modify: `src/parser/parser.ts` (lines 40-81)

- [ ] **Step 1: Update parseScene to handle new Color union in JSON input**

The JSON path uses `JSON5.parse()` and feeds directly to `createNode`. Since `Color` is now a union (string | object), the Zod schema validation in `createNode` / `NodeSchema` handles discrimination. No special JSON parsing code needed for fill.

For stroke, check if any JSON migration logic is needed. If old-format strokes (`{ h, s, l, width }`) appear in JSON input, convert them:

```typescript
function migrateStroke(stroke: any): any {
  if (stroke && typeof stroke === 'object' && 'h' in stroke && 's' in stroke && 'l' in stroke) {
    const { width, ...color } = stroke;
    return { color, ...(width !== undefined ? { width } : {}) };
  }
  return stroke;
}
```

Apply this in `parseScene` after JSON5 parsing, before validation.

- [ ] **Step 2: Run sample parse tests**

Run: `npx vitest run src/__tests__/parser/samples.test.ts`
Expected: May fail due to samples using old HSL bare numbers — that's expected, fixed in Task 8.

- [ ] **Step 3: Commit**

```bash
git add src/parser/parser.ts
git commit -m "feat: accept Color union in JSON parser, migrate old stroke format"
```

---

## Chunk 3: DSL Generator

### Task 5: Rewrite formatColor and formatStroke

**Files:**
- Modify: `src/dsl/generator.ts` (lines 13-36 formatColor/formatStroke, lines 169-206 inline/block props, lines 482-514 keyframe changes)

- [ ] **Step 1: Write failing generator round-trip tests**

Add to `src/__tests__/dsl/roundtrip.test.ts`:

```typescript
it('round-trips fill with named color', () => {
  const scene = {
    objects: [{ id: 'box', rect: { w: 100, h: 80 }, fill: 'red' }],
  };
  const result = roundTrip(scene);
  expect(result.objects[0].fill).toBe('red');
});

it('round-trips fill with hex color', () => {
  const scene = {
    objects: [{ id: 'box', rect: { w: 100, h: 80 }, fill: '#3B82F6' }],
  };
  const result = roundTrip(scene);
  expect(result.objects[0].fill).toBe('#3B82F6');
});

it('round-trips fill with RGB', () => {
  const scene = {
    objects: [{ id: 'box', rect: { w: 100, h: 80 }, fill: { r: 255, g: 128, b: 0 } }],
  };
  const result = roundTrip(scene);
  expect(result.objects[0].fill).toEqual({ r: 255, g: 128, b: 0 });
});

it('round-trips fill with HSL', () => {
  const scene = {
    objects: [{ id: 'box', rect: { w: 100, h: 80 }, fill: { h: 210, s: 70, l: 45 } }],
  };
  const result = roundTrip(scene);
  expect(result.objects[0].fill).toEqual({ h: 210, s: 70, l: 45 });
});

it('round-trips fill with named+alpha', () => {
  const scene = {
    objects: [{ id: 'box', rect: { w: 100, h: 80 }, fill: { name: 'red', a: 0.5 } }],
  };
  const result = roundTrip(scene);
  expect(result.objects[0].fill).toEqual({ name: 'red', a: 0.5 });
});

it('round-trips stroke with nested color', () => {
  const scene = {
    objects: [{ id: 'box', rect: { w: 100, h: 80 }, stroke: { color: 'blue', width: 2 } }],
  };
  const result = roundTrip(scene);
  expect(result.objects[0].stroke).toEqual({ color: 'blue', width: 2 });
});

it('round-trips animation keyframe with named color', () => {
  const scene = {
    objects: [{ id: 'box', rect: { w: 100, h: 80 } }],
    animate: {
      duration: 5,
      keyframes: [
        { time: 0, changes: { 'box.fill': 'red' } },
        { time: 2, changes: { 'box.fill': 'blue' } },
      ],
    },
  };
  const result = roundTrip(scene);
  expect(result.animate.keyframes[0].changes['box.fill']).toBe('red');
  expect(result.animate.keyframes[1].changes['box.fill']).toBe('blue');
});
```

- [ ] **Step 2: Run tests — should fail**

Run: `npx vitest run src/__tests__/dsl/roundtrip.test.ts`

- [ ] **Step 3: Rewrite formatColor**

```typescript
function formatAlpha(a: number | undefined): string {
  return a !== undefined ? ` a=${a}` : '';
}

function formatColor(color: Color): string {
  if (typeof color === 'string') {
    return color.startsWith('#') ? color : color;
  }
  if ('name' in color && 'a' in color) {
    return `${color.name} a=${color.a}`;
  }
  if ('hex' in color && 'a' in color) {
    return `${color.hex} a=${color.a}`;
  }
  if ('r' in color) {
    const name = rgbToName(color);
    if (name) return name + formatAlpha(color.a);
    return `rgb ${color.r} ${color.g} ${color.b}${formatAlpha(color.a)}`;
  }
  if ('h' in color) {
    return `hsl ${color.h} ${color.s} ${color.l}${formatAlpha(color.a)}`;
  }
  return String(color);
}
```

- [ ] **Step 4: Rewrite formatStroke**

```typescript
function formatStroke(stroke: Stroke): string {
  let result = formatColor(stroke.color);
  if (stroke.width !== undefined) result += ` width=${stroke.width}`;
  return result;
}
```

- [ ] **Step 5: Update formatInlineProps and formatBlockVisualProps**

These functions access `node.fill` and `node.stroke` — update them to work with the new types:
- `node.fill` is now a `Color` (string or object), not `HslColor`
- `node.stroke` is now `{ color: Color, width?: number }`, not `{ h, s, l, width }`

- [ ] **Step 6: Update formatKeyframeChange**

Replace the HSL-specific check with `isColor()`:

```typescript
function formatKeyframeChange(path: string, val: any): string {
  if (typeof val === 'string' && isEffectKey(path)) {
    return `${path} ${val}`;
  }
  if (typeof val === 'object' && val !== null && !Array.isArray(val) && 'effect' in val) {
    let s = `${path} ${val.effect}`;
    for (const [k, v] of Object.entries(val)) {
      if (k === 'effect') continue;
      s += ` ${k}=${formatValue(v)}`;
    }
    return s;
  }
  // Color value (any Color variant)
  if (isColor(val) && !isEffectKey(path)) {
    if (typeof val === 'string') {
      return `${path}: ${val}`;
    }
    return `${path}: ${formatColor(val)}`;
  }
  // Property change with easing
  if (typeof val === 'object' && val !== null && !Array.isArray(val) && 'value' in val && 'easing' in val) {
    const valStr = isColor(val.value) ? formatColor(val.value) : formatValue(val.value);
    return `${path}: ${valStr} easing=${val.easing}`;
  }
  return `${path}: ${formatValue(val)}`;
}
```

- [ ] **Step 7: Run round-trip tests**

Run: `npx vitest run src/__tests__/dsl/roundtrip.test.ts`

- [ ] **Step 8: Update existing round-trip tests**

Update tests that expect old HSL shapes. E.g., `expect(obj.fill).toEqual({ h: 210, s: 70, l: 45 })` for fills that were specified with HSL objects — these still work if the JSON input had HSL objects. But DSL round-trips that started with bare HSL numbers now produce RGB.

- [ ] **Step 9: Commit**

```bash
git add src/dsl/generator.ts src/__tests__/dsl/roundtrip.test.ts
git commit -m "feat: formatColor preserves original color format, stroke uses nested color"
```

---

## Chunk 4: Renderer, Animation, Walker

### Task 6: Update renderer

**Files:**
- Modify: `src/renderer/emitter.ts` (lines 12-45)
- Modify: `src/renderer/colorConvert.ts`
- Modify: `src/renderer/hslToCSS.ts`

- [ ] **Step 1: Update hslFillToRgba → colorFillToRgba in emitter.ts**

Replace `hslFillToRgba` with a function that accepts `Color`:

```typescript
import { colorToRgba } from '../types/color';
import type { Color, Stroke } from '../types/properties';

function colorFillToRgba(fill: Color, alpha: number): RgbaColor {
  const rgba = colorToRgba(fill);
  return { ...rgba, a: rgba.a * alpha };
}
```

- [ ] **Step 2: Update strokeToStyle in emitter.ts**

The stroke is now `{ color: Color, width?: number }`:

```typescript
function strokeToStyle(stroke: Stroke, alpha: number): StrokeStyle {
  const rgba = colorToRgba(stroke.color);
  // ... rest of dash handling unchanged ...
  return { color: { ...rgba, a: rgba.a * alpha }, width: stroke.width ?? 1, dash };
}
```

- [ ] **Step 3: Update all callsites in emitNode**

Replace `hslFillToRgba(node.fill, ...)` with `colorFillToRgba(node.fill, ...)` throughout `emitNode`.

- [ ] **Step 4: Update colorConvert.ts exports**

Keep `hslToRgba` for any remaining internal use. Add `rgbToRgba` if needed. The main conversion is now `colorToRgba` in `color.ts`.

- [ ] **Step 5: Update hslToCSS.ts**

Add a `colorToCSS` function that dispatches based on color type:

```typescript
import type { Color, Stroke } from '../types/properties';
import { colorToRgba } from '../types/color';
import { rgbaToCSS } from './colorConvert';

export function colorToCSS(color: Color): string {
  const rgba = colorToRgba(color);
  return rgbaToCSS(rgba);
}

export function strokeToCSSColor(stroke: Stroke): string {
  return colorToCSS(stroke.color);
}
```

- [ ] **Step 6: Run full test suite to check for renderer regressions**

Run: `npx vitest run`

- [ ] **Step 7: Commit**

```bash
git add src/renderer/emitter.ts src/renderer/colorConvert.ts src/renderer/hslToCSS.ts
git commit -m "feat: renderer uses colorToRgba for multi-format colors"
```

---

### Task 7: Update animation system

**Files:**
- Modify: `src/animation/interpolate.ts`
- Modify: `src/animation/timeline.ts`

- [ ] **Step 1: Write failing interpolation test for Color values**

Add to `src/__tests__/animation/interpolate.test.ts`:

```typescript
import { colorToHsl } from '../../types/color';

it('interpolates named color strings via HSL', () => {
  const result = interpolateValue('red', 'blue', 0.5);
  // Result is an ephemeral HSL object
  expect(result).toHaveProperty('h');
  expect(result).toHaveProperty('s');
  expect(result).toHaveProperty('l');
});

it('interpolates RGB color objects via HSL', () => {
  const result = interpolateValue({ r: 255, g: 0, b: 0 }, { r: 0, g: 0, b: 255 }, 0.5);
  expect(result).toHaveProperty('h');
});

it('interpolates mixed color formats via HSL', () => {
  const result = interpolateValue('red', { r: 0, g: 0, b: 255 }, 0.5);
  expect(result).toHaveProperty('h');
});
```

- [ ] **Step 2: Run tests — should fail**

Run: `npx vitest run src/__tests__/animation/interpolate.test.ts`

- [ ] **Step 3: Update interpolateValue**

```typescript
import { isColor, colorToHsl } from '../types/color';
import { lerpHsl } from '../types/color';

export function interpolateValue(a: unknown, b: unknown, t: number): unknown {
  if (typeof a === 'number' && typeof b === 'number') {
    return a + (b - a) * t;
  }
  // Any Color values → convert to HSL and lerp
  if (isColor(a) && isColor(b)) {
    return lerpHsl(colorToHsl(a as any), colorToHsl(b as any), t);
  }
  return t >= 1 ? b : a;
}
```

- [ ] **Step 4: Update timeline.ts isColor guard**

Replace `isHslObject` with imported `isColor`:

```typescript
import { isColor } from '../types/color';

function isSubObjectShorthand(value: unknown): boolean {
  return typeof value === 'object' && value !== null
    && !isPropertyChange(value) && !Array.isArray(value)
    && !isColor(value);
}
```

Remove the local `isHslObject` function.

- [ ] **Step 5: Update timeline tests**

In `src/__tests__/animation/timeline.test.ts`, update the "keeps HSL color objects as atomic" test to also test RGB and string colors:

```typescript
it('keeps Color values as atomic track values', () => {
  const config = makeConfig({
    keyframes: [
      { time: 0, changes: { 'box.fill': 'red' } },
      { time: 2, changes: { 'box.fill': 'blue' } },
    ],
  });
  const { tracks } = buildTimeline(config);
  expect(tracks.has('box.fill')).toBe(true);
  expect(tracks.get('box.fill')![0].value).toBe('red');
  expect(tracks.get('box.fill')![1].value).toBe('blue');
});

it('keeps RGB color objects as atomic track values', () => {
  const config = makeConfig({
    keyframes: [
      { time: 0, changes: { 'box.fill': { r: 255, g: 0, b: 0 } } },
      { time: 2, changes: { 'box.fill': { r: 0, g: 0, b: 255 } } },
    ],
  });
  const { tracks } = buildTimeline(config);
  expect(tracks.has('box.fill')).toBe(true);
  expect(tracks.has('box.fill.r')).toBe(false);
});
```

- [ ] **Step 6: Run animation tests**

Run: `npx vitest run src/__tests__/animation/`

- [ ] **Step 7: Commit**

```bash
git add src/animation/interpolate.ts src/animation/timeline.ts src/__tests__/animation/
git commit -m "feat: animation interpolates any Color format via colorToHsl"
```

---

### Task 8: Update track walker

**Files:**
- Modify: `src/tree/walker.ts` (lines 4-55)

- [ ] **Step 1: Update walker to treat fill as leaf, stroke as sub-object with color leaf**

In `src/tree/walker.ts`:

```typescript
// Remove 'fill' and 'stroke' from SUB_OBJECT_KEYS
const SUB_OBJECT_KEYS = ['transform', 'dash', 'size', 'layout', 'layoutHint'] as const;

// Add a new set for color properties (leaf values, not recursed)
const COLOR_KEYS = ['fill'] as const;

// Stroke is handled specially: stroke.color is a leaf, stroke.width is a scalar
```

Update `walkNode` to:
- Emit `{prefix}.fill` as a leaf path (no recursion into h/s/l/r/g/b)
- Emit `{prefix}.stroke.color` and `{prefix}.stroke.width` as leaf paths

- [ ] **Step 2: Update integration test expectations**

Any test that expects paths like `box.fill.h` or `box.stroke.h` now expects `box.fill` and `box.stroke.color`.

Check `src/__tests__/dsl/integration.test.ts` for track path expectations.

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`

- [ ] **Step 4: Commit**

```bash
git add src/tree/walker.ts src/__tests__/
git commit -m "feat: walker treats fill as leaf, stroke.color as leaf"
```

---

## Chunk 5: Samples, Editor, Cleanup

### Task 9: Update samples

**Files:**
- Modify: `src/samples/index.ts`

- [ ] **Step 1: Update all HSL bare-number fills/strokes in samples**

All samples currently use `fill: { h: 210, s: 70, l: 45 }` in JSON format. These HSL objects are still valid in the Color union, so JSON-format samples need no change for fill.

Stroke objects need restructuring: `stroke: { h: 210, s: 80, l: 30, width: 2 }` → `stroke: { color: { h: 210, s: 80, l: 30 }, width: 2 }`.

The DSL-format `color-animation` sample needs updating for the new syntax.

- [ ] **Step 2: Update animation keyframe paths in samples**

Any sample with `box.fill.h` animation paths needs updating to `box.fill` with whole-color values.

For example, `nested-children` sample animating `card.bg.fill.h`:
```
// Before
{ time: 0, changes: { "card.bg.fill.h": 210 } }

// After — animate whole color
{ time: 0, changes: { "card.bg.fill": { h: 210, s: 50, l: 18 } } }
```

Similarly for all other samples that animate individual color components.

- [ ] **Step 3: Run sample parse tests**

Run: `npx vitest run src/__tests__/parser/samples.test.ts`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/samples/index.ts
git commit -m "feat: update samples for multi-format Color model"
```

---

### Task 10: Update editor

**Files:**
- Modify: `src/editor/dslCursorPath.ts`

- [ ] **Step 1: Add rgb/hsl to clickable keyword detection**

In `dslCursorPath.ts`, find where color keywords are detected (the `CLICKABLE_PROPS` or similar set). Add `'rgb'` and `'hsl'` so the editor recognises them as part of a color value.

- [ ] **Step 2: Run editor tests if any exist**

```bash
npx vitest run src/__tests__/editor/
```

- [ ] **Step 3: Commit**

```bash
git add src/editor/dslCursorPath.ts
git commit -m "feat: editor recognises rgb/hsl color keywords"
```

---

### Task 11: Full test suite and cleanup

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```

Fix any remaining failures.

- [ ] **Step 2: Run type-check**

```bash
npx tsc --noEmit
```

Fix any type errors.

- [ ] **Step 3: Clean up unused imports and dead code**

Remove any remaining references to old `HslColor`-only patterns. Check for unused imports of deleted functions.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: fix remaining type errors and test failures"
```

---

## Verification

After all tasks complete:

1. `npx vitest run` — all tests pass
2. `npx tsc --noEmit` — no type errors
3. Manual test: parse `fill red` → model stores `"red"`, generator outputs `fill red`
4. Manual test: parse `fill #ff0000` → model stores `"#ff0000"`, generator outputs `fill #ff0000`
5. Manual test: parse `fill 255 0 0` → model stores `{ r: 255, g: 0, b: 0 }`, generator outputs `fill rgb 255 0 0`
6. Manual test: parse `fill hsl 210 70 45` → model stores `{ h: 210, s: 70, l: 45 }`, generator outputs `fill hsl 210 70 45`
7. Manual test: animation `a.fill: red` → `a.fill: blue` interpolates smoothly
