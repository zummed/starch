# Schema-Mapped Editor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace cursor-path inference with schema-annotated CodeMirror decorations, simplify popups to direct model bindings, and drop JSON5 rendering.

**Architecture:** A `SchemaRenderer` walks the model + zod schemas to produce DSL text and a parallel `SchemaSpan[]` in a single pass. Spans become CodeMirror decorations. Clicks, hover tooltips, and completions all read decoration metadata instead of inferring context from cursor position. Popups receive individual model path bindings per widget, with no internal navigation state.

**Tech Stack:** TypeScript, React, Zod, CodeMirror 6, Vitest

**Spec:** `docs/superpowers/specs/2026-03-24-schema-mapped-editor-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|----------------|
| `src/editor/schemaSpan.ts` | `SchemaSpan` interface, `SchemaSection` type, `RenderResult` interface |
| `src/editor/dslBuilder.ts` | `DslBuilder` class — text accumulator that tracks character offsets and records spans |
| `src/editor/schemaRenderer.ts` | Main renderer: walks model + zod schemas, uses DslBuilder to produce `RenderResult` |
| `src/editor/schemaDecorations.ts` | CodeMirror extension: applies spans as `Decoration.mark`, provides `getSpanAtPos()` lookup |
| `src/editor/schemaCompletionSource.ts` | Schema-driven completion provider using span context |
| `src/__tests__/editor/schemaRenderer.test.ts` | Tests for renderer output (text correctness + span accuracy) |
| `src/__tests__/editor/dslBuilder.test.ts` | Tests for DslBuilder offset tracking |
| `src/__tests__/editor/schemaDecorations.test.ts` | Tests for decoration application + span lookup |
| `src/__tests__/editor/schemaCompletionSource.test.ts` | Tests for schema-driven completions |

### Modified Files
| File | Changes |
|------|---------|
| `src/editor/modelManager.ts` | Add `resolveIdPath()`, add `getDisplayResult(): RenderResult`, switch `getDisplayText()` to use SchemaRenderer |
| `src/app/components/V2Editor.tsx` | Wire decorations, rewrite click handler, hover tooltip, completions, gutter; remove JSON5 mode |
| `src/editor/popups/PropertyPopup.tsx` | Rewrite: direct model bindings, `initialFocusKey` prop, no navStack/wrappedOnChange/diffAndUpdate |

### Deleted Files
| File | Reason |
|------|--------|
| `src/editor/dslCursorPath.ts` | Replaced by span lookup |
| `src/editor/cursorPath.ts` | JSON5 gone |
| `src/editor/completionSource.ts` | JSON5 completions gone |
| `src/editor/dslCompletionSource.ts` | Replaced by schema-driven completions |
| `src/__tests__/editor/dslCursorPath.test.ts` | Tests for deleted file |
| `src/__tests__/editor/cursorPath.test.ts` | Tests for deleted file |
| `src/__tests__/editor/completionSource.test.ts` | Tests for deleted file |
| `src/__tests__/editor/dslCompletionSource.test.ts` | Tests for deleted file |
| `src/editor/v2Linter.ts` | Dead code (JSON5 linter, never imported) |

---

## Chunk 1: SchemaSpan Types + DslBuilder + SchemaRenderer Core

### Task 1: SchemaSpan Type Definitions

**Files:**
- Create: `src/editor/schemaSpan.ts`

- [ ] **Step 1: Create the SchemaSpan types file**

```typescript
// src/editor/schemaSpan.ts

export type SchemaSection = 'node' | 'style' | 'animate' | 'images';

export interface SchemaSpan {
  from: number;        // character offset in text
  to: number;
  schemaPath: string;  // e.g., "stroke.color" — for schema lookup
  modelPath: string;   // e.g., "objects.box.stroke.color" — uses node ID, not array index
  section: SchemaSection;
}

export interface RenderResult {
  text: string;
  spans: SchemaSpan[];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/editor/schemaSpan.ts
git commit -m "feat: add SchemaSpan type definitions"
```

---

### Task 2: DslBuilder — Text Accumulator with Span Tracking

**Files:**
- Create: `src/editor/dslBuilder.ts`
- Create: `src/__tests__/editor/dslBuilder.test.ts`

- [ ] **Step 1: Write failing tests for DslBuilder**

```typescript
// src/__tests__/editor/dslBuilder.test.ts
import { describe, it, expect } from 'vitest';
import { DslBuilder } from '../../editor/dslBuilder';

describe('DslBuilder', () => {
  it('tracks offset through plain writes', () => {
    const b = new DslBuilder('node');
    b.write('hello ');
    b.write('world');
    const result = b.build();
    expect(result.text).toBe('hello world');
    expect(result.spans).toEqual([]);
  });

  it('records spans with correct offsets', () => {
    const b = new DslBuilder('node');
    b.write('box: rect ');
    b.writeSpan('140', 'rect.w', 'objects.box.rect.w');
    b.write('x');
    b.writeSpan('80', 'rect.h', 'objects.box.rect.h');
    const result = b.build();
    expect(result.text).toBe('box: rect 140x80');
    expect(result.spans).toEqual([
      { from: 10, to: 13, schemaPath: 'rect.w', modelPath: 'objects.box.rect.w', section: 'node' },
      { from: 14, to: 16, schemaPath: 'rect.h', modelPath: 'objects.box.rect.h', section: 'node' },
    ]);
  });

  it('handles newlines in offset tracking', () => {
    const b = new DslBuilder('node');
    b.write('line1\n  ');
    b.writeSpan('value', 'fill', 'objects.box.fill');
    const result = b.build();
    expect(result.spans[0].from).toBe(8);
    expect(result.spans[0].to).toBe(13);
  });

  it('supports section override per span', () => {
    const b = new DslBuilder('animate');
    b.writeSpan('2s', 'duration', 'animate.duration');
    const result = b.build();
    expect(result.spans[0].section).toBe('animate');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/editor/dslBuilder.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement DslBuilder**

```typescript
// src/editor/dslBuilder.ts
import type { SchemaSpan, SchemaSection, RenderResult } from './schemaSpan';

export class DslBuilder {
  private parts: string[] = [];
  private spans: SchemaSpan[] = [];
  private offset = 0;
  private section: SchemaSection;

  constructor(section: SchemaSection) {
    this.section = section;
  }

  /** Write syntax/structural text (no span). */
  write(text: string): this {
    this.parts.push(text);
    this.offset += text.length;
    return this;
  }

  /** Write a value token and record a span for it. */
  writeSpan(text: string, schemaPath: string, modelPath: string): this {
    const from = this.offset;
    this.parts.push(text);
    this.offset += text.length;
    this.spans.push({ from, to: this.offset, schemaPath, modelPath, section: this.section });
    return this;
  }

  /** Get current character offset. */
  get pos(): number {
    return this.offset;
  }

  build(): RenderResult {
    return { text: this.parts.join(''), spans: this.spans };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/editor/dslBuilder.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/editor/dslBuilder.ts src/__tests__/editor/dslBuilder.test.ts
git commit -m "feat: add DslBuilder text accumulator with span tracking"
```

---

### Task 3: SchemaRenderer — Value Formatting

**Files:**
- Create: `src/editor/schemaRenderer.ts`
- Create: `src/__tests__/editor/schemaRenderer.test.ts`

The SchemaRenderer is the largest new component. Build it incrementally, starting with value formatting helpers, then node rendering, then full document assembly.

- [ ] **Step 1: Write failing tests for value formatting**

```typescript
// src/__tests__/editor/schemaRenderer.test.ts
import { describe, it, expect } from 'vitest';
import { SchemaRenderer } from '../../editor/schemaRenderer';
import type { FormatHints } from '../../dsl/formatHints';
import { emptyFormatHints } from '../../dsl/formatHints';

const hints = emptyFormatHints();

describe('SchemaRenderer - value formatting', () => {
  it('renders a simple rect node inline', () => {
    const scene = {
      objects: [{ id: 'box', rect: { w: 140, h: 80 } }],
    };
    const result = new SchemaRenderer().render(scene, hints);
    expect(result.text).toContain('box: rect 140x80');
  });

  it('produces spans for rect dimensions', () => {
    const scene = {
      objects: [{ id: 'box', rect: { w: 140, h: 80 } }],
    };
    const result = new SchemaRenderer().render(scene, hints);
    const wSpan = result.spans.find(s => s.schemaPath === 'rect.w');
    const hSpan = result.spans.find(s => s.schemaPath === 'rect.h');
    expect(wSpan).toBeDefined();
    expect(hSpan).toBeDefined();
    expect(result.text.slice(wSpan!.from, wSpan!.to)).toBe('140');
    expect(result.text.slice(hSpan!.from, hSpan!.to)).toBe('80');
  });

  it('renders named color as a single span', () => {
    const scene = {
      objects: [{ id: 'box', rect: { w: 100, h: 100 }, fill: 'red' }],
    };
    const result = new SchemaRenderer().render(scene, hints);
    const fillSpan = result.spans.find(s => s.schemaPath === 'fill');
    expect(fillSpan).toBeDefined();
    expect(result.text.slice(fillSpan!.from, fillSpan!.to)).toBe('red');
  });

  it('renders HSL color with sub-spans', () => {
    const scene = {
      objects: [{ id: 'box', rect: { w: 100, h: 100 }, fill: { h: 210, s: 80, l: 50 } }],
    };
    const result = new SchemaRenderer().render(scene, hints);
    // HSL that doesn't map to a named color should have component spans
    const hSpan = result.spans.find(s => s.schemaPath === 'fill.h');
    const sSpan = result.spans.find(s => s.schemaPath === 'fill.s');
    const lSpan = result.spans.find(s => s.schemaPath === 'fill.l');
    // Either individual spans or a single fill span — renderer decides
    const fillSpan = result.spans.find(s => s.schemaPath === 'fill');
    expect(hSpan || fillSpan).toBeDefined();
  });

  it('renders stroke with color and width spans', () => {
    const scene = {
      objects: [{ id: 'box', rect: { w: 100, h: 100 }, stroke: { color: 'blue', width: 2 } }],
    };
    const result = new SchemaRenderer().render(scene, hints);
    const colorSpan = result.spans.find(s => s.schemaPath === 'stroke.color');
    const widthSpan = result.spans.find(s => s.schemaPath === 'stroke.width');
    expect(colorSpan).toBeDefined();
    expect(widthSpan).toBeDefined();
    expect(result.text.slice(colorSpan!.from, colorSpan!.to)).toBe('blue');
    expect(result.text.slice(widthSpan!.from, widthSpan!.to)).toBe('2');
  });

  it('all spans have section = node for object nodes', () => {
    const scene = {
      objects: [{ id: 'box', rect: { w: 100, h: 100 }, fill: 'red' }],
    };
    const result = new SchemaRenderer().render(scene, hints);
    for (const span of result.spans) {
      expect(span.section).toBe('node');
    }
  });

  it('modelPath uses node ID not array index', () => {
    const scene = {
      objects: [{ id: 'box', rect: { w: 100, h: 100 } }],
    };
    const result = new SchemaRenderer().render(scene, hints);
    const wSpan = result.spans.find(s => s.schemaPath === 'rect.w');
    expect(wSpan!.modelPath).toBe('objects.box.rect.w');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/editor/schemaRenderer.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement SchemaRenderer core with value formatting**

Build the `SchemaRenderer` class with:
- `render(scene, formatHints): RenderResult` — main entry point
- Private helpers that mirror the existing `generator.ts` functions but use `DslBuilder`:
  - `formatColor(builder, color, schemaPath, modelPath)` — emits color text + spans
  - `formatStroke(builder, stroke, modelPath)` — emits color + optional width spans
  - `formatValue(builder, value, schemaPath, modelPath)` — numbers, booleans, strings
  - `formatPointRef(builder, ref, schemaPath, modelPath)` — point references
  - `formatGeometry(builder, node, modelPath)` — rect/ellipse/text/image/camera with per-field spans
  - `formatTransform(builder, transform, modelPath)` — at x,y + extras with per-field spans
  - `formatDash(builder, dash, modelPath)` — dash pattern/length/gap spans
  - `formatLayout(builder, layout, modelPath)` — layout type/direction/props spans
  - `formatInlineProps(builder, node, modelPath)` — fill, stroke, style, opacity, etc.

Key difference from existing generator: every value token gets a `writeSpan()` call recording its schema path and model path. Structural syntax (`:`, `=`, `at`, `fill`, `stroke` keywords, whitespace) uses plain `write()`.

The model path for objects uses the pattern `objects.<nodeId>.<property>` (node ID, not array index). For children: `objects.<parentId>.<childId>.<property>`.

Port the formatting logic from `src/dsl/generator.ts` — same DSL output format, same inline/block decisions, same `shouldRenderBlock()` logic with FormatHints. The difference is purely additive: span recording alongside text emission.

Reuse the existing `formatColor` and related helpers from `generator.ts` for the text content, but wrap them in span-aware versions. Import `hslToName`, `rgbToName`, `isColor` from `../types/color` and `hasOwn`, `countProps` patterns from the generator.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/editor/schemaRenderer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/editor/schemaRenderer.ts src/__tests__/editor/schemaRenderer.test.ts
git commit -m "feat: SchemaRenderer core with value formatting and span tracking"
```

---

### Task 4: SchemaRenderer — Node Rendering (Inline + Block)

**Files:**
- Modify: `src/editor/schemaRenderer.ts`
- Modify: `src/__tests__/editor/schemaRenderer.test.ts`

- [ ] **Step 1: Write failing tests for node rendering**

Add to `schemaRenderer.test.ts` (imports for `FormatHints`, `emptyFormatHints`, `SchemaRenderer`, and the `hints` constant are already present from Task 3):

```typescript
describe('SchemaRenderer - node rendering', () => {
  it('renders inline node with all properties', () => {
    const scene = {
      objects: [{
        id: 'box', rect: { w: 140, h: 80 },
        fill: 'cornflowerblue', stroke: { color: 'red', width: 2 },
        opacity: 0.8,
      }],
    };
    const result = new SchemaRenderer().render(scene, hints);
    expect(result.text).toContain('box: rect 140x80 fill cornflowerblue stroke red width=2 opacity=0.8');
  });

  it('renders block node with indented fill/stroke', () => {
    const blockHints: FormatHints = { nodes: { box: { display: 'block' } } };
    const scene = {
      objects: [{
        id: 'box', rect: { w: 140, h: 80 },
        fill: 'red', stroke: { color: 'blue', width: 2 },
      }],
    };
    const result = new SchemaRenderer().render(scene, blockHints);
    expect(result.text).toContain('box: rect 140x80');
    expect(result.text).toContain('  fill red');
    expect(result.text).toContain('  stroke blue width=2');
  });

  it('renders children with increased indentation', () => {
    const scene = {
      objects: [{
        id: 'parent', rect: { w: 200, h: 200 },
        children: [{ id: 'child', rect: { w: 50, h: 50 } }],
      }],
    };
    const result = new SchemaRenderer().render(scene, hints);
    expect(result.text).toContain('  child: rect 50x50');
  });

  it('child modelPaths use parent.child format', () => {
    const scene = {
      objects: [{
        id: 'parent', rect: { w: 200, h: 200 },
        children: [{ id: 'child', rect: { w: 50, h: 50 } }],
      }],
    };
    const result = new SchemaRenderer().render(scene, hints);
    const childW = result.spans.find(s => s.modelPath === 'objects.parent.child.rect.w');
    expect(childW).toBeDefined();
  });

  it('renders connection nodes with spans for route endpoints', () => {
    const scene = {
      objects: [
        { id: 'a', rect: { w: 100, h: 100 } },
        { id: 'b', rect: { w: 100, h: 100 } },
        { id: 'link', path: { route: ['a', 'b'], smooth: true, bend: 30 } },
      ],
    };
    const result = new SchemaRenderer().render(scene, hints);
    expect(result.text).toContain('link: a -> b smooth bend=30');
    // Route endpoints should have spans
    const routeSpans = result.spans.filter(s => s.modelPath.startsWith('objects.link.path'));
    expect(routeSpans.length).toBeGreaterThan(0);
    // Bend value should have its own span
    const bendSpan = result.spans.find(s => s.schemaPath === 'path.bend');
    expect(bendSpan).toBeDefined();
    expect(result.text.slice(bendSpan!.from, bendSpan!.to)).toBe('30');
  });

  it('renders transform with position', () => {
    const scene = {
      objects: [{ id: 'box', rect: { w: 100, h: 100 }, transform: { x: 50, y: 75 } }],
    };
    const result = new SchemaRenderer().render(scene, hints);
    expect(result.text).toContain('at 50,75');
    const xSpan = result.spans.find(s => s.schemaPath === 'transform.x');
    expect(xSpan).toBeDefined();
  });

  it('renders layout as block property', () => {
    const scene = {
      objects: [{ id: 'box', rect: { w: 200, h: 200 }, layout: { type: 'flex', direction: 'row', gap: 10 } }],
    };
    const result = new SchemaRenderer().render(scene, hints);
    expect(result.text).toContain('layout flex row gap=10');
  });

  it('renders layout hint props inline', () => {
    const scene = {
      objects: [{ id: 'box', rect: { w: 100, h: 100 }, layout: { grow: 1 } }],
    };
    const result = new SchemaRenderer().render(scene, hints);
    expect(result.text).toContain('layout grow=1');
    // Verify the grow span is linked to the child, not the parent
    const growSpan = result.spans.find(s => s.schemaPath === 'layout.grow');
    expect(growSpan).toBeDefined();
    expect(growSpan!.modelPath).toBe('objects.box.layout.grow');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/editor/schemaRenderer.test.ts`
Expected: FAIL on new tests

- [ ] **Step 3: Implement node rendering**

Add to `SchemaRenderer`:
- `renderNode(builder, node, depth, modelPrefix)` — dispatches to connection, explicit path, or regular node
- `renderConnection(builder, node, modelPrefix)` — route with arrow syntax
- `renderExplicitPath(builder, node, modelPrefix)` — path with points
- `shouldRenderBlock(node)` — uses FormatHints + property count heuristic (port from generator.ts lines 323-333)
- `renderBlockNode(builder, node, depth, modelPrefix)` — geometry on first line, fill/stroke/dash/layout indented
- `renderInlineNode(builder, node, depth, modelPrefix)` — everything on one line
- Children rendering with `depth + 1`

Model path construction: `modelPrefix` is `"objects.<nodeId>"` for top-level nodes. For children, it becomes `"objects.<parentId>.<childId>"`. Each property's modelPath is `"${modelPrefix}.<property>"`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/editor/schemaRenderer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/editor/schemaRenderer.ts src/__tests__/editor/schemaRenderer.test.ts
git commit -m "feat: SchemaRenderer node rendering with inline/block modes"
```

---

### Task 5: SchemaRenderer — Metadata, Styles, Animation, Full Document

**Files:**
- Modify: `src/editor/schemaRenderer.ts`
- Modify: `src/__tests__/editor/schemaRenderer.test.ts`

- [ ] **Step 1: Write failing tests for full document rendering**

```typescript
describe('SchemaRenderer - metadata and sections', () => {
  it('renders document metadata', () => {
    const scene = { name: 'My Scene', background: '#1a1a2e' };
    const result = new SchemaRenderer().render(scene, hints);
    expect(result.text).toContain('name "My Scene"');
    expect(result.text).toContain('background "#1a1a2e"');
  });

  it('renders images block', () => {
    const scene = { images: { logo: 'https://example.com/logo.png' } };
    const result = new SchemaRenderer().render(scene, hints);
    expect(result.text).toContain('images');
    expect(result.text).toContain('  logo: "https://example.com/logo.png"');
    const imgSpan = result.spans.find(s => s.section === 'images');
    expect(imgSpan).toBeDefined();
  });

  it('renders style block', () => {
    const scene = {
      styles: { primary: { fill: 'blue', opacity: 0.9 } },
    };
    const result = new SchemaRenderer().render(scene, hints);
    expect(result.text).toContain('style primary');
    expect(result.text).toContain('  fill blue');
    const fillSpan = result.spans.find(s => s.section === 'style' && s.schemaPath === 'fill');
    expect(fillSpan).toBeDefined();
    expect(fillSpan!.modelPath).toBe('styles.primary.fill');
  });

  it('renders animate section with spans', () => {
    const scene = {
      objects: [{ id: 'box', rect: { w: 100, h: 100 } }],
      animate: {
        duration: 2,
        keyframes: [
          { time: 0, changes: { 'box.opacity': 0 } },
          { time: 1, changes: { 'box.opacity': 1 } },
        ],
      },
    };
    const result = new SchemaRenderer().render(scene, hints);
    expect(result.text).toContain('animate 2s');
    const durationSpan = result.spans.find(s => s.section === 'animate' && s.schemaPath === 'duration');
    expect(durationSpan).toBeDefined();
  });

  it('separates sections with double newlines', () => {
    const scene = {
      name: 'Test',
      objects: [{ id: 'box', rect: { w: 100, h: 100 } }],
    };
    const result = new SchemaRenderer().render(scene, hints);
    expect(result.text).toContain('\n\n');
  });
});

describe('SchemaRenderer - span invariants', () => {
  it('no spans overlap', () => {
    const scene = {
      objects: [
        { id: 'box', rect: { w: 140, h: 80 }, fill: 'red', stroke: { color: 'blue', width: 2 } },
      ],
    };
    const result = new SchemaRenderer().render(scene, hints);
    const sorted = [...result.spans].sort((a, b) => a.from - b.from);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].from).toBeGreaterThanOrEqual(sorted[i - 1].to);
    }
  });

  it('all span ranges are within text bounds', () => {
    const scene = {
      objects: [
        { id: 'box', rect: { w: 140, h: 80 }, fill: 'red' },
        { id: 'circle', ellipse: { rx: 50, ry: 50 }, opacity: 0.5 },
      ],
    };
    const result = new SchemaRenderer().render(scene, hints);
    for (const span of result.spans) {
      expect(span.from).toBeGreaterThanOrEqual(0);
      expect(span.to).toBeLessThanOrEqual(result.text.length);
      expect(span.to).toBeGreaterThan(span.from);
    }
  });

  it('span text matches the value it represents', () => {
    const scene = {
      objects: [{ id: 'box', rect: { w: 140, h: 80 } }],
    };
    const result = new SchemaRenderer().render(scene, hints);
    const wSpan = result.spans.find(s => s.schemaPath === 'rect.w')!;
    expect(result.text.slice(wSpan.from, wSpan.to)).toBe('140');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/editor/schemaRenderer.test.ts`
Expected: FAIL on new tests

- [ ] **Step 3: Implement metadata, styles, animation, and document assembly**

Add to `SchemaRenderer`:
- `renderMetadata(builder, scene)` — name, description, background, viewport
- `renderImages(builder, images)` — images block with per-image spans (section: 'images')
- `renderStyle(builder, name, style)` — style block with per-property spans (section: 'style', modelPath: `styles.<name>.<prop>`)
- `renderAnimate(builder, animate)` — animation header, chapters, keyframes with spans (section: 'animate')
- `renderKeyframeChange(builder, path, value)` — individual keyframe change formatting
- Update `render()` to assemble all sections with `\n\n` separators

Each section uses its own `DslBuilder` with the appropriate section type (`new DslBuilder('animate')`, `new DslBuilder('style')`, etc.). The `render()` method builds each section separately, then concatenates the results by joining text with `\n\n` separators and adjusting span offsets by the cumulative text length of preceding sections.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/editor/schemaRenderer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/editor/schemaRenderer.ts src/__tests__/editor/schemaRenderer.test.ts
git commit -m "feat: SchemaRenderer full document rendering with all sections"
```

---

### Task 6: SchemaRenderer — Regression Test Against Existing Generator

**Files:**
- Modify: `src/__tests__/editor/schemaRenderer.test.ts`

The SchemaRenderer should produce DSL text equivalent to the existing `generateDsl()`. This task adds a regression test that compares output for representative scenes.

- [ ] **Step 1: Write comparison tests**

```typescript
import { generateDsl } from '../../dsl/generator';

describe('SchemaRenderer - parity with existing generator', () => {
  const cases = [
    {
      name: 'simple rect',
      scene: { objects: [{ id: 'box', rect: { w: 100, h: 60 } }] },
    },
    {
      name: 'node with fill and stroke',
      scene: { objects: [{ id: 'box', rect: { w: 100, h: 60 }, fill: 'red', stroke: { color: 'blue', width: 2 } }] },
    },
    {
      name: 'connection',
      scene: { objects: [
        { id: 'a', rect: { w: 100, h: 100 } },
        { id: 'b', rect: { w: 100, h: 100 } },
        { id: 'link', path: { route: ['a', 'b'] } },
      ]},
    },
    {
      name: 'with metadata',
      scene: { name: 'Test', background: '#1a1a2e', objects: [{ id: 'box', rect: { w: 100, h: 100 } }] },
    },
    {
      name: 'with styles',
      scene: { styles: { primary: { fill: 'blue' } }, objects: [{ id: 'box', rect: { w: 100, h: 100 }, style: 'primary' }] },
    },
    {
      name: 'with animation',
      scene: {
        objects: [{ id: 'box', rect: { w: 100, h: 100 } }],
        animate: { duration: 2, keyframes: [{ time: 0, changes: { 'box.opacity': 0 } }, { time: 1, changes: { 'box.opacity': 1 } }] },
      },
    },
  ];

  for (const { name, scene } of cases) {
    it(`matches generator output: ${name}`, () => {
      const expected = generateDsl(scene, { formatHints: hints });
      const result = new SchemaRenderer().render(scene, hints);
      expect(result.text).toBe(expected);
    });
  }
});
```

- [ ] **Step 2: Run tests — fix any discrepancies**

Run: `npx vitest run src/__tests__/editor/schemaRenderer.test.ts`

If there are minor formatting differences (whitespace, property order), decide whether to match the existing generator exactly or accept the new output. The DSL parser should accept both — verify by round-tripping through `parseDsl(result.text)`.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/editor/schemaRenderer.test.ts
git commit -m "test: SchemaRenderer parity tests against existing generator"
```

---

## Chunk 2: CodeMirror Integration + Click Handling

### Task 7: CodeMirror Schema Decoration Extension

**Files:**
- Create: `src/editor/schemaDecorations.ts`
- Create: `src/__tests__/editor/schemaDecorations.test.ts`

- [ ] **Step 1: Write tests for decoration extension**

```typescript
// src/__tests__/editor/schemaDecorations.test.ts
import { describe, it, expect } from 'vitest';
import { getSpanAtPos } from '../../editor/schemaDecorations';
import type { SchemaSpan } from '../../editor/schemaSpan';

describe('getSpanAtPos', () => {
  const spans: SchemaSpan[] = [
    { from: 10, to: 13, schemaPath: 'rect.w', modelPath: 'objects.box.rect.w', section: 'node' },
    { from: 14, to: 16, schemaPath: 'rect.h', modelPath: 'objects.box.rect.h', section: 'node' },
    { from: 22, to: 25, schemaPath: 'fill', modelPath: 'objects.box.fill', section: 'node' },
  ];

  it('returns span containing the position', () => {
    expect(getSpanAtPos(spans, 11)).toEqual(spans[0]);
  });

  it('returns span at exact start', () => {
    expect(getSpanAtPos(spans, 10)).toEqual(spans[0]);
  });

  it('returns null for position outside spans', () => {
    expect(getSpanAtPos(spans, 5)).toBeNull();
    expect(getSpanAtPos(spans, 13)).toBeNull(); // between spans
    expect(getSpanAtPos(spans, 20)).toBeNull();
  });

  it('returns null for empty spans', () => {
    expect(getSpanAtPos([], 5)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/editor/schemaDecorations.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement schema decoration extension**

```typescript
// src/editor/schemaDecorations.ts
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { StateField, StateEffect } from '@codemirror/state';
import type { SchemaSpan } from './schemaSpan';

/** State effect to replace the current span map. */
export const setSpans = StateEffect.define<SchemaSpan[]>();

/** StateField that holds the current SchemaSpan array. */
export const spanField = StateField.define<SchemaSpan[]>({
  create: () => [],
  update(spans, tr) {
    for (const e of tr.effects) {
      if (e.is(setSpans)) return e.value;
    }
    return spans;
  },
});

/** StateField that builds decorations from spans. Only rebuilds when setSpans fires. */
export const spanDecorations = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decos, tr) {
    // Only rebuild when spans actually changed
    if (!tr.effects.some(e => e.is(setSpans))) return decos;
    const spans = tr.state.field(spanField);
    if (spans.length === 0) return Decoration.none;
    const marks = spans.map(span =>
      Decoration.mark({
        attributes: {
          'data-schema-path': span.schemaPath,
          'data-model-path': span.modelPath,
          'data-section': span.section,
        },
      }).range(span.from, span.to)
    );
    // Decorations must be sorted by from position
    marks.sort((a, b) => a.from - b.from);
    return Decoration.set(marks);
  },
  provide: f => EditorView.decorations.from(f),
});

/** Lookup a span by position. Uses binary search — spans MUST be sorted by `from` ascending
 *  (which SchemaRenderer guarantees since it emits in document order). */
export function getSpanAtPos(spans: SchemaSpan[], pos: number): SchemaSpan | null {
  let lo = 0, hi = spans.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const span = spans[mid];
    if (pos < span.from) hi = mid - 1;
    else if (pos >= span.to) lo = mid + 1;
    else return span;
  }
  return null;
}

/** Bundle of extensions for schema decorations. */
export function schemaDecorationsExtension() {
  return [spanField, spanDecorations];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/editor/schemaDecorations.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/editor/schemaDecorations.ts src/__tests__/editor/schemaDecorations.test.ts
git commit -m "feat: CodeMirror schema decoration extension with span lookup"
```

---

### Task 8: ModelManager — ID-Based Path Resolution + SchemaRenderer Integration

**Files:**
- Modify: `src/editor/modelManager.ts`
- Modify: `src/__tests__/editor/modelManager.test.ts`

- [ ] **Step 1: Write failing tests for ID-based path resolution**

Add to `modelManager.test.ts`:

```typescript
import { resolveIdPath } from '../../editor/modelManager';

describe('resolveIdPath', () => {
  const json = {
    objects: [
      { id: 'box', rect: { w: 100 } },
      { id: 'circle', ellipse: { rx: 50 } },
    ],
    styles: { primary: { fill: 'blue' } },
    animate: { duration: 2 },
  };

  it('resolves objects.<id> to objects.<index>', () => {
    expect(resolveIdPath(json, 'objects.box.rect.w')).toBe('objects.0.rect.w');
    expect(resolveIdPath(json, 'objects.circle.ellipse.rx')).toBe('objects.1.ellipse.rx');
  });

  it('passes through style paths unchanged', () => {
    expect(resolveIdPath(json, 'styles.primary.fill')).toBe('styles.primary.fill');
  });

  it('passes through animate paths unchanged', () => {
    expect(resolveIdPath(json, 'animate.duration')).toBe('animate.duration');
  });

  it('handles nested children', () => {
    const withChildren = {
      objects: [
        { id: 'parent', children: [{ id: 'child', rect: { w: 50 } }] },
      ],
    };
    expect(resolveIdPath(withChildren, 'objects.parent.child.rect.w'))
      .toBe('objects.0.children.0.rect.w');
  });

  it('handles grandchild nesting', () => {
    const withGrandchildren = {
      objects: [
        { id: 'root', children: [
          { id: 'mid', children: [
            { id: 'leaf', fill: 'red' },
          ]},
        ]},
      ],
    };
    expect(resolveIdPath(withGrandchildren, 'objects.root.mid.leaf.fill'))
      .toBe('objects.0.children.0.children.0.fill');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/editor/modelManager.test.ts`
Expected: FAIL — `resolveIdPath` not found

- [ ] **Step 3: Implement resolveIdPath**

Add to `modelManager.ts`:

```typescript
/**
 * Resolve an ID-based model path to an index-based path.
 * "objects.box.rect.w" → "objects.0.rect.w"
 * "objects.parent.child.rect.w" → "objects.0.children.0.rect.w"
 * "objects.parent.child.grandchild.fill" → "objects.0.children.0.children.0.fill"
 * Style and animate paths pass through unchanged.
 */
export function resolveIdPath(json: any, idPath: string): string {
  const segments = idPath.split('.');
  if (segments[0] !== 'objects' || !json.objects) return idPath;

  const result: string[] = ['objects'];
  let nodes: any[] = json.objects;

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    const idx = nodes.findIndex((n: any) => n.id === seg);
    if (idx >= 0) {
      result.push(String(idx));
      const node = nodes[idx];
      // Check if next segment is a child ID
      if (node.children && i + 1 < segments.length) {
        const nextSeg = segments[i + 1];
        const childIdx = node.children.findIndex((c: any) => c.id === nextSeg);
        if (childIdx >= 0) {
          result.push('children');
          nodes = node.children;
          continue; // next iteration finds the child ID in the now-updated nodes array
        }
      }
      // Remaining segments are property path
      result.push(...segments.slice(i + 1));
      break;
    } else {
      // Not a node ID — must be a property path
      result.push(...segments.slice(i));
      break;
    }
  }

  return result.join('.');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/editor/modelManager.test.ts`
Expected: PASS

- [ ] **Step 5: Add `getDisplayResult()` to ModelManager**

Add a new method that returns the full `RenderResult` (text + spans):

```typescript
import { SchemaRenderer } from './schemaRenderer';
import type { RenderResult } from './schemaSpan';

// In ModelManager class:

getDisplayResult(): RenderResult {
  return new SchemaRenderer().render(this._json, this._formatHints);
}
```

Update `getDisplayText()` to delegate:

```typescript
getDisplayText(): string {
  return this.getDisplayResult().text;
}
```

Remove the JSON5 branch from `getDisplayText()` — DSL only now.

- [ ] **Step 6: Update `updateProperty()` to resolve ID paths**

In `updateProperty()` and `removeProperty()`, resolve the path before using it:

```typescript
updateProperty(path: string, value: unknown): void {
  if (this._json == null || Object.keys(this._json).length === 0) return;
  if (this._debounceTimer) { clearTimeout(this._debounceTimer); this._debounceTimer = null; }
  const resolvedPath = resolveIdPath(this._json, path);
  setNestedValue(this._json, resolvedPath.split('.'), value);
  // ... rest unchanged
}
```

Same for `removeProperty()`.

- [ ] **Step 7: Run all tests**

Run: `npx vitest run`
Expected: All existing tests still pass (the generator and parser tests are independent)

- [ ] **Step 8: Commit**

```bash
git add src/editor/modelManager.ts src/__tests__/editor/modelManager.test.ts
git commit -m "feat: ModelManager ID-based path resolution and SchemaRenderer integration"
```

---

### Task 9: V2Editor — Wire Decorations + Rewrite Click Handler

**Files:**
- Modify: `src/app/components/V2Editor.tsx`

This task replaces the click handler and wires in decorations. The hover tooltip and completions are handled in subsequent tasks.

- [ ] **Step 1: Add decoration imports and state**

Add to V2Editor imports:

```typescript
import { schemaDecorationsExtension, setSpans, spanField, getSpanAtPos } from '../../editor/schemaDecorations';
import type { SchemaSpan } from '../../editor/schemaSpan';
import { detectSchemaType, isBubblableType, getPropertySchema } from '../../types/schemaRegistry';
```

Remove old imports:
```typescript
// DELETE these:
import { getCursorContext } from '../../editor/cursorPath';
import { getDslCursorContext, stripModelPrefix } from '../../editor/dslCursorPath';
import { getCompletions } from '../../editor/completionSource';
```

- [ ] **Step 2: Wire decorations into extensions**

In `createExtensions()`, add the schema decoration extensions:

```typescript
return [
  // ... existing extensions ...
  schemaDecorationsExtension(),
  // ... rest ...
];
```

- [ ] **Step 3: Update text change handler to push spans**

In the `modelManager` useEffect, both the initial text push AND the `onTextChange` subscriber must dispatch spans:

```typescript
useEffect(() => {
  const view = viewRef.current;
  if (view) {
    // Initial push — includes spans
    const result = modelManager.getDisplayResult();
    externalDispatch.current = true;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: result.text },
      effects: [setSpans.of(result.spans)],
    });
    externalDispatch.current = false;
  }

  // Subscribe to text changes (for popup edits / mode toggle)
  const unsubText = modelManager.onTextChange(() => {
    const v = viewRef.current;
    if (!v) return;
    const result = modelManager.getDisplayResult();
    externalDispatch.current = true;
    v.dispatch({
      changes: { from: 0, to: v.state.doc.length, insert: result.text },
      effects: [setSpans.of(result.spans)],
    });
    externalDispatch.current = false;
  });
  setPopup(null);
  return unsubText;
}, [modelManager]);
```

- [ ] **Step 4: Rewrite click handler**

Replace `handleEditorClick` with span-based logic:

```typescript
const handleEditorClick = useCallback((view: EditorView, pos: number) => {
  const spans = view.state.field(spanField);
  const span = getSpanAtPos(spans, pos);
  if (!span) return;

  // Walk up to compound ancestor
  let schemaPath = span.schemaPath;
  let modelPath = span.modelPath;
  const schema = getPropertySchema(schemaPath);
  if (!schema) return;

  let type = detectSchemaType(schema);
  let initialFocusKey: string | undefined;

  // If leaf, bubble up to compound parent
  if (!isBubblableType(type) && type !== 'object') {
    const lastDot = schemaPath.lastIndexOf('.');
    if (lastDot > 0) {
      const parentSchemaPath = schemaPath.slice(0, lastDot);
      const parentSchema = getPropertySchema(parentSchemaPath);
      if (parentSchema && isBubblableType(detectSchemaType(parentSchema))) {
        initialFocusKey = schemaPath.slice(lastDot + 1);
        schemaPath = parentSchemaPath;
        modelPath = modelPath.slice(0, modelPath.lastIndexOf('.'));
        type = detectSchemaType(parentSchema);
      }
    }
  }

  if (!['number', 'color', 'enum', 'boolean', 'object', 'pointref', 'anchor', 'string'].includes(type)) return;

  const value = getNestedValue(modelManagerRef.current.json,
    resolveIdPath(modelManagerRef.current.json, modelPath));
  const coords = view.coordsAtPos(pos);
  if (!coords) return;

  popupOpenRef.current = true;
  setPopup({
    path: modelPath,
    schemaPath,
    section: span.section,
    value,
    position: { x: coords.left, y: coords.bottom + 4 },
    initialFocusKey,
  });
}, []);
```

Update popup state type to include `section` and `initialFocusKey`:
```typescript
const [popup, setPopup] = useState<{
  path: string;
  schemaPath: string;
  section: import('../../editor/schemaSpan').SchemaSection;
  value: unknown;
  position: { x: number; y: number };
  initialFocusKey?: string;
} | null>(null);
```

- [ ] **Step 5: Simplify popup change handler**

Replace `handlePopupChange` with direct model binding:

```typescript
const handlePopupChange = useCallback((propModelPath: string, newValue: unknown) => {
  modelManagerRef.current.updateProperty(propModelPath, newValue);
  // Popup reads fresh values from model on next render — no need to setState
}, []);
```

Update popup rendering to pass the new interface. The PropertyPopup will receive `modelPath` + `schemaPath` + `section` and call `onChange(propModelPath, value)` per widget. This is wired in Task 11 when the popup is rewritten.

For now, keep the existing popup working with a compatibility shim if needed, or do Tasks 9 and 11 together.

- [ ] **Step 6: Remove JSON5 mode toggle**

Remove `handleFormatToggle`, JSON5 linter, JSON5 completion source, format compartments. The editor is DSL-only now:
- Remove `langCompartment`, `linterCompartment`, `completionCompartment` — no more dynamic reconfiguration between modes
- Remove `v2EditorLinter`, `v2CompletionSource`, `json()` import
- Remove `formatRef` — always DSL
- Simplify `createExtensions()` to only include DSL extensions

- [ ] **Step 7: Commit**

```bash
git add src/app/components/V2Editor.tsx
git commit -m "feat: V2Editor decoration-based click handling, remove JSON5 mode"
```

---

### Task 10: V2Editor — Hover Tooltip Using Decorations

**Files:**
- Modify: `src/app/components/V2Editor.tsx`

- [ ] **Step 1: Rewrite hover tooltip**

Replace `createHoverTooltipSource` with:

```typescript
function createHoverTooltipSource() {
  return hoverTooltip((view, pos) => {
    const spans = view.state.field(spanField);
    const span = getSpanAtPos(spans, pos);
    if (!span) return null;

    const description = getPropertyDescription(span.schemaPath);
    const schema = getPropertySchema(span.schemaPath);
    if (!description && !schema) return null;
    const type = schema ? detectSchemaType(schema) : 'unknown';

    return {
      pos,
      above: true,
      create() {
        const dom = document.createElement('div');
        dom.style.cssText = 'padding: 4px 8px; font-size: 11px; font-family: monospace; max-width: 300px;';

        const pathEl = document.createElement('div');
        pathEl.style.cssText = 'color: #a78bfa; font-weight: bold; margin-bottom: 2px;';
        pathEl.textContent = span.schemaPath;
        dom.appendChild(pathEl);

        if (description) {
          const descEl = document.createElement('div');
          descEl.style.cssText = 'color: #c9cdd4;';
          descEl.textContent = description;
          dom.appendChild(descEl);
        }

        const typeEl = document.createElement('div');
        typeEl.style.cssText = 'color: #6b7280; font-size: 10px; margin-top: 2px;';
        typeEl.textContent = `Type: ${type}`;
        dom.appendChild(typeEl);

        return { dom };
      },
    } satisfies Tooltip;
  }, { hoverTime: 400 });
}
```

This is much simpler — no cursor context inference, no schema path derivation, no special handling for property name vs value position.

- [ ] **Step 2: Update `createExtensions` to use the new tooltip**

Remove `formatRef` parameter from tooltip creation.

- [ ] **Step 3: Commit**

```bash
git add src/app/components/V2Editor.tsx
git commit -m "feat: hover tooltip using decoration span lookup"
```

---

## Chunk 3: Simplified Popups + Completions + Cleanup

### Task 11: Rewrite PropertyPopup with Direct Model Bindings

**Files:**
- Modify: `src/editor/popups/PropertyPopup.tsx`

This is the key simplification. The popup receives a `schemaPath`, `modelPath`, `section`, and an `onPropertyChange(modelPath, value)` callback. Each widget calls it directly. No navStack, no wrappedOnChange, no diffAndUpdate.

- [ ] **Step 1: Define the new PropertyPopup interface**

```typescript
interface PropertyPopupProps {
  schemaPath: string;
  modelPath: string;
  section: import('../schemaSpan').SchemaSection;
  position: { x: number; y: number };
  initialFocusKey?: string;
  /** Called per-widget with the specific property's full model path and new value. */
  onPropertyChange: (modelPath: string, value: unknown) => void;
  /** Read the current value for a model path from the model. */
  readValue: (modelPath: string) => unknown;
  onClose: () => void;
}
```

- [ ] **Step 2: Rewrite the popup component**

The new component:
1. Resolves `getPropertySchema(schemaPath)` to determine the schema type
2. For compound types (object, color): calls `getAvailableProperties(schemaPath)` and renders a widget for each
3. Each widget reads its value via `readValue(modelPath + '.' + prop.name)` and writes via `onPropertyChange(modelPath + '.' + prop.name, value)`
4. For scalar types (number, string, enum, boolean, pointref, anchor): renders a single widget bound to `modelPath`
5. Active/inactive separation with geometry filtering — port from existing `CompoundEditor`
6. Property removal calls `onPropertyRemove(modelPath + '.' + prop.name)` (or sets to undefined)
7. `initialFocusKey` scrolls the corresponding widget into view via a ref + `scrollIntoView()`

The `CompoundEditor` becomes a simple list of widgets with no onChange reconstruction. Each widget is independently bound. Key changes from the existing CompoundEditor:
- **No `onChange` with object reconstruction** — each widget calls `onPropertyChange(propPath, value)` directly
- **`activeKeys` initializes from `readValue`** — `new Set(Object.keys(readValue(modelPath) as object ?? {}))`
- **`handleRemove` calls `onPropertyChange(propPath, undefined)`** instead of reconstructing the parent object
- **No `valueRef`** — each widget reads its value fresh via `readValue(propPath)`

```typescript
function CompoundEditor({ schemaPath, modelPath, onPropertyChange, readValue }: {
  schemaPath: string;
  modelPath: string;
  onPropertyChange: (path: string, value: unknown) => void;
  readValue: (path: string) => unknown;
}) {
  const modelValue = readValue(modelPath) as Record<string, unknown> ?? {};
  const [activeKeys, setActiveKeys] = useState<Set<string>>(
    () => new Set(Object.keys(modelValue)),
  );

  const allProps = getAvailableProperties(schemaPath);
  const existingGeom = Object.keys(modelValue).find(k => GEOMETRY_PROPS.has(k));
  const editableProps = allProps.filter(p => {
    if (EXCLUDED_PROPS.has(p.name)) return false;
    if (existingGeom && GEOMETRY_PROPS.has(p.name) && p.name !== existingGeom) return false;
    return true;
  });

  const activeProps = editableProps.filter(p => activeKeys.has(p.name));
  const inactiveProps = editableProps.filter(p => !activeKeys.has(p.name));

  return (
    <div>
      {activeProps.map(prop => {
        const propPath = `${modelPath}.${prop.name}`;
        const value = readValue(propPath);
        return renderWidget(prop, value, (v) => onPropertyChange(propPath, v));
      })}
      {activeProps.length > 0 && inactiveProps.length > 0 && <Separator />}
      {inactiveProps.map(prop => {
        const propPath = `${modelPath}.${prop.name}`;
        const value = readValue(propPath);
        return renderWidget(prop, value, (v) => {
          onPropertyChange(propPath, v);
          setActiveKeys(prev => new Set([...prev, prop.name]));
        }, true /* inactive */);
      })}
    </div>
  );
}
```

- [ ] **Step 3: Update V2Editor popup rendering**

```typescript
{popup && createPortal(
  <PropertyPopup
    schemaPath={popup.schemaPath}
    modelPath={popup.path}
    section={popup.section}
    position={popup.position}
    initialFocusKey={popup.initialFocusKey}
    onPropertyChange={(path, value) => {
      modelManagerRef.current.updateProperty(path, value);
    }}
    readValue={(path) => {
      const resolved = resolveIdPath(modelManagerRef.current.json, path);
      return getNestedValue(modelManagerRef.current.json, resolved);
    }}
    onClose={() => { popupOpenRef.current = false; setPopup(null); }}
  />,
  document.body,
)}
```

- [ ] **Step 4: Verify popup works end-to-end**

Manual test: click on a value in the editor, popup opens, edit a slider, verify the DSL text updates correctly.

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/editor/popups/PropertyPopup.tsx src/app/components/V2Editor.tsx
git commit -m "feat: rewrite PropertyPopup with direct model bindings"
```

---

### Task 12: Schema-Driven Completion Source

**Files:**
- Create: `src/editor/schemaCompletionSource.ts`
- Create: `src/__tests__/editor/schemaCompletionSource.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/editor/schemaCompletionSource.test.ts
import { describe, it, expect } from 'vitest';
import { getSchemaCompletions } from '../../editor/schemaCompletionSource';
import type { SchemaSpan } from '../../editor/schemaSpan';

describe('getSchemaCompletions', () => {
  const spans: SchemaSpan[] = [
    { from: 0, to: 3, schemaPath: 'rect', modelPath: 'objects.box.rect', section: 'node' },
    { from: 4, to: 7, schemaPath: 'rect.w', modelPath: 'objects.box.rect.w', section: 'node' },
    { from: 17, to: 20, schemaPath: 'fill', modelPath: 'objects.box.fill', section: 'node' },
  ];

  it('returns color completions at a fill value position', () => {
    const items = getSchemaCompletions(spans, 18, 'bl');
    expect(items.some(i => i.label === 'blue')).toBe(true);
    expect(items.some(i => i.label === 'black')).toBe(true);
  });

  it('returns enum completions for enum schema types', () => {
    const enumSpans: SchemaSpan[] = [
      { from: 0, to: 5, schemaPath: 'text.align', modelPath: 'objects.box.text.align', section: 'node' },
    ];
    const items = getSchemaCompletions(enumSpans, 2, 'mi');
    expect(items.some(i => i.label === 'middle')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/editor/schemaCompletionSource.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement schema-driven completion source**

```typescript
// src/editor/schemaCompletionSource.ts
import type { SchemaSpan } from './schemaSpan';
import { getSpanAtPos } from './schemaDecorations';
import {
  getPropertySchema, detectSchemaType, getEnumValues,
  getAvailableProperties, AnimConfigSchema, EasingNameSchema,
} from '../types/schemaRegistry';
import { getAllColorNames } from '../types/color';

export interface SchemaCompletionItem {
  label: string;
  type?: string;
  detail?: string;
}

/**
 * Get completions based on span context + model data.
 * @param spans Current span map
 * @param pos Cursor position
 * @param prefix Partially typed word
 * @param lineText Current line text up to cursor (for context-dependent completions)
 * @param modelJson The model JSON (for extracting node IDs, style names)
 */
export function getSchemaCompletions(
  spans: SchemaSpan[],
  pos: number,
  prefix: string,
  lineText?: string,
  modelJson?: any,
): SchemaCompletionItem[] {
  // Content-dependent completions that don't need span context
  if (lineText) {
    // After = sign: value completions (easing=, look=, etc.)
    const equalsMatch = lineText.match(/(\w+)\s*=\s*(\w*)$/);
    if (equalsMatch) {
      const key = equalsMatch[1];
      if (key === 'easing') {
        const values = getEnumValues(EasingNameSchema) ?? [];
        return filterByPrefix(values.map(v => ({ label: v, type: 'value', detail: 'Easing function' })), prefix);
      }
      if (key === 'look' && modelJson) {
        return filterByPrefix(extractNodeIds(modelJson), prefix);
      }
    }

    // After fill/stroke keyword: color completions
    if (lineText.match(/\b(fill|stroke)\s+\w*$/)) {
      return filterByPrefix(colorCompletions(), prefix);
    }

    // After @ sign: style names
    if (lineText.match(/@\w*$/) && modelJson?.styles) {
      return filterByPrefix(
        Object.keys(modelJson.styles).map(n => ({ label: n, type: 'value', detail: 'Style name' })),
        prefix,
      );
    }

    // After -> : node IDs for connections
    if (lineText.includes('->') && modelJson) {
      return filterByPrefix(extractNodeIds(modelJson), prefix);
    }
  }

  // Span-based completions
  const span = getSpanAtPos(spans, pos) ?? findNearestSpan(spans, pos);

  if (!span) {
    // No span context — could be at top level or in an unspanned region
    // Offer top-level keywords + node IDs
    const items: SchemaCompletionItem[] = [
      { label: 'name', type: 'keyword', detail: 'Document name' },
      { label: 'description', type: 'keyword', detail: 'Document description' },
      { label: 'background', type: 'keyword', detail: 'Background color' },
      { label: 'viewport', type: 'keyword', detail: 'Viewport dimensions' },
      { label: 'images', type: 'keyword', detail: 'Image definitions' },
      { label: 'style', type: 'keyword', detail: 'Named style block' },
      { label: 'animate', type: 'keyword', detail: 'Animation block' },
    ];
    return filterByPrefix(items, prefix);
  }

  const rootSchema = span.section === 'animate' ? AnimConfigSchema : undefined;
  const schema = getPropertySchema(span.schemaPath, rootSchema);
  if (!schema) return [];

  const type = detectSchemaType(schema);

  switch (type) {
    case 'color':
      return filterByPrefix(colorCompletions(), prefix);
    case 'enum':
      return filterByPrefix(
        (getEnumValues(schema) ?? []).map(v => ({ label: v, type: 'value' })),
        prefix,
      );
    case 'object':
      return filterByPrefix(
        getAvailableProperties(span.schemaPath, rootSchema)
          .map(p => ({ label: p.name, type: 'property', detail: p.description })),
        prefix,
      );
    default:
      return [];
  }
}

function colorCompletions(): SchemaCompletionItem[] {
  return getAllColorNames().map(name => ({ label: name, type: 'value', detail: 'Named color' }));
}

function extractNodeIds(modelJson: any): SchemaCompletionItem[] {
  if (!modelJson?.objects) return [];
  const ids: SchemaCompletionItem[] = [];
  const walk = (nodes: any[]) => {
    for (const n of nodes) {
      if (n.id) ids.push({ label: n.id, type: 'value', detail: 'Node ID' });
      if (n.children) walk(n.children);
    }
  };
  walk(modelJson.objects);
  return ids;
}

function findNearestSpan(spans: SchemaSpan[], pos: number): SchemaSpan | null {
  let best: SchemaSpan | null = null;
  for (const s of spans) {
    if (s.to <= pos) best = s;
    if (s.from > pos) break;
  }
  return best;
}

function filterByPrefix(items: SchemaCompletionItem[], prefix: string): SchemaCompletionItem[] {
  if (!prefix) return items;
  const lower = prefix.toLowerCase();
  return items.filter(i => i.label.toLowerCase().startsWith(lower));
}
```

- [ ] **Step 4: Wire into V2Editor**

Replace `dslCompletionSource` in V2Editor with:

```typescript
function schemaCompletionAdapter(context: CompletionContext): CompletionResult | null {
  const wordBefore = context.matchBefore(/[\w@]+/);
  if (!context.explicit && !wordBefore) return null;

  const spans = context.state.field(spanField);
  const prefix = wordBefore ? wordBefore.text : '';

  // Get current line text up to cursor for context-dependent completions
  const line = context.state.doc.lineAt(context.pos);
  const lineText = context.state.doc.sliceString(line.from, context.pos);

  const items = getSchemaCompletions(
    spans, context.pos, prefix, lineText, modelManagerRef.current.json,
  );
  if (items.length === 0) return null;

  const from = wordBefore ? wordBefore.from : context.pos;
  return {
    from,
    options: items.map(item => ({
      label: item.label,
      detail: item.detail,
      type: item.type === 'property' ? 'property' : item.type === 'value' ? 'constant' : 'keyword',
    })),
  };
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/editor/schemaCompletionSource.ts src/__tests__/editor/schemaCompletionSource.test.ts src/app/components/V2Editor.tsx
git commit -m "feat: schema-driven completion source using span context"
```

---

### Task 13: Gutter Toggle Using Span Metadata

**Files:**
- Modify: `src/app/components/V2Editor.tsx`

- [ ] **Step 1: Update gutter to use span metadata**

Replace the regex-based `NODE_LINE_RE` approach. The gutter can now check if a line contains a span whose `modelPath` matches `objects.<id>` (top-level node):

```typescript
function createNodeToggleGutter(
  getNodeFormat: (nodeId: string) => 'inline' | 'block' | undefined,
  onToggle: (nodeId: string) => void,
): Extension {
  return gutter({
    class: 'cm-dsl-toggle-gutter',
    lineMarker(view, line) {
      const spans = view.state.field(spanField);
      // Find spans on this line that represent a top-level node
      for (const span of spans) {
        if (span.from >= line.from && span.from < line.to) {
          // Check if this is a node-level span (modelPath = "objects.<id>" or "objects.<id>.<geom>")
          const parts = span.modelPath.split('.');
          if (parts[0] === 'objects' && parts.length >= 2) {
            const nodeId = parts[1];
            const isBlock = getNodeFormat(nodeId) === 'block';
            return new NodeToggleMarker(nodeId, isBlock);
          }
        }
      }
      return null;
    },
    domEventHandlers: {
      click(view, line) {
        const spans = view.state.field(spanField);
        for (const span of spans) {
          if (span.from >= line.from && span.from < line.to) {
            const parts = span.modelPath.split('.');
            if (parts[0] === 'objects' && parts.length >= 2) {
              onToggle(parts[1]);
              return true;
            }
          }
        }
        return false;
      },
    },
  });
}
```

Remove `formatRef` parameter — no longer needed.

- [ ] **Step 2: Commit**

```bash
git add src/app/components/V2Editor.tsx
git commit -m "feat: gutter toggle using span metadata instead of regex"
```

---

### Task 14: Delete Old Code

**Files:**
- Delete: `src/editor/dslCursorPath.ts`
- Delete: `src/editor/cursorPath.ts`
- Delete: `src/editor/completionSource.ts`
- Delete: `src/editor/dslCompletionSource.ts`
- Delete: `src/__tests__/editor/dslCursorPath.test.ts`
- Delete: `src/__tests__/editor/cursorPath.test.ts`
- Delete: `src/__tests__/editor/completionSource.test.ts`
- Delete: `src/__tests__/editor/dslCompletionSource.test.ts`

- [ ] **Step 1: Verify no remaining imports of deleted modules**

Search for imports of the files being deleted:

```bash
grep -r "dslCursorPath\|cursorPath\|completionSource\|dslCompletionSource" src/ --include="*.ts" --include="*.tsx" | grep -v __tests__ | grep -v node_modules
```

Fix any remaining references.

- [ ] **Step 2: Delete the files**

```bash
rm src/editor/dslCursorPath.ts
rm src/editor/cursorPath.ts
rm src/editor/completionSource.ts
rm src/editor/dslCompletionSource.ts
rm src/__tests__/editor/dslCursorPath.test.ts
rm src/__tests__/editor/cursorPath.test.ts
rm src/__tests__/editor/completionSource.test.ts
rm src/__tests__/editor/dslCompletionSource.test.ts
```

- [ ] **Step 3: Remove unused imports from V2Editor**

Clean up any remaining references to:
- `getCursorContext` from `cursorPath`
- `getDslCursorContext`, `stripModelPrefix` from `dslCursorPath`
- `getCompletions` from `completionSource`
- `getDslCompletions` from `dslCompletionSource`
- `json` from `@codemirror/lang-json`
- `starchHighlight` (if JSON5-only)
- `v2EditorLinter`, `v2CompletionSource`, `dslCompletionSource` (local functions now deleted)
- `Compartment` import (if all compartments removed)

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass. Deleted test files no longer run. No import errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: delete cursor-path inference, JSON5 completions, and old tests"
```

---

### Task 15: Final Integration Verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Manual smoke test**

Start the dev server and verify:
1. DSL text renders correctly
2. Clicking a value opens the correct popup
3. Editing a slider updates the DSL text
4. Clicking `fill` (compound) opens the color popup
5. Clicking a number inside a compound (e.g., `rect.w`) opens the rect popup with width aligned
6. Hover tooltip shows schema info
7. Completions work (type `fill ` and see color suggestions)
8. Gutter toggle switches inline/block
9. Text editing still works (type a new value, it parses correctly)
10. The flex-grow click bug from the original issue is fixed

- [ ] **Step 3: Commit any fixes from smoke test**

```bash
git add -A
git commit -m "fix: address issues found in integration smoke test"
```
