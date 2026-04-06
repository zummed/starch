# Context-Aware Animate Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route cursor positions inside an `animate` block to four sub-contexts (header, keyframe-start, path, value) with structural detection (AST + tokenizer, no content regexes), and provide tiered scene-aware path completion for keyframe assignments.

**Architecture:** Two new modules — `modelPathWalker.ts` (general-purpose utility for walking scene JSON + Zod schemas) and `animateCompletions.ts` (animate-specific context handlers). `completionsAt` in `astCompletions.ts` routes to the animate handlers when the cursor's enclosing section is `animate`, before falling through to existing logic. Two small structural helpers (`lineOf`, `indentOf`) live in `astTypes.ts` so other DSL sections can reuse them later.

**Tech Stack:** TypeScript, Zod, Vitest. Existing helpers reused: `getDsl`, `getPropertySchema`, `detectSchemaType`, `getEnumValues`, `colorCompletions`, `findNearestContext`.

**Spec:** `docs/superpowers/specs/2026-04-05-animate-autocomplete-design.md`

---

## File Structure

**New files:**
- `src/dsl/modelPathWalker.ts` — walks model JSON + Zod schemas to resolve dotted paths, enumerate next segments, read current values.
- `src/dsl/animateCompletions.ts` — four context-specific handlers + a routing dispatcher.
- `src/__tests__/dsl/modelPathWalker.test.ts` — unit tests for the walker.
- `src/__tests__/dsl/animateCompletions.test.ts` — unit tests for each handler and end-to-end routing.

**Modified files:**
- `src/dsl/astTypes.ts` — add `lineOf(pos, text)` and `indentOf(pos, text)` helpers.
- `src/dsl/astCompletions.ts` — add optional `text` parameter to `completionsAt`; dispatch to animate handlers before existing flow when enclosing section is `animate`.
- `src/editor/plugins/completionPlugin.ts` — pass `text` through to `completionsAt`.
- `src/__tests__/dsl/astCompletions.test.ts` — one regression case confirming animate-header bug is fixed.

---

## Conventions

- **Imports go at the top of the file.** When a later task adds a test that imports a new symbol, merge the `import` line into the top-of-file imports, then append the new `describe` block at the bottom.
- **Append vs. replace.** When a task says "Append to X", add the code after existing content. When a task says "Update Y" or "Replace Y", overwrite the existing function/block.
- **Test commands.** Run a single test file: `npx vitest run path/to/file.test.ts`. Run tests matching a name: `npx vitest run -t "fragment"`. Run everything: `npx vitest run`.
- **AST access.** This codebase uses two AST builders: `buildAstFromModel` (from a parsed model, in `astEmitter.ts`) and `leavesToAst` (from walker leaves, in `astAdapter.ts`). The completion plugin in production uses `leavesToAst`. Animate appears as a **document-level compound** (not a section) in `leavesToAst` output — routing must match on `schemaPath === 'animate'` regardless of `dslRole`.

---

## Task 1: Structural helpers (lineOf, indentOf)

**Files:**
- Modify: `src/dsl/astTypes.ts`
- Test: `src/__tests__/dsl/astTypes.test.ts` (create)

- [ ] **Step 1.1: Write failing tests for lineOf/indentOf**

Create `src/__tests__/dsl/astTypes.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { lineOf, indentOf } from '../../dsl/astTypes';

describe('lineOf', () => {
  it('returns 0 for position on first line', () => {
    const text = 'animate 10s\n  1 box.fill: red';
    expect(lineOf(0, text)).toBe(0);
    expect(lineOf(5, text)).toBe(0);
    expect(lineOf(11, text)).toBe(0); // before newline
  });

  it('returns 1 for position on second line', () => {
    const text = 'animate 10s\n  1 box.fill: red';
    expect(lineOf(12, text)).toBe(1); // just after newline
    expect(lineOf(text.length, text)).toBe(1);
  });

  it('handles multiple newlines', () => {
    const text = 'a\nb\nc\nd';
    expect(lineOf(0, text)).toBe(0);
    expect(lineOf(2, text)).toBe(1);
    expect(lineOf(4, text)).toBe(2);
    expect(lineOf(6, text)).toBe(3);
  });

  it('returns 0 for empty text', () => {
    expect(lineOf(0, '')).toBe(0);
  });
});

describe('indentOf', () => {
  it('returns 0 for unindented line', () => {
    const text = 'animate 10s\n  1 box.fill: red';
    expect(indentOf(0, text)).toBe(0);
    expect(indentOf(5, text)).toBe(0);
  });

  it('returns leading-space count on indented line', () => {
    const text = 'animate 10s\n  1 box.fill: red';
    expect(indentOf(12, text)).toBe(2); // start of "  1..."
    expect(indentOf(14, text)).toBe(2); // mid-line
    expect(indentOf(text.length, text)).toBe(2);
  });

  it('counts tabs and spaces as 1 char each', () => {
    const text = '\t\t body';
    expect(indentOf(5, text)).toBe(3); // two tabs + one space
  });

  it('returns 0 for empty line', () => {
    const text = 'a\n\nb';
    expect(indentOf(2, text)).toBe(0);
  });
});
```

- [ ] **Step 1.2: Run tests to verify failure**

Run: `npx vitest run src/__tests__/dsl/astTypes.test.ts`
Expected: FAIL — `lineOf` and `indentOf` are not exported from `astTypes.ts`.

- [ ] **Step 1.3: Implement lineOf and indentOf**

Append to `src/dsl/astTypes.ts`:

```typescript
/**
 * Returns the 0-based line index for a character position in text.
 * Counts newlines strictly before `pos` — a position immediately after
 * a newline is on the next line.
 */
export function lineOf(pos: number, text: string): number {
  let line = 0;
  const end = Math.min(pos, text.length);
  for (let i = 0; i < end; i++) {
    if (text.charCodeAt(i) === 10) line++; // '\n'
  }
  return line;
}

/**
 * Returns the number of leading whitespace characters on the line
 * containing `pos`. Counts any whitespace character (space, tab) as 1.
 */
export function indentOf(pos: number, text: string): number {
  // Find line start
  let lineStart = Math.min(pos, text.length);
  while (lineStart > 0 && text.charCodeAt(lineStart - 1) !== 10) {
    lineStart--;
  }
  // Count whitespace forward from lineStart
  let indent = 0;
  for (let i = lineStart; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (ch === 32 || ch === 9) indent++; // space or tab
    else break;
  }
  return indent;
}
```

- [ ] **Step 1.4: Run tests to verify pass**

Run: `npx vitest run src/__tests__/dsl/astTypes.test.ts`
Expected: PASS (8 tests pass).

- [ ] **Step 1.5: Commit**

```bash
git add src/dsl/astTypes.ts src/__tests__/dsl/astTypes.test.ts
git commit -m "feat(dsl): add lineOf and indentOf structural helpers"
```

---

## Task 2: modelPathWalker — resolvePath

**Files:**
- Create: `src/dsl/modelPathWalker.ts`
- Test: `src/__tests__/dsl/modelPathWalker.test.ts`

The walker navigates scene JSON + Zod schemas. A scene's `objects` array holds nodes by id, and each node has children, sub-objects, and properties. A `ResolvedLocation` is what we've walked to.

- [ ] **Step 2.1: Write failing tests for resolvePath**

Create `src/__tests__/dsl/modelPathWalker.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolvePath } from '../../dsl/modelPathWalker';

const scene = {
  objects: [
    {
      id: 'card',
      transform: { x: 200, y: 150 },
      children: [
        {
          id: 'bg',
          rect: { w: 160, h: 100, radius: 6 },
          fill: 'midnightblue',
          stroke: { color: 'steelblue', width: 2 },
        },
        { id: 'badge', ellipse: { rx: 8, ry: 8 }, fill: 'limegreen' },
      ],
    },
    { id: 'solo', rect: { w: 50, h: 50 }, opacity: 0.8 },
  ],
};

describe('resolvePath', () => {
  it('resolves root node by id', () => {
    const loc = resolvePath(scene, ['card']);
    expect(loc).not.toBeNull();
    expect(loc!.kind).toBe('node');
    expect((loc!.modelValue as any).id).toBe('card');
  });

  it('resolves root node with no children', () => {
    const loc = resolvePath(scene, ['solo']);
    expect(loc).not.toBeNull();
    expect(loc!.kind).toBe('node');
    expect((loc!.modelValue as any).id).toBe('solo');
  });

  it('resolves a child node through children array', () => {
    const loc = resolvePath(scene, ['card', 'bg']);
    expect(loc).not.toBeNull();
    expect(loc!.kind).toBe('node');
    expect((loc!.modelValue as any).id).toBe('bg');
  });

  it('resolves a direct leaf property', () => {
    const loc = resolvePath(scene, ['card', 'bg', 'fill']);
    expect(loc).not.toBeNull();
    expect(loc!.kind).toBe('leaf');
    expect(loc!.modelValue).toBe('midnightblue');
  });

  it('resolves a sub-object', () => {
    const loc = resolvePath(scene, ['card', 'bg', 'stroke']);
    expect(loc).not.toBeNull();
    expect(loc!.kind).toBe('subobject');
    expect((loc!.modelValue as any).color).toBe('steelblue');
  });

  it('resolves into a sub-object field', () => {
    const loc = resolvePath(scene, ['card', 'bg', 'stroke', 'width']);
    expect(loc).not.toBeNull();
    expect(loc!.kind).toBe('leaf');
    expect(loc!.modelValue).toBe(2);
  });

  it('returns null for unknown root node', () => {
    expect(resolvePath(scene, ['nope'])).toBeNull();
  });

  it('returns null for unknown child id', () => {
    expect(resolvePath(scene, ['card', 'nope'])).toBeNull();
  });

  it('returns null for unknown leaf key', () => {
    expect(resolvePath(scene, ['card', 'bg', 'nope'])).toBeNull();
  });

  it('returns null for empty segments', () => {
    expect(resolvePath(scene, [])).toBeNull();
  });

  it('returns null when model is empty', () => {
    expect(resolvePath({ objects: [] }, ['card'])).toBeNull();
  });

  it('returns null when model has no objects array', () => {
    expect(resolvePath({} as any, ['card'])).toBeNull();
  });
});
```

- [ ] **Step 2.2: Run tests to verify failure**

Run: `npx vitest run src/__tests__/dsl/modelPathWalker.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 2.3: Implement resolvePath**

Create `src/dsl/modelPathWalker.ts`:

```typescript
/**
 * Walk a scene model + Zod schemas to resolve dotted paths. General-purpose —
 * usable from completions, hover, diagnostics.
 */
import type { z } from 'zod';
import { getPropertySchema, detectSchemaType } from '../types/schemaRegistry';
import { NodeSchema } from '../types/node';

export type LocationKind = 'node' | 'subobject' | 'leaf';

export interface ResolvedLocation {
  /** The JSON value at this path (node, sub-object, or scalar). */
  modelValue: unknown;
  /** The Zod schema describing modelValue's shape. May be null if the
   *  schema can't be determined (should not normally happen). */
  schema: z.ZodType | null;
  /** What kind of location this is. Callers use this to decide whether to
   *  offer it as a drill target or a terminal leaf. */
  kind: LocationKind;
  /** The segments consumed so far, joined with '.'. */
  path: string;
}

/**
 * Find a node by id in an array of nodes (recursively searching children).
 * Returns null if not found.
 */
function findNodeById(nodes: any[] | undefined, id: string): any | null {
  if (!nodes) return null;
  for (const n of nodes) {
    if (n && n.id === id) return n;
  }
  return null;
}

/**
 * Resolve a dotted path through a scene model. Segment 0 must name a
 * top-level object id. Subsequent segments walk children (by id) or
 * sub-objects/leaves (by key on the current node's Zod schema).
 *
 * Returns null on any unresolvable segment.
 */
export function resolvePath(
  modelJson: any,
  segments: string[],
): ResolvedLocation | null {
  if (!modelJson || !Array.isArray(modelJson.objects)) return null;
  if (segments.length === 0) return null;

  // Segment 0: top-level node
  const rootNode = findNodeById(modelJson.objects, segments[0]);
  if (!rootNode) return null;

  let currentValue: any = rootNode;
  let currentSchema: z.ZodType | null = NodeSchema;
  let currentKind: LocationKind = 'node';
  const consumed: string[] = [segments[0]];

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];

    // If we're at a node, try children first, then properties.
    if (currentKind === 'node') {
      const child = findNodeById(currentValue.children, seg);
      if (child) {
        currentValue = child;
        currentSchema = NodeSchema;
        currentKind = 'node';
        consumed.push(seg);
        continue;
      }
      // Fall through to property resolution on the node.
    }

    // Resolve property on current schema.
    if (!currentSchema) return null;
    const fieldSchema = getPropertySchema(seg, currentSchema);
    if (!fieldSchema) return null;

    // Does the current model value actually have this key set?
    const nextValue = currentValue?.[seg];

    // Classify the next location by the field's schema type.
    const type = detectSchemaType(fieldSchema);
    currentSchema = fieldSchema;
    currentValue = nextValue;
    consumed.push(seg);

    if (type === 'object') {
      currentKind = 'subobject';
    } else {
      currentKind = 'leaf';
      // Leaf is terminal — later segments would fail.
    }
  }

  return {
    modelValue: currentValue,
    schema: currentSchema,
    kind: currentKind,
    path: consumed.join('.'),
  };
}
```

- [ ] **Step 2.4: Run tests to verify pass**

Run: `npx vitest run src/__tests__/dsl/modelPathWalker.test.ts`
Expected: PASS (12 tests pass).

- [ ] **Step 2.5: Commit**

```bash
git add src/dsl/modelPathWalker.ts src/__tests__/dsl/modelPathWalker.test.ts
git commit -m "feat(dsl): add resolvePath for scene model traversal"
```

---

## Task 3: modelPathWalker — enumerateNextSegments

Returns the possible next-level segments from a resolved location, each classified as a drill target or a leaf. Used by path completion to populate options at each dot.

**Files:**
- Modify: `src/dsl/modelPathWalker.ts`
- Modify: `src/__tests__/dsl/modelPathWalker.test.ts`

- [ ] **Step 3.1: Write failing tests**

Append to `src/__tests__/dsl/modelPathWalker.test.ts`:

```typescript
import { enumerateNextSegments } from '../../dsl/modelPathWalker';

describe('enumerateNextSegments', () => {
  it('at a node returns child ids and its animatable properties', () => {
    const loc = resolvePath(scene, ['card']);
    const segs = enumerateNextSegments(loc!);
    const names = segs.map(s => s.name);
    expect(names).toContain('bg');      // child
    expect(names).toContain('badge');   // child
    expect(names).toContain('fill');    // leaf property
    expect(names).toContain('opacity'); // leaf property
    expect(names).toContain('stroke');  // drill target (sub-object)
    expect(names).toContain('transform'); // drill target (sub-object)
  });

  it('classifies child ids as drill targets', () => {
    const loc = resolvePath(scene, ['card']);
    const segs = enumerateNextSegments(loc!);
    const bg = segs.find(s => s.name === 'bg');
    expect(bg!.kind).toBe('drill');
    expect(bg!.source).toBe('child');
  });

  it('classifies colors and numbers as leaves', () => {
    const loc = resolvePath(scene, ['card']);
    const segs = enumerateNextSegments(loc!);
    expect(segs.find(s => s.name === 'fill')!.kind).toBe('leaf');
    expect(segs.find(s => s.name === 'opacity')!.kind).toBe('leaf');
  });

  it('classifies multi-field sub-objects as drill targets', () => {
    const loc = resolvePath(scene, ['card']);
    const segs = enumerateNextSegments(loc!);
    expect(segs.find(s => s.name === 'stroke')!.kind).toBe('drill');
    expect(segs.find(s => s.name === 'transform')!.kind).toBe('drill');
  });

  it('at a sub-object returns its declared fields as leaves', () => {
    const loc = resolvePath(scene, ['card', 'bg', 'stroke']);
    const segs = enumerateNextSegments(loc!);
    const names = segs.map(s => s.name);
    expect(names).toContain('color');
    expect(names).toContain('width');
    expect(segs.find(s => s.name === 'width')!.kind).toBe('leaf');
  });

  it('at a leaf returns empty list', () => {
    const loc = resolvePath(scene, ['card', 'bg', 'fill']);
    const segs = enumerateNextSegments(loc!);
    expect(segs).toEqual([]);
  });

  it('does not include id/children/_internal keys', () => {
    const loc = resolvePath(scene, ['card']);
    const segs = enumerateNextSegments(loc!);
    const names = segs.map(s => s.name);
    expect(names).not.toContain('id');
    expect(names).not.toContain('children');
  });
});
```

- [ ] **Step 3.2: Run tests to verify failure**

Run: `npx vitest run src/__tests__/dsl/modelPathWalker.test.ts -t enumerateNextSegments`
Expected: FAIL — function not exported.

- [ ] **Step 3.3: Implement enumerateNextSegments**

Update the imports at the top of `src/dsl/modelPathWalker.ts` to include `getAvailableProperties`:

```typescript
import { getPropertySchema, detectSchemaType, getAvailableProperties } from '../types/schemaRegistry';
```

Append to `src/dsl/modelPathWalker.ts`:

```typescript
export interface NextSegment {
  /** The segment name (property key or child node id). */
  name: string;
  /** 'drill' means "this has substructure, keep drilling with another dot."
   *  'leaf' means "this is terminal — insert colon to assign a value." */
  kind: 'drill' | 'leaf';
  /** Where this segment came from — helps consumers format display. */
  source: 'child' | 'property';
  /** For 'property' entries, the Zod schema of that field. Consumers use
   *  this for value-completion dispatch. */
  schema?: z.ZodType;
}

const INTERNAL_KEYS = new Set(['id', 'children', 'template', 'props', 'style']);

/**
 * List the next-level segment options at a resolved location.
 *
 * - At a node: returns child-node ids (drill) + the node's schema fields
 *   (classified by type).
 * - At a sub-object: returns the sub-object's declared fields.
 * - At a leaf: returns an empty list (terminal).
 */
export function enumerateNextSegments(location: ResolvedLocation): NextSegment[] {
  if (location.kind === 'leaf') return [];

  const segments: NextSegment[] = [];

  // If at a node, add children first.
  if (location.kind === 'node') {
    const children = (location.modelValue as any)?.children;
    if (Array.isArray(children)) {
      for (const child of children) {
        if (child && typeof child.id === 'string') {
          segments.push({ name: child.id, kind: 'drill', source: 'child' });
        }
      }
    }
  }

  // Add schema-declared properties.
  if (location.schema) {
    const props = getAvailableProperties('', location.schema);
    for (const p of props) {
      if (INTERNAL_KEYS.has(p.name)) continue;
      // Don't re-emit child ids as properties.
      if (segments.some(s => s.name === p.name)) continue;
      const type = detectSchemaType(p.schema);
      const kind: 'drill' | 'leaf' = type === 'object' ? 'drill' : 'leaf';
      segments.push({ name: p.name, kind, source: 'property', schema: p.schema });
    }
  }

  return segments;
}
```

- [ ] **Step 3.4: Run tests to verify pass**

Run: `npx vitest run src/__tests__/dsl/modelPathWalker.test.ts`
Expected: PASS (all tests from Task 2 + 7 new tests = 19 tests).

- [ ] **Step 3.5: Commit**

```bash
git add src/dsl/modelPathWalker.ts src/__tests__/dsl/modelPathWalker.test.ts
git commit -m "feat(dsl): add enumerateNextSegments for path completion"
```

---

## Task 4: modelPathWalker — currentValueAt and pathExists

Small wrappers for the common "does this path exist?" and "what value sits at this path?" queries.

**Files:**
- Modify: `src/dsl/modelPathWalker.ts`
- Modify: `src/__tests__/dsl/modelPathWalker.test.ts`

- [ ] **Step 4.1: Write failing tests**

Append to `src/__tests__/dsl/modelPathWalker.test.ts`:

```typescript
import { currentValueAt, pathExists } from '../../dsl/modelPathWalker';

describe('currentValueAt', () => {
  it('returns the scalar at a leaf path', () => {
    expect(currentValueAt(scene, 'card.bg.fill')).toBe('midnightblue');
    expect(currentValueAt(scene, 'card.bg.stroke.width')).toBe(2);
    expect(currentValueAt(scene, 'solo.opacity')).toBe(0.8);
  });

  it('returns the sub-object at a drill path', () => {
    const v = currentValueAt(scene, 'card.bg.stroke');
    expect(v).toEqual({ color: 'steelblue', width: 2 });
  });

  it('returns undefined for unknown paths', () => {
    expect(currentValueAt(scene, 'card.bg.nope')).toBeUndefined();
    expect(currentValueAt(scene, 'nope.bg.fill')).toBeUndefined();
  });

  it('returns undefined for property that is not set on the object', () => {
    // solo has no fill explicitly set
    expect(currentValueAt(scene, 'solo.fill')).toBeUndefined();
  });
});

describe('pathExists', () => {
  it('returns true for valid schema paths', () => {
    expect(pathExists(scene, 'card.bg.fill')).toBe(true);
    expect(pathExists(scene, 'card.bg.stroke.width')).toBe(true);
    // Paths that are schema-reachable but not set on this model still "exist"
    // in the schema sense (the walker resolves them).
    expect(pathExists(scene, 'solo.opacity')).toBe(true);
  });

  it('returns false for unresolvable paths', () => {
    expect(pathExists(scene, 'nope')).toBe(false);
    expect(pathExists(scene, 'card.nope')).toBe(false);
    expect(pathExists(scene, 'card.bg.nope.further')).toBe(false);
  });
});
```

- [ ] **Step 4.2: Run tests to verify failure**

Run: `npx vitest run src/__tests__/dsl/modelPathWalker.test.ts -t "currentValueAt|pathExists"`
Expected: FAIL — functions not exported.

- [ ] **Step 4.3: Implement**

Append to `src/dsl/modelPathWalker.ts`:

```typescript
/**
 * Read the scalar or sub-object at a dotted path. Returns undefined if the
 * path is unresolvable OR the property is not set on the actual model value.
 *
 * Note the distinction from pathExists: a schema-reachable path that is
 * unset on the model resolves to location.modelValue === undefined, so this
 * function returns undefined. pathExists would return true for the same
 * path (it exists in the schema).
 */
export function currentValueAt(modelJson: any, path: string): unknown {
  if (!path) return undefined;
  const segments = path.split('.');
  const loc = resolvePath(modelJson, segments);
  if (!loc) return undefined;
  return loc.modelValue;
}

/**
 * Check whether a dotted path is resolvable through the scene model +
 * schemas. Returns true even if the property is not set on the model,
 * as long as the path is schema-valid from an existing root node.
 */
export function pathExists(modelJson: any, path: string): boolean {
  if (!path) return false;
  const segments = path.split('.');
  return resolvePath(modelJson, segments) !== null;
}
```

**BUT** — `currentValueAt` and `pathExists` both rely on `resolvePath` returning non-null for schema-valid-but-unset paths. Check that the existing `resolvePath` does so: when walking a property whose `nextValue = currentValue?.[seg]` is undefined, `resolvePath` continues (doesn't return null) and just passes undefined through. That's the intended behavior. If the Task-2 tests include "returns null for unknown leaf key", that's about a key not in the schema — schema-unreachable. A schema-reachable but unset path (like `solo.fill`) should still return a ResolvedLocation with `modelValue: undefined`.

Verify Task 2's test `'returns null for unknown leaf key'` uses `'nope'` (not in schema) not a valid unset key. It does. Good.

- [ ] **Step 4.4: Run tests to verify pass**

Run: `npx vitest run src/__tests__/dsl/modelPathWalker.test.ts`
Expected: PASS (19 + 6 = 25 tests).

- [ ] **Step 4.5: Commit**

```bash
git add src/dsl/modelPathWalker.ts src/__tests__/dsl/modelPathWalker.test.ts
git commit -m "feat(dsl): add currentValueAt and pathExists helpers"
```

---

## Task 5: animateCompletions — Header handler

The header handler runs when the cursor is on the `animate ...` header line. It returns flags, kwarg snippets, or kwarg values depending on what the cursor is positioned on.

**Files:**
- Create: `src/dsl/animateCompletions.ts`
- Create: `src/__tests__/dsl/animateCompletions.test.ts`

- [ ] **Step 5.1: Write failing tests for animateHeaderCompletions**

Create `src/__tests__/dsl/animateCompletions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { animateHeaderCompletions } from '../../dsl/animateCompletions';

function labels(items: { label: string }[]): string[] {
  return items.map(i => i.label);
}

describe('animateHeaderCompletions', () => {
  it('returns flags and kwarg snippets when cursor is after duration', () => {
    // Simulating cursor after "animate 10s "
    const items = animateHeaderCompletions('animate 10s ');
    const l = labels(items);
    expect(l).toContain('loop');
    expect(l).toContain('autoKey');
    expect(l).toContain('easing=');
  });

  it('kwarg snippet includes value placeholder', () => {
    const items = animateHeaderCompletions('animate 10s ');
    const easing = items.find(i => i.label === 'easing=');
    expect(easing!.snippetTemplate).toBeDefined();
    expect(easing!.snippetTemplate).toContain('${1}');
  });

  it('omits flags already present in the header', () => {
    const items = animateHeaderCompletions('animate 10s loop ');
    const l = labels(items);
    expect(l).not.toContain('loop');
    expect(l).toContain('autoKey');
    expect(l).toContain('easing=');
  });

  it('returns easing enum values when cursor is after "easing="', () => {
    const items = animateHeaderCompletions('animate 10s easing=');
    const l = labels(items);
    expect(l).toContain('linear');
    expect(l).toContain('easeIn');
    expect(l).toContain('easeOut');
    // Must NOT include flags/kwargs at this position
    expect(l).not.toContain('loop');
    expect(l).not.toContain('easing=');
  });

  it('returns easing enum values mid-typing after "easing="', () => {
    const items = animateHeaderCompletions('animate 10s easing=ea');
    const l = labels(items);
    // Handler returns full list; caller filters by prefix.
    expect(l).toContain('easeIn');
    expect(l).toContain('linear');
  });
});
```

- [ ] **Step 5.2: Run tests to verify failure**

Run: `npx vitest run src/__tests__/dsl/animateCompletions.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 5.3: Implement animateHeaderCompletions**

Create `src/dsl/animateCompletions.ts`:

```typescript
/**
 * Animate-specific completion handlers. Each handler takes minimal input
 * and returns CompletionItem[]. Structural context detection (which handler
 * to call) lives in astCompletions.ts.
 */
import type { CompletionItem } from './astCompletions';
import { AnimConfigSchema, EasingNameSchema } from '../types/animation';
import { getDsl } from './dslMeta';
import { getEnumValues } from '../types/schemaRegistry';

/**
 * Scan backwards from the end of `headerText` to find the last token.
 * Returns the token text and whether it ends with '=' (kwarg-value position).
 */
function lastTokenInfo(headerText: string): { token: string; afterEquals: boolean } {
  // Trim trailing word (partial the user is typing).
  let end = headerText.length;
  // Rewind past any partial identifier characters after '='.
  let i = end;
  while (i > 0) {
    const ch = headerText[i - 1];
    if (/[a-zA-Z_\-]/.test(ch)) { i--; continue; }
    break;
  }
  // After rewinding, i points to the character after the last delimiter.
  // If the character at i-1 is '=', we're in kwarg-value position.
  const afterEquals = i > 0 && headerText[i - 1] === '=';
  // Find the kwarg key if afterEquals.
  if (afterEquals) {
    let keyEnd = i - 1;
    let keyStart = keyEnd;
    while (keyStart > 0 && /[a-zA-Z_\-]/.test(headerText[keyStart - 1])) {
      keyStart--;
    }
    return { token: headerText.slice(keyStart, keyEnd), afterEquals: true };
  }
  return { token: '', afterEquals: false };
}

/**
 * Which flags/kwargs have already appeared in the header, so we can omit
 * duplicates. Scan tokens separated by whitespace.
 */
function usedFlagsAndKwargs(headerText: string): Set<string> {
  const used = new Set<string>();
  const tokens = headerText.split(/\s+/);
  for (const tok of tokens) {
    if (!tok) continue;
    // Kwarg: "easing=linear" → record "easing"
    const eq = tok.indexOf('=');
    if (eq >= 0) {
      used.add(tok.slice(0, eq));
      continue;
    }
    // Flag or positional — record the bare identifier.
    if (/^[a-zA-Z_][\w\-]*$/.test(tok)) used.add(tok);
  }
  return used;
}

/**
 * Header context completions. Routes internally between:
 *   - kwarg-value (after "key="): enum values for that kwarg.
 *   - otherwise: flags + kwarg snippets from AnimConfigSchema hints.
 */
export function animateHeaderCompletions(headerText: string): CompletionItem[] {
  const hints = getDsl(AnimConfigSchema);
  if (!hints) return [];

  const { token, afterEquals } = lastTokenInfo(headerText);

  // Kwarg-value sub-context.
  if (afterEquals && token === 'easing') {
    const vals = getEnumValues(EasingNameSchema) ?? [];
    return vals.map(v => ({ label: v, type: 'value', detail: 'Easing function' }));
  }

  // Flags + kwarg snippets.
  const used = usedFlagsAndKwargs(headerText);
  const items: CompletionItem[] = [];

  for (const flag of hints.flags ?? []) {
    if (used.has(flag)) continue;
    items.push({ label: flag, type: 'keyword', detail: 'Animation flag' });
  }

  for (const kw of hints.kwargs ?? []) {
    if (used.has(kw)) continue;
    items.push({
      label: `${kw}=`,
      type: 'keyword',
      detail: 'Animation option',
      snippetTemplate: `${kw}=\${1}`,
    });
  }

  return items;
}
```

- [ ] **Step 5.4: Run tests to verify pass**

Run: `npx vitest run src/__tests__/dsl/animateCompletions.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5.5: Commit**

```bash
git add src/dsl/animateCompletions.ts src/__tests__/dsl/animateCompletions.test.ts
git commit -m "feat(dsl): add animateHeaderCompletions handler"
```

---

## Task 6: Wire Header context into completionsAt

Route cursor positions on the animate header line to the new handler, **before** `lineTextCompletions` runs. Add an optional `text` parameter to `completionsAt` so we can compute `lineOf` for the cursor and the section start.

**Files:**
- Modify: `src/dsl/astCompletions.ts`
- Modify: `src/__tests__/dsl/astCompletions.test.ts`
- Modify: `src/editor/plugins/completionPlugin.ts`

- [ ] **Step 6.1: Write failing regression test**

Append to `src/__tests__/dsl/astCompletions.test.ts` inside the top-level `describe('completionsAt', ...)`:

```typescript
  describe('animate header context', () => {
    it('offers loop, autoKey, easing= after "animate 10s "', () => {
      const text = 'animate 10s ';
      const { ast: ctx } = walkDocument(text);
      const ast = leavesToAst(ctx.astLeaves(), text.length);
      const items = completionsAt(ast, text.length, text, undefined, text);
      const l = labels(items);
      expect(l).toContain('loop');
      expect(l).toContain('autoKey');
      expect(l).toContain('easing=');
    });

    it('omits loop when already present in header', () => {
      const text = 'animate 10s loop ';
      const { ast: ctx } = walkDocument(text);
      const ast = leavesToAst(ctx.astLeaves(), text.length);
      const items = completionsAt(ast, text.length, text, undefined, text);
      const l = labels(items);
      expect(l).not.toContain('loop');
      expect(l).toContain('autoKey');
    });
  });
```

- [ ] **Step 6.2: Run test to verify failure**

Run: `npx vitest run src/__tests__/dsl/astCompletions.test.ts -t "animate header"`
Expected: FAIL — `completionsAt` takes 4 args, we pass 5; also behavior doesn't match.

- [ ] **Step 6.3: Add `text` parameter and Header routing to `completionsAt`**

Modify `src/dsl/astCompletions.ts`. Update the signature of `completionsAt`:

```typescript
export function completionsAt(
  ast: AstNode | null,
  pos: number,
  lineText?: string,
  modelJson?: any,
  text?: string,
): CompletionItem[] {
  // NEW: animate sub-context routing. Runs before lineTextCompletions to
  // bypass the content-regex branches for animate-specific positions.
  if (text !== undefined && ast) {
    const animateItems = routeAnimateContext(ast, pos, text, modelJson);
    if (animateItems) return animateItems;
  }

  // … existing body unchanged
```

Add at the top of the file, next to the other imports:

```typescript
import { lineOf } from './astTypes';
import { animateHeaderCompletions } from './animateCompletions';
```

Add the router function at the bottom of the file:

```typescript
/**
 * Dispatch to animate-specific handlers based on structural cursor context.
 * Returns null when the cursor is NOT in an animate sub-context (caller
 * should fall through to existing logic).
 *
 * Note: in the walker-based AST (leavesToAst, used by completionPlugin),
 * animate appears as a document-level COMPOUND with schemaPath='animate',
 * NOT a section. In the older model-based AST (buildAstFromModel), it's a
 * section. We match on schemaPath alone to handle both.
 */
function routeAnimateContext(
  ast: AstNode,
  pos: number,
  text: string,
  modelJson: any,
): CompletionItem[] | null {
  // Find the enclosing animate node (compound or section), if any.
  const animateNode = ast.children.find(c => c.schemaPath === 'animate');
  if (!animateNode) return null;

  // Header context: cursor line === animate node start line.
  if (lineOf(pos, text) === lineOf(animateNode.from, text)) {
    // animateNode.from is the position of the "animate" keyword's first char.
    const headerText = text.slice(animateNode.from, pos);
    return animateHeaderCompletions(headerText);
  }

  // Other animate sub-contexts are wired in later tasks; return null for now
  // so the caller falls through to existing logic.
  return null;
}
```

Update the existing call-site in `src/editor/plugins/completionPlugin.ts`:

```typescript
// around line 78:
let items = completionsAt(ast, textPos, lineText, model, text);
```

- [ ] **Step 6.4: Run tests to verify Header routing works**

Run: `npx vitest run src/__tests__/dsl/astCompletions.test.ts -t "animate header"`
Expected: PASS (2 tests).

Also run all completion tests to verify no regression:

Run: `npx vitest run src/__tests__/dsl/astCompletions.test.ts`
Expected: PASS (all existing tests + 2 new).

- [ ] **Step 6.5: Commit**

```bash
git add src/dsl/astCompletions.ts src/__tests__/dsl/astCompletions.test.ts src/editor/plugins/completionPlugin.ts
git commit -m "feat(dsl): route animate header context to dedicated handler

Fixes ctrl+space after 'animate 10s ' showing generic completions
instead of flags/kwargs. Adds optional text parameter to completionsAt
so animate sub-context routing can use structural line info."
```

---

## Task 7: animateKeyframeStartCompletions handler

Returns completions for a fresh indented line under the animate header (no timestamp yet on the line). Offers a numeric timestamp snippet and the `chapter` keyword.

**Files:**
- Modify: `src/dsl/animateCompletions.ts`
- Modify: `src/__tests__/dsl/animateCompletions.test.ts`

- [ ] **Step 7.1: Write failing test**

Append to `src/__tests__/dsl/animateCompletions.test.ts`:

```typescript
import { animateKeyframeStartCompletions } from '../../dsl/animateCompletions';

describe('animateKeyframeStartCompletions', () => {
  it('returns timestamp snippet and chapter keyword', () => {
    const items = animateKeyframeStartCompletions();
    const l = labels(items);
    expect(l.some(lbl => /^\d/.test(lbl) || lbl.includes('time') || lbl.includes('seconds'))).toBe(true);
    expect(l).toContain('chapter');
  });

  it('timestamp item has a snippet template', () => {
    const items = animateKeyframeStartCompletions();
    const ts = items.find(i => i.detail === 'Keyframe timestamp');
    expect(ts).toBeDefined();
    expect(ts!.snippetTemplate).toBeDefined();
  });
});
```

- [ ] **Step 7.2: Run test to verify failure**

Run: `npx vitest run src/__tests__/dsl/animateCompletions.test.ts -t animateKeyframeStartCompletions`
Expected: FAIL — function not exported.

- [ ] **Step 7.3: Implement**

Append to `src/dsl/animateCompletions.ts`:

```typescript
/**
 * Keyframe-start context: cursor is on an indented line under the animate
 * header, before typing a timestamp. Offer a numeric-time snippet and the
 * `chapter` keyword.
 */
export function animateKeyframeStartCompletions(): CompletionItem[] {
  return [
    {
      label: 'time',
      type: 'keyword',
      detail: 'Keyframe timestamp',
      snippetTemplate: '${1:1} ${2:path}: ${3:value}',
    },
    {
      label: 'chapter',
      type: 'keyword',
      detail: 'Named chapter marker',
      snippetTemplate: 'chapter "${1:name}" at ${2:0}',
    },
  ];
}
```

- [ ] **Step 7.4: Run tests to verify pass**

Run: `npx vitest run src/__tests__/dsl/animateCompletions.test.ts`
Expected: PASS.

- [ ] **Step 7.5: Commit**

```bash
git add src/dsl/animateCompletions.ts src/__tests__/dsl/animateCompletions.test.ts
git commit -m "feat(dsl): add animateKeyframeStartCompletions handler"
```

---

## Task 8: Wire Keyframe-start context into completionsAt

Detect when the cursor is on an indented fresh line (no number or identifier token yet) inside the animate section, below the header.

**Files:**
- Modify: `src/dsl/astCompletions.ts`
- Modify: `src/__tests__/dsl/astCompletions.test.ts`

- [ ] **Step 8.1: Write failing test**

Append to the `describe('animate header context', ...)` block in `src/__tests__/dsl/astCompletions.test.ts`:

```typescript
  describe('animate keyframe-start context', () => {
    it('offers timestamp snippet and chapter keyword on fresh indented line', () => {
      const text = 'animate 5s loop\n  ';
      const { ast: ctx } = walkDocument(text);
      const ast = leavesToAst(ctx.astLeaves(), text.length);
      const items = completionsAt(ast, text.length, '  ', undefined, text);
      const l = labels(items);
      expect(l).toContain('chapter');
      expect(l).toContain('time');
    });
  });
```

- [ ] **Step 8.2: Run test to verify failure**

Run: `npx vitest run src/__tests__/dsl/astCompletions.test.ts -t "keyframe-start"`
Expected: FAIL — routing returns null at this position.

- [ ] **Step 8.3: Add Keyframe-start routing to `routeAnimateContext`**

Modify `routeAnimateContext` in `src/dsl/astCompletions.ts`. Also import `indentOf`:

```typescript
import { lineOf, indentOf } from './astTypes';
import {
  animateHeaderCompletions,
  animateKeyframeStartCompletions,
} from './animateCompletions';
```

Add two helpers at the bottom of the file: `findLineStart` (scans back to previous newline) and `isInsideAnimateBody` (checks that cursor is in the body of the animate block, i.e. below the header with no dedent-to-header-level between them):

```typescript
function findLineStart(text: string, pos: number): number {
  let i = Math.min(pos, text.length);
  while (i > 0 && text.charCodeAt(i - 1) !== 10) i--;
  return i;
}

/**
 * Returns true iff `pos` sits on a line that belongs to the animate block's
 * body — i.e., it is below the header line AND indented deeper than the
 * header AND no non-blank line at indent <= headerIndent appears between the
 * header and the cursor.
 */
function isInsideAnimateBody(
  animateNode: AstNode,
  pos: number,
  text: string,
): boolean {
  const headerLine = lineOf(animateNode.from, text);
  const cursorLine = lineOf(pos, text);
  if (cursorLine <= headerLine) return false;

  const headerIndent = indentOf(animateNode.from, text);
  const cursorIndent = indentOf(pos, text);
  if (cursorIndent <= headerIndent) return false;

  // Scan lines strictly between header and cursor for dedents.
  const lines = text.split('\n');
  for (let ln = headerLine + 1; ln < cursorLine; ln++) {
    const line = lines[ln] ?? '';
    if (line.trim() === '') continue; // blank lines OK
    let ind = 0;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === ' ' || line[i] === '\t') ind++;
      else break;
    }
    if (ind <= headerIndent) return false; // dedented out of animate body
  }
  return true;
}
```

Extend the router (replace the entire `routeAnimateContext` body):

```typescript
function routeAnimateContext(
  ast: AstNode,
  pos: number,
  text: string,
  modelJson: any,
): CompletionItem[] | null {
  const animateNode = ast.children.find(c => c.schemaPath === 'animate');
  if (!animateNode) return null;

  // Header context: cursor line === animate node start line.
  if (lineOf(pos, text) === lineOf(animateNode.from, text)) {
    const headerText = text.slice(animateNode.from, pos);
    return animateHeaderCompletions(headerText);
  }

  // Below the header: must be inside the animate body.
  if (!isInsideAnimateBody(animateNode, pos, text)) return null;

  const lineStart = findLineStart(text, pos);
  const lineBeforeCursor = text.slice(lineStart, pos);

  // Keyframe-start: fresh indented line (whitespace-only before cursor).
  if (/^\s*$/.test(lineBeforeCursor)) {
    return animateKeyframeStartCompletions();
  }

  // Other animate sub-contexts wired in later tasks.
  return null;
}
```

(Note: the `/^\s*$/` regex tests whether a string is all whitespace — a
character-class delimiter check, not content pattern matching.)

- [ ] **Step 8.4: Run tests to verify pass**

Run: `npx vitest run src/__tests__/dsl/astCompletions.test.ts -t "keyframe-start"`
Expected: PASS.

Run full test suite to verify no regression:

Run: `npx vitest run src/__tests__/dsl/astCompletions.test.ts`
Expected: PASS (all tests).

- [ ] **Step 8.5: Commit**

```bash
git add src/dsl/astCompletions.ts src/__tests__/dsl/astCompletions.test.ts
git commit -m "feat(dsl): route animate keyframe-start context to handler"
```

---

## Task 9: Partial-path extraction helper

Extracts the dotted path the user is currently typing by scanning backward from the cursor to the nearest delimiter.

**Files:**
- Modify: `src/dsl/animateCompletions.ts`
- Modify: `src/__tests__/dsl/animateCompletions.test.ts`

- [ ] **Step 9.1: Write failing tests**

Append to `src/__tests__/dsl/animateCompletions.test.ts`:

```typescript
import { extractPartialPath } from '../../dsl/animateCompletions';

describe('extractPartialPath', () => {
  it('returns empty string when no identifier characters before cursor', () => {
    expect(extractPartialPath('    ')).toBe('');
    expect(extractPartialPath('')).toBe('');
    expect(extractPartialPath('  1 ')).toBe('');
  });

  it('returns single segment', () => {
    expect(extractPartialPath('    card')).toBe('card');
    expect(extractPartialPath('  1 ca')).toBe('ca');
  });

  it('returns dotted path', () => {
    expect(extractPartialPath('  1 card.bg')).toBe('card.bg');
    expect(extractPartialPath('  1 card.bg.f')).toBe('card.bg.f');
    expect(extractPartialPath('  1 card.bg.stroke.')).toBe('card.bg.stroke.');
  });

  it('stops at whitespace', () => {
    expect(extractPartialPath('  1 card.bg.fill ')).toBe('');
    expect(extractPartialPath('  a.b c.d')).toBe('c.d');
  });

  it('stops at colon (path terminator)', () => {
    expect(extractPartialPath('  1 card.bg.fill: ')).toBe('');
    // Cursor right after colon (no trailing space):
    expect(extractPartialPath('  1 card.bg.fill:')).toBe('');
  });
});
```

- [ ] **Step 9.2: Run test to verify failure**

Run: `npx vitest run src/__tests__/dsl/animateCompletions.test.ts -t extractPartialPath`
Expected: FAIL — function not exported.

- [ ] **Step 9.3: Implement**

Append to `src/dsl/animateCompletions.ts`:

```typescript
/**
 * Scan backwards from the end of `textBeforeCursor` to extract the dotted
 * path the user is typing. Stops at whitespace or ':' (value terminator).
 *
 * This is tokenisation-style scanning — it reads characters until a
 * delimiter, not pattern-matching on content shape.
 */
export function extractPartialPath(textBeforeCursor: string): string {
  let i = textBeforeCursor.length;
  while (i > 0) {
    const ch = textBeforeCursor[i - 1];
    if (/[a-zA-Z0-9_\-.]/.test(ch)) { i--; continue; }
    break;
  }
  const raw = textBeforeCursor.slice(i);
  // If what we captured contains ':', it's past a terminator — reject.
  if (raw.includes(':')) return '';
  return raw;
}
```

- [ ] **Step 9.4: Run tests to verify pass**

Run: `npx vitest run src/__tests__/dsl/animateCompletions.test.ts`
Expected: PASS.

- [ ] **Step 9.5: Commit**

```bash
git add src/dsl/animateCompletions.ts src/__tests__/dsl/animateCompletions.test.ts
git commit -m "feat(dsl): add extractPartialPath helper"
```

---

## Task 10: Path tiering — gather animated paths from animate block

Before we tier candidates, we need to know which paths are already animated. Scan the animate block's keyframe changes to collect them.

**Files:**
- Modify: `src/dsl/animateCompletions.ts`
- Modify: `src/__tests__/dsl/animateCompletions.test.ts`

- [ ] **Step 10.1: Write failing test**

Append to `src/__tests__/dsl/animateCompletions.test.ts`:

```typescript
import { collectAnimatedPaths } from '../../dsl/animateCompletions';

describe('collectAnimatedPaths', () => {
  it('returns empty set for empty animate block', () => {
    expect(collectAnimatedPaths(undefined)).toEqual(new Set());
    expect(collectAnimatedPaths({ duration: 5, keyframes: [] })).toEqual(new Set());
  });

  it('collects paths from a single keyframe', () => {
    const block = {
      duration: 5,
      keyframes: [
        { time: 1, changes: { 'card.bg.fill': 'blue' } },
      ],
    };
    expect(collectAnimatedPaths(block)).toEqual(new Set(['card.bg.fill']));
  });

  it('collects paths across multiple keyframes', () => {
    const block = {
      duration: 5,
      keyframes: [
        { time: 1, changes: { 'card.bg.fill': 'blue', 'card.opacity': 0.5 } },
        { time: 2, changes: { 'card.bg.fill': 'red' } },
      ],
    };
    expect(collectAnimatedPaths(block)).toEqual(
      new Set(['card.bg.fill', 'card.opacity']),
    );
  });
});
```

- [ ] **Step 10.2: Run test to verify failure**

Run: `npx vitest run src/__tests__/dsl/animateCompletions.test.ts -t collectAnimatedPaths`
Expected: FAIL.

- [ ] **Step 10.3: Implement**

Append to `src/dsl/animateCompletions.ts`:

```typescript
/**
 * Collect all paths that appear in any keyframe's `changes` record on this
 * animate block. Used by tier-1 classification during path completion.
 */
export function collectAnimatedPaths(animateBlock: any): Set<string> {
  const paths = new Set<string>();
  if (!animateBlock?.keyframes) return paths;
  for (const kf of animateBlock.keyframes) {
    if (!kf?.changes) continue;
    for (const path of Object.keys(kf.changes)) {
      paths.add(path);
    }
  }
  return paths;
}
```

- [ ] **Step 10.4: Run tests to verify pass**

Run: `npx vitest run src/__tests__/dsl/animateCompletions.test.ts`
Expected: PASS.

- [ ] **Step 10.5: Commit**

```bash
git add src/dsl/animateCompletions.ts src/__tests__/dsl/animateCompletions.test.ts
git commit -m "feat(dsl): add collectAnimatedPaths helper for tier-1 classification"
```

---

## Task 11: Path candidate tiering

For each candidate next-segment from the walker, classify it as animated / set / available. The tier is stored in each CompletionItem's `detail` field and determines sort order.

**Files:**
- Modify: `src/dsl/animateCompletions.ts`
- Modify: `src/__tests__/dsl/animateCompletions.test.ts`

- [ ] **Step 11.1: Write failing tests**

Append to `src/__tests__/dsl/animateCompletions.test.ts`:

```typescript
import { tierCandidate } from '../../dsl/animateCompletions';

const tierScene = {
  objects: [
    {
      id: 'card',
      children: [
        {
          id: 'bg',
          rect: { w: 100, h: 50 },
          fill: 'blue',
          stroke: { color: 'red', width: 2 },
        },
      ],
    },
  ],
};

describe('tierCandidate', () => {
  it('returns animated for candidate under an animated path', () => {
    const animated = new Set(['card.bg.fill']);
    const tier = tierCandidate('fill', 'card.bg', tierScene, animated);
    expect(tier).toBe('animated');
  });

  it('returns animated for drill target leading to animated path', () => {
    const animated = new Set(['card.bg.fill']);
    // Candidate "bg" at prefix "card" → extends to "card.bg" which is a
    // prefix of an animated path.
    expect(tierCandidate('bg', 'card', tierScene, animated)).toBe('animated');
  });

  it('returns set for candidate with explicit model value', () => {
    const animated = new Set<string>();
    // card.bg.fill is set on the model
    expect(tierCandidate('fill', 'card.bg', tierScene, animated)).toBe('set');
  });

  it('returns set for drill target with set descendants', () => {
    const animated = new Set<string>();
    // stroke has color and width set
    expect(tierCandidate('stroke', 'card.bg', tierScene, animated)).toBe('set');
  });

  it('returns available for unset schema-reachable properties', () => {
    const animated = new Set<string>();
    // opacity is schema-reachable on bg but not set
    expect(tierCandidate('opacity', 'card.bg', tierScene, animated)).toBe('available');
  });

  it('animated beats set', () => {
    const animated = new Set(['card.bg.fill']);
    // fill is both animated AND set; animated wins.
    expect(tierCandidate('fill', 'card.bg', tierScene, animated)).toBe('animated');
  });
});
```

- [ ] **Step 11.2: Run test to verify failure**

Run: `npx vitest run src/__tests__/dsl/animateCompletions.test.ts -t tierCandidate`
Expected: FAIL.

- [ ] **Step 11.3: Implement**

Append to `src/dsl/animateCompletions.ts`:

Add the import at the top of `src/dsl/animateCompletions.ts`:

```typescript
import { currentValueAt, resolvePath, enumerateNextSegments } from './modelPathWalker';
```

Append:

```typescript
export type Tier = 'animated' | 'set' | 'available';

/**
 * Classify a candidate next-segment by tier:
 *   - 'animated': extending to `prefix.candidate` reaches (or is a prefix of)
 *     some path in the animated set.
 *   - 'set': `prefix.candidate` has an explicit value in the model — or,
 *     for drill targets, some descendant leaf is set.
 *   - 'available': schema-reachable but neither of the above.
 */
export function tierCandidate(
  candidate: string,
  prefix: string,
  modelJson: any,
  animatedPaths: Set<string>,
): Tier {
  const fullPath = prefix ? `${prefix}.${candidate}` : candidate;

  // Tier 1: animated — any animated path starts with fullPath (or equals it).
  for (const ap of animatedPaths) {
    if (ap === fullPath) return 'animated';
    if (ap.startsWith(fullPath + '.')) return 'animated';
  }

  // Tier 2: set — fullPath leads to a currently-set value.
  const value = currentValueAt(modelJson, fullPath);
  if (value !== undefined && value !== null) {
    // For scalars and present sub-objects, treat as set.
    return 'set';
  }

  return 'available';
}
```

- [ ] **Step 11.4: Run tests to verify pass**

Run: `npx vitest run src/__tests__/dsl/animateCompletions.test.ts`
Expected: PASS.

- [ ] **Step 11.5: Commit**

```bash
git add src/dsl/animateCompletions.ts src/__tests__/dsl/animateCompletions.test.ts
git commit -m "feat(dsl): add tierCandidate for path completion ranking"
```

---

## Task 12: animatePathCompletions handler

Ties together walker + tiering + partial extraction to produce tiered path completions.

**Files:**
- Modify: `src/dsl/animateCompletions.ts`
- Modify: `src/__tests__/dsl/animateCompletions.test.ts`

- [ ] **Step 12.1: Write failing tests**

Append to `src/__tests__/dsl/animateCompletions.test.ts`:

```typescript
import { animatePathCompletions } from '../../dsl/animateCompletions';

const pathScene = {
  objects: [
    {
      id: 'card',
      children: [
        {
          id: 'bg',
          rect: { w: 100, h: 50 },
          fill: 'blue',
          stroke: { color: 'red', width: 2 },
        },
        { id: 'title', text: { content: 'hi', size: 14 } },
      ],
    },
    { id: 'solo', rect: { w: 20, h: 20 } },
  ],
  animate: {
    duration: 5,
    keyframes: [{ time: 1, changes: { 'card.bg.fill': 'green' } }],
  },
};

describe('animatePathCompletions', () => {
  it('at empty prefix, returns all scene node ids', () => {
    const items = animatePathCompletions('', pathScene, pathScene.animate);
    const l = labels(items);
    expect(l).toContain('card');
    expect(l).toContain('solo');
  });

  it('at empty prefix, marks node with animated descendant as tier 1', () => {
    const items = animatePathCompletions('', pathScene, pathScene.animate);
    const card = items.find(i => i.label === 'card');
    expect(card!.detail).toBe('animated');
  });

  it('after "card.", returns children and node properties', () => {
    const items = animatePathCompletions('card.', pathScene, pathScene.animate);
    const l = labels(items);
    expect(l).toContain('bg');
    expect(l).toContain('title');
    expect(l).toContain('fill'); // card's own property (unset)
    expect(l).toContain('opacity');
  });

  it('after "card.bg.", fill is animated, stroke is set', () => {
    const items = animatePathCompletions('card.bg.', pathScene, pathScene.animate);
    const fill = items.find(i => i.label === 'fill');
    const stroke = items.find(i => i.label === 'stroke');
    const opacity = items.find(i => i.label === 'opacity');
    expect(fill!.detail).toBe('animated');
    expect(stroke!.detail).toBe('set');
    expect(opacity!.detail).toBe('available');
  });

  it('tier 1 items come before tier 2, before tier 3', () => {
    const items = animatePathCompletions('card.bg.', pathScene, pathScene.animate);
    const fillIdx = items.findIndex(i => i.label === 'fill');
    const strokeIdx = items.findIndex(i => i.label === 'stroke');
    const opacityIdx = items.findIndex(i => i.label === 'opacity');
    expect(fillIdx).toBeLessThan(strokeIdx);
    expect(strokeIdx).toBeLessThan(opacityIdx);
  });

  it('unknown root falls back to all nodes + info item', () => {
    const items = animatePathCompletions('typo.', pathScene, pathScene.animate);
    const l = labels(items);
    expect(l).toContain('card');
    expect(l).toContain('solo');
    // Info item signals no match
    const info = items.find(i => i.type === 'info');
    expect(info).toBeDefined();
    expect(info!.label).toContain('typo');
  });

  it('after a leaf segment returns empty', () => {
    // card.bg.fill is a leaf — drilling further is invalid
    const items = animatePathCompletions('card.bg.fill.', pathScene, pathScene.animate);
    expect(items).toEqual([]);
  });
});
```

- [ ] **Step 12.2: Run tests to verify failure**

Run: `npx vitest run src/__tests__/dsl/animateCompletions.test.ts -t animatePathCompletions`
Expected: FAIL.

- [ ] **Step 12.3: Implement**

Append to `src/dsl/animateCompletions.ts`:

```typescript
/**
 * Enumerate all top-level scene node ids from the model. Used as the
 * root-segment candidate list (when partial has no dot yet or is empty).
 */
function sceneNodeIds(modelJson: any): string[] {
  if (!Array.isArray(modelJson?.objects)) return [];
  return modelJson.objects.map((o: any) => o?.id).filter((id: any) => typeof id === 'string');
}

/**
 * Main path-completion handler. Given a partial dot-path, resolves as far
 * as possible through the scene model and returns tiered next-segment
 * candidates.
 *
 * When the partial ends with '.' or is empty at a segment boundary, we've
 * committed the previous segments. Otherwise, the last segment is a
 * filter-prefix for the caller (we return all options at the resolved
 * parent).
 */
export function animatePathCompletions(
  partialPath: string,
  modelJson: any,
  animateBlock: any,
): CompletionItem[] {
  const animated = collectAnimatedPaths(animateBlock);

  // Split on '.'. The last segment is the user's filter-prefix (possibly
  // empty if they just typed a dot). Everything before it is committed.
  const segments = partialPath.split('.');
  const committed = segments.slice(0, -1);
  const prefix = committed.join('.');

  // Empty committed → we're at the root. Return top-level scene node ids.
  if (committed.length === 0) {
    const ids = sceneNodeIds(modelJson);
    return ids.map(id => {
      const tier = tierCandidate(id, '', modelJson, animated);
      return makeCandidateItem(id, tier, 'drill');
    });
  }

  // Resolve the walk through the committed segments.
  const loc = resolvePath(modelJson, committed);
  if (!loc) {
    // Fallback: unknown root — return all nodes + info item.
    const ids = sceneNodeIds(modelJson);
    const items: CompletionItem[] = ids.map(id => {
      const tier = tierCandidate(id, '', modelJson, animated);
      return makeCandidateItem(id, tier, 'drill');
    });
    items.push({
      label: `no match for "${committed[0]}"`,
      type: 'info',
      detail: 'Showing all scene nodes',
    });
    return items;
  }

  // Enumerate next-level options and tier them.
  const nexts = enumerateNextSegments(loc);
  const items = nexts.map(n => {
    const tier = tierCandidate(n.name, prefix, modelJson, animated);
    return makeCandidateItem(n.name, tier, n.kind);
  });

  // Sort by tier: animated → set → available, then alphabetical.
  const tierOrder: Record<Tier, number> = { animated: 0, set: 1, available: 2 };
  items.sort((a, b) => {
    const ta = tierOrder[(a.detail as Tier) ?? 'available'];
    const tb = tierOrder[(b.detail as Tier) ?? 'available'];
    if (ta !== tb) return ta - tb;
    return a.label.localeCompare(b.label);
  });

  return items;
}

function makeCandidateItem(
  name: string,
  tier: Tier,
  kind: 'drill' | 'leaf',
): CompletionItem {
  return {
    label: name,
    type: kind === 'leaf' ? 'property' : 'keyword',
    detail: tier,
  };
}
```

- [ ] **Step 12.4: Run tests to verify pass**

Run: `npx vitest run src/__tests__/dsl/animateCompletions.test.ts`
Expected: PASS (all 7 new animatePathCompletions tests + all prior tests).

- [ ] **Step 12.5: Commit**

```bash
git add src/dsl/animateCompletions.ts src/__tests__/dsl/animateCompletions.test.ts
git commit -m "feat(dsl): add animatePathCompletions with tiered results"
```

---

## Task 13: Wire Path context into completionsAt

Detect when the cursor is typing a keyframe path — either on a line that starts with a timestamp (inline change) or on an indented line under a keyframe (block change).

**Files:**
- Modify: `src/dsl/astCompletions.ts`
- Modify: `src/__tests__/dsl/astCompletions.test.ts`

- [ ] **Step 13.1: Write failing test**

Append to `src/__tests__/dsl/astCompletions.test.ts`:

```typescript
  describe('animate path context', () => {
    const sceneModel = {
      objects: [
        {
          id: 'card',
          children: [
            {
              id: 'bg',
              rect: { w: 100, h: 50 },
              fill: 'blue',
              stroke: { color: 'red', width: 2 },
            },
          ],
        },
      ],
      animate: {
        duration: 5,
        keyframes: [{ time: 1, changes: { 'card.bg.fill': 'green' } }],
      },
    };

    it('offers scene nodes on inline-change after timestamp', () => {
      const text = 'animate 5s\n  1 ';
      const { ast: ctx } = walkDocument(text);
      const ast = leavesToAst(ctx.astLeaves(), text.length);
      const items = completionsAt(ast, text.length, '  1 ', sceneModel, text);
      const l = labels(items);
      expect(l).toContain('card');
    });

    it('offers children and props after "card." on inline change', () => {
      const text = 'animate 5s\n  1 card.';
      const { ast: ctx } = walkDocument(text);
      const ast = leavesToAst(ctx.astLeaves(), text.length);
      const items = completionsAt(ast, text.length, '  1 card.', sceneModel, text);
      const l = labels(items);
      expect(l).toContain('bg');
      expect(l).toContain('opacity');
    });

    it('offers tiered completions after "card.bg." on block change', () => {
      const text = 'animate 5s\n  1\n    card.bg.';
      const { ast: ctx } = walkDocument(text);
      const ast = leavesToAst(ctx.astLeaves(), text.length);
      const items = completionsAt(ast, text.length, '    card.bg.', sceneModel, text);
      // fill is animated — must appear before stroke (set) and opacity (available)
      const fillIdx = items.findIndex(i => i.label === 'fill');
      const opacityIdx = items.findIndex(i => i.label === 'opacity');
      expect(fillIdx).toBeGreaterThanOrEqual(0);
      expect(fillIdx).toBeLessThan(opacityIdx);
    });
  });
```

- [ ] **Step 13.2: Run test to verify failure**

Run: `npx vitest run src/__tests__/dsl/astCompletions.test.ts -t "animate path context"`
Expected: FAIL.

- [ ] **Step 13.3: Add Path routing to `routeAnimateContext`**

Modify `src/dsl/astCompletions.ts`. Import the path handler and partial extractor:

```typescript
import {
  animateHeaderCompletions,
  animateKeyframeStartCompletions,
  animatePathCompletions,
  extractPartialPath,
} from './animateCompletions';
```

Update the routing function (replace the entire `routeAnimateContext` body; `findLineStart` and `isInsideAnimateBody` already exist from Task 8):

```typescript
function routeAnimateContext(
  ast: AstNode,
  pos: number,
  text: string,
  modelJson: any,
): CompletionItem[] | null {
  const animateNode = ast.children.find(c => c.schemaPath === 'animate');
  if (!animateNode) return null;

  // Header context: cursor line === animate node start line.
  if (lineOf(pos, text) === lineOf(animateNode.from, text)) {
    const headerText = text.slice(animateNode.from, pos);
    return animateHeaderCompletions(headerText);
  }

  // Below the header: must be inside the animate body.
  if (!isInsideAnimateBody(animateNode, pos, text)) return null;

  const lineStart = findLineStart(text, pos);
  const lineBeforeCursor = text.slice(lineStart, pos);

  // Keyframe-start: fresh indented line (whitespace-only before cursor).
  if (/^\s*$/.test(lineBeforeCursor)) {
    return animateKeyframeStartCompletions();
  }

  // Path context: extract partial by backward scan from cursor.
  const partial = extractPartialPath(lineBeforeCursor);
  return animatePathCompletions(partial, modelJson, (modelJson as any)?.animate);
}
```

- [ ] **Step 13.4: Run test to verify pass**

Run: `npx vitest run src/__tests__/dsl/astCompletions.test.ts -t "animate path context"`
Expected: PASS (3 new tests).

Also run the full suite:

Run: `npx vitest run src/__tests__/dsl/astCompletions.test.ts`
Expected: PASS.

- [ ] **Step 13.5: Commit**

```bash
git add src/dsl/astCompletions.ts src/__tests__/dsl/astCompletions.test.ts
git commit -m "feat(dsl): route animate keyframe path context to tiered handler"
```

---

## Task 14: animateValueCompletions handler

When the cursor is after `:` on a keyframe change line, offer type-appropriate values plus the current scene value.

**Files:**
- Modify: `src/dsl/animateCompletions.ts`
- Modify: `src/__tests__/dsl/animateCompletions.test.ts`

- [ ] **Step 14.1: Write failing tests**

Append to `src/__tests__/dsl/animateCompletions.test.ts`:

```typescript
import { animateValueCompletions } from '../../dsl/animateCompletions';

const valueScene = {
  objects: [
    {
      id: 'box',
      rect: { w: 100, h: 50 },
      fill: 'midnightblue',
      opacity: 0.7,
    },
  ],
};

describe('animateValueCompletions', () => {
  it('returns color completions for a color property', () => {
    const items = animateValueCompletions('box.fill', valueScene);
    const l = labels(items);
    expect(l).toContain('red');
    expect(l).toContain('hsl');
  });

  it('includes current value at top for colors', () => {
    const items = animateValueCompletions('box.fill', valueScene);
    expect(items[0].label).toBe('midnightblue');
    expect(items[0].detail).toContain('current');
  });

  it('returns only current-value for numeric property', () => {
    const items = animateValueCompletions('box.opacity', valueScene);
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('0.7');
    expect(items[0].detail).toContain('current');
  });

  it('returns empty list for unresolvable path', () => {
    const items = animateValueCompletions('nope.path', valueScene);
    expect(items).toEqual([]);
  });

  it('returns boolean true/false for a boolean property', () => {
    const items = animateValueCompletions('box.visible', valueScene);
    const l = labels(items);
    expect(l).toContain('true');
    expect(l).toContain('false');
  });
});
```

- [ ] **Step 14.2: Run test to verify failure**

Run: `npx vitest run src/__tests__/dsl/animateCompletions.test.ts -t animateValueCompletions`
Expected: FAIL.

- [ ] **Step 14.3: Implement**

Add imports at the top of `src/dsl/animateCompletions.ts`:

```typescript
import { detectSchemaType, getEnumValues } from '../types/schemaRegistry';
import { getAllColorNames } from '../types/color';
import { HslColorSchema, RgbColorSchema } from '../types/properties';
```

Append:

```typescript
/**
 * Produce value completions for a full keyframe change path.
 * Includes the current scene value (if concise) as a top-ranked item.
 */
export function animateValueCompletions(
  fullPath: string,
  modelJson: any,
): CompletionItem[] {
  const segments = fullPath.split('.');
  const loc = resolvePath(modelJson, segments);
  if (!loc || !loc.schema) return [];

  const type = detectSchemaType(loc.schema);
  const items: CompletionItem[] = [];

  // Current-value item (top-ranked).
  const current = currentValueAt(modelJson, fullPath);
  if (current !== undefined && current !== null) {
    const asText = conciseValue(current);
    if (asText !== null) {
      items.push({
        label: asText,
        type: 'value',
        detail: `current: ${asText}`,
      });
    }
  }

  // Type-specific completions.
  if (type === 'color') {
    for (const name of getAllColorNames()) {
      if (items[0]?.label === name) continue; // don't duplicate the current
      items.push({ label: name, type: 'value', detail: 'Named color' });
    }
    items.push({
      label: 'hsl',
      type: 'keyword',
      detail: 'HSL color',
      snippetTemplate: 'hsl ${1:H} ${2:S} ${3:L}',
    });
    items.push({
      label: 'rgb',
      type: 'keyword',
      detail: 'RGB color',
      snippetTemplate: 'rgb ${1:R} ${2:G} ${3:B}',
    });
  } else if (type === 'enum') {
    const vals = getEnumValues(loc.schema) ?? [];
    for (const v of vals) {
      if (items[0]?.label === v) continue;
      items.push({ label: v, type: 'value' });
    }
  } else if (type === 'boolean') {
    for (const v of ['true', 'false']) {
      if (items[0]?.label === v) continue;
      items.push({ label: v, type: 'value' });
    }
  }
  // number → only current-value item (no free list).

  return items;
}

/**
 * Format a model value as a concise DSL-compatible string. Returns null for
 * structured values that can't be rendered concisely.
 */
function conciseValue(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return String(v);
  return null;
}
```

- [ ] **Step 14.4: Run tests to verify pass**

Run: `npx vitest run src/__tests__/dsl/animateCompletions.test.ts`
Expected: PASS.

- [ ] **Step 14.5: Commit**

```bash
git add src/dsl/animateCompletions.ts src/__tests__/dsl/animateCompletions.test.ts
git commit -m "feat(dsl): add animateValueCompletions with current-value ranking"
```

---

## Task 15: Wire Value context into completionsAt

When the cursor is after `:` on a line whose prefix is a keyframe path, dispatch to `animateValueCompletions`.

**Files:**
- Modify: `src/dsl/astCompletions.ts`
- Modify: `src/__tests__/dsl/astCompletions.test.ts`

- [ ] **Step 15.1: Write failing test**

Append to the `describe('animate path context', ...)` block (or a sibling) in `src/__tests__/dsl/astCompletions.test.ts`:

```typescript
  describe('animate value context', () => {
    const valueSceneModel = {
      objects: [
        {
          id: 'box',
          rect: { w: 100, h: 50 },
          fill: 'midnightblue',
          opacity: 0.5,
        },
      ],
      animate: { duration: 3, keyframes: [] },
    };

    it('offers colors after "box.fill: " on inline change', () => {
      const text = 'animate 3s\n  1 box.fill: ';
      const { ast: ctx } = walkDocument(text);
      const ast = leavesToAst(ctx.astLeaves(), text.length);
      const items = completionsAt(ast, text.length, '  1 box.fill: ', valueSceneModel, text);
      const l = labels(items);
      expect(l).toContain('red');
      expect(l).toContain('hsl');
    });

    it('ranks current value first for colors', () => {
      const text = 'animate 3s\n  1 box.fill: ';
      const { ast: ctx } = walkDocument(text);
      const ast = leavesToAst(ctx.astLeaves(), text.length);
      const items = completionsAt(ast, text.length, '  1 box.fill: ', valueSceneModel, text);
      expect(items[0].label).toBe('midnightblue');
    });

    it('offers only current-value for a number property', () => {
      const text = 'animate 3s\n  1 box.opacity: ';
      const { ast: ctx } = walkDocument(text);
      const ast = leavesToAst(ctx.astLeaves(), text.length);
      const items = completionsAt(ast, text.length, '  1 box.opacity: ', valueSceneModel, text);
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items[0].label).toBe('0.5');
    });
  });
```

- [ ] **Step 15.2: Run test to verify failure**

Run: `npx vitest run src/__tests__/dsl/astCompletions.test.ts -t "animate value context"`
Expected: FAIL.

- [ ] **Step 15.3: Wire into router**

Modify `src/dsl/astCompletions.ts`. Add import:

```typescript
import {
  animateHeaderCompletions,
  animateKeyframeStartCompletions,
  animatePathCompletions,
  animateValueCompletions,
  extractPartialPath,
} from './animateCompletions';
```

Update the path branch of `routeAnimateContext` to check for Value context first (the line contains `:` before the cursor):

```typescript
  // Path or Value context. Find whether a ':' appears on this line before cursor.
  const colonIdx = lineBeforeCursor.lastIndexOf(':');
  if (colonIdx >= 0) {
    // Value context: extract the full path from before the colon.
    const beforeColon = lineBeforeCursor.slice(0, colonIdx);
    // The keyframe path is the last dotted token before the colon.
    const pathMatch = extractPartialPath(beforeColon);
    if (pathMatch) {
      return animateValueCompletions(pathMatch, modelJson);
    }
    return [];
  }

  // Path context: extract partial by backward scan.
  const partial = extractPartialPath(lineBeforeCursor);
  return animatePathCompletions(partial, modelJson, (modelJson as any)?.animate);
```

- [ ] **Step 15.4: Run tests to verify pass**

Run: `npx vitest run src/__tests__/dsl/astCompletions.test.ts -t "animate value context"`
Expected: PASS.

Run full suite:

Run: `npx vitest run`
Expected: PASS (all tests, no regressions).

- [ ] **Step 15.5: Commit**

```bash
git add src/dsl/astCompletions.ts src/__tests__/dsl/astCompletions.test.ts
git commit -m "feat(dsl): route animate value context to type-aware completions"
```

---

## Task 16: End-to-end regression test with real scene + animate

Verify all four contexts work end-to-end on a realistic DSL text, caught all together.

**Files:**
- Modify: `src/__tests__/dsl/animateCompletions.test.ts`

- [ ] **Step 16.1: Write end-to-end test**

Append to `src/__tests__/dsl/animateCompletions.test.ts`:

```typescript
import { walkDocument } from '../../dsl/schemaWalker';
import { leavesToAst } from '../../dsl/astAdapter';
import { completionsAt } from '../../dsl/astCompletions';

describe('animate completions end-to-end', () => {
  const dsl = `objects
  card: at 100,100
    bg: rect 160x100 fill midnightblue stroke steelblue width=2
    badge: ellipse 8x8 fill limegreen

animate 3s loop
  1 card.bg.fill: crimson
  `;

  it('header offers flags/kwargs after "animate 3s loop "', () => {
    // Position right after "loop " on the header line
    const cursorText = 'animate 3s loop ';
    const idx = dsl.indexOf(cursorText) + cursorText.length;
    const { ast: ctx } = walkDocument(dsl);
    const ast = leavesToAst(ctx.astLeaves(), dsl.length);
    const { model } = walkDocument(dsl);
    const items = completionsAt(ast, idx, cursorText, model, dsl);
    const l = items.map(i => i.label);
    expect(l).toContain('autoKey');
    expect(l).toContain('easing=');
    expect(l).not.toContain('loop'); // already present
  });

  it('path context offers scene-aware tiered completions', () => {
    // Position at end of document (after "  ")
    const pos = dsl.length;
    const { ast: ctx } = walkDocument(dsl);
    const ast = leavesToAst(ctx.astLeaves(), dsl.length);
    const { model } = walkDocument(dsl);
    // The last line is "  " (fresh indented line) — this is keyframe-start.
    const items = completionsAt(ast, pos, '  ', model, dsl);
    const l = items.map(i => i.label);
    expect(l).toContain('chapter');
    expect(l).toContain('time');
  });

  it('path context after typing "  2 card." offers children', () => {
    const augmented = dsl + '2 card.';
    const pos = augmented.length;
    const { ast: ctx } = walkDocument(augmented);
    const ast = leavesToAst(ctx.astLeaves(), augmented.length);
    const { model } = walkDocument(augmented);
    const items = completionsAt(ast, pos, '  2 card.', model, augmented);
    const l = items.map(i => i.label);
    expect(l).toContain('bg');
    expect(l).toContain('badge');
  });

  it('value context after "card.bg.fill: " offers colors with current first', () => {
    const augmented = dsl + '2 card.bg.fill: ';
    const pos = augmented.length;
    const { ast: ctx } = walkDocument(augmented);
    const ast = leavesToAst(ctx.astLeaves(), augmented.length);
    const { model } = walkDocument(augmented);
    const items = completionsAt(ast, pos, '  2 card.bg.fill: ', model, augmented);
    // First item should be the current value
    expect(items[0].label).toBe('midnightblue');
    // Other colors present
    const l = items.map(i => i.label);
    expect(l).toContain('red');
  });
});
```

- [ ] **Step 16.2: Run tests**

Run: `npx vitest run src/__tests__/dsl/animateCompletions.test.ts -t "end-to-end"`
Expected: PASS (4 tests).

If any test fails, debug by inspecting the actual `items` returned — likely cause is a context-detection mismatch (cursor position relative to section bounds or indent).

- [ ] **Step 16.3: Run full suite**

Run: `npx vitest run`
Expected: PASS (all tests).

- [ ] **Step 16.4: Commit**

```bash
git add src/__tests__/dsl/animateCompletions.test.ts
git commit -m "test(dsl): end-to-end animate completion contexts on real DSL"
```

---

## Task 17: Verify in dev app and tighten any gaps

Manual verification in the running editor, to catch cases the unit tests missed.

**Files:**
- No code changes expected; fixes would go into the relevant handler/router.

- [ ] **Step 17.1: Start dev server**

Run: `npm run dev` (v1) or `npm run dev:v2` (v2)
Leave running in another terminal.

- [ ] **Step 17.2: Manually test header context**

In the editor, type:

```
animate 10s
```

Position cursor after `10s `, press ctrl+space. Verify: `loop`, `autoKey`, `easing=` appear. Type `l` — list filters to `loop`.

- [ ] **Step 17.3: Manually test keyframe-start context**

Add a newline after the animate header. Type two spaces, then ctrl+space. Verify: `chapter`, `time` snippet appear.

- [ ] **Step 17.4: Manually test path context**

Define a simple scene, then type inside the animate block:

```
objects
  box: rect 100x50 fill blue

animate 5s
  1 
```

Cursor after `1 `, ctrl+space. Verify: `box` appears. Type `box.`, ctrl+space. Verify: `fill`, `opacity`, etc. appear with tier markers in the detail field.

- [ ] **Step 17.5: Manually test value context**

Continue typing `box.fill: `. Press ctrl+space. Verify: current color (`blue`) appears first, followed by named colors + `hsl`/`rgb` snippets.

- [ ] **Step 17.6: Fix any gaps discovered**

If any manual test fails in a way unit tests missed, write a unit test that reproduces the failure, then fix. If no gaps found, skip this step.

- [ ] **Step 17.7: Run full suite one final time**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 17.8: Commit any fixes**

```bash
# Only if step 17.6 was needed:
git add <changed files>
git commit -m "fix(dsl): <what was fixed>"
```

---

## Self-Review

Run this checklist after writing the plan above:

**1. Spec coverage.** Trace each in-scope item from the spec:
- Context taxonomy (header, keyframe-start, path, value) — Tasks 5-15 cover each.
- Tiered path completion — Tasks 10-13.
- Schema-driven value completion — Tasks 14-15.
- Header-flags bug fix — Tasks 5-6.
- modelPathWalker utility — Tasks 2-4.
- lineOf/indentOf helpers — Task 1.

**2. Placeholder scan.** Search plan for "TBD", "TODO", "implement later", "handle edge cases", "write tests for the above". None found.

**3. Type consistency.** Check function signatures match between task definitions and usage:
- `resolvePath(modelJson, segments)` — Tasks 2, 4, 12, 14 — consistent.
- `enumerateNextSegments(location)` — Tasks 3, 12 — consistent.
- `currentValueAt(modelJson, path)` — Tasks 4, 11, 14 — consistent.
- `tierCandidate(candidate, prefix, modelJson, animatedPaths)` — Tasks 11, 12 — consistent.
- `animateHeaderCompletions(headerText)` — Tasks 5, 6 — consistent.
- `animatePathCompletions(partialPath, modelJson, animateBlock)` — Tasks 12, 13 — consistent.
- `animateValueCompletions(fullPath, modelJson)` — Tasks 14, 15 — consistent.
- `completionsAt(ast, pos, lineText?, modelJson?, text?)` — all usages match.
