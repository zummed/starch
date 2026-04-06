# Shape Set Positional Syntax Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make shape set shapes feel like primitives — positional args, snippet templates, and full autocomplete help, all driven by `dsl()` hints on existing zod schemas.

**Architecture:** Wrap each shape's existing `props` zod schema with `dsl()` (the same mechanism primitives use). Update the template prop parser in `hintExecutors.ts` to call `executePositional()` before the key=val loop. Update the completion system in `astCompletions.ts` to look up shape schemas from the registry for snippet generation.

**Tech Stack:** TypeScript, Zod, Vitest

---

### Task 1: Add `dsl()` hints to core text+dimension shapes

Wrap `boxProps`, `pillProps`, `noteProps`, `cardProps`, `groupProps` with `dsl()` hints declaring their positional args.

**Files:**
- Modify: `src/templates/sets/core/box.ts:1-15`
- Modify: `src/templates/sets/core/pill.ts` (props schema)
- Modify: `src/templates/sets/core/note.ts` (props schema)
- Modify: `src/templates/sets/core/card.ts` (props schema)
- Modify: `src/templates/sets/core/group.ts` (props schema)

- [ ] **Step 1: Add dsl() to boxProps**

In `src/templates/sets/core/box.ts`, add the import and wrap the schema:

```ts
import { dsl } from '../../../dsl/dslMeta';

export const boxProps = dsl(z.object({
  text: z.string().describe('Label text').optional(),
  w: z.number().min(1).describe('Width').optional(),
  h: z.number().min(1).describe('Height').optional(),
  radius: z.number().min(0).describe('Corner radius').optional(),
  textSize: z.number().min(1).describe('Font size').optional(),
  color: z.string().describe('Color (sets stroke + faded fill)').optional(),
  textColor: z.string().describe('Text color').optional(),
}), {
  positional: [
    { keys: ['text'], format: 'quoted' },
    { keys: ['w', 'h'], format: 'dimension' },
  ],
  kwargs: ['radius', 'textSize', 'color', 'textColor'],
});
```

Note: `text` is moved to the first field so the positional order matches the declaration order. The field order in the zod object doesn't affect runtime behavior.

- [ ] **Step 2: Add dsl() to pillProps**

In `src/templates/sets/core/pill.ts`:

```ts
import { dsl } from '../../../dsl/dslMeta';

export const pillProps = dsl(z.object({
  text: z.string().describe('Label text').optional(),
  w: z.number().min(1).describe('Width').optional(),
  h: z.number().min(1).describe('Height').optional(),
  color: z.string().describe('Color (sets stroke + faded fill)').optional(),
}), {
  positional: [
    { keys: ['text'], format: 'quoted' },
    { keys: ['w', 'h'], format: 'dimension' },
  ],
  kwargs: ['color'],
});
```

- [ ] **Step 3: Add dsl() to noteProps**

In `src/templates/sets/core/note.ts`:

```ts
import { dsl } from '../../../dsl/dslMeta';

export const noteProps = dsl(z.object({
  text: z.string().describe('Note text').optional(),
  w: z.number().min(1).describe('Width').optional(),
  h: z.number().min(1).describe('Height').optional(),
  color: z.string().describe('Color (stroke; fill derived)').optional(),
}), {
  positional: [
    { keys: ['text'], format: 'quoted' },
    { keys: ['w', 'h'], format: 'dimension' },
  ],
  kwargs: ['color'],
});
```

- [ ] **Step 4: Add dsl() to cardProps**

In `src/templates/sets/core/card.ts`:

```ts
import { dsl } from '../../../dsl/dslMeta';

export const cardProps = dsl(z.object({
  title: z.string().describe('Card title'),
  body: z.string().describe('Body text').optional(),
  w: z.number().min(1).describe('Width').optional(),
  h: z.number().min(1).describe('Height').optional(),
  color: z.string().describe('Color (sets stroke + faded fill)').optional(),
}), {
  positional: [
    { keys: ['title'], format: 'quoted' },
    { keys: ['w', 'h'], format: 'dimension' },
  ],
  kwargs: ['body', 'color'],
});
```

- [ ] **Step 5: Add dsl() to groupProps**

In `src/templates/sets/core/group.ts`:

```ts
import { dsl } from '../../../dsl/dslMeta';

export const groupProps = dsl(z.object({
  label: z.string().describe('Group label').optional(),
  w: z.number().min(1).describe('Width').optional(),
  h: z.number().min(1).describe('Height').optional(),
  color: z.string().describe('Color').optional(),
  direction: z.enum(['row', 'column']).describe('Flex layout direction').optional(),
  gap: z.number().min(0).describe('Gap between children').optional(),
}), {
  positional: [
    { keys: ['label'], format: 'quoted' },
    { keys: ['w', 'h'], format: 'dimension' },
  ],
  kwargs: ['color', 'direction', 'gap'],
});
```

- [ ] **Step 6: Commit**

```bash
git add src/templates/sets/core/box.ts src/templates/sets/core/pill.ts src/templates/sets/core/note.ts src/templates/sets/core/card.ts src/templates/sets/core/group.ts
git commit -m "feat: add dsl() hints to core text+dimension shape schemas"
```

---

### Task 2: Add `dsl()` hints to circle and state shapes

**Files:**
- Modify: `src/templates/sets/core/circle.ts` (props schema)
- Modify: `src/templates/sets/state/node.ts` (props schema)
- Modify: `src/templates/sets/state/region.ts` (props schema)

- [ ] **Step 1: Add dsl() to circleProps**

In `src/templates/sets/core/circle.ts`:

```ts
import { dsl } from '../../../dsl/dslMeta';

export const circleProps = dsl(z.object({
  text: z.string().describe('Label text').optional(),
  r: z.number().min(1).describe('Radius').optional(),
  textSize: z.number().min(1).describe('Font size').optional(),
  color: z.string().describe('Color').optional(),
}), {
  positional: [
    { keys: ['text'], format: 'quoted' },
    { keys: ['r'], format: 'spaced' },
  ],
  kwargs: ['textSize', 'color'],
});
```

- [ ] **Step 2: Add dsl() to stateNodeProps**

In `src/templates/sets/state/node.ts`:

```ts
import { dsl } from '../../../dsl/dslMeta';

// Wrap the existing schema (whatever it's named — likely `stateNodeProps` or `nodeProps`)
export const stateNodeProps = dsl(z.object({
  name: z.string().describe('State name'),
  entry: z.string().describe('Entry action').optional(),
  exit: z.string().describe('Exit action').optional(),
  w: z.number().min(1).describe('Width').optional(),
  h: z.number().min(1).describe('Height').optional(),
  color: z.string().describe('Color').optional(),
}), {
  positional: [
    { keys: ['name'], format: 'quoted' },
  ],
  kwargs: ['entry', 'exit', 'w', 'h', 'color'],
});
```

- [ ] **Step 3: Add dsl() to stateRegionProps**

In `src/templates/sets/state/region.ts`:

```ts
import { dsl } from '../../../dsl/dslMeta';

export const stateRegionProps = dsl(z.object({
  label: z.string().describe('Region label'),
  w: z.number().min(1).describe('Width').optional(),
  h: z.number().min(1).describe('Height').optional(),
  color: z.string().describe('Color').optional(),
  direction: z.enum(['row', 'column']).describe('Layout direction').optional(),
  gap: z.number().min(0).describe('Gap between children').optional(),
}), {
  positional: [
    { keys: ['label'], format: 'quoted' },
    { keys: ['w', 'h'], format: 'dimension' },
  ],
  kwargs: ['color', 'direction', 'gap'],
});
```

- [ ] **Step 4: Commit**

```bash
git add src/templates/sets/core/circle.ts src/templates/sets/state/node.ts src/templates/sets/state/region.ts
git commit -m "feat: add dsl() hints to circle and state shape schemas"
```

---

### Task 3: Add `dsl()` hints to arrow and line shapes

Arrow and line use the `arrow` positional format which produces a route array. The template functions expect separate `from`/`to` props. The parser (Task 5) will post-process the route array into `from`/`to` props.

**Files:**
- Modify: `src/templates/sets/core/arrow.ts:8-20`
- Modify: `src/templates/sets/core/line.ts:7-17`

- [ ] **Step 1: Add dsl() to arrowProps**

In `src/templates/sets/core/arrow.ts`:

```ts
import { dsl } from '../../../dsl/dslMeta';

export const arrowProps = dsl(z.object({
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
}), {
  positional: [
    { keys: ['route'], format: 'arrow' },
  ],
  kwargs: ['label', 'labelSize', 'bend', 'gap', 'color'],
  flags: ['arrow', 'arrowStart', 'smooth', 'dashed'],
});
```

The `arrow` format parses `A -> B` into `{ route: ['A', 'B'] }`. Task 5's parser code will split `route[0]` → `from`, `route[last]` → `to`, intermediates → `route`.

- [ ] **Step 2: Add dsl() to lineProps**

In `src/templates/sets/core/line.ts`:

```ts
import { dsl } from '../../../dsl/dslMeta';

export const lineProps = dsl(z.object({
  from: z.string().describe('Start point'),
  to: z.string().describe('End point'),
  label: z.string().describe('Label text').optional(),
  labelSize: z.number().describe('Label font size').optional(),
  arrow: z.boolean().describe('Show arrowhead').optional(),
  smooth: z.boolean().describe('Smooth curves').optional(),
  bend: z.number().describe('Bend amount').optional(),
  dashed: z.boolean().describe('Dashed line').optional(),
  color: z.string().describe('Color').optional(),
}), {
  positional: [
    { keys: ['route'], format: 'arrow' },
  ],
  kwargs: ['label', 'labelSize', 'bend', 'color'],
  flags: ['arrow', 'smooth', 'dashed'],
});
```

- [ ] **Step 3: Commit**

```bash
git add src/templates/sets/core/arrow.ts src/templates/sets/core/line.ts
git commit -m "feat: add dsl() hints to arrow and line shape schemas"
```

---

### Task 4: Expose shape props schema from registry

Add a helper to look up a shape's props schema given its template name (qualified or unqualified). This is needed by both the parser and completion system.

**Files:**
- Modify: `src/templates/registry.ts:60-79`
- Test: `src/__tests__/templates/registry.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/templates/registry.test.ts`:

```ts
import { getShapePropsSchema } from '../../templates/registry';
import { getDsl } from '../../dsl/dslMeta';

describe('getShapePropsSchema', () => {
  it('returns props schema for fully-qualified name', () => {
    const schema = getShapePropsSchema('core.box');
    expect(schema).toBeDefined();
    expect(getDsl(schema!)).toBeDefined();
    expect(getDsl(schema!)!.positional).toBeDefined();
  });

  it('returns props schema for unqualified name via search path', () => {
    const schema = getShapePropsSchema('box', ['core']);
    expect(schema).toBeDefined();
    expect(getDsl(schema!)).toBeDefined();
  });

  it('returns undefined for unknown shape', () => {
    expect(getShapePropsSchema('nonexistent')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/templates/registry.test.ts -t "getShapePropsSchema"`
Expected: FAIL — `getShapePropsSchema` is not exported

- [ ] **Step 3: Implement getShapePropsSchema**

In `src/templates/registry.ts`, add after the existing `getShapeDefinition` function:

```ts
import type { z } from 'zod';

export function getShapePropsSchema(
  name: string,
  searchPath: string[] = [],
): z.ZodObject<any> | undefined {
  // Fully-qualified name (contains dot)
  if (name.includes('.')) {
    const [setName, shapeName] = name.split('.', 2);
    return shapeSets.get(setName)?.shapes.get(shapeName)?.props;
  }
  // Unqualified — walk search path
  for (const setName of searchPath) {
    const props = shapeSets.get(setName)?.shapes.get(name)?.props;
    if (props) return props;
  }
  // Fall back to checking all sets
  for (const set of shapeSets.values()) {
    const props = set.shapes.get(name)?.props;
    if (props) return props;
  }
  return undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/templates/registry.test.ts -t "getShapePropsSchema"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/templates/registry.ts src/__tests__/templates/registry.test.ts
git commit -m "feat: add getShapePropsSchema helper to registry"
```

---

### Task 5: Update template parser to use DslHints for positional args

Replace the duplicated key=val-only parsing in both the explicit `template` and implicit template paths with a shared helper that first parses positionals (via `executePositional`), then parses kwargs.

**Files:**
- Modify: `src/dsl/hintExecutors.ts:613-769`
- Test: `src/__tests__/templates/integration.test.ts`

- [ ] **Step 1: Write failing tests for positional template syntax**

Add to `src/__tests__/templates/integration.test.ts`:

```ts
it('parses positional text for box', () => {
  const scene = parseScene(`
    b: box "Hello"
  `);
  const b = scene.nodes.find(n => n.id === 'b');
  expect(b).toBeDefined();
  expect(b!.children.find(c => c.id === 'b.label')?.text?.content).toBe('Hello');
});

it('parses positional text + dimensions for box', () => {
  const scene = parseScene(`
    b: box "Hello" 200x80
  `);
  const b = scene.nodes.find(n => n.id === 'b');
  expect(b).toBeDefined();
  expect(b!.children.find(c => c.id === 'b.bg')?.rect?.w).toBe(200);
  expect(b!.children.find(c => c.id === 'b.bg')?.rect?.h).toBe(80);
  expect(b!.children.find(c => c.id === 'b.label')?.text?.content).toBe('Hello');
});

it('parses positional text + dimensions + kwargs for box', () => {
  const scene = parseScene(`
    b: box "Hello" 200x80 radius=12 color=steelblue
  `);
  const b = scene.nodes.find(n => n.id === 'b');
  expect(b).toBeDefined();
  expect(b!.children.find(c => c.id === 'b.bg')?.rect?.w).toBe(200);
  expect(b!.children.find(c => c.id === 'b.bg')?.rect?.radius).toBe(12);
});

it('parses fully-qualified positional syntax: core.box "Text"', () => {
  const scene = parseScene(`
    b: core.box "Title" 150x60
  `);
  const b = scene.nodes.find(n => n.id === 'b');
  expect(b).toBeDefined();
  expect(b!.children.find(c => c.id === 'b.label')?.text?.content).toBe('Title');
  expect(b!.children.find(c => c.id === 'b.bg')?.rect?.w).toBe(150);
});

it('parses circle with text and radius positionals', () => {
  const scene = parseScene(`
    c: circle "Node" 40
  `);
  const c = scene.nodes.find(n => n.id === 'c');
  expect(c).toBeDefined();
  expect(c!.children.find(ch => ch.id === 'c.label')?.text?.content).toBe('Node');
});

it('parses arrow with route positional: arrow A -> B', () => {
  const scene = parseScene(`
    a: rect 10x10
    b: rect 10x10
    conn: arrow a -> b label="go"
  `);
  const conn = scene.nodes.find(n => n.id === 'conn');
  expect(conn).toBeDefined();
  expect(conn!.children.find(c => c.id === 'conn.route')).toBeDefined();
});

it('parses state.node with positional name', () => {
  const scene = parseScene(`
    use [core, state]
    s1: node "Idle"
  `);
  const s1 = scene.nodes.find(n => n.id === 's1');
  expect(s1).toBeDefined();
  expect(s1!.children.find(c => c.id === 's1.name')?.text?.content).toBe('Idle');
});

it('old key=val syntax still works alongside positionals', () => {
  const scene = parseScene(`
    b: box w=200 h=80 text="Old"
  `);
  const b = scene.nodes.find(n => n.id === 'b');
  expect(b).toBeDefined();
  expect(b!.children.find(c => c.id === 'b.label')?.text?.content).toBe('Old');
});

it('explicit template keyword with positionals', () => {
  const scene = parseScene(`
    b: template box "Explicit" 100x50
  `);
  const b = scene.nodes.find(n => n.id === 'b');
  expect(b).toBeDefined();
  expect(b!.children.find(c => c.id === 'b.label')?.text?.content).toBe('Explicit');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/templates/integration.test.ts`
Expected: FAIL — positional args not parsed, values are undefined

- [ ] **Step 3: Extract shared template prop parser**

In `src/dsl/hintExecutors.ts`, add a new helper function and update the import. Place this before `executeNodeBody`:

```ts
import { getShapePropsSchema } from '../templates/registry';

/**
 * Parse template props: first positionals (from DslHints on the shape's
 * props schema), then key=val kwargs. Returns the merged props object.
 *
 * For arrow-format positionals, the route array is split into
 * from (first), to (last), and route (intermediates).
 */
function parseTemplateProps(
  ctx: WalkContext,
  templateName: string,
  schemaPath: string,
): Record<string, unknown> {
  const props: Record<string, unknown> = {};

  // Look up DslHints from the shape's props schema
  const propsSchema = getShapePropsSchema(templateName);
  const hints = propsSchema ? getDsl(propsSchema) : undefined;

  // Parse positionals if the schema declares them
  if (hints?.positional) {
    for (const posHint of hints.positional) {
      const posResult = executePositional(ctx, posHint, `${schemaPath}.tplprops:${templateName}`);
      if (posResult) {
        Object.assign(props, posResult);
      } else {
        break; // Stop at first non-matching positional
      }
    }
    // Post-process arrow format: split route into from/to/intermediates
    if (props.route && Array.isArray(props.route)) {
      const route = props.route as unknown[];
      props.from = route[0];
      props.to = route[route.length - 1];
      if (route.length > 2) {
        props.route = route.slice(1, -1);
      } else {
        delete props.route;
      }
    }
  }

  // Parse flags if declared
  if (hints?.flags) {
    while (!ctx.atEnd() && ctx.is('identifier')) {
      const flagTok = ctx.peek()!;
      if (!hints.flags.includes(flagTok.value)) break;
      if (ctx.peek(1)?.type === 'equals') break; // it's a kwarg, not a flag
      ctx.next();
      props[flagTok.value] = true;
      ctx.emitLeaf({
        schemaPath: `${schemaPath}.tplprops:${templateName}.${flagTok.value}`,
        from: flagTok.offset,
        to: flagTok.offset + flagTok.value.length,
        value: true,
        dslRole: 'flag',
      });
    }
  }

  // Parse key=val kwargs
  while (!ctx.atEnd() && ctx.is('identifier') && ctx.peek(1)?.type === 'equals') {
    const keyTok = ctx.next()!;
    ctx.next(); // consume =
    const valTok = ctx.peek();
    if (!valTok) break;
    let val: unknown;
    if (valTok.type === 'number') val = parseFloat(valTok.value);
    else if (valTok.type === 'string') val = valTok.value;
    else if (valTok.type === 'identifier') val = valTok.value;
    else if (valTok.type === 'hexColor') val = valTok.value;
    else break;
    ctx.next();
    props[keyTok.value] = val;
    ctx.emitLeaf({
      schemaPath: `${schemaPath}.tplprops:${templateName}.${keyTok.value}`,
      from: keyTok.offset,
      to: keyTok.offset + keyTok.value.length,
      value: keyTok.value,
      dslRole: 'kwarg-key',
    });
    ctx.emitLeaf({
      schemaPath: `${schemaPath}.tplprops:${templateName}.${keyTok.value}`,
      from: valTok.offset,
      to: valTok.offset + valTok.value.length,
      value: val,
      dslRole: 'kwarg-value',
    });
  }

  return props;
}
```

- [ ] **Step 4: Replace explicit template prop parsing**

In `executeNodeBody`, replace the explicit template path's prop parsing (lines ~656-688) with a call to the new helper. The template name detection and AST emission stay the same. Replace from `// Parse key=val props, emitting AST leaves for each kwarg` through `if (Object.keys(props).length > 0) result.props = props;` with:

```ts
      const props = parseTemplateProps(ctx, templateName, schemaPath);
      if (Object.keys(props).length > 0) result.props = props;
```

- [ ] **Step 5: Replace implicit template prop parsing**

In the implicit template path (lines ~738-768), replace the same pattern — from `// Parse key=val props (same as explicit template syntax)` through `if (Object.keys(props).length > 0) result.props = props;` with:

```ts
      const props = parseTemplateProps(ctx, implicitTemplateName, schemaPath);
      if (Object.keys(props).length > 0) result.props = props;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/templates/integration.test.ts`
Expected: ALL PASS (both old key=val tests and new positional tests)

- [ ] **Step 7: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS — no regressions in parser, editor, or other modules

- [ ] **Step 8: Commit**

```bash
git add src/dsl/hintExecutors.ts src/__tests__/templates/integration.test.ts
git commit -m "feat: parse positional args for shape set templates via DslHints"
```

---

### Task 6: Update completions to generate snippets for shape set shapes

Make the completion system look up shape schemas from the registry so that shape names get snippet templates, and kwargs get type-aware value completions.

**Files:**
- Modify: `src/dsl/astCompletions.ts:16-17` (imports), `325-365` (shape completions), `668-704` (buildSnippetTemplate)

- [ ] **Step 1: Add registry import**

In `src/dsl/astCompletions.ts`, update the registry import (line 17):

```ts
import { getSetNames, getShapeNames, getShapePropsSchema } from '../templates/registry';
```

- [ ] **Step 2: Add helper to look up shape schema for snippet building**

Add a helper function near `buildSnippetTemplate` that tries the static `ANNOTATED_SCHEMAS` first, then falls back to the shape registry:

```ts
/**
 * Look up an annotated schema by key. Checks static ANNOTATED_SCHEMAS first,
 * then falls back to shape set registry for template shapes.
 */
function getAnnotatedSchema(key: string): z.ZodType | undefined {
  return ANNOTATED_SCHEMAS[key] ?? getShapePropsSchema(key);
}
```

- [ ] **Step 3: Update buildSnippetTemplate to use registry fallback**

In `buildSnippetTemplate` (line ~668), change:

```ts
function buildSnippetTemplate(schemaPath: string): string | null {
  const schema = ANNOTATED_SCHEMAS[schemaPath];
```

to:

```ts
function buildSnippetTemplate(schemaPath: string): string | null {
  const schema = getAnnotatedSchema(schemaPath);
```

Also, the keyword used in the snippet string (`hints.keyword ?? schemaPath`) needs to handle shape names. For a shape like `core.box`, the schemaPath is `core.box` but the unqualified name `box` should be used when the snippet is for an unqualified completion. The simplest fix: extract the last segment of dotted paths as the keyword fallback. Update the keyword line:

```ts
  const keyword = hints.keyword ?? (schemaPath.includes('.') ? schemaPath.split('.').pop()! : schemaPath);
```

Do the same schema lookup change in `buildPositionalOnlySnippet` (line ~710):

```ts
function buildPositionalOnlySnippet(schemaPath: string): { label: string; detail: string; template: string } | null {
  const schema = getAnnotatedSchema(schemaPath);
```

- [ ] **Step 4: Add snippet templates to shape name completions after set prefix**

Update the `setDotMatch` completion block (lines ~325-334) to include snippets:

```ts
  if (setDotMatch) {
    const setName = setDotMatch[1];
    const shapes = getShapeNames(setName);
    if (shapes.length > 0) {
      return shapes.map(s => {
        const item: CompletionItem = {
          label: s, type: 'keyword' as const, detail: `${setName} shape`,
        };
        // buildSnippetTemplate uses the last segment of the path as keyword,
        // so `state.node` produces `node "${1:name}"` — correct since `state.` is already typed
        const tmpl = buildSnippetTemplate(`${setName}.${s}`);
        if (tmpl) item.snippetTemplate = tmpl;
        return item;
      });
    }
  }
```

- [ ] **Step 5: Add snippet templates to unqualified shape name completions**

In the `nodePropertyCompletions` function (lines ~795-807), and in `lineTextCompletions` where shape set prefixes are offered (lines ~347-365), also offer unqualified shape names with snippets alongside the set prefixes. After the set prefix loop (line ~363):

```ts
    // Also offer unqualified shape names from all registered sets
    for (const setName of getSetNames()) {
      for (const shapeName of getShapeNames(setName)) {
        const qualifiedName = `${setName}.${shapeName}`;
        const item: CompletionItem = {
          label: shapeName, type: 'keyword', detail: `${setName} shape`,
        };
        const tmpl = buildSnippetTemplate(qualifiedName);
        if (tmpl) item.snippetTemplate = tmpl;
        items.push(item);
      }
    }
```

- [ ] **Step 6: Add shape kwargs to POSITIONAL_KEYWORDS set for post-keyword help**

In the section where `POSITIONAL_KEYWORDS` is built (near the `KEYWORD_TO_SCHEMA` loop), shape set keywords won't be there at module load since sets register later. Instead, update the `keywordMatch` handler in `lineTextCompletions` (lines ~370-387) to also check shape schemas dynamically:

```ts
  if (keywordMatch) {
    const kw = keywordMatch[1];
    if (COLOR_POSITIONAL_KEYWORDS.has(kw)) {
      return colorCompletions();
    }
    if (POSITIONAL_KEYWORDS.has(kw)) {
      const schemaKey = KEYWORD_TO_SCHEMA[kw];
      if (schemaKey) {
        const tmpl = buildPositionalOnlySnippet(schemaKey);
        if (tmpl) {
          return [{ label: tmpl.label, type: 'keyword', detail: tmpl.detail, snippetTemplate: tmpl.template }];
        }
      }
      return [];
    }
    // Check shape set schemas for post-keyword positional help
    const shapeSchema = getShapePropsSchema(kw);
    if (shapeSchema) {
      const shapeHints = getDsl(shapeSchema);
      if (shapeHints?.positional?.length) {
        // Build a snippet for the positional part using the qualified name lookup
        // Find the qualified name for this shape
        for (const setName of getSetNames()) {
          if (getShapeNames(setName).includes(kw)) {
            const tmpl = buildPositionalOnlySnippet(`${setName}.${kw}`);
            if (tmpl) {
              return [{ label: tmpl.label, type: 'keyword', detail: tmpl.detail, snippetTemplate: tmpl.template }];
            }
            break;
          }
        }
      }
    }
  }
```

- [ ] **Step 7: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 8: Commit**

```bash
git add src/dsl/astCompletions.ts
git commit -m "feat: generate snippet templates and completions for shape set shapes"
```

---

### Task 7: Update samples to use new positional syntax

Update the shape sets sample category to demonstrate the new syntax.

**Files:**
- Modify: `src/samples/index.ts` (shape sets sample entries)

- [ ] **Step 1: Find and update shape sets samples**

In `src/samples/index.ts`, find the shape sets sample entries (lines ~598-679) and update them to use positional syntax. For example, change:

```
box w=200 h=40 text="Title" color=steelblue
```

to:

```
box "Title" 200x40 color=steelblue
```

Apply the same pattern throughout the samples: text first as a quoted positional, then dimensions, then remaining kwargs.

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/samples/index.ts
git commit -m "feat: update shape sets samples to use positional syntax"
```

---

### Task 8: Final integration verification

Run full tests, verify no regressions, and test the editor manually.

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Manual editor verification**

Start the dev server and verify in the editor:

1. Type `b: box ` → autocomplete offers `"${1:text}" ${2:W}x${3:H}` snippet
2. Type `b: core.` → shows box, circle, etc. with snippets
3. Type `b: box "Hello" 200x80 color=` → offers color completions
4. Type `c: circle "Node" ` → offers `${1:r}` snippet
5. Type `a: arrow ` → offers route snippet
6. Existing key=val syntax still works: `b: box w=100 h=50 text="Old"`

- [ ] **Step 3: Commit any fixes**

If any issues found, fix and commit.
