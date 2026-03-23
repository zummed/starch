# Starch DSL Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a compact, human-readable DSL as an alternative editor view over the canonical JSON5 format, with full editor intelligence (autocomplete, popups, linting, hover descriptions).

**Architecture:** The DSL is a bidirectional presentation layer. A parser converts DSL text → JSON AST. A generator converts JSON AST → DSL text. The editor toggles between views, with all edits targeting the underlying JSON5 source. The existing schema registry, popups, and completion infrastructure are reused.

**Tech Stack:** TypeScript, Zod 4, CodeMirror 6, Vitest, React

**Spec:** `docs/superpowers/specs/2026-03-22-dsl-design.md`

**Out of scope:** Embedded editor (Section 6 of spec) — separate follow-up plan.

---

## File Structure

### New Files

```
src/dsl/
  types.ts              — DSL AST node types (DslNode, DslDocument, DslStyle, DslAnimate)
  tokenizer.ts          — Lexer: DSL text → token stream (handles indentation, keywords, values)
  parser.ts             — DSL token stream → JSON AST (ParsedScene-compatible)
  generator.ts          — JSON AST → DSL text (rendering heuristics)
  colorNames.ts         — Named color ↔ HSL lookup table
  resolveShortcut.ts    — `..` double-dot path resolution

src/editor/
  dslCursorPath.ts      — DSL cursor position → JSON schema path
  dslCompletionSource.ts — DSL-specific autocompletions
  dslLinter.ts          — DSL linting via parse errors + schema validation

src/__tests__/dsl/
  tokenizer.test.ts
  parser.test.ts
  generator.test.ts
  colorNames.test.ts
  resolveShortcut.test.ts
  roundtrip.test.ts
```

### Modified Files

```
src/types/properties.ts     — Add defaults: stroke.width, dash.length/gap
src/types/node.ts           — Add .describe() to all fields, default text.size, tighten points type
src/types/animation.ts      — Add .describe() to all fields
src/types/schemaRegistry.ts — Export descriptions for hover tooltips
src/parser/parser.ts        — Accept DSL input (detect format, delegate), normalize from/to → route
src/editor/modelManager.ts  — Add format tracking, DSL ↔ JSON coordination
src/app/components/V2Editor.tsx — Format toggle button, DSL CodeMirror mode
```

---

## Chunk 1: Schema Foundations

Adds schema defaults, descriptions, and the unified route model. These are prerequisites for both the DSL and improved editor intelligence.

### Task 1: Enrich Schema Descriptions for Hover Tooltips

All schema fields already have `.describe()` calls. This task enriches them with consistent, user-facing descriptions that include type, range, and default information — suitable for display in hover tooltips.

**Files:**
- Modify: `src/types/properties.ts`
- Modify: `src/types/node.ts`
- Modify: `src/types/animation.ts`

- [ ] **Step 1: Review and enrich descriptions in properties.ts**

Update all `.describe()` calls to follow the pattern: "What it does (type, range, default)". Example: change `.describe('Hue (degrees)')` to `.describe('Hue angle in degrees (0-360)')`. Follow the existing codebase convention of `.describe().optional()` order (description before optional).

- [ ] **Step 2: Review and enrich descriptions in node.ts**

Same pattern. Ensure geometry-specific fields clearly state units and constraints.

- [ ] **Step 3: Review and enrich descriptions in animation.ts**

Same pattern.

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All existing tests pass

- [ ] **Step 5: Commit**

```bash
git add src/types/
git commit -m "feat: enrich schema descriptions for hover tooltips"
```

### Task 2: Add Schema Defaults

**Files:**
- Modify: `src/types/properties.ts`
- Modify: `src/types/node.ts`
- Test: `src/__tests__/types/defaults.test.ts`

- [ ] **Step 1: Write tests for new defaults**

```typescript
// src/__tests__/types/defaults.test.ts
import { describe, it, expect } from 'vitest';
import { StrokeSchema, DashSchema } from '../../types/properties';
import { TextGeomSchema } from '../../types/node';

describe('schema defaults', () => {
  it('StrokeSchema.width defaults to 1', () => {
    const result = StrokeSchema.parse({ h: 0, s: 0, l: 50 });
    expect(result.width).toBe(1);
  });

  it('DashSchema.length and gap are optional', () => {
    const result = DashSchema.parse({ pattern: 'dashed' });
    expect(result.pattern).toBe('dashed');
    expect(result.length).toBeUndefined();
    expect(result.gap).toBeUndefined();
  });

  it('TextGeomSchema.size defaults to 14', () => {
    const result = TextGeomSchema.parse({ content: 'hello' });
    expect(result.size).toBe(14);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/types/defaults.test.ts`
Expected: FAIL

- [ ] **Step 3: Update StrokeSchema**

In `src/types/properties.ts`, make `width` optional (keep `z.string()` for dash pattern — it supports custom SVG dasharray values):

```typescript
width: z.number().min(0).max(20).describe('Stroke width in pixels (0-20, default 1)').optional(),
```

- [ ] **Step 4: Update DashSchema**

Make `length` and `gap` optional. Keep `pattern` as `z.string()` (not `z.enum`) to preserve SVG dasharray support:

```typescript
export const DashSchema = z.object({
  pattern: z.string().describe('Dash pattern (solid, dashed, dotted, or SVG dasharray)'),
  length: z.number().min(0).max(50).describe('Dash length in pixels (0-50)').optional(),
  gap: z.number().min(0).max(50).describe('Gap between dashes in pixels (0-50)').optional(),
});
```

- [ ] **Step 5: Update TextGeomSchema**

Make `size` optional:

```typescript
size: z.number().min(1).describe('Font size in pixels (default 14)').optional(),
```

- [ ] **Step 6: Add runtime fallbacks in renderers**

Since the codebase doesn't use `Schema.parse()` at runtime, adding `.default()` alone won't inject defaults. Add fallback operators in the renderer code that reads these fields:

In `src/renderer/emitter.ts`: use `stroke.width ?? 1` wherever `stroke.width` is read.
In `src/renderer/svgBackend.ts`: for dash, derive defaults from pattern: `dashed` → `length: 8, gap: 4`; `dotted` → `length: 2, gap: 4`; otherwise use the explicit values.
In `src/renderer/emitter.ts` and geometry code: use `text.size ?? 14` wherever text size is read.

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/__tests__/types/defaults.test.ts`
Expected: PASS

- [ ] **Step 7: Run full test suite**

Run: `npx vitest run`
Expected: All pass (check for any tests that relied on width being required)

- [ ] **Step 8: Commit**

```bash
git add src/types/properties.ts src/types/node.ts src/__tests__/types/defaults.test.ts
git commit -m "feat: add schema defaults for stroke.width, dash, text.size"
```

### Task 3: Unified Route Path Model

**Files:**
- Modify: `src/types/node.ts` — update `PathGeomSchema`
- Modify: `src/parser/parser.ts` — normalize legacy `from`/`to`
- Modify: `src/renderer/pathGeometry.ts` — read from `route`
- Modify: `src/renderer/connections.ts` — read endpoints from `route[0]`/`route[last]`
- Modify: `src/tree/walker.ts` — update track path generation for `route`
- Test: `src/__tests__/parser/route.test.ts`
- Test: `src/__tests__/renderer/connections.test.ts` — update to use new route format

- [ ] **Step 1: Write tests for unified route**

```typescript
// src/__tests__/parser/route.test.ts
import { describe, it, expect } from 'vitest';
import { parseScene } from '../../parser/parser';

describe('unified route model', () => {
  it('parses route array directly', () => {
    const scene = parseScene(`{
      objects: [
        { id: "a", rect: { w: 50, h: 50 } },
        { id: "b", rect: { w: 50, h: 50 } },
        { id: "line", path: { route: ["a", "b"] } }
      ]
    }`);
    const line = scene.nodes.find(n => n.id === 'line');
    expect(line?.path?.route).toEqual(['a', 'b']);
  });

  it('normalizes legacy from/to into route', () => {
    const scene = parseScene(`{
      objects: [
        { id: "a", rect: { w: 50, h: 50 } },
        { id: "b", rect: { w: 50, h: 50 } },
        { id: "line", path: { from: "a", to: "b" } }
      ]
    }`);
    const line = scene.nodes.find(n => n.id === 'line');
    expect(line?.path?.route).toEqual(['a', 'b']);
    expect(line?.path?.from).toBeUndefined();
    expect(line?.path?.to).toBeUndefined();
  });

  it('normalizes legacy from/to/route into unified route', () => {
    const scene = parseScene(`{
      objects: [
        { id: "a", rect: { w: 50, h: 50 } },
        { id: "b", rect: { w: 50, h: 50 } },
        { id: "line", path: { from: "a", to: "b", route: [[250, 100]] } }
      ]
    }`);
    const line = scene.nodes.find(n => n.id === 'line');
    expect(line?.path?.route).toEqual(['a', [250, 100], 'b']);
  });

  it('tightens points to coordinate-only tuples', () => {
    const scene = parseScene(`{
      objects: [
        { id: "tri", path: { points: [[0, -40], [40, 30], [-40, 30]], closed: true } }
      ]
    }`);
    const tri = scene.nodes.find(n => n.id === 'tri');
    expect(tri?.path?.points).toEqual([[0, -40], [40, 30], [-40, 30]]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/parser/route.test.ts`
Expected: FAIL

- [ ] **Step 3: Update PathGeomSchema in node.ts**

The `route` field already exists but currently holds only intermediate waypoints. Repurpose it to hold the full path including endpoints (first entry = start, last = end, intermediates = waypoints). Keep `from`/`to` as optional for backward compat but mark deprecated with comments. Tighten `points` to `z.array(z.tuple([z.number(), z.number()]))` (coordinate-only, no PointRefs).

Also add `z.array(z.unknown())` to `ChangeValueSchema` in `animation.ts` to support array values in keyframes (e.g., `camera.look: [300, 200]`).

- [ ] **Step 4: Add normalization in parser.ts**

Add a `normalizeRoutes(nodes)` function called after `expandTemplates()` that walks all nodes and converts `from`/`to` patterns to unified `route`:

```typescript
function normalizeRoutes(nodes: any[]): void {
  for (const node of nodes) {
    if (node.path) {
      if (node.path.from != null || node.path.to != null) {
        const route: any[] = [];
        if (node.path.from != null) route.push(node.path.from);
        if (node.path.route) route.push(...node.path.route);
        if (node.path.to != null) route.push(node.path.to);
        node.path.route = route;
        delete node.path.from;
        delete node.path.to;
      }
    }
    if (node.children) normalizeRoutes(node.children);
  }
}
```

- [ ] **Step 5: Update renderer to use route**

In `src/renderer/pathGeometry.ts` and `src/renderer/connections.ts`, change all reads of `path.from`/`path.to` to read `path.route[0]` and `path.route[path.route.length - 1]`, with intermediate entries as waypoints. Also update `src/tree/walker.ts` for track path generation.

Note: `emitter.ts` delegates to `resolvePathGeometry()` and doesn't read from/to directly — no changes needed there.

- [ ] **Step 5b: Update renderer tests**

Update `src/__tests__/renderer/connections.test.ts` to use the new route format. Add regression tests verifying that `resolvePathGeometry` produces correct path segments when reading from `route`.

- [ ] **Step 6: Update existing samples**

Update any sample files that use `from`/`to` to use the new `route` format (the normalization handles them at runtime, but samples should show the canonical form).

- [ ] **Step 7: Run tests**

Run: `npx vitest run`
Expected: All pass including new route tests

- [ ] **Step 8: Commit**

```bash
git add src/types/node.ts src/parser/parser.ts src/renderer/ src/samples/ src/__tests__/
git commit -m "feat: unified route model replacing from/to/route separation"
```

---

## Chunk 2: DSL Parser

Converts DSL text into JSON objects compatible with `ParsedScene`. The parser is built in layers: tokenizer → tree builder → JSON converter.

### Task 4: Named Color Table

**Files:**
- Create: `src/dsl/colorNames.ts`
- Test: `src/__tests__/dsl/colorNames.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// src/__tests__/dsl/colorNames.test.ts
import { describe, it, expect } from 'vitest';
import { nameToHsl, hslToName } from '../../dsl/colorNames';

describe('colorNames', () => {
  it('converts white to HSL', () => {
    expect(nameToHsl('white')).toEqual({ h: 0, s: 0, l: 100 });
  });

  it('converts black to HSL', () => {
    expect(nameToHsl('black')).toEqual({ h: 0, s: 0, l: 0 });
  });

  it('converts red to HSL', () => {
    expect(nameToHsl('red')).toEqual({ h: 0, s: 100, l: 50 });
  });

  it('returns undefined for unknown color', () => {
    expect(nameToHsl('notacolor')).toBeUndefined();
  });

  it('reverse-maps HSL to name', () => {
    expect(hslToName({ h: 0, s: 0, l: 100 })).toBe('white');
    expect(hslToName({ h: 0, s: 0, l: 0 })).toBe('black');
  });

  it('returns undefined for non-named HSL', () => {
    expect(hslToName({ h: 123, s: 45, l: 67 })).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/dsl/colorNames.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement colorNames.ts**

```typescript
// src/dsl/colorNames.ts
interface HslColor { h: number; s: number; l: number; }

const NAMED_COLORS: Record<string, HslColor> = {
  white:   { h: 0, s: 0, l: 100 },
  black:   { h: 0, s: 0, l: 0 },
  red:     { h: 0, s: 100, l: 50 },
  green:   { h: 120, s: 100, l: 25 },
  blue:    { h: 240, s: 100, l: 50 },
  yellow:  { h: 60, s: 100, l: 50 },
  cyan:    { h: 180, s: 100, l: 50 },
  magenta: { h: 300, s: 100, l: 50 },
  orange:  { h: 30, s: 100, l: 50 },
  purple:  { h: 270, s: 100, l: 50 },
  gray:    { h: 0, s: 0, l: 50 },
  grey:    { h: 0, s: 0, l: 50 },
};

export function nameToHsl(name: string): HslColor | undefined {
  return NAMED_COLORS[name.toLowerCase()];
}

export function hslToName(hsl: HslColor): string | undefined {
  for (const [name, color] of Object.entries(NAMED_COLORS)) {
    if (name === 'grey') continue; // prefer 'gray'
    if (color.h === hsl.h && color.s === hsl.s && color.l === hsl.l) return name;
  }
  return undefined;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/__tests__/dsl/colorNames.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/dsl/colorNames.ts src/__tests__/dsl/colorNames.test.ts
git commit -m "feat: named color table for DSL"
```

### Task 5: DSL Tokenizer

**Files:**
- Create: `src/dsl/types.ts`
- Create: `src/dsl/tokenizer.ts`
- Test: `src/__tests__/dsl/tokenizer.test.ts`

- [ ] **Step 1: Define DSL token types**

```typescript
// src/dsl/types.ts
export type TokenType =
  | 'identifier'     // node IDs, keywords (rect, fill, at, style, etc.)
  | 'number'         // 42, 3.14, -10
  | 'string'         // "hello world"
  | 'arrow'          // ->
  | 'colon'          // :
  | 'equals'         // =
  | 'dot'            // .
  | 'doubleDot'      // ..
  | 'at'             // @ (style reference prefix)
  | 'plus'           // + (relative time)
  | 'dimensions'     // 160x100 (WxH shorthand)
  | 'parenOpen'      // (
  | 'parenClose'     // )
  | 'braceOpen'      // { (JSON escape hatch)
  | 'braceClose'     // }
  | 'comma'          // ,
  | 'newline'        // significant newlines
  | 'indent'         // indentation increase
  | 'dedent'         // indentation decrease
  | 'comment'        // // ...
  | 'hexColor'       // #3B82F6
  | 'eof';

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
  offset: number;
}
```

- [ ] **Step 2: Write tokenizer tests**

```typescript
// src/__tests__/dsl/tokenizer.test.ts
import { describe, it, expect } from 'vitest';
import { tokenize } from '../../dsl/tokenizer';

describe('tokenizer', () => {
  it('tokenizes a simple node declaration', () => {
    const tokens = tokenize('box: rect 160x100 at 200,150');
    expect(tokens.map(t => t.type)).toEqual([
      'identifier', 'colon', 'identifier', 'dimensions',
      'identifier', 'number', 'comma', 'number', 'eof'
    ]);
  });

  it('tokenizes arrow syntax', () => {
    const tokens = tokenize('link: a -> b');
    expect(tokens.map(t => t.type)).toEqual([
      'identifier', 'colon', 'identifier', 'arrow', 'identifier', 'eof'
    ]);
  });

  it('tokenizes style reference', () => {
    const tokens = tokenize('box: rect 100x50 @primary');
    const atToken = tokens.find(t => t.type === 'at');
    const nameToken = tokens[tokens.indexOf(atToken!) + 1];
    expect(atToken?.type).toBe('at');
    expect(nameToken?.value).toBe('primary');
  });

  it('tokenizes fill with HSL', () => {
    const tokens = tokenize('fill 210 70 45');
    expect(tokens.map(t => [t.type, t.value])).toEqual([
      ['identifier', 'fill'], ['number', '210'], ['number', '70'], ['number', '45'], ['eof', '']
    ]);
  });

  it('tokenizes hex color', () => {
    const tokens = tokenize('fill #3B82F6');
    expect(tokens[1].type).toBe('hexColor');
    expect(tokens[1].value).toBe('#3B82F6');
  });

  it('tokenizes key=value', () => {
    const tokens = tokenize('radius=8');
    expect(tokens.map(t => t.type)).toEqual([
      'identifier', 'equals', 'number', 'eof'
    ]);
  });

  it('tokenizes indentation as indent/dedent', () => {
    const tokens = tokenize('card: rect 100x50\n  title: text "Hello"');
    const types = tokens.map(t => t.type);
    expect(types).toContain('indent');
  });

  it('handles double-dot shortcut', () => {
    const tokens = tokenize('card..h');
    expect(tokens.map(t => t.type)).toEqual([
      'identifier', 'doubleDot', 'identifier', 'eof'
    ]);
  });

  it('tokenizes string with escapes', () => {
    const tokens = tokenize('"hello \\"world\\""');
    expect(tokens[0].type).toBe('string');
    expect(tokens[0].value).toBe('hello "world"');
  });

  it('tokenizes JSON escape hatch', () => {
    const tokens = tokenize('layout={ type: "flex" }');
    expect(tokens.map(t => t.type)).toContain('braceOpen');
  });

  it('skips comments', () => {
    const tokens = tokenize('// this is a comment\nbox: rect 50x50');
    expect(tokens[0].type).toBe('newline');
  });

  it('tokenizes coordinate tuples', () => {
    const tokens = tokenize('(250,100)');
    expect(tokens.map(t => t.type)).toEqual([
      'parenOpen', 'number', 'comma', 'number', 'parenClose', 'eof'
    ]);
  });

  it('tokenizes relative time', () => {
    const tokens = tokenize('+2.0  box..x: 400');
    expect(tokens[0].type).toBe('plus');
    expect(tokens[1].type).toBe('number');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/__tests__/dsl/tokenizer.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement tokenizer.ts**

Implement `tokenize(input: string): Token[]` — a character-by-character lexer that:
- Tracks line/col/offset for error reporting
- Maintains an indentation stack and emits `indent`/`dedent` tokens on newlines
- Recognizes `WxH` patterns as `dimensions` tokens
- Recognizes `->` as `arrow`
- Recognizes `..` as `doubleDot` (distinct from single `.`)
- Handles `//` comments (skip to end of line)
- Handles `"..."` strings with escape sequences
- Handles `#hexColor` patterns
- Handles `{...}` JSON blocks by counting braces and emitting the whole block as tokens
- Emits `eof` at end

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/__tests__/dsl/tokenizer.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/dsl/types.ts src/dsl/tokenizer.ts src/__tests__/dsl/tokenizer.test.ts
git commit -m "feat: DSL tokenizer with indentation tracking"
```

### Task 6: DSL Parser Core

**Files:**
- Create: `src/dsl/parser.ts`
- Test: `src/__tests__/dsl/parser.test.ts`

The parser consumes tokens from the tokenizer and produces a JavaScript object matching the `ParsedScene` input shape (before validation). This is the most complex component.

- [ ] **Step 1: Write parser tests — document level**

```typescript
// src/__tests__/dsl/parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseDsl } from '../../dsl/parser';

describe('DSL parser', () => {
  describe('document metadata', () => {
    it('parses name and description', () => {
      const result = parseDsl('name "My Diagram"\ndescription "A test"');
      expect(result.name).toBe('My Diagram');
      expect(result.description).toBe('A test');
    });

    it('parses background and viewport', () => {
      const result = parseDsl('background "#1a1a2e"\nviewport 600x400');
      expect(result.background).toBe('#1a1a2e');
      expect(result.viewport).toEqual({ width: 600, height: 400 });
    });
  });

  describe('styles', () => {
    it('parses style block', () => {
      const result = parseDsl(`
style primary
  fill 210 70 45
  stroke 210 80 30 width=2
      `);
      expect(result.styles.primary).toEqual({
        fill: { h: 210, s: 70, l: 45 },
        stroke: { h: 210, s: 80, l: 30, width: 2 },
      });
    });
  });

  describe('nodes', () => {
    it('parses rect node', () => {
      const result = parseDsl('box: rect 160x100 at 200,150');
      expect(result.objects[0]).toMatchObject({
        id: 'box',
        rect: { w: 160, h: 100 },
        transform: { x: 200, y: 150 },
      });
    });

    it('parses ellipse node', () => {
      const result = parseDsl('dot: ellipse 8x8 fill 120 70 45');
      expect(result.objects[0]).toMatchObject({
        id: 'dot',
        ellipse: { rx: 8, ry: 8 },
        fill: { h: 120, s: 70, l: 45 },
      });
    });

    it('parses text node', () => {
      const result = parseDsl('title: text "Hello" size=14 bold fill white');
      expect(result.objects[0]).toMatchObject({
        id: 'title',
        text: { content: 'Hello', size: 14, bold: true },
        fill: { h: 0, s: 0, l: 100 },
      });
    });

    it('parses image node with dimensions', () => {
      const result = parseDsl('pic: image "photo.png" 200x150 fit=cover');
      expect(result.objects[0]).toMatchObject({
        id: 'pic',
        image: { src: 'photo.png', w: 200, h: 150, fit: 'cover' },
      });
    });

    it('parses camera node', () => {
      const result = parseDsl('cam: camera look=all zoom=1.5 active');
      expect(result.objects[0]).toMatchObject({
        id: 'cam',
        camera: { look: 'all', zoom: 1.5, active: true },
      });
    });

    it('parses container node (no geometry)', () => {
      const result = parseDsl('group: at 100,100');
      expect(result.objects[0]).toMatchObject({
        id: 'group',
        transform: { x: 100, y: 100 },
      });
    });

    it('parses style reference', () => {
      const result = parseDsl('box: rect 100x50 @primary at 100,150');
      expect(result.objects[0]).toMatchObject({
        id: 'box',
        style: 'primary',
      });
    });

    it('parses named colors', () => {
      const result = parseDsl('t: text "Hi" fill white');
      expect(result.objects[0].fill).toEqual({ h: 0, s: 0, l: 100 });
    });

    it('parses hex colors', () => {
      const result = parseDsl('t: text "Hi" fill #ff0000');
      expect(result.objects[0].fill?.h).toBeCloseTo(0);
      expect(result.objects[0].fill?.s).toBeCloseTo(100);
      expect(result.objects[0].fill?.l).toBeCloseTo(50);
    });

    it('parses fill with alpha', () => {
      const result = parseDsl('box: rect 50x50 fill 210 70 45 a=0.5');
      expect(result.objects[0].fill).toEqual({ h: 210, s: 70, l: 45, a: 0.5 });
    });

    it('parses dash shorthand', () => {
      const result = parseDsl('box: rect 50x50 dash=dashed');
      expect(result.objects[0].dash).toEqual({ pattern: 'dashed' });
    });

    it('parses layout DSL form', () => {
      const result = parseDsl('row: rect 400x80\n  layout flex row gap=10 padding=8');
      expect(result.objects[0].layout).toEqual({
        type: 'flex', direction: 'row', gap: 10, padding: 8,
      });
    });
  });

  describe('children', () => {
    it('parses indented children', () => {
      const result = parseDsl(`
card: rect 160x100 at 200,150
  title: text "Hello" size=14
  badge: ellipse 8x8
      `);
      const card = result.objects[0];
      expect(card.id).toBe('card');
      expect(card.children).toHaveLength(2);
      expect(card.children[0].id).toBe('title');
      expect(card.children[1].id).toBe('badge');
    });
  });

  describe('connections', () => {
    it('parses simple connection', () => {
      const result = parseDsl(`
a: rect 50x50
b: rect 50x50
link: a -> b
      `);
      const link = result.objects[2];
      expect(link.path).toMatchObject({ route: ['a', 'b'] });
    });

    it('parses connection with waypoints', () => {
      const result = parseDsl(`
a: rect 50x50
b: rect 50x50
link: a -> (250,100) -> (250,200) -> b smooth radius=15
      `);
      const link = result.objects[2];
      expect(link.path).toMatchObject({
        route: ['a', [250, 100], [250, 200], 'b'],
        smooth: true,
        radius: 15,
      });
    });
  });

  describe('explicit point paths', () => {
    it('parses triangle', () => {
      const result = parseDsl('tri: path (0,-40) (40,30) (-40,30) closed');
      expect(result.objects[0].path).toMatchObject({
        points: [[0, -40], [40, 30], [-40, 30]],
        closed: true,
      });
    });
  });

  describe('flat references', () => {
    it('applies flat reference to nested node', () => {
      const result = parseDsl(`
card: rect 160x100
  badge: ellipse 8x8
card.badge.fill: 120 70 45
      `);
      const badge = result.objects[0].children[0];
      expect(badge.fill).toEqual({ h: 120, s: 70, l: 45 });
    });
  });

  describe('JSON escape hatch', () => {
    it('accepts inline JSON for property values', () => {
      const result = parseDsl('box: rect 100x50 layout={ type: "flex", direction: "row" }');
      expect(result.objects[0].layout).toEqual({ type: 'flex', direction: 'row' });
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/dsl/parser.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement parseDsl() — document level and styles**

In `src/dsl/parser.ts`, implement `parseDsl(input: string): any` that:
1. Calls `tokenize(input)` to get tokens
2. Walks tokens, consuming document-level keywords (`name`, `description`, `background`, `viewport`, `images`)
3. Handles `style` blocks — reads style name, then indented properties
4. Accumulates into a result object: `{ name, description, background, viewport, images, styles, objects, animate }`

- [ ] **Step 4: Implement parseDsl() — node declarations**

Extend the parser to handle node lines:
- Detect `id: geometry ...` pattern
- Parse geometry (rect WxH, ellipse WxH, text "...", image "..." WxH, camera, path)
- Parse inline properties (fill, stroke, at, @style, key=value, booleans)
- Use `nameToHsl()` for named colors
- Parse `{...}` JSON literals by collecting brace-balanced text and calling `JSON5.parse()`

- [ ] **Step 5: Implement parseDsl() — children and indentation**

Use the indent/dedent tokens from the tokenizer to build the tree:
- On `indent`, push current node onto a parent stack
- Subsequent nodes become children of the current parent
- On `dedent`, pop the parent stack
- Distinguish child nodes (have `:`) from block properties (no `:`)

- [ ] **Step 6: Implement parseDsl() — connections and paths**

When the token after `id:` contains `->`:
- Collect all PointRef entries between `->` tokens
- Each entry is: bare identifier (node ID), `(x,y)` tuple, or `("id", dx, dy)` tuple
- Store as `path: { route: [...] }`
- Parse remaining tokens as path modifiers (bend=, smooth, radius=, etc.)

For explicit point paths (tokens after `path`):
- Collect `(x,y)` tuples into `points` array
- Parse remaining tokens as path modifiers

- [ ] **Step 7: Implement parseDsl() — flat references**

When a line starts with a dotted path (e.g., `card.badge.fill:`):
- Split on dots to get the path segments
- Walk the already-parsed object tree to find the target node
- Apply the value to the target property

- [ ] **Step 8: Run tests**

Run: `npx vitest run src/__tests__/dsl/parser.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/dsl/parser.ts src/__tests__/dsl/parser.test.ts
git commit -m "feat: DSL parser for nodes, styles, connections, flat references"
```

### Task 7: DSL Parser — Animation Blocks

**Files:**
- Modify: `src/dsl/parser.ts`
- Test: `src/__tests__/dsl/parser.test.ts` (add animation tests)

- [ ] **Step 1: Write animation parser tests**

Add to the existing parser test file:

```typescript
describe('animation', () => {
  it('parses flat timeline', () => {
    const result = parseDsl(`
box: rect 50x50
animate 3s loop easing=easeInOut
  0.0  box.fill.h: 120
  1.5  box.fill.h: 0
  3.0  box.fill.h: 120
    `);
    expect(result.animate).toMatchObject({
      duration: 3,
      loop: true,
      easing: 'easeInOut',
    });
    expect(result.animate.keyframes).toHaveLength(3);
    expect(result.animate.keyframes[0]).toMatchObject({
      time: 0, changes: { 'box.fill.h': 120 },
    });
  });

  it('parses scoped blocks', () => {
    const result = parseDsl(`
box: rect 50x50
animate 3s
  box:
    0.0  fill.h: 120
    1.5  fill.h: 0
    `);
    expect(result.animate.keyframes[0].changes).toHaveProperty('box.fill.h', 120);
    expect(result.animate.keyframes[1].changes).toHaveProperty('box.fill.h', 0);
  });

  it('parses relative time with +', () => {
    const result = parseDsl(`
box: rect 50x50
animate 6s
  0.0  box.fill.h: 120
  +2.0  box.fill.h: 0
    `);
    expect(result.animate.keyframes[1]).toMatchObject({ plus: 2 });
  });

  it('parses chapters', () => {
    const result = parseDsl(`
box: rect 50x50
animate 6s
  chapter "Intro" at 0
  chapter "Build" at 2
  0.0  box.fill.h: 120
    `);
    expect(result.animate.chapters).toEqual([
      { name: 'Intro', time: 0 },
      { name: 'Build', time: 2 },
    ]);
  });

  it('parses effects', () => {
    const result = parseDsl(`
box: rect 50x50
animate 6s
  1.5  box pulse
    `);
    expect(result.animate.keyframes[0].changes).toHaveProperty('box', 'pulse');
  });

  it('parses effects with parameters', () => {
    const result = parseDsl(`
box: rect 50x50
animate 6s
  1.5  box flash amplitude=2 duration=0.5
    `);
    expect(result.animate.keyframes[0].changes.box).toEqual({
      effect: 'flash', amplitude: 2, duration: 0.5,
    });
  });

  it('parses multi-line keyframes (continuation)', () => {
    const result = parseDsl(`
cam: camera look=all zoom=1
animate 6s
  0.0  cam.camera.look: all
       cam.camera.zoom: 1
    `);
    expect(result.animate.keyframes[0].changes).toMatchObject({
      'cam.camera.look': 'all',
      'cam.camera.zoom': 1,
    });
  });

  it('parses per-keyframe easing', () => {
    const result = parseDsl(`
box: rect 50x50
animate 3s
  0.0  box.fill.h: 120
  1.5  box.fill.h: 0 easing=bounce
    `);
    expect(result.animate.keyframes[1].easing).toBe('bounce');
  });

  it('mixes scoped and flat entries', () => {
    const result = parseDsl(`
a: rect 50x50
b: rect 50x50
animate 6s
  a:
    0.0  fill.h: 120
  1.0  b.fill.h: 0
    `);
    expect(result.animate.keyframes).toHaveLength(2);
    expect(result.animate.keyframes[0].changes).toHaveProperty('a.fill.h');
    expect(result.animate.keyframes[1].changes).toHaveProperty('b.fill.h');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/dsl/parser.test.ts`
Expected: FAIL on the new animation tests

- [ ] **Step 3: Implement animation parsing**

Extend `parseDsl()` to handle the `animate` keyword:
- Parse duration (number followed by `s`), `loop`, `easing=`, `autoKey`
- Inside the animate block (indented), parse:
  - `chapter "name" at time` → chapters array
  - Lines starting with number or `+` → keyframe entries
  - Lines with `id:` (no number prefix) → scope block start
  - Continuation lines (extra-indented, no timestamp) → merge into previous keyframe
  - Effect lines (timestamp + id + effect name, no colon) → effect entries

For scoped blocks, prefix all track paths with the scope.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/__tests__/dsl/parser.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/dsl/parser.ts src/__tests__/dsl/parser.test.ts
git commit -m "feat: DSL parser animation blocks (flat, scoped, effects, chapters)"
```

### Task 8: DSL Parser — `..` Shortcut Resolution

**Files:**
- Create: `src/dsl/resolveShortcut.ts`
- Test: `src/__tests__/dsl/resolveShortcut.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// src/__tests__/dsl/resolveShortcut.test.ts
import { describe, it, expect } from 'vitest';
import { resolveShortcut } from '../../dsl/resolveShortcut';

describe('resolveShortcut', () => {
  const trackPaths = [
    'box.fill.h', 'box.fill.s', 'box.fill.l',
    'box.stroke.h', 'box.rect.w', 'box.rect.h',
    'box.transform.x', 'box.transform.y',
    'cam.camera.zoom', 'cam.camera.look',
    'card.title.text.size', 'card.badge.fill.h',
  ];

  it('resolves unambiguous shortcut', () => {
    expect(resolveShortcut('cam..zoom', trackPaths)).toBe('cam.camera.zoom');
  });

  it('resolves deep shortcut', () => {
    expect(resolveShortcut('card..size', trackPaths)).toBe('card.title.text.size');
  });

  it('throws on ambiguous shortcut', () => {
    expect(() => resolveShortcut('box..h', trackPaths)).toThrow(/ambiguous/i);
  });

  it('throws on unresolvable shortcut', () => {
    expect(() => resolveShortcut('box..nonexistent', trackPaths)).toThrow(/no match/i);
  });

  it('passes through non-shortcut paths unchanged', () => {
    expect(resolveShortcut('box.fill.h', trackPaths)).toBe('box.fill.h');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/dsl/resolveShortcut.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement resolveShortcut**

```typescript
// src/dsl/resolveShortcut.ts
export function resolveShortcut(path: string, trackPaths: string[]): string {
  if (!path.includes('..')) return path;

  const [prefix, suffix] = path.split('..');
  const candidates = trackPaths.filter(tp =>
    tp.startsWith(prefix + '.') && tp.endsWith('.' + suffix)
  );

  if (candidates.length === 0) {
    throw new Error(`No match for shortcut "${path}"`);
  }
  if (candidates.length > 1) {
    throw new Error(
      `Ambiguous shortcut "${path}": matches ${candidates.join(', ')}`
    );
  }
  return candidates[0];
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/__tests__/dsl/resolveShortcut.test.ts`
Expected: PASS

- [ ] **Step 5: Integrate into DSL parser**

In `src/dsl/parser.ts`, after building the animation keyframes, call `resolveShortcut()` on all track paths in changes objects. This requires generating `trackPaths` from the parsed nodes first (reuse existing `generateTrackPaths()` from `src/parser/parser.ts`).

- [ ] **Step 6: Commit**

```bash
git add src/dsl/resolveShortcut.ts src/__tests__/dsl/resolveShortcut.test.ts src/dsl/parser.ts
git commit -m "feat: double-dot shortcut resolution for animation track paths"
```

### Task 9: Integrate DSL Parser with Main Parser

**Files:**
- Modify: `src/parser/parser.ts`
- Test: `src/__tests__/dsl/integration.test.ts`

- [ ] **Step 1: Write integration tests**

```typescript
// src/__tests__/dsl/integration.test.ts
import { describe, it, expect } from 'vitest';
import { parseScene } from '../../parser/parser';

describe('DSL integration with parseScene', () => {
  it('auto-detects DSL input', () => {
    const scene = parseScene(`
name "Test"
box: rect 100x50 fill 210 70 45 at 200,150
    `);
    expect(scene.name).toBe('Test');
    expect(scene.nodes.find(n => n.id === 'box')).toBeDefined();
  });

  it('auto-detects JSON5 input', () => {
    const scene = parseScene(`{
      objects: [{ id: "box", rect: { w: 100, h: 50 } }]
    }`);
    expect(scene.nodes.find(n => n.id === 'box')).toBeDefined();
  });

  it('produces identical ParsedScene from DSL and JSON5', () => {
    const dslScene = parseScene(`
box: rect 100x50 fill 210 70 45 at 200,150
    `);
    const jsonScene = parseScene(`{
      objects: [{
        id: "box",
        rect: { w: 100, h: 50 },
        fill: { h: 210, s: 70, l: 45 },
        transform: { x: 200, y: 150 }
      }]
    }`);
    const dslBox = dslScene.nodes.find(n => n.id === 'box');
    const jsonBox = jsonScene.nodes.find(n => n.id === 'box');
    expect(dslBox?.rect).toEqual(jsonBox?.rect);
    expect(dslBox?.fill).toEqual(jsonBox?.fill);
    expect(dslBox?.transform?.x).toEqual(jsonBox?.transform?.x);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/dsl/integration.test.ts`
Expected: FAIL

- [ ] **Step 3: Update parseScene to detect and delegate**

In `src/parser/parser.ts`, modify `parseScene()`:

```typescript
export function parseScene(input: string): ParsedScene {
  const trimmed = input.trim();
  const isDsl = trimmed.length > 0 && trimmed[0] !== '{';

  let raw: any;
  if (isDsl) {
    raw = parseDsl(trimmed);
  } else {
    raw = JSON5.parse(trimmed);
  }
  // ... rest of existing pipeline (expandTemplates, normalizeRoutes, validateTree, etc.)
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: All pass including new integration tests and all existing tests

- [ ] **Step 5: Commit**

```bash
git add src/parser/parser.ts src/__tests__/dsl/integration.test.ts
git commit -m "feat: integrate DSL parser with parseScene, auto-detect format"
```

---

## Chunk 3: DSL Generator

Converts JSON AST into DSL text. Used for the DSL view in the editor.

### Task 10: DSL Generator — Nodes and Properties

**Files:**
- Create: `src/dsl/generator.ts`
- Test: `src/__tests__/dsl/generator.test.ts`

- [ ] **Step 1: Write generator tests**

```typescript
// src/__tests__/dsl/generator.test.ts
import { describe, it, expect } from 'vitest';
import { generateDsl } from '../../dsl/generator';

describe('DSL generator', () => {
  it('generates rect node', () => {
    const dsl = generateDsl({
      objects: [{
        id: 'box', rect: { w: 160, h: 100 },
        transform: { x: 200, y: 150 },
      }],
    });
    expect(dsl).toContain('box: rect 160x100 at 200,150');
  });

  it('generates ellipse node', () => {
    const dsl = generateDsl({
      objects: [{ id: 'dot', ellipse: { rx: 8, ry: 8 } }],
    });
    expect(dsl).toContain('dot: ellipse 8x8');
  });

  it('generates text node with properties', () => {
    const dsl = generateDsl({
      objects: [{
        id: 'title',
        text: { content: 'Hello', size: 14, bold: true },
        fill: { h: 0, s: 0, l: 100 },
      }],
    });
    expect(dsl).toContain('text "Hello"');
    expect(dsl).toContain('size=14');
    expect(dsl).toContain('bold');
    expect(dsl).toContain('fill white');
  });

  it('generates named colors when possible', () => {
    const dsl = generateDsl({
      objects: [{
        id: 'box', rect: { w: 50, h: 50 },
        fill: { h: 0, s: 0, l: 100 },
      }],
    });
    expect(dsl).toContain('fill white');
  });

  it('generates HSL when no named color matches', () => {
    const dsl = generateDsl({
      objects: [{
        id: 'box', rect: { w: 50, h: 50 },
        fill: { h: 210, s: 70, l: 45 },
      }],
    });
    expect(dsl).toContain('fill 210 70 45');
  });

  it('generates children indented', () => {
    const dsl = generateDsl({
      objects: [{
        id: 'card', rect: { w: 160, h: 100 },
        children: [
          { id: 'title', text: { content: 'Hello', size: 14 } },
        ],
      }],
    });
    const lines = dsl.split('\n');
    const titleLine = lines.find(l => l.includes('title:'));
    expect(titleLine).toMatch(/^ {2}/); // 2-space indent
  });

  it('generates style reference with @', () => {
    const dsl = generateDsl({
      objects: [{ id: 'box', rect: { w: 50, h: 50 }, style: 'primary' }],
    });
    expect(dsl).toContain('@primary');
  });

  it('generates document metadata', () => {
    const dsl = generateDsl({
      name: 'Test',
      description: 'A test diagram',
      background: '#1a1a2e',
      viewport: { width: 600, height: 400 },
      objects: [],
    });
    expect(dsl).toContain('name "Test"');
    expect(dsl).toContain('description "A test diagram"');
    expect(dsl).toContain('background "#1a1a2e"');
    expect(dsl).toContain('viewport 600x400');
  });

  it('generates style blocks', () => {
    const dsl = generateDsl({
      styles: {
        primary: { fill: { h: 210, s: 70, l: 45 }, stroke: { h: 210, s: 80, l: 30, width: 2 } },
      },
      objects: [],
    });
    expect(dsl).toContain('style primary');
    expect(dsl).toContain('fill 210 70 45');
    expect(dsl).toContain('stroke 210 80 30 width=2');
  });

  it('generates connections with arrow syntax', () => {
    const dsl = generateDsl({
      objects: [
        { id: 'a', rect: { w: 50, h: 50 } },
        { id: 'b', rect: { w: 50, h: 50 } },
        { id: 'link', path: { route: ['a', 'b'] }, stroke: { h: 0, s: 0, l: 60, width: 2 } },
      ],
    });
    expect(dsl).toContain('link: a -> b');
  });

  it('generates connections with waypoints', () => {
    const dsl = generateDsl({
      objects: [
        { id: 'a', rect: { w: 50, h: 50 } },
        { id: 'b', rect: { w: 50, h: 50 } },
        { id: 'link', path: { route: ['a', [250, 100], 'b'] } },
      ],
    });
    expect(dsl).toContain('a -> (250,100) -> b');
  });

  it('generates explicit point paths', () => {
    const dsl = generateDsl({
      objects: [{
        id: 'tri',
        path: { points: [[0, -40], [40, 30], [-40, 30]], closed: true },
      }],
    });
    expect(dsl).toContain('path (0,-40) (40,30) (-40,30) closed');
  });

  it('generates dash property', () => {
    const dsl = generateDsl({
      objects: [{ id: 'box', rect: { w: 50, h: 50 }, dash: { pattern: 'dashed' } }],
    });
    expect(dsl).toContain('dash=dashed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/dsl/generator.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement generateDsl()**

In `src/dsl/generator.ts`, implement `generateDsl(scene: any, options?: GeneratorOptions): string`:

- Walk the scene object and emit DSL text
- Use `hslToName()` for color rendering
- Use WxH syntax for geometry
- Emit `@styleName` for style references
- Use arrow syntax for path connections
- Indent children by 2 spaces per level
- Use inline vs block heuristic: ≤4 properties → inline, otherwise block

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/__tests__/dsl/generator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/dsl/generator.ts src/__tests__/dsl/generator.test.ts
git commit -m "feat: DSL generator for nodes, styles, connections"
```

### Task 11: DSL Generator — Animation Blocks

**Files:**
- Modify: `src/dsl/generator.ts`
- Test: `src/__tests__/dsl/generator.test.ts` (add animation tests)

- [ ] **Step 1: Write animation generator tests**

Add to generator test file:

```typescript
describe('animation generation', () => {
  it('generates flat timeline', () => {
    const dsl = generateDsl({
      objects: [{ id: 'box', rect: { w: 50, h: 50 } }],
      animate: {
        duration: 3,
        loop: true,
        easing: 'easeInOut',
        keyframes: [
          { time: 0, changes: { 'box.fill.h': 120 } },
          { time: 1.5, changes: { 'box.fill.h': 0 } },
        ],
      },
    });
    expect(dsl).toContain('animate 3s loop easing=easeInOut');
    expect(dsl).toContain('0  box.fill.h: 120');
    expect(dsl).toContain('1.5  box.fill.h: 0');
  });

  it('generates chapters', () => {
    const dsl = generateDsl({
      objects: [],
      animate: {
        duration: 6,
        chapters: [{ name: 'Intro', time: 0 }],
        keyframes: [],
      },
    });
    expect(dsl).toContain('chapter "Intro" at 0');
  });

  it('generates effect entries', () => {
    const dsl = generateDsl({
      objects: [{ id: 'box', rect: { w: 50, h: 50 } }],
      animate: {
        duration: 6,
        keyframes: [
          { time: 1.5, changes: { box: 'pulse' } },
        ],
      },
    });
    expect(dsl).toContain('1.5  box pulse');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/dsl/generator.test.ts`
Expected: FAIL on new tests

- [ ] **Step 3: Implement animation generation**

Extend `generateDsl()` to emit animation blocks:
- `animate Ns [loop] [easing=...]`
- Chapters as `chapter "name" at time`
- Keyframe entries with track paths and values
- Effect entries (detect by string value type)

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/__tests__/dsl/generator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/dsl/generator.ts src/__tests__/dsl/generator.test.ts
git commit -m "feat: DSL generator animation blocks"
```

### Task 12: Round-Trip Tests

**Files:**
- Test: `src/__tests__/dsl/roundtrip.test.ts`

- [ ] **Step 1: Write round-trip tests**

These test that JSON → DSL → JSON produces semantically identical results:

```typescript
// src/__tests__/dsl/roundtrip.test.ts
import { describe, it, expect } from 'vitest';
import { parseScene } from '../../parser/parser';
import { generateDsl } from '../../dsl/generator';

function roundTrip(json5: string) {
  const original = parseScene(json5);
  const dsl = generateDsl({
    name: original.name,
    description: original.description,
    styles: original.styles,
    objects: original.nodes.filter(n => !(n as any)._isStyle),
    animate: original.animate,
    background: original.background,
    viewport: original.viewport,
    images: original.images,
  });
  const roundTripped = parseScene(dsl);
  return { original, roundTripped };
}

describe('round-trip fidelity', () => {
  it('preserves simple rect', () => {
    const { original, roundTripped } = roundTrip(`{
      objects: [{ id: "box", rect: { w: 100, h: 50 }, fill: { h: 210, s: 70, l: 45 }, transform: { x: 200, y: 150 } }]
    }`);
    const ob = original.nodes.find(n => n.id === 'box')!;
    const rb = roundTripped.nodes.find(n => n.id === 'box')!;
    expect(rb.rect).toEqual(ob.rect);
    expect(rb.fill).toEqual(ob.fill);
    expect(rb.transform?.x).toEqual(ob.transform?.x);
  });

  it('preserves children hierarchy', () => {
    const { original, roundTripped } = roundTrip(`{
      objects: [{
        id: "card", rect: { w: 160, h: 100 },
        children: [
          { id: "title", text: { content: "Hello", size: 14 } },
          { id: "badge", ellipse: { rx: 8, ry: 8 } }
        ]
      }]
    }`);
    const oc = original.nodes.find(n => n.id === 'card')!;
    const rc = roundTripped.nodes.find(n => n.id === 'card')!;
    expect(rc.children).toHaveLength(oc.children.length);
    expect(rc.children[0].id).toBe('title');
    expect(rc.children[1].id).toBe('badge');
  });

  it('preserves connections', () => {
    const { original, roundTripped } = roundTrip(`{
      objects: [
        { id: "a", rect: { w: 50, h: 50 } },
        { id: "b", rect: { w: 50, h: 50 } },
        { id: "link", path: { route: ["a", [250, 100], "b"], smooth: true } }
      ]
    }`);
    const ol = original.nodes.find(n => n.id === 'link')!;
    const rl = roundTripped.nodes.find(n => n.id === 'link')!;
    expect(rl.path?.route).toEqual(ol.path?.route);
    expect(rl.path?.smooth).toEqual(ol.path?.smooth);
  });

  it('preserves styles', () => {
    const { original, roundTripped } = roundTrip(`{
      styles: { primary: { fill: { h: 210, s: 70, l: 45 } } },
      objects: [{ id: "box", rect: { w: 50, h: 50 }, style: "primary" }]
    }`);
    expect(roundTripped.styles.primary.fill).toEqual(original.styles.primary.fill);
  });

  it('preserves animation', () => {
    const { original, roundTripped } = roundTrip(`{
      objects: [{ id: "box", rect: { w: 50, h: 50 } }],
      animate: {
        duration: 3, loop: true,
        keyframes: [
          { time: 0, changes: { "box.fill.h": 120 } },
          { time: 1.5, changes: { "box.fill.h": 0 } }
        ]
      }
    }`);
    expect(roundTripped.animate?.duration).toBe(original.animate?.duration);
    expect(roundTripped.animate?.loop).toBe(original.animate?.loop);
    expect(roundTripped.animate?.keyframes).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/__tests__/dsl/roundtrip.test.ts`
Expected: PASS (if previous tasks implemented correctly)

- [ ] **Step 3: Fix any round-trip failures**

If any tests fail, trace the issue through parser → generator → parser to find where data is lost or transformed incorrectly. Fix in the relevant file.

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/dsl/roundtrip.test.ts
git commit -m "test: round-trip fidelity tests for DSL parser/generator"
```

---

## Chunk 4: Editor Integration

Adds the format toggle button, DSL-specific editor intelligence, and the edit pipeline.

### Task 13: DSL Cursor Path Resolver

**Files:**
- Create: `src/editor/dslCursorPath.ts`
- Test: `src/__tests__/editor/dslCursorPath.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// src/__tests__/editor/dslCursorPath.test.ts
import { describe, it, expect } from 'vitest';
import { getDslCursorContext } from '../../editor/dslCursorPath';

describe('getDslCursorContext', () => {
  it('resolves cursor on geometry dimension', () => {
    const ctx = getDslCursorContext('box: rect 160x100', 15);
    expect(ctx.path).toContain('rect');
  });

  it('resolves cursor on fill color', () => {
    const ctx = getDslCursorContext('box: rect 50x50 fill 210 70 45', 22);
    expect(ctx.path).toContain('fill');
  });

  it('resolves cursor on nested child property', () => {
    const text = 'card: rect 160x100\n  title: text "Hello" size=14';
    const ctx = getDslCursorContext(text, text.indexOf('size'));
    expect(ctx.path).toContain('title');
    expect(ctx.path).toContain('text');
  });

  it('resolves cursor in animation block', () => {
    const text = 'box: rect 50x50\nanimate 3s\n  0.0  box.fill.h: 120';
    const ctx = getDslCursorContext(text, text.indexOf('120'));
    expect(ctx.path).toContain('box.fill.h');
  });

  it('returns schema path compatible with schemaRegistry', () => {
    const ctx = getDslCursorContext('box: rect 160x100 radius=8', 25);
    // Should resolve to a path that schemaRegistry.getPropertySchema() can use
    expect(ctx.jsonPath).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/editor/dslCursorPath.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement getDslCursorContext()**

In `src/editor/dslCursorPath.ts`:
- Parse the DSL text up to the cursor position using the tokenizer
- Determine which node and property the cursor is within
- Map to a JSON-compatible path that the schema registry can resolve
- Return a `CursorContext`-compatible object (same interface as JSON cursor path)

This is the bridge that makes all existing popup/autocomplete logic work in DSL mode.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/__tests__/editor/dslCursorPath.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/editor/dslCursorPath.ts src/__tests__/editor/dslCursorPath.test.ts
git commit -m "feat: DSL cursor position to JSON path resolver"
```

### Task 14: DSL Completion Source

**Files:**
- Create: `src/editor/dslCompletionSource.ts`
- Test: `src/__tests__/editor/dslCompletionSource.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// src/__tests__/editor/dslCompletionSource.test.ts
import { describe, it, expect } from 'vitest';
import { getDslCompletions } from '../../editor/dslCompletionSource';

describe('getDslCompletions', () => {
  it('suggests geometry types after id:', () => {
    const completions = getDslCompletions('box: ', 5);
    const labels = completions.map(c => c.label);
    expect(labels).toContain('rect');
    expect(labels).toContain('ellipse');
    expect(labels).toContain('text');
    expect(labels).toContain('camera');
  });

  it('suggests properties after geometry', () => {
    const completions = getDslCompletions('box: rect 100x50 ', 18);
    const labels = completions.map(c => c.label);
    expect(labels).toContain('fill');
    expect(labels).toContain('stroke');
    expect(labels).toContain('at');
    expect(labels).toContain('radius=');
  });

  it('suggests named colors after fill', () => {
    const completions = getDslCompletions('box: rect 50x50 fill ', 21);
    const labels = completions.map(c => c.label);
    expect(labels).toContain('white');
    expect(labels).toContain('red');
  });

  it('suggests easing names after easing=', () => {
    const completions = getDslCompletions('animate 3s\n  0.0  box.fill.h: 120 easing=', 42);
    const labels = completions.map(c => c.label);
    expect(labels).toContain('easeInOut');
    expect(labels).toContain('bounce');
  });

  it('suggests track paths in animate block', () => {
    const text = 'box: rect 50x50\nanimate 3s\n  0.0  ';
    const completions = getDslCompletions(text, text.length);
    const labels = completions.map(c => c.label);
    expect(labels).toContain('box.fill.h');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/editor/dslCompletionSource.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement getDslCompletions()**

In `src/editor/dslCompletionSource.ts`:
- Use `getDslCursorContext()` to determine context
- Delegate to the schema registry for property and value suggestions
- Add DSL-specific completions: geometry types, named colors, easing names, node IDs
- Format completions as DSL syntax (not JSON)

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/__tests__/editor/dslCompletionSource.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/editor/dslCompletionSource.ts src/__tests__/editor/dslCompletionSource.test.ts
git commit -m "feat: DSL autocompletion source"
```

### Task 15: DSL Linter

**Files:**
- Create: `src/editor/dslLinter.ts`
- Test: `src/__tests__/editor/dslLinter.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// src/__tests__/editor/dslLinter.test.ts
import { describe, it, expect } from 'vitest';
import { lintDsl } from '../../editor/dslLinter';

describe('DSL linter', () => {
  it('reports no errors for valid DSL', () => {
    const errors = lintDsl('box: rect 100x50 fill 210 70 45 at 200,150');
    expect(errors).toHaveLength(0);
  });

  it('reports unknown keyword', () => {
    const errors = lintDsl('box: blorp 100x50');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toMatch(/unknown/i);
  });

  it('reports ambiguous .. shortcut', () => {
    const errors = lintDsl(`
box: rect 50x50 fill 210 70 45 stroke 0 0 0 width=1
animate 3s
  0.0  box..h: 120
    `);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toMatch(/ambiguous/i);
  });

  it('reports bad indentation', () => {
    const errors = lintDsl('card: rect 100x50\n   title: text "Hi"'); // 3 spaces, not 2
    expect(errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/editor/dslLinter.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement lintDsl()**

In `src/editor/dslLinter.ts`:
- Call `parseDsl()` wrapped in try/catch
- Collect parse errors with line/column info
- Run schema validation on the produced JSON
- Return an array of `{ line, col, message, severity }` diagnostics

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/__tests__/editor/dslLinter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/editor/dslLinter.ts src/__tests__/editor/dslLinter.test.ts
git commit -m "feat: DSL linter with parse error and schema validation reporting"
```

### Task 16: Format Toggle and DSL Editor View

**Files:**
- Modify: `src/editor/modelManager.ts` — add format state
- Modify: `src/app/components/V2Editor.tsx` — toggle button, dual-mode rendering
- Modify: `src/app/App.tsx` — store format preference per tab

- [ ] **Step 1: Add format tracking to ModelManager**

**Critical design rule: `_text` in ModelManager always stores JSON5, never DSL.** The DSL view is a generated projection. This ensures `updateProperty()`, `JSON5.parse(this._text)`, and all existing popup/edit logic continues to work unchanged.

In `src/editor/modelManager.ts`, add:
- `viewFormat: 'json5' | 'dsl'` property (tracks which view is displayed, not the storage format)
- `setViewFormat(format)` method
- `getDslText(): string` method that calls `generateDsl()` on the current model
- `getDisplayText(): string` — returns `_text` if JSON5 mode, `getDslText()` if DSL mode
- `applyDslEdit(dslText: string)` method that:
  1. Parses DSL → JSON AST via `parseDsl()`
  2. Serializes the AST to JSON5 text
  3. Replaces `_text` with the new JSON5
  4. Calls `_parseAndPromote()` to update the model
  This is a full replacement, not a surgical diff — simpler to implement and correct.

- [ ] **Step 2: Write unit tests for ModelManager DSL methods**

```typescript
// Add to existing modelManager tests or create new test file
it('getDslText() generates DSL from current model', () => {
  manager.setTextImmediate('{ objects: [{ id: "box", rect: { w: 100, h: 50 } }] }');
  const dsl = manager.getDslText();
  expect(dsl).toContain('box: rect 100x50');
});

it('applyDslEdit() updates JSON source', () => {
  manager.setTextImmediate('{ objects: [{ id: "box", rect: { w: 100, h: 50 } }] }');
  manager.applyDslEdit('box: rect 200x100');
  expect(manager.getText()).toContain('"w": 200');
});
```

- [ ] **Step 3: Add format toggle button to V2Editor**

In `src/app/components/V2Editor.tsx`:
- Add a toggle button in the toolbar: `[JSON5] ⇄ [DSL]`
- When toggling to DSL: replace CodeMirror content with `modelManager.getDslText()`
- When toggling to JSON5: replace with `modelManager.getText()` (the JSON5 source)
- **Swap the `json()` language extension**: in DSL mode, remove the `json()` CodeMirror extension (DSL is not valid JSON). Use a minimal custom syntax highlighting or no language extension initially.
- Swap the linter extension (use `dslLinter` vs `v2Linter`)
- Swap the completion source (use `getDslCompletions` vs `getCompletions`)

- [ ] **Step 4: Make popup handlers mode-aware**

In `src/app/components/V2Editor.tsx`:
- `handleEditorClick` currently calls `getCursorContext()` (JSON-specific). Add a mode check: in DSL mode, call `getDslCursorContext()` instead. Both return the same `CursorContext` interface, so downstream popup logic is unchanged.
- When a popup edits a value, it currently calls `modelManager.updateProperty()` which patches the JSON5 `_text` directly. In DSL mode, after `updateProperty()` modifies `_text`, regenerate the DSL view and update CodeMirror. The popup writes to JSON (which is correct), then the DSL display refreshes.
- `extractValueAtCursor` and `findValueSpan` are JSON-specific. In DSL mode, these must use DSL-aware counterparts (or the popup can write to the JSON source and refresh the DSL view, bypassing DSL text surgery entirely — this is simpler).

- [ ] **Step 5: Wire up DSL edit pipeline**

When in DSL mode and the user types:
1. CodeMirror onChange fires with DSL text
2. Call `modelManager.applyDslEdit(newDslText)` (debounced, same as JSON edits)
3. ModelManager parses DSL → generates new JSON5 → stores as `_text`
4. Model updates, diagram re-renders
5. DSL view stays as the user typed it (don't regenerate from JSON while typing — only regenerate on explicit toggle or popup edit)

On toggle back to JSON5: show `modelManager.getText()` (the JSON5 source).

**Cursor stability**: during continuous typing in DSL mode, the DSL view shows the user's own text (not regenerated). The view only regenerates from JSON on toggle or popup edit. This sidesteps the cursor stability problem for the common case.

- [ ] **Step 6: Store format preference per tab**

In `src/app/App.tsx`:
- Extend `EditorTab` interface to include `viewFormat: 'json5' | 'dsl'`
- Update `StoredTabs` interface, `loadStoredTabs()`, and `saveStoredTabs()` to persist this field
- Default to `'json5'`

- [ ] **Step 7: Manual testing**

Test in browser:
1. Open playground, write a JSON5 diagram
2. Click DSL toggle — verify DSL rendering is correct
3. Edit in DSL view — verify diagram updates
4. Toggle back to JSON5 — verify JSON5 is updated
5. Verify autocomplete works in DSL mode
6. Verify popups (ColorPicker, NumberSlider) work in DSL mode (they edit JSON, DSL refreshes)
7. Verify linting shows errors in DSL mode
8. Verify the `json()` syntax highlighting is not active in DSL mode

- [ ] **Step 8: Commit**

```bash
git add src/editor/modelManager.ts src/app/components/V2Editor.tsx src/app/App.tsx
git commit -m "feat: format toggle between JSON5 and DSL views"
```

### Task 17: Hover Descriptions

**Files:**
- Modify: `src/app/components/V2Editor.tsx` — add hover tooltip
- Modify: `src/types/schemaRegistry.ts` — expose description lookup

- [ ] **Step 1: Add description lookup to schema registry**

In `src/types/schemaRegistry.ts`, add:

```typescript
export function getPropertyDescription(path: string, rootSchema?: z.ZodType): string | undefined {
  const schema = getPropertySchema(path, rootSchema);
  return schema?.description;
}
```

- [ ] **Step 2: Add hover tooltip to V2Editor**

In `src/app/components/V2Editor.tsx`, add a CodeMirror `hoverTooltip` extension that:
1. Gets the word/token at the hover position
2. Resolves to a JSON path (using cursor path resolver for current mode)
3. Looks up description, type, constraints from schema registry
4. Returns a tooltip with: full path, description, type info, current value

- [ ] **Step 3: Manual testing**

Test in browser:
1. Hover over `radius=8` — should show "Corner radius in pixels (0-50)"
2. Hover over `fill 210 70 45` — should show "Fill color (HSL)"
3. Hover over `easeInOut` — should show "Easing function name"
4. Works in both JSON5 and DSL views

- [ ] **Step 4: Commit**

```bash
git add src/app/components/V2Editor.tsx src/types/schemaRegistry.ts
git commit -m "feat: hover tooltips showing property descriptions from Zod schemas"
```

### Task 18: Inline/Expand Toggle

**Files:**
- Modify: `src/dsl/generator.ts` — accept per-node format preferences
- Modify: `src/app/components/V2Editor.tsx` — gutter icons

- [ ] **Step 1: Add format preferences to generator**

Extend `generateDsl()` to accept an optional `nodeFormats: Record<string, 'inline' | 'block'>` map. When generating a node, check the map — if present, override the default heuristic.

- [ ] **Step 2: Add gutter decoration to V2Editor**

In DSL mode, add a CodeMirror gutter decoration that:
- Shows `▸` on collapsed (inline) nodes
- Shows `⋯` on expanded (block) nodes
- On click, toggles the node's format preference and regenerates the DSL view

- [ ] **Step 3: Store preferences in tab metadata**

Persist the `nodeFormats` map per tab in localStorage.

- [ ] **Step 4: Manual testing**

Test in browser:
1. In DSL view, click `▸` on an inline node — should expand to block form
2. Click `⋯` on a block node — should collapse to inline
3. Preferences persist across tab switches

- [ ] **Step 5: Commit**

```bash
git add src/dsl/generator.ts src/app/components/V2Editor.tsx
git commit -m "feat: inline/expand toggle for DSL node formatting"
```

### Task 19: Update Samples for DSL

**Files:**
- Modify: selected sample files in `src/samples/`

- [ ] **Step 1: Verify all existing samples render correctly through round-trip**

Write a quick integration test that loads each sample, generates DSL, and parses back:

```typescript
// src/__tests__/dsl/samples.test.ts
import { describe, it, expect } from 'vitest';
import { parseScene } from '../../parser/parser';
import { generateDsl } from '../../dsl/generator';
import fs from 'fs';
import path from 'path';

const samplesDir = path.join(__dirname, '../../samples');
const sampleFiles = fs.readdirSync(samplesDir).filter(f => f.endsWith('.ts'));

describe('sample round-trips', () => {
  for (const file of sampleFiles) {
    it(`round-trips ${file}`, async () => {
      const mod = await import(`../../samples/${file}`);
      const dsl = mod.default || mod.dsl || mod.sample;
      if (typeof dsl !== 'string') return; // skip non-string exports

      const original = parseScene(dsl);
      // Just verify it doesn't throw — data fidelity tested elsewhere
      const generated = generateDsl({
        styles: original.styles,
        objects: original.nodes.filter(n => !(n as any)._isStyle),
        animate: original.animate,
        background: original.background,
        viewport: original.viewport,
      });
      expect(() => parseScene(generated)).not.toThrow();
    });
  }
});
```

- [ ] **Step 2: Run and fix any failures**

Run: `npx vitest run src/__tests__/dsl/samples.test.ts`
Fix any round-trip issues discovered.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/dsl/samples.test.ts
git commit -m "test: verify all existing samples round-trip through DSL"
```

---

## Test Coverage Notes

The test cases in this plan cover the critical paths. During implementation, the following additional test scenarios should be added:

**Parser (Chunk 2):**
- Template definition and instantiation syntax
- `images` block parsing
- Camera `look` with all tuple variants: `look=(300,200)`, `look=("b",0,-100)`, `look=("a","b","c")`
- `at` with partial forms: `at y=-20`, `at 200,150 rotation=45 scale=2`
- All connection modifiers: `fromAnchor`, `toAnchor`, `gap`, `fromGap`, `toGap`, `drawProgress`
- Block property forms: `dash dashed length=10 gap=5`, `fill`/`stroke` on their own lines
- Keyframe values: coordinate tuples, booleans, sub-objects via JSON escape hatch
- Negative tests: malformed input with good error messages, reserved words as unquoted IDs
- Empty containers (`group:` with nothing after colon)
- Quoted IDs for reserved words (`"at": rect 100x50`)

**Generator (Chunk 3):**
- Stroke/fill with alpha
- Transform with rotation, scale, anchor, pathFollow, pathProgress
- Camera look tuple forms
- Layout generation
- Dash with length/gap
- Images block
- Inline vs block heuristic (verify nodes with many props use block form)

**Round-trip (Chunk 3):**
- Camera nodes with complex look values
- Effects with parameters
- Dash with all sub-fields
- Transform with rotation/scale/anchor

**Editor (Chunk 4):**
- Unit tests for `getPropertyDescription()` (hover lookup)
- Unit tests for `nodeFormats` parameter to `generateDsl()` (inline/expand)
- Verify samples round-trip: import from `src/samples/index.ts` `v2Samples` array, iterate `.dsl` property

---

## Follow-up (Separate Plan)

The **Embedded Editor** (Section 6 of the spec) is a separate deliverable requiring:
- Web component packaging
- Embed shell UI
- Three-tier mode system (view/interactive/editable)
- Standalone JS bundle build pipeline

This should be planned and implemented after the core DSL is stable.
