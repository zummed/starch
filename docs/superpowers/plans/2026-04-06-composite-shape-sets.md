# Composite Shape Sets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce namespaced shape sets (core, state) with a search-path `use` declaration, reorganize all existing templates into the core set, and wire up autocompletion and editor popups for shape props.

**Architecture:** Extend the template registry with a `ShapeSet` concept that bundles related shapes with metadata and Zod prop schemas. A DSL-level `use` declaration controls which sets are in scope for unqualified name resolution. The existing `expandTemplates()` pipeline resolves dotted names through the registry. Autocompletion and the click-popup system query the registry for set-level metadata.

**Tech Stack:** TypeScript, Zod, Vitest, ProseMirror (editor integration)

---

### Task 1: ShapeSet Types and Registry Extension

**Files:**
- Modify: `src/templates/registry.ts`
- Test: `src/__tests__/templates/registry.test.ts`

- [ ] **Step 1: Write failing tests for ShapeSet registration and lookup**

Add to `src/__tests__/templates/registry.test.ts`:

```typescript
import { z } from 'zod';
import {
  registerTemplate, getTemplate, expandTemplates, expandTemplate,
  registerSet, getSet, listSets, resolveTemplateName,
  type ShapeSet, type ShapeDefinition,
} from '../../templates/registry';
import { createNode } from '../../types/node';

describe('shape sets', () => {
  it('registers a shape set and retrieves it', () => {
    const testSet: ShapeSet = {
      name: 'test',
      description: 'Test shapes',
      shapes: new Map([
        ['widget', {
          template: (id, props) => createNode({ id }),
          props: z.object({ text: z.string().optional() }),
        }],
      ]),
    };
    registerSet(testSet);
    const retrieved = getSet('test');
    expect(retrieved).toBeDefined();
    expect(retrieved!.name).toBe('test');
    expect(retrieved!.shapes.has('widget')).toBe(true);
  });

  it('lists all registered sets', () => {
    const sets = listSets();
    expect(sets.length).toBeGreaterThanOrEqual(1);
    expect(sets.some(s => s.name === 'test')).toBe(true);
  });

  it('resolves fully-qualified dotted name', () => {
    const fn = getTemplate('test.widget');
    expect(fn).toBeDefined();
  });

  it('resolves unqualified name through search path', () => {
    const fn = resolveTemplateName('widget', ['test']);
    expect(fn).toBeDefined();
  });

  it('returns undefined for unqualified name not in search path', () => {
    const fn = resolveTemplateName('widget', []);
    expect(fn).toBeUndefined();
  });

  it('fully-qualified name works regardless of search path', () => {
    const fn = resolveTemplateName('test.widget', []);
    expect(fn).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/templates/registry.test.ts`
Expected: FAIL — `registerSet`, `getSet`, `listSets`, `resolveTemplateName` not exported

- [ ] **Step 3: Implement ShapeSet types and registry functions**

Edit `src/templates/registry.ts`. Add the following after the existing `templates` Map and before `substituteValue`:

```typescript
import { z } from 'zod';

export interface ShapeDefinition {
  template: TemplateFn;
  props: z.ZodObject<any>;
}

export interface ShapeSet {
  name: string;
  description: string;
  shapes: Map<string, ShapeDefinition>;
}

const shapeSets = new Map<string, ShapeSet>();

export function registerSet(set: ShapeSet): void {
  shapeSets.set(set.name, set);
  for (const [shapeName, def] of set.shapes) {
    templates.set(`${set.name}.${shapeName}`, def.template);
  }
}

export function getSet(name: string): ShapeSet | undefined {
  return shapeSets.get(name);
}

export function listSets(): ShapeSet[] {
  return Array.from(shapeSets.values());
}

export function resolveTemplateName(
  name: string,
  searchPath: string[],
): TemplateFn | undefined {
  // Fully-qualified name (contains dot) — direct lookup
  if (name.includes('.')) {
    return templates.get(name);
  }
  // Unqualified — walk search path
  for (const setName of searchPath) {
    const fn = templates.get(`${setName}.${name}`);
    if (fn) return fn;
  }
  // Fall back to flat template names (for primitives if any remain)
  return templates.get(name);
}
```

Also export the `TemplateFn` type:

```typescript
export type TemplateFn = (id: string, props: Record<string, unknown>) => Node;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/templates/registry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/templates/registry.ts src/__tests__/templates/registry.test.ts
git commit -m "feat: add ShapeSet registry with dotted name resolution and search path"
```

---

### Task 2: Move Existing Templates into Core Set

**Files:**
- Create: `src/templates/sets/core/index.ts`
- Move: `src/templates/builtins/box.ts` → `src/templates/sets/core/box.ts`
- Move: `src/templates/builtins/circle.ts` → `src/templates/sets/core/circle.ts`
- Move: `src/templates/builtins/arrow.ts` → `src/templates/sets/core/arrow.ts`
- Move: `src/templates/builtins/line.ts` → `src/templates/sets/core/line.ts`
- Move: `src/templates/builtins/table.ts` → `src/templates/sets/core/table.ts`
- Move: `src/templates/builtins/textblock.ts` → `src/templates/sets/core/textblock.ts`
- Move: `src/templates/builtins/codeblock.ts` → `src/templates/sets/core/codeblock.ts`
- Create: `src/templates/sets/index.ts`
- Modify: `src/templates/index.ts`
- Delete: `src/templates/builtins/label.ts`
- Delete: `src/templates/builtins/stateNode.ts`
- Delete: `src/templates/builtins/flowchartNode.ts`
- Delete: `src/templates/builtins/sequenceParticipant.ts`
- Modify: `src/__tests__/templates/builtins.test.ts`
- Modify: `src/__tests__/templates/complex.test.ts`
- Test: `src/__tests__/templates/builtins.test.ts`

- [ ] **Step 1: Create directory structure and move template files**

```bash
mkdir -p src/templates/sets/core
# Move files (git mv preserves history)
git mv src/templates/builtins/box.ts src/templates/sets/core/box.ts
git mv src/templates/builtins/circle.ts src/templates/sets/core/circle.ts
git mv src/templates/builtins/arrow.ts src/templates/sets/core/arrow.ts
git mv src/templates/builtins/line.ts src/templates/sets/core/line.ts
git mv src/templates/builtins/table.ts src/templates/sets/core/table.ts
git mv src/templates/builtins/textblock.ts src/templates/sets/core/textblock.ts
git mv src/templates/builtins/codeblock.ts src/templates/sets/core/codeblock.ts
```

- [ ] **Step 2: Fix relative imports in moved files**

Each moved file imports from `../../types/node` and `../../types/color`. After moving one level deeper, update these to `../../../types/node` and `../../../types/color` in all 7 files. Also update `codeblock.ts` which imports from `./textblock` (this stays the same since both moved together).

- [ ] **Step 3: Add Zod prop schemas to each template file**

Add a named export for the props schema alongside each template function. Example for `src/templates/sets/core/box.ts` — add at the bottom:

```typescript
import { z } from 'zod';

export const boxProps = z.object({
  w: z.number().min(1).describe('Width').optional(),
  h: z.number().min(1).describe('Height').optional(),
  radius: z.number().min(0).describe('Corner radius').optional(),
  text: z.string().describe('Label text').optional(),
  textSize: z.number().min(1).describe('Font size').optional(),
  color: z.string().describe('Color (sets stroke + faded fill)').optional(),
  textColor: z.string().describe('Text color').optional(),
});
```

For `circle.ts`:
```typescript
export const circleProps = z.object({
  r: z.number().min(1).describe('Radius').optional(),
  text: z.string().describe('Label text').optional(),
  textSize: z.number().min(1).describe('Font size').optional(),
  color: z.string().describe('Color').optional(),
});
```

For `arrow.ts`:
```typescript
export const arrowProps = z.object({
  from: z.string().describe('Start point (node ID or x,y)'),
  to: z.string().describe('End point (node ID or x,y)'),
  label: z.string().describe('Label text').optional(),
  labelSize: z.number().describe('Label font size').optional(),
  arrow: z.boolean().describe('Show end arrowhead').optional(),
  arrowStart: z.boolean().describe('Show start arrowhead').optional(),
  smooth: z.boolean().describe('Smooth curves').optional(),
  bend: z.number().describe('Bend amount').optional(),
  dashed: z.boolean().describe('Dashed line').optional(),
  gap: z.number().describe('Gap from node edge').optional(),
  color: z.string().describe('Color').optional(),
});
```

For `line.ts`:
```typescript
export const lineProps = z.object({
  from: z.string().describe('Start point'),
  to: z.string().describe('End point'),
  label: z.string().describe('Label text').optional(),
  labelSize: z.number().describe('Label font size').optional(),
  arrow: z.boolean().describe('Show arrowhead').optional(),
  smooth: z.boolean().describe('Smooth curves').optional(),
  bend: z.number().describe('Bend amount').optional(),
  dashed: z.boolean().describe('Dashed line').optional(),
  color: z.string().describe('Color').optional(),
});
```

For `table.ts`:
```typescript
export const tableProps = z.object({
  cols: z.array(z.string()).describe('Column headers'),
  rows: z.array(z.array(z.string())).describe('Row data'),
  colWidth: z.number().describe('Column width').optional(),
  rowHeight: z.number().describe('Row height').optional(),
});
```

For `textblock.ts`:
```typescript
export const textblockProps = z.object({
  lines: z.array(z.string()).describe('Lines of text'),
  size: z.number().describe('Font size').optional(),
  lineHeight: z.number().describe('Line height').optional(),
  mono: z.boolean().describe('Monospace font').optional(),
  bold: z.boolean().describe('Bold text').optional(),
  color: z.string().describe('Text color').optional(),
});
```

For `codeblock.ts`:
```typescript
export const codeblockProps = z.object({
  lines: z.array(z.string()).describe('Lines of code'),
  size: z.number().describe('Font size').optional(),
});
```

- [ ] **Step 4: Create `src/templates/sets/core/index.ts`**

```typescript
import { z } from 'zod';
import type { ShapeSet } from '../../registry';
import { boxTemplate, boxProps } from './box';
import { circleTemplate, circleProps } from './circle';
import { arrowTemplate, arrowProps } from './arrow';
import { lineTemplate, lineProps } from './line';
import { tableTemplate, tableProps } from './table';
import { textblockTemplate, textblockProps } from './textblock';
import { codeblockTemplate, codeblockProps } from './codeblock';

export const coreSet: ShapeSet = {
  name: 'core',
  description: 'General-purpose diagram shapes',
  shapes: new Map([
    ['box', { template: boxTemplate, props: boxProps }],
    ['circle', { template: circleTemplate, props: circleProps }],
    ['arrow', { template: arrowTemplate, props: arrowProps }],
    ['line', { template: lineTemplate, props: lineProps }],
    ['table', { template: tableTemplate, props: tableProps }],
    ['textblock', { template: textblockTemplate, props: textblockProps }],
    ['codeblock', { template: codeblockTemplate, props: codeblockProps }],
  ]),
};
```

- [ ] **Step 5: Create `src/templates/sets/index.ts`**

```typescript
import { registerSet } from '../registry';
import { coreSet } from './core/index';

export function registerAllSets(): void {
  registerSet(coreSet);
}
```

- [ ] **Step 6: Update `src/templates/index.ts`**

Replace the entire file. Remove all builtin imports and registrations. Instead import and call `registerAllSets`:

```typescript
import { registerAllSets } from './sets/index';

export function registerBuiltinTemplates(): void {
  registerAllSets();
}
```

- [ ] **Step 7: Delete removed template files**

```bash
rm src/templates/builtins/label.ts
rm src/templates/builtins/stateNode.ts
rm src/templates/builtins/flowchartNode.ts
rm src/templates/builtins/sequenceParticipant.ts
```

Also delete or empty `src/templates/builtins/` if all files have been moved out. The remaining directory can be removed:

```bash
rm -r src/templates/builtins/
```

- [ ] **Step 8: Update tests**

Update `src/__tests__/templates/builtins.test.ts`:
- Change imports from `../../templates/builtins/box` to `../../templates/sets/core/box`, etc.
- Remove `labelTemplate` tests
- Ensure all remaining tests still reference correct import paths

Update `src/__tests__/templates/complex.test.ts`:
- Remove `flowchartNodeTemplate`, `sequenceParticipantTemplate`, `stateNodeTemplate` tests
- Remove the end-to-end DSL parse tests that use `state-node`, `flowchart-node`, `sequence-participant`
- These will be re-added in Task 4 (state set) with new names

- [ ] **Step 9: Run all tests**

Run: `npx vitest run`
Expected: PASS — all templates resolve via `core.box`, `core.arrow`, etc., and `expandTemplates` still works because `registerSet` registers each shape as a flat dotted name in the templates Map.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor: move existing templates into core shape set, remove label/stateNode/flowchartNode/sequenceParticipant"
```

---

### Task 3: `use` Declaration in DSL and Search Path Resolution

**Files:**
- Modify: `src/types/schemaRegistry.ts` (DocumentSchema)
- Modify: `src/parser/parser.ts` (pass search path to expandTemplates)
- Modify: `src/templates/registry.ts` (expandTemplates uses search path)
- Test: `src/__tests__/templates/registry.test.ts`
- Test: `src/__tests__/parser/parser.test.ts` (or equivalent)

- [ ] **Step 1: Write failing tests for search path resolution in expandTemplates**

Add to `src/__tests__/templates/registry.test.ts`:

```typescript
describe('expandTemplates with search path', () => {
  it('resolves unqualified names through search path', () => {
    const nodes = expandTemplates(
      [{ template: 'box', id: 'b1', props: { w: 100 } }],
      ['core'],
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('b1');
  });

  it('resolves fully-qualified names regardless of search path', () => {
    const nodes = expandTemplates(
      [{ template: 'core.box', id: 'b2', props: { w: 100 } }],
      [],
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('b2');
  });

  it('defaults search path to [core] when not provided', () => {
    const nodes = expandTemplates(
      [{ template: 'box', id: 'b3', props: { w: 100 } }],
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('b3');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/templates/registry.test.ts`
Expected: FAIL — `expandTemplates` doesn't accept a search path argument yet

- [ ] **Step 3: Update `expandTemplates` to accept a search path**

In `src/templates/registry.ts`, modify `expandTemplates`:

```typescript
export function expandTemplates(
  nodes: Array<Record<string, unknown>>,
  searchPath: string[] = ['core'],
): Node[] {
  const result: Node[] = [];
  for (const nodeDef of nodes) {
    if (nodeDef.template && typeof nodeDef.template === 'string') {
      const fn = resolveTemplateName(nodeDef.template, searchPath);
      if (fn) {
        result.push(fn(
          nodeDef.id as string,
          (nodeDef.props as Record<string, unknown>) ?? {},
        ));
        continue;
      }
    }
    const children = Array.isArray(nodeDef.children)
      ? expandTemplates(nodeDef.children as Array<Record<string, unknown>>, searchPath)
      : [];
    result.push(createNode({ ...nodeDef, children } as NodeInput));
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/templates/registry.test.ts`
Expected: PASS

- [ ] **Step 5: Add `use` field to DocumentSchema**

In `src/types/schemaRegistry.ts`, add before the `DocumentSchema` definition:

```typescript
const useField = dsl(
  z.array(z.string()).describe('Shape set search path for unqualified template names'),
  {
    topLevel: true,
    keyword: 'use',
    positional: [{ keys: ['_value'], format: 'bracketList' }],
  },
);
```

Add to `DocumentSchema`:

```typescript
export const DocumentSchema = z.object({
  name: nameField.optional(),
  description: descriptionField.optional(),
  objects: objectsField.optional(),
  styles: stylesField.optional(),
  animate: AnimConfigSchema.describe('Animation configuration').optional(),
  background: backgroundField.optional(),
  viewport: viewportField.optional(),
  images: imagesField.optional(),
  use: useField.optional(),
});
```

- [ ] **Step 6: Pass search path from parser to expandTemplates**

In `src/parser/parser.ts`, extract `use` from the raw model and pass it:

```typescript
export function parseScene(input: string): ParsedScene {
  registerBuiltinTemplates();

  const trimmed = input.trim();
  const raw = walkDocument(trimmed).model;

  // ... existing name/description/background/viewport/images extraction ...

  const searchPath = (raw.use as string[]) ?? ['core'];

  // ... existing style migration ...

  const expanded = expandTemplates((raw.objects ?? []).map(migrateNode), searchPath);

  // ... rest unchanged ...
}
```

- [ ] **Step 7: Run full test suite**

Run: `npx vitest run`
Expected: PASS — existing DSLs work because default search path is `['core']`

- [ ] **Step 8: Commit**

```bash
git add src/templates/registry.ts src/types/schemaRegistry.ts src/parser/parser.ts src/__tests__/templates/registry.test.ts
git commit -m "feat: add use declaration for shape set search path, default [core]"
```

---

### Task 4: State Shape Set

**Files:**
- Create: `src/templates/sets/state/index.ts`
- Create: `src/templates/sets/state/node.ts`
- Create: `src/templates/sets/state/initial.ts`
- Create: `src/templates/sets/state/final.ts`
- Create: `src/templates/sets/state/region.ts`
- Create: `src/templates/sets/state/choice.ts`
- Modify: `src/templates/sets/index.ts`
- Test: `src/__tests__/templates/state.test.ts`

- [ ] **Step 1: Write failing tests for state shapes**

Create `src/__tests__/templates/state.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { registerBuiltinTemplates } from '../../templates/index';
import { expandTemplates } from '../../templates/registry';

beforeAll(() => {
  registerBuiltinTemplates();
});

describe('state.node', () => {
  it('creates a state node with name, bg, and no divider when no actions', () => {
    const nodes = expandTemplates([
      { template: 'state.node', id: 's1', props: { name: 'Idle' } },
    ]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('s1');
    const bg = nodes[0].children.find(c => c.id === 's1.bg');
    expect(bg?.rect).toBeDefined();
    expect(bg?.rect!.radius).toBe(16);
    const name = nodes[0].children.find(c => c.id === 's1.name');
    expect(name?.text?.content).toBe('Idle');
    const divider = nodes[0].children.find(c => c.id === 's1.divider');
    expect(divider).toBeUndefined();
  });

  it('creates divider and action labels when entry/exit provided', () => {
    const nodes = expandTemplates([
      { template: 'state.node', id: 's2', props: { name: 'Active', entry: 'startTimer', exit: 'stopTimer' } },
    ]);
    const node = nodes[0];
    expect(node.children.find(c => c.id === 's2.divider')).toBeDefined();
    expect(node.children.find(c => c.id === 's2.entry')?.text?.content).toContain('startTimer');
    expect(node.children.find(c => c.id === 's2.exit')?.text?.content).toContain('stopTimer');
  });

  it('applies color to stroke and faded fill', () => {
    const nodes = expandTemplates([
      { template: 'state.node', id: 's3', props: { name: 'Test', color: 'steelblue' } },
    ]);
    const bg = nodes[0].children.find(c => c.id === 's3.bg');
    expect(bg?.stroke).toBeDefined();
    expect(bg?.fill).toBeDefined();
  });
});

describe('state.initial', () => {
  it('creates a filled circle', () => {
    const nodes = expandTemplates([
      { template: 'state.initial', id: 'start', props: {} },
    ]);
    const dot = nodes[0].children.find(c => c.id === 'start.dot');
    expect(dot?.ellipse).toBeDefined();
    expect(dot?.fill).toBeDefined();
  });
});

describe('state.final', () => {
  it('creates outer and inner circles', () => {
    const nodes = expandTemplates([
      { template: 'state.final', id: 'end', props: {} },
    ]);
    const outer = nodes[0].children.find(c => c.id === 'end.outer');
    const inner = nodes[0].children.find(c => c.id === 'end.inner');
    expect(outer?.ellipse).toBeDefined();
    expect(outer?.stroke).toBeDefined();
    expect(inner?.ellipse).toBeDefined();
    expect(inner?.fill).toBeDefined();
  });
});

describe('state.choice', () => {
  it('creates a diamond path', () => {
    const nodes = expandTemplates([
      { template: 'state.choice', id: 'ch', props: {} },
    ]);
    const diamond = nodes[0].children.find(c => c.id === 'ch.diamond');
    expect(diamond?.path).toBeDefined();
    expect(diamond?.path!.points).toHaveLength(4);
    expect(diamond?.path!.closed).toBe(true);
  });
});

describe('state.region', () => {
  it('creates a labeled container with dashed stroke', () => {
    const nodes = expandTemplates([
      { template: 'state.region', id: 'r1', props: { label: 'Region A' } },
    ]);
    const bg = nodes[0].children.find(c => c.id === 'r1.bg');
    expect(bg?.rect).toBeDefined();
    expect(bg?.dash).toBeDefined();
    const title = nodes[0].children.find(c => c.id === 'r1.title');
    expect(title?.text?.content).toBe('Region A');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/templates/state.test.ts`
Expected: FAIL — state templates not registered

- [ ] **Step 3: Implement `state.node`**

Create `src/templates/sets/state/node.ts`:

```typescript
import { z } from 'zod';
import type { Node } from '../../../types/node';
import { createNode } from '../../../types/node';
import { parseColor } from '../../../types/color';
import type { HslColor } from '../../../types/properties';

export const stateNodeProps = z.object({
  name: z.string().describe('State name'),
  entry: z.string().describe('Entry action').optional(),
  exit: z.string().describe('Exit action').optional(),
  color: z.string().describe('Color').optional(),
  w: z.number().min(1).describe('Width').optional(),
  h: z.number().min(1).describe('Height').optional(),
});

export function stateNodeTemplate(id: string, props: Record<string, unknown>): Node {
  const name = (props.name as string) ?? id;
  const w = (props.w as number) ?? 140;
  const h = (props.h as number) ?? 60;
  const entry = props.entry as string | undefined;
  const exit = props.exit as string | undefined;

  let fill: HslColor = { h: 30, s: 30, l: 20 };
  let stroke: HslColor = { h: 30, s: 50, l: 50 };

  if (props.colour || props.color) {
    const raw = (props.colour ?? props.color) as unknown;
    const hsl = typeof raw === 'string' ? parseColor(raw) : raw as HslColor;
    stroke = hsl;
    fill = { ...hsl, a: 0.15 };
  }

  const children: Node[] = [
    createNode({
      id: `${id}.bg`,
      rect: { w, h, radius: 16 },
      fill,
      stroke: { color: stroke, width: 2 },
    }),
    createNode({
      id: `${id}.name`,
      text: { content: name, size: 14, bold: true, align: 'middle' },
      fill: { h: 0, s: 0, l: 90 },
      transform: { x: w / 2, y: entry || exit ? 18 : h / 2 },
    }),
  ];

  if (entry || exit) {
    children.push(createNode({
      id: `${id}.divider`,
      path: { points: [[8, 30], [w - 8, 30]], closed: false },
      stroke: { color: stroke, width: 1 },
    }));

    let actionY = 40;
    if (entry) {
      children.push(createNode({
        id: `${id}.entry`,
        text: { content: `entry / ${entry}`, size: 10, align: 'start' },
        fill: { h: 0, s: 0, l: 70 },
        transform: { x: 12, y: actionY },
      }));
      actionY += 14;
    }
    if (exit) {
      children.push(createNode({
        id: `${id}.exit`,
        text: { content: `exit / ${exit}`, size: 10, align: 'start' },
        fill: { h: 0, s: 0, l: 70 },
        transform: { x: 12, y: actionY },
      }));
    }
  }

  return createNode({
    id,
    children,
    ...(props.transform ? { transform: props.transform as any } : {}),
    ...(props.opacity !== undefined ? { opacity: props.opacity as number } : {}),
  });
}
```

- [ ] **Step 4: Implement `state.initial`**

Create `src/templates/sets/state/initial.ts`:

```typescript
import { z } from 'zod';
import type { Node } from '../../../types/node';
import { createNode } from '../../../types/node';
import { parseColor } from '../../../types/color';
import type { HslColor } from '../../../types/properties';

export const stateInitialProps = z.object({
  color: z.string().describe('Color').optional(),
  r: z.number().min(1).describe('Radius').optional(),
});

export function stateInitialTemplate(id: string, props: Record<string, unknown>): Node {
  const r = (props.r as number) ?? 8;
  let fill: HslColor = { h: 0, s: 0, l: 80 };

  if (props.colour || props.color) {
    const raw = (props.colour ?? props.color) as unknown;
    fill = typeof raw === 'string' ? parseColor(raw) : raw as HslColor;
  }

  return createNode({
    id,
    children: [
      createNode({
        id: `${id}.dot`,
        ellipse: { rx: r, ry: r },
        fill,
      }),
    ],
    ...(props.transform ? { transform: props.transform as any } : {}),
  });
}
```

- [ ] **Step 5: Implement `state.final`**

Create `src/templates/sets/state/final.ts`:

```typescript
import { z } from 'zod';
import type { Node } from '../../../types/node';
import { createNode } from '../../../types/node';
import { parseColor } from '../../../types/color';
import type { HslColor } from '../../../types/properties';

export const stateFinalProps = z.object({
  color: z.string().describe('Color').optional(),
  r: z.number().min(1).describe('Radius').optional(),
});

export function stateFinalTemplate(id: string, props: Record<string, unknown>): Node {
  const r = (props.r as number) ?? 10;
  let color: HslColor = { h: 0, s: 0, l: 80 };

  if (props.colour || props.color) {
    const raw = (props.colour ?? props.color) as unknown;
    color = typeof raw === 'string' ? parseColor(raw) : raw as HslColor;
  }

  return createNode({
    id,
    children: [
      createNode({
        id: `${id}.outer`,
        ellipse: { rx: r, ry: r },
        stroke: { color, width: 2 },
      }),
      createNode({
        id: `${id}.inner`,
        ellipse: { rx: r * 0.6, ry: r * 0.6 },
        fill: color,
      }),
    ],
    ...(props.transform ? { transform: props.transform as any } : {}),
  });
}
```

- [ ] **Step 6: Implement `state.choice`**

Create `src/templates/sets/state/choice.ts`:

```typescript
import { z } from 'zod';
import type { Node } from '../../../types/node';
import { createNode } from '../../../types/node';
import { parseColor } from '../../../types/color';
import type { HslColor } from '../../../types/properties';

export const stateChoiceProps = z.object({
  color: z.string().describe('Color').optional(),
  size: z.number().min(1).describe('Diamond size').optional(),
});

export function stateChoiceTemplate(id: string, props: Record<string, unknown>): Node {
  const size = (props.size as number) ?? 20;
  let fill: HslColor = { h: 30, s: 30, l: 20 };
  let stroke: HslColor = { h: 30, s: 50, l: 50 };

  if (props.colour || props.color) {
    const raw = (props.colour ?? props.color) as unknown;
    const hsl = typeof raw === 'string' ? parseColor(raw) : raw as HslColor;
    stroke = hsl;
    fill = { ...hsl, a: 0.15 };
  }

  return createNode({
    id,
    children: [
      createNode({
        id: `${id}.diamond`,
        path: {
          points: [[size, 0], [size * 2, size], [size, size * 2], [0, size]],
          closed: true,
        },
        fill,
        stroke: { color: stroke, width: 2 },
      }),
    ],
    ...(props.transform ? { transform: props.transform as any } : {}),
  });
}
```

- [ ] **Step 7: Implement `state.region`**

Create `src/templates/sets/state/region.ts`:

```typescript
import { z } from 'zod';
import type { Node } from '../../../types/node';
import { createNode } from '../../../types/node';
import { parseColor } from '../../../types/color';
import type { HslColor } from '../../../types/properties';

export const stateRegionProps = z.object({
  label: z.string().describe('Region label'),
  color: z.string().describe('Color').optional(),
  w: z.number().min(1).describe('Width').optional(),
  h: z.number().min(1).describe('Height').optional(),
  direction: z.enum(['row', 'column']).describe('Layout direction').optional(),
  gap: z.number().min(0).describe('Gap between children').optional(),
});

export function stateRegionTemplate(id: string, props: Record<string, unknown>): Node {
  const label = (props.label as string) ?? '';
  const w = (props.w as number) ?? 300;
  const h = (props.h as number) ?? 200;
  const direction = (props.direction as 'row' | 'column') ?? 'row';
  const gap = (props.gap as number) ?? 16;

  let stroke: HslColor = { h: 0, s: 0, l: 50 };
  let fill: HslColor = { h: 0, s: 0, l: 15, a: 0.3 };

  if (props.colour || props.color) {
    const raw = (props.colour ?? props.color) as unknown;
    const hsl = typeof raw === 'string' ? parseColor(raw) : raw as HslColor;
    stroke = hsl;
    fill = { ...hsl, a: 0.08 };
  }

  return createNode({
    id,
    children: [
      createNode({
        id: `${id}.bg`,
        rect: { w, h, radius: 8 },
        fill,
        stroke: { color: stroke, width: 1 },
        dash: { pattern: 'dashed', length: 6, gap: 4 },
      }),
      createNode({
        id: `${id}.title`,
        text: { content: label, size: 11, bold: true, align: 'start' },
        fill: { h: 0, s: 0, l: 70 },
        transform: { x: 10, y: 14 },
      }),
    ],
    layout: { type: 'flex', direction, gap, padding: 30 },
    ...(props.transform ? { transform: props.transform as any } : {}),
  });
}
```

- [ ] **Step 8: Create `src/templates/sets/state/index.ts`**

```typescript
import type { ShapeSet } from '../../registry';
import { stateNodeTemplate, stateNodeProps } from './node';
import { stateInitialTemplate, stateInitialProps } from './initial';
import { stateFinalTemplate, stateFinalProps } from './final';
import { stateRegionTemplate, stateRegionProps } from './region';
import { stateChoiceTemplate, stateChoiceProps } from './choice';

export const stateSet: ShapeSet = {
  name: 'state',
  description: 'State chart shapes',
  shapes: new Map([
    ['node', { template: stateNodeTemplate, props: stateNodeProps }],
    ['initial', { template: stateInitialTemplate, props: stateInitialProps }],
    ['final', { template: stateFinalTemplate, props: stateFinalProps }],
    ['region', { template: stateRegionTemplate, props: stateRegionProps }],
    ['choice', { template: stateChoiceTemplate, props: stateChoiceProps }],
  ]),
};
```

- [ ] **Step 9: Register state set in `src/templates/sets/index.ts`**

```typescript
import { registerSet } from '../registry';
import { coreSet } from './core/index';
import { stateSet } from './state/index';

export function registerAllSets(): void {
  registerSet(coreSet);
  registerSet(stateSet);
}
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/templates/state.test.ts`
Expected: PASS

- [ ] **Step 11: Run full test suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 12: Commit**

```bash
git add src/templates/sets/state/ src/templates/sets/index.ts src/__tests__/templates/state.test.ts
git commit -m "feat: add state shape set with node, initial, final, region, choice"
```

---

### Task 5: New Core Shapes (pill, card, note, group)

**Files:**
- Create: `src/templates/sets/core/pill.ts`
- Create: `src/templates/sets/core/card.ts`
- Create: `src/templates/sets/core/note.ts`
- Create: `src/templates/sets/core/group.ts`
- Modify: `src/templates/sets/core/index.ts`
- Test: `src/__tests__/templates/core-shapes.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/templates/core-shapes.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { registerBuiltinTemplates } from '../../templates/index';
import { expandTemplates } from '../../templates/registry';

beforeAll(() => {
  registerBuiltinTemplates();
});

describe('core.pill', () => {
  it('creates a rounded rect with centered text', () => {
    const nodes = expandTemplates([
      { template: 'core.pill', id: 'p1', props: { text: 'Active' } },
    ]);
    expect(nodes).toHaveLength(1);
    const bg = nodes[0].children.find(c => c.id === 'p1.bg');
    expect(bg?.rect).toBeDefined();
    expect(bg?.rect!.radius).toBeGreaterThanOrEqual(15);
    const label = nodes[0].children.find(c => c.id === 'p1.label');
    expect(label?.text?.content).toBe('Active');
  });

  it('applies color to stroke and faded fill', () => {
    const nodes = expandTemplates([
      { template: 'core.pill', id: 'p2', props: { text: 'OK', color: 'green' } },
    ]);
    const bg = nodes[0].children.find(c => c.id === 'p2.bg');
    expect(bg?.stroke).toBeDefined();
    expect(bg?.fill).toBeDefined();
  });
});

describe('core.card', () => {
  it('creates title, divider, and optional body', () => {
    const nodes = expandTemplates([
      { template: 'core.card', id: 'c1', props: { title: 'Header', body: 'Details here' } },
    ]);
    const node = nodes[0];
    expect(node.children.find(c => c.id === 'c1.bg')?.rect).toBeDefined();
    expect(node.children.find(c => c.id === 'c1.header')?.text?.content).toBe('Header');
    expect(node.children.find(c => c.id === 'c1.divider')?.path).toBeDefined();
    expect(node.children.find(c => c.id === 'c1.body')?.text?.content).toBe('Details here');
  });

  it('omits body when not provided', () => {
    const nodes = expandTemplates([
      { template: 'core.card', id: 'c2', props: { title: 'Title Only' } },
    ]);
    expect(nodes[0].children.find(c => c.id === 'c2.body')).toBeUndefined();
  });
});

describe('core.note', () => {
  it('creates a rect with fold and text', () => {
    const nodes = expandTemplates([
      { template: 'core.note', id: 'n1', props: { text: 'Remember this' } },
    ]);
    const node = nodes[0];
    expect(node.children.find(c => c.id === 'n1.bg')?.rect).toBeDefined();
    expect(node.children.find(c => c.id === 'n1.fold')?.path).toBeDefined();
    expect(node.children.find(c => c.id === 'n1.label')?.text?.content).toBe('Remember this');
  });
});

describe('core.group', () => {
  it('creates a labeled container with dashed stroke', () => {
    const nodes = expandTemplates([
      { template: 'core.group', id: 'g1', props: { label: 'Group A' } },
    ]);
    const node = nodes[0];
    const bg = node.children.find(c => c.id === 'g1.bg');
    expect(bg?.rect).toBeDefined();
    expect(bg?.dash).toBeDefined();
    expect(node.children.find(c => c.id === 'g1.title')?.text?.content).toBe('Group A');
    expect(node.layout).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/templates/core-shapes.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `core.pill`**

Create `src/templates/sets/core/pill.ts`:

```typescript
import { z } from 'zod';
import type { Node } from '../../../types/node';
import { createNode } from '../../../types/node';
import { parseColor } from '../../../types/color';
import type { HslColor } from '../../../types/properties';

export const pillProps = z.object({
  text: z.string().describe('Label text'),
  color: z.string().describe('Color').optional(),
  w: z.number().min(1).describe('Width').optional(),
  h: z.number().min(1).describe('Height').optional(),
});

export function pillTemplate(id: string, props: Record<string, unknown>): Node {
  const text = (props.text as string) ?? '';
  const w = (props.w as number) ?? 80;
  const h = (props.h as number) ?? 30;
  const radius = Math.min(w, h) / 2;

  let fill: HslColor | undefined;
  let stroke: HslColor | undefined;

  if (props.colour || props.color) {
    const raw = (props.colour ?? props.color) as unknown;
    const hsl = typeof raw === 'string' ? parseColor(raw) : raw as HslColor;
    stroke = hsl;
    fill = { ...hsl, a: 0.15 };
  }

  return createNode({
    id,
    children: [
      createNode({
        id: `${id}.bg`,
        rect: { w, h, radius },
        ...(fill ? { fill } : {}),
        ...(stroke ? { stroke: { color: stroke, width: 2 } } : {}),
      }),
      createNode({
        id: `${id}.label`,
        text: { content: text, size: 12, align: 'middle' },
        fill: { h: 0, s: 0, l: 90 },
        transform: { x: w / 2, y: h / 2 },
      }),
    ],
    ...(props.transform ? { transform: props.transform as any } : {}),
    ...(props.opacity !== undefined ? { opacity: props.opacity as number } : {}),
  });
}
```

- [ ] **Step 4: Implement `core.card`**

Create `src/templates/sets/core/card.ts`:

```typescript
import { z } from 'zod';
import type { Node } from '../../../types/node';
import { createNode } from '../../../types/node';
import { parseColor } from '../../../types/color';
import type { HslColor } from '../../../types/properties';

export const cardProps = z.object({
  title: z.string().describe('Card title'),
  body: z.string().describe('Body text').optional(),
  color: z.string().describe('Color').optional(),
  w: z.number().min(1).describe('Width').optional(),
  h: z.number().min(1).describe('Height').optional(),
});

export function cardTemplate(id: string, props: Record<string, unknown>): Node {
  const title = (props.title as string) ?? '';
  const body = props.body as string | undefined;
  const w = (props.w as number) ?? 180;
  const h = (props.h as number) ?? 100;

  let fill: HslColor | undefined;
  let stroke: HslColor | undefined;

  if (props.colour || props.color) {
    const raw = (props.colour ?? props.color) as unknown;
    const hsl = typeof raw === 'string' ? parseColor(raw) : raw as HslColor;
    stroke = hsl;
    fill = { ...hsl, a: 0.15 };
  }

  const headerY = 20;
  const dividerY = 32;

  const children: Node[] = [
    createNode({
      id: `${id}.bg`,
      rect: { w, h, radius: 6 },
      ...(fill ? { fill } : {}),
      ...(stroke ? { stroke: { color: stroke, width: 2 } } : {}),
    }),
    createNode({
      id: `${id}.header`,
      text: { content: title, size: 14, bold: true, align: 'middle' },
      fill: { h: 0, s: 0, l: 90 },
      transform: { x: w / 2, y: headerY },
    }),
    createNode({
      id: `${id}.divider`,
      path: { points: [[6, dividerY], [w - 6, dividerY]], closed: false },
      stroke: { color: stroke ?? { h: 0, s: 0, l: 40 }, width: 1 },
    }),
  ];

  if (body) {
    children.push(createNode({
      id: `${id}.body`,
      text: { content: body, size: 11, align: 'start' },
      fill: { h: 0, s: 0, l: 70 },
      transform: { x: 10, y: dividerY + 16 },
    }));
  }

  return createNode({
    id,
    children,
    ...(props.transform ? { transform: props.transform as any } : {}),
    ...(props.opacity !== undefined ? { opacity: props.opacity as number } : {}),
  });
}
```

- [ ] **Step 5: Implement `core.note`**

Create `src/templates/sets/core/note.ts`:

```typescript
import { z } from 'zod';
import type { Node } from '../../../types/node';
import { createNode } from '../../../types/node';
import { parseColor } from '../../../types/color';
import type { HslColor } from '../../../types/properties';

export const noteProps = z.object({
  text: z.string().describe('Note text'),
  color: z.string().describe('Color').optional(),
  w: z.number().min(1).describe('Width').optional(),
  h: z.number().min(1).describe('Height').optional(),
});

export function noteTemplate(id: string, props: Record<string, unknown>): Node {
  const text = (props.text as string) ?? '';
  const w = (props.w as number) ?? 140;
  const h = (props.h as number) ?? 80;
  const foldSize = 12;

  // Default to a pale yellow if no color given
  let fill: HslColor = { h: 50, s: 60, l: 25 };
  let stroke: HslColor = { h: 50, s: 50, l: 45 };

  if (props.colour || props.color) {
    const raw = (props.colour ?? props.color) as unknown;
    const hsl = typeof raw === 'string' ? parseColor(raw) : raw as HslColor;
    stroke = hsl;
    fill = { ...hsl, a: 0.15 };
  }

  return createNode({
    id,
    children: [
      createNode({
        id: `${id}.bg`,
        rect: { w, h, radius: 2 },
        fill,
        stroke: { color: stroke, width: 1 },
      }),
      createNode({
        id: `${id}.fold`,
        path: {
          points: [[w - foldSize, 0], [w, foldSize], [w - foldSize, foldSize]],
          closed: true,
        },
        fill: stroke,
      }),
      createNode({
        id: `${id}.label`,
        text: { content: text, size: 12, align: 'start' },
        fill: { h: 0, s: 0, l: 85 },
        transform: { x: 8, y: 20 },
      }),
    ],
    ...(props.transform ? { transform: props.transform as any } : {}),
    ...(props.opacity !== undefined ? { opacity: props.opacity as number } : {}),
  });
}
```

- [ ] **Step 6: Implement `core.group`**

Create `src/templates/sets/core/group.ts`:

```typescript
import { z } from 'zod';
import type { Node } from '../../../types/node';
import { createNode } from '../../../types/node';
import { parseColor } from '../../../types/color';
import type { HslColor } from '../../../types/properties';

export const groupProps = z.object({
  label: z.string().describe('Group label'),
  color: z.string().describe('Color').optional(),
  w: z.number().min(1).describe('Width').optional(),
  h: z.number().min(1).describe('Height').optional(),
  direction: z.enum(['row', 'column']).describe('Layout direction').optional(),
  gap: z.number().min(0).describe('Gap between children').optional(),
});

export function groupTemplate(id: string, props: Record<string, unknown>): Node {
  const label = (props.label as string) ?? '';
  const w = (props.w as number) ?? 300;
  const h = (props.h as number) ?? 200;
  const direction = (props.direction as 'row' | 'column') ?? 'row';
  const gap = (props.gap as number) ?? 16;

  let stroke: HslColor = { h: 0, s: 0, l: 50 };
  let fill: HslColor = { h: 0, s: 0, l: 15, a: 0.3 };

  if (props.colour || props.color) {
    const raw = (props.colour ?? props.color) as unknown;
    const hsl = typeof raw === 'string' ? parseColor(raw) : raw as HslColor;
    stroke = hsl;
    fill = { ...hsl, a: 0.08 };
  }

  return createNode({
    id,
    children: [
      createNode({
        id: `${id}.bg`,
        rect: { w, h, radius: 6 },
        fill,
        stroke: { color: stroke, width: 1 },
        dash: { pattern: 'dashed', length: 6, gap: 4 },
      }),
      createNode({
        id: `${id}.title`,
        text: { content: label, size: 11, bold: true, align: 'start' },
        fill: { h: 0, s: 0, l: 70 },
        transform: { x: 10, y: 14 },
      }),
    ],
    layout: { type: 'flex', direction, gap, padding: 30 },
    ...(props.transform ? { transform: props.transform as any } : {}),
    ...(props.opacity !== undefined ? { opacity: props.opacity as number } : {}),
  });
}
```

- [ ] **Step 7: Register new shapes in `src/templates/sets/core/index.ts`**

Add imports and entries to the shapes Map:

```typescript
import { pillTemplate, pillProps } from './pill';
import { cardTemplate, cardProps } from './card';
import { noteTemplate, noteProps } from './note';
import { groupTemplate, groupProps } from './group';
```

Add to the Map:
```typescript
['pill', { template: pillTemplate, props: pillProps }],
['card', { template: cardTemplate, props: cardProps }],
['note', { template: noteTemplate, props: noteProps }],
['group', { template: groupTemplate, props: groupProps }],
```

- [ ] **Step 8: Run tests**

Run: `npx vitest run src/__tests__/templates/core-shapes.test.ts`
Expected: PASS

- [ ] **Step 9: Run full test suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/templates/sets/core/ src/__tests__/templates/core-shapes.test.ts
git commit -m "feat: add core shapes — pill, card, note, group"
```

---

### Task 6: Autocompletion for Shape Sets

**Files:**
- Modify: `src/dsl/astCompletions.ts`
- Modify: `src/templates/registry.ts` (if needed for query helpers)
- Test: `src/__tests__/dsl/astCompletions.test.ts`

- [ ] **Step 1: Write failing tests for shape set completions**

Add to `src/__tests__/dsl/astCompletions.test.ts`:

```typescript
describe('shape set completions', () => {
  it('suggests set prefixes after node id + colon', () => {
    const items = completionsAt(ast, pos, 'mynode: ');
    const labels = items.map(i => i.label);
    // Should include both geometry keywords AND set prefixes
    expect(labels).toContain('core');
    expect(labels).toContain('state');
  });

  it('suggests shapes within a set after dot', () => {
    const items = completionsAt(ast, pos, 'mynode: state.');
    const labels = items.map(i => i.label);
    expect(labels).toContain('node');
    expect(labels).toContain('initial');
    expect(labels).toContain('final');
    expect(labels).toContain('region');
    expect(labels).toContain('choice');
  });

  it('suggests set names after use keyword', () => {
    const items = completionsAt(ast, pos, 'use ');
    const labels = items.map(i => i.label);
    expect(labels).toContain('core');
    expect(labels).toContain('state');
  });
});
```

Note: the exact test setup (ast, pos) will need to match the existing test patterns in this file. Adapt the helpers used in the existing tests.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/dsl/astCompletions.test.ts`
Expected: FAIL — no set prefix completions yet

- [ ] **Step 3: Add registry query helper**

In `src/templates/registry.ts`, add:

```typescript
export function getSetNames(): string[] {
  return Array.from(shapeSets.keys());
}

export function getShapeNames(setName: string): string[] {
  const set = shapeSets.get(setName);
  if (!set) return [];
  return Array.from(set.shapes.keys());
}

export function getShapeDefinition(setName: string, shapeName: string): ShapeDefinition | undefined {
  return shapeSets.get(setName)?.shapes.get(shapeName);
}
```

- [ ] **Step 4: Add set completions to `astCompletions.ts`**

In `src/dsl/astCompletions.ts`, import the registry helpers:

```typescript
import { getSetNames, getShapeNames } from '../templates/registry';
```

In `lineTextCompletions()`, add a branch for set prefix completion. After the `id:` geometry keywords branch and before the keyword+space branch, add:

```typescript
// After set prefix + dot: offer shapes in that set
const setDotMatch = lineText.match(/\b(\w+)\.\s*(\w*)$/);
if (setDotMatch) {
  const setName = setDotMatch[1];
  const shapes = getShapeNames(setName);
  if (shapes.length > 0) {
    return shapes.map(name => ({
      label: name,
      type: 'keyword',
      detail: `${setName} shape`,
      snippetTemplate: `${name} `,
    }));
  }
}
```

In the geometry keywords section (the `id:` match), add set prefixes alongside geometry keywords:

```typescript
// Add shape set prefixes as retrigger completions
const setItems: CompletionItem[] = getSetNames().map(name => ({
  label: name,
  type: 'keyword',
  detail: 'Shape set',
  retrigger: true,
}));
return [...GEOMETRY_KEYWORDS.map(g => { /* existing logic */ }), ...setItems];
```

Add a branch for `use` keyword completions:

```typescript
// After 'use' keyword: offer set names
if (keywordMatch && keywordMatch[1] === 'use') {
  return getSetNames().map(name => ({
    label: name,
    type: 'value',
    detail: 'Shape set',
  }));
}
```

Add `use` to the `templates` Record in `buildTopLevelKeywords()`:

```typescript
const templates: Record<string, string> = {
  // ... existing entries ...
  use: 'use [${1:core}]',
};
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/__tests__/dsl/astCompletions.test.ts`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/dsl/astCompletions.ts src/templates/registry.ts src/__tests__/dsl/astCompletions.test.ts
git commit -m "feat: autocompletion for shape set prefixes and shape names"
```

---

### Task 7: Editor Popups for Shape Template Props

**Files:**
- Modify: `src/editor/plugins/clickPopupPlugin.ts`
- Test: `src/__tests__/editor/clickPopup.test.ts` (if popup tests exist)

- [ ] **Step 1: Write failing test for template prop popup detection**

Add to popup tests:

```typescript
describe('template prop popup', () => {
  it('detects template instance and resolves props schema', () => {
    // Test that clicking on a template prop value in DSL like:
    //   mybox: box w=200
    // detects the 'w' prop and resolves to number type
    const state = detectPopupAt(/* DSL with template usage, click on prop value */);
    expect(state?.schemaType).toBe('number');
  });
});
```

Note: adapt this to use the existing `detectPopupAt` test helper and fixture DSL patterns in `clickPopup.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/editor/clickPopup.test.ts`
Expected: FAIL

- [ ] **Step 3: Extend `clickPopupPlugin.ts` to resolve template prop schemas**

In the `detectPopupAt()` function, after the existing schema resolution logic, add a fallback that checks if the node is a template instance:

```typescript
import { getSetNames, getShapeDefinition } from '../../templates/registry';

// In detectPopupAt(), after existing resolvePropertySchema() call:
// If standard resolution failed and we're inside a template's props:
if (!schema && templateName) {
  // Parse "setName.shapeName" or resolve through search path
  const dotIdx = templateName.indexOf('.');
  if (dotIdx >= 0) {
    const setName = templateName.slice(0, dotIdx);
    const shapeName = templateName.slice(dotIdx + 1);
    const shapeDef = getShapeDefinition(setName, shapeName);
    if (shapeDef && propKey) {
      const propSchema = shapeDef.props.shape[propKey];
      if (propSchema) {
        schema = propSchema;
        schemaType = detectSchemaType(propSchema);
      }
    }
  }
}
```

The exact integration point depends on how `detectPopupAt()` identifies the template name and prop key from the AST. The AST should already contain `template` and `props` information from `schemaWalker`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/__tests__/editor/clickPopup.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/editor/plugins/clickPopupPlugin.ts src/__tests__/editor/clickPopup.test.ts
git commit -m "feat: editor popups for shape template props via props schema"
```

---

### Task 8: End-to-End Integration Test

**Files:**
- Test: `src/__tests__/templates/integration.test.ts`

- [ ] **Step 1: Write end-to-end test**

Create `src/__tests__/templates/integration.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseScene } from '../../parser/parser';

describe('shape sets end-to-end', () => {
  it('parses DSL with core shapes using default search path', () => {
    const scene = parseScene(`
      header: box w=200 h=40 text="Title" color=steelblue
      status: pill text="Active" color=green
    `);
    expect(scene.nodes.find(n => n.id === 'header')).toBeDefined();
    expect(scene.nodes.find(n => n.id === 'status')).toBeDefined();
  });

  it('parses DSL with state shapes using use declaration', () => {
    const scene = parseScene(`
      use [core, state]

      idle: state.node name="Idle" color=steelblue
      start: state.initial
      end: state.final
    `);
    const idle = scene.nodes.find(n => n.id === 'idle');
    expect(idle).toBeDefined();
    expect(idle!.children.find(c => c.id === 'idle.bg')).toBeDefined();
    expect(idle!.children.find(c => c.id === 'idle.name')).toBeDefined();

    const start = scene.nodes.find(n => n.id === 'start');
    expect(start).toBeDefined();
    expect(start!.children.find(c => c.id === 'start.dot')).toBeDefined();

    const end = scene.nodes.find(n => n.id === 'end');
    expect(end).toBeDefined();
  });

  it('resolves unqualified state names when state is in use path', () => {
    const scene = parseScene(`
      use [core, state]

      s1: node name="Ready"
    `);
    const s1 = scene.nodes.find(n => n.id === 's1');
    expect(s1).toBeDefined();
    expect(s1!.children.find(c => c.id === 's1.name')?.text?.content).toBe('Ready');
  });

  it('fully-qualified names work without use declaration', () => {
    const scene = parseScene(`
      s1: state.node name="Idle"
    `);
    expect(scene.nodes.find(n => n.id === 's1')).toBeDefined();
  });

  it('core.group creates a container with layout', () => {
    const scene = parseScene(`
      g: group label="My Group" direction=column gap=10
    `);
    const g = scene.nodes.find(n => n.id === 'g');
    expect(g).toBeDefined();
    expect(g!.layout).toBeDefined();
    expect(g!.children.find(c => c.id === 'g.title')?.text?.content).toBe('My Group');
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run src/__tests__/templates/integration.test.ts`
Expected: PASS (if all prior tasks are done correctly)

If any tests fail, debug and fix the issue in the relevant task's code.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/templates/integration.test.ts
git commit -m "test: end-to-end integration tests for shape sets"
```
