# Schema-Driven DSL Parser — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-coded `astParser.ts` with a single schema-driven walker that interprets Zod schemas + DslHints to produce both the model JSON and a uniform AST.

**Architecture:** One walker (`schemaWalker.ts`) traverses tokens guided by schema hints. Each hint type has an executor that consumes tokens, accumulates model data, and emits AST leaves. All consumers (completions, popups, placeholders, tooltips, validation) read from one uniform AST output.

**Tech Stack:** TypeScript, Zod v4, Vitest. Existing tokenizer preserved.

**Spec:** `docs/superpowers/specs/2026-04-04-schema-driven-parser-design.md`

---

## File Structure

### New files

- `src/dsl/walkContext.ts` — Walker state (token cursor, model accumulator, AST accumulator, path tracking)
- `src/dsl/hintExecutors.ts` — Per-hint-type token consumption (positional, kwargs, flags, sigil, record, children, variants, instanceDeclaration, topLevel, flatReference, sectionKeyword)
- `src/dsl/schemaWalker.ts` — Main walker entry point (`walkDocument(text)`), dispatches to hint executors
- `src/__tests__/dsl/hintExecutors.test.ts` — Unit tests per executor
- `src/__tests__/dsl/schemaWalker.test.ts` — End-to-end walker tests
- `src/__tests__/dsl/walkerParity.test.ts` — Parity with existing parser on samples

### Modified files

- `src/dsl/dslMeta.ts` — Extend DslHints with new hint types
- `src/types/schemaRegistry.ts` — Add hints to DocumentSchema fields
- `src/types/node.ts` — Add `instanceDeclaration` to `children` field on NodeSchema where applicable
- `src/dsl/astTypes.ts` — Possibly simplify AstNode (uniform leaf shape)
- `src/parser/parser.ts` — Switch `parseScene` to use walker

### Deleted after migration

- `src/dsl/astParser.ts`

---

## Task 1: Extend DslHints with new hint types

**Files:**
- Modify: `src/dsl/dslMeta.ts`
- Test: `src/__tests__/dsl/dslMeta.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/__tests__/dsl/dslMeta.test.ts (append to existing file)
import { describe, it, expect } from 'vitest';
import type { DslHints } from '../../dsl/dslMeta';

describe('DslHints new types', () => {
  it('supports topLevel hint', () => {
    const hints: DslHints = { topLevel: true, keyword: 'name' };
    expect(hints.topLevel).toBe(true);
  });

  it('supports instanceDeclaration hint', () => {
    const hints: DslHints = {
      instanceDeclaration: { idKey: 'id', colon: 'optional' },
    };
    expect(hints.instanceDeclaration?.idKey).toBe('id');
    expect(hints.instanceDeclaration?.colon).toBe('optional');
  });

  it('supports flatReference hint', () => {
    const hints: DslHints = { flatReference: true };
    expect(hints.flatReference).toBe(true);
  });

  it('supports sectionKeyword hint', () => {
    const hints: DslHints = { sectionKeyword: 'animate' };
    expect(hints.sectionKeyword).toBe('animate');
  });

  it('supports indentedEntries hint', () => {
    const hints: DslHints = { indentedEntries: true };
    expect(hints.indentedEntries).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/dsl/dslMeta.test.ts`
Expected: FAIL — TypeScript compile errors, properties don't exist

- [ ] **Step 3: Add new fields to DslHints**

Edit `src/dsl/dslMeta.ts`, add to the `DslHints` interface (after existing fields):

```typescript
  // Top-level document field — parseable at document root
  topLevel?: boolean;
  // Array items are user-named instances (e.g., objects, children)
  instanceDeclaration?: {
    idKey: string;               // field name holding the ID (e.g., 'id')
    colon: 'required' | 'optional'; // whether `id: body` colon is required
  };
  // Array with flat-reference assignment support (box.fill: red → objects[box].fill)
  flatReference?: boolean;
  // Field opened by a section keyword header (style name, animate, images)
  sectionKeyword?: string;
  // Section body is indented entries (vs inline)
  indentedEntries?: boolean;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/dsl/dslMeta.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/dsl/dslMeta.ts src/__tests__/dsl/dslMeta.test.ts
git commit -m "feat: extend DslHints with new hint types

topLevel, instanceDeclaration, flatReference, sectionKeyword,
indentedEntries — cover document-level grammar forms.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: WalkContext — walker state infrastructure

**Files:**
- Create: `src/dsl/walkContext.ts`
- Test: `src/__tests__/dsl/walkContext.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/__tests__/dsl/walkContext.test.ts
import { describe, it, expect } from 'vitest';
import { WalkContext } from '../../dsl/walkContext';
import { tokenize } from '../../dsl/tokenizer';

describe('WalkContext', () => {
  it('wraps tokens with a cursor', () => {
    const tokens = tokenize('rect 100x200');
    const ctx = new WalkContext(tokens, 'rect 100x200');

    expect(ctx.peek()?.type).toBe('identifier');
    expect(ctx.peek()?.value).toBe('rect');
  });

  it('advances through tokens', () => {
    const tokens = tokenize('rect 100x200');
    const ctx = new WalkContext(tokens, 'rect 100x200');
    const t1 = ctx.next();
    const t2 = ctx.next();
    expect(t1?.value).toBe('rect');
    expect(t2?.value).toBe('100x200');
  });

  it('tracks model path', () => {
    const tokens = tokenize('x');
    const ctx = new WalkContext(tokens, 'x');
    ctx.pushPath('objects.0.rect');
    expect(ctx.modelPath()).toBe('objects.0.rect');
    ctx.pushPath('w');
    expect(ctx.modelPath()).toBe('objects.0.rect.w');
    ctx.popPath();
    expect(ctx.modelPath()).toBe('objects.0.rect');
  });

  it('emits AST leaves', () => {
    const tokens = tokenize('rect');
    const ctx = new WalkContext(tokens, 'rect');
    ctx.emitLeaf({
      schemaPath: 'rect',
      from: 0,
      to: 4,
      value: 'rect',
      dslRole: 'keyword',
    });
    expect(ctx.astLeaves()).toHaveLength(1);
    expect(ctx.astLeaves()[0].value).toBe('rect');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/dsl/walkContext.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement WalkContext**

```typescript
// src/dsl/walkContext.ts
import type { Token } from './types';
import type { z } from 'zod';

export type DslRole =
  | 'keyword' | 'value' | 'kwarg-key' | 'kwarg-value'
  | 'flag' | 'sigil' | 'separator';

export interface AstLeaf {
  schemaPath: string;
  modelPath: string;
  from: number;
  to: number;
  value: unknown;
  dslRole: DslRole;
  schema?: z.ZodType;
}

/**
 * Walker state. Holds the token cursor, model path stack, and accumulated AST leaves.
 */
export class WalkContext {
  private pos = 0;
  private pathStack: string[] = [];
  private leaves: AstLeaf[] = [];

  constructor(
    private tokens: Token[],
    public readonly text: string,
  ) {}

  peek(offset = 0): Token | undefined {
    return this.tokens[this.pos + offset];
  }

  next(): Token | undefined {
    return this.tokens[this.pos++];
  }

  is(type: Token['type'], value?: string): boolean {
    const tok = this.peek();
    if (!tok || tok.type !== type) return false;
    if (value !== undefined && tok.value !== value) return false;
    return true;
  }

  atEnd(): boolean {
    const tok = this.peek();
    return !tok || tok.type === 'eof';
  }

  pushPath(segment: string): void {
    this.pathStack.push(segment);
  }

  popPath(): void {
    this.pathStack.pop();
  }

  modelPath(): string {
    return this.pathStack.join('.');
  }

  /** Skip newline tokens (not indent/dedent). */
  skipNewlines(): void {
    while (this.is('newline')) this.next();
  }

  emitLeaf(leaf: Omit<AstLeaf, 'modelPath'> & { modelPath?: string }): void {
    this.leaves.push({
      modelPath: leaf.modelPath ?? this.modelPath(),
      ...leaf,
    });
  }

  astLeaves(): AstLeaf[] {
    return this.leaves;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/dsl/walkContext.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/dsl/walkContext.ts src/__tests__/dsl/walkContext.test.ts
git commit -m "feat: WalkContext — walker state with cursor, path stack, AST leaves

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Positional hint executor — basic formats

Implements the positional token consumption for formats: `quoted`, `dimension`, `joined`, `spaced`.

**Files:**
- Create: `src/dsl/hintExecutors.ts`
- Test: `src/__tests__/dsl/hintExecutors.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/__tests__/dsl/hintExecutors.test.ts
import { describe, it, expect } from 'vitest';
import { WalkContext } from '../../dsl/walkContext';
import { tokenize } from '../../dsl/tokenizer';
import { executePositional } from '../../dsl/hintExecutors';
import type { PositionalHint } from '../../dsl/dslMeta';

function ctx(text: string): WalkContext {
  return new WalkContext(tokenize(text), text);
}

describe('executePositional - basic formats', () => {
  it('format dimension parses WxH', () => {
    const c = ctx('100x200');
    const hint: PositionalHint = { keys: ['w', 'h'], format: 'dimension' };
    const result = executePositional(c, hint, '');
    expect(result).toEqual({ w: 100, h: 200 });
  });

  it('format quoted parses a string', () => {
    const c = ctx('"hello world"');
    const hint: PositionalHint = { keys: ['content'], format: 'quoted' };
    const result = executePositional(c, hint, '');
    expect(result).toEqual({ content: 'hello world' });
  });

  it('format joined with separator parses X,Y', () => {
    const c = ctx('50,100');
    const hint: PositionalHint = { keys: ['x', 'y'], format: 'joined', separator: ',' };
    const result = executePositional(c, hint, '');
    expect(result).toEqual({ x: 50, y: 100 });
  });

  it('format spaced parses H S L', () => {
    const c = ctx('200 80 50');
    const hint: PositionalHint = { keys: ['h', 's', 'l'], format: 'spaced' };
    const result = executePositional(c, hint, '');
    expect(result).toEqual({ h: 200, s: 80, l: 50 });
  });

  it('single key no format parses one value', () => {
    const c = ctx('dashed');
    const hint: PositionalHint = { keys: ['pattern'] };
    const result = executePositional(c, hint, '');
    expect(result).toEqual({ pattern: 'dashed' });
  });

  it('transform double halves dimensions (ellipse)', () => {
    const c = ctx('100x60');
    const hint: PositionalHint = {
      keys: ['rx', 'ry'], format: 'dimension', transform: 'double',
    };
    const result = executePositional(c, hint, '');
    expect(result).toEqual({ rx: 50, ry: 30 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/dsl/hintExecutors.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement executePositional for basic formats**

```typescript
// src/dsl/hintExecutors.ts
import type { WalkContext } from './walkContext';
import type { PositionalHint } from './dslMeta';

/**
 * Consume tokens for a positional hint. Returns an object populating the
 * hint's keys with parsed values. Records are consumed from the walker context.
 */
export function executePositional(
  ctx: WalkContext,
  hint: PositionalHint,
  schemaPath: string,
): Record<string, unknown> | null {
  const result: Record<string, unknown> = {};
  const format = hint.format;

  // dimension: "WxH" as a single dimensions token
  if (format === 'dimension') {
    if (!ctx.is('dimensions')) return null;
    const tok = ctx.next()!;
    const [a, b] = tok.value.split('x').map(Number);
    const [k1, k2] = hint.keys;
    const transform = (v: number) =>
      hint.transform === 'double' ? v / 2 : v;
    result[k1] = transform(a);
    if (k2) result[k2] = transform(b);
    ctx.emitLeaf({
      schemaPath: `${schemaPath}.${k1}`,
      from: tok.offset,
      to: tok.offset + tok.value.length,
      value: result[k1],
      dslRole: 'value',
    });
    return result;
  }

  // quoted: single string literal
  if (format === 'quoted') {
    if (!ctx.is('string')) return null;
    const tok = ctx.next()!;
    const [k] = hint.keys;
    result[k] = tok.value;
    ctx.emitLeaf({
      schemaPath: `${schemaPath}.${k}`,
      from: tok.offset,
      to: tok.offset + tok.value.length + 2, // include quotes
      value: tok.value,
      dslRole: 'value',
    });
    return result;
  }

  // joined: values separated by a specific separator (e.g., X,Y)
  if (format === 'joined') {
    const sep = hint.separator ?? ',';
    for (let i = 0; i < hint.keys.length; i++) {
      if (i > 0) {
        // Expect separator token
        if (sep === ',' && !ctx.is('comma')) return result;
        ctx.next();
      }
      if (!ctx.is('number')) return result;
      const tok = ctx.next()!;
      const k = hint.keys[i];
      result[k] = parseFloat(tok.value);
      ctx.emitLeaf({
        schemaPath: `${schemaPath}.${k}`,
        from: tok.offset,
        to: tok.offset + tok.value.length,
        value: result[k],
        dslRole: 'value',
      });
    }
    return result;
  }

  // spaced: values separated by whitespace
  if (format === 'spaced') {
    for (const k of hint.keys) {
      if (!ctx.is('number')) return result;
      const tok = ctx.next()!;
      result[k] = parseFloat(tok.value);
      ctx.emitLeaf({
        schemaPath: `${schemaPath}.${k}`,
        from: tok.offset,
        to: tok.offset + tok.value.length,
        value: result[k],
        dslRole: 'value',
      });
    }
    return result;
  }

  // Default: single value (identifier/number/hexColor/string)
  const tok = ctx.peek();
  if (!tok) return null;
  const [k] = hint.keys;
  if (tok.type === 'number') {
    result[k] = parseFloat(tok.value);
  } else if (tok.type === 'string' || tok.type === 'identifier' || tok.type === 'hexColor') {
    result[k] = tok.value;
  } else {
    return null;
  }
  ctx.next();
  ctx.emitLeaf({
    schemaPath: `${schemaPath}.${k}`,
    from: tok.offset,
    to: tok.offset + tok.value.length,
    value: result[k],
    dslRole: 'value',
  });
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/dsl/hintExecutors.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/dsl/hintExecutors.ts src/__tests__/dsl/hintExecutors.test.ts
git commit -m "feat: positional hint executor — quoted, dimension, joined, spaced

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Positional hint executor — arrow and tuples formats

**Files:**
- Modify: `src/dsl/hintExecutors.ts`
- Test: `src/__tests__/dsl/hintExecutors.test.ts` (append)

- [ ] **Step 1: Write failing tests**

Append to `src/__tests__/dsl/hintExecutors.test.ts`:

```typescript
describe('executePositional - arrow and tuples', () => {
  it('format tuples parses multiple (x,y) points', () => {
    const c = ctx('(0,0) (10,20) (30,40)');
    const hint: PositionalHint = { keys: ['points'], format: 'tuples' };
    const result = executePositional(c, hint, '');
    expect(result?.points).toEqual([[0, 0], [10, 20], [30, 40]]);
  });

  it('format arrow parses id -> id chain', () => {
    const c = ctx('a -> b -> c');
    const hint: PositionalHint = { keys: ['route'], format: 'arrow' };
    const result = executePositional(c, hint, '');
    expect(result?.route).toEqual(['a', 'b', 'c']);
  });

  it('format arrow handles (x,y) waypoints', () => {
    const c = ctx('a -> (10,20) -> b');
    const hint: PositionalHint = { keys: ['route'], format: 'arrow' };
    const result = executePositional(c, hint, '');
    expect(result?.route).toEqual(['a', [10, 20], 'b']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/dsl/hintExecutors.test.ts`
Expected: FAIL — "arrow" and "tuples" formats not implemented

- [ ] **Step 3: Add tuples and arrow format handling**

In `src/dsl/hintExecutors.ts`, before the "Default: single value" block, add:

```typescript
  // tuples: list of (x,y) points
  if (format === 'tuples') {
    const [k] = hint.keys;
    const points: Array<[number, number]> = [];
    while (ctx.is('parenOpen')) {
      ctx.next(); // consume (
      if (!ctx.is('number')) break;
      const x = parseFloat(ctx.next()!.value);
      if (ctx.is('comma')) ctx.next();
      if (!ctx.is('number')) break;
      const y = parseFloat(ctx.next()!.value);
      if (ctx.is('parenClose')) ctx.next();
      points.push([x, y]);
    }
    result[k] = points;
    return result;
  }

  // arrow: identifier/(x,y)/(id,dx,dy) chain separated by arrows
  if (format === 'arrow') {
    const [k] = hint.keys;
    const route: unknown[] = [];

    const parseWaypoint = (): unknown | null => {
      if (ctx.is('identifier')) {
        return ctx.next()!.value;
      }
      if (ctx.is('parenOpen')) {
        ctx.next();
        // Could be (x,y) or (id,dx,dy)
        const first = ctx.peek();
        if (first?.type === 'number') {
          const x = parseFloat(ctx.next()!.value);
          if (ctx.is('comma')) ctx.next();
          const y = parseFloat(ctx.next()!.value);
          if (ctx.is('parenClose')) ctx.next();
          return [x, y];
        }
        if (first?.type === 'identifier') {
          const id = ctx.next()!.value;
          if (ctx.is('comma')) ctx.next();
          const dx = parseFloat(ctx.next()!.value);
          if (ctx.is('comma')) ctx.next();
          const dy = parseFloat(ctx.next()!.value);
          if (ctx.is('parenClose')) ctx.next();
          return [id, dx, dy];
        }
      }
      return null;
    };

    const first = parseWaypoint();
    if (first == null) return null;
    route.push(first);

    while (ctx.is('arrow')) {
      ctx.next();
      const wp = parseWaypoint();
      if (wp == null) break;
      route.push(wp);
    }
    result[k] = route;
    return result;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/dsl/hintExecutors.test.ts`
Expected: PASS all executePositional tests

- [ ] **Step 5: Commit**

```bash
git add src/dsl/hintExecutors.ts src/__tests__/dsl/hintExecutors.test.ts
git commit -m "feat: positional hint executor — arrow and tuples formats

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Kwargs and flags executors

**Files:**
- Modify: `src/dsl/hintExecutors.ts`
- Test: `src/__tests__/dsl/hintExecutors.test.ts` (append)

- [ ] **Step 1: Write failing tests**

```typescript
// Append to src/__tests__/dsl/hintExecutors.test.ts
import { executeKwargs, executeFlags } from '../../dsl/hintExecutors';

describe('executeKwargs', () => {
  it('consumes key=value pairs', () => {
    const c = ctx('width=2 radius=8');
    const allowed = ['width', 'radius', 'color'];
    const result = executeKwargs(c, allowed, '');
    expect(result).toEqual({ width: 2, radius: 8 });
  });

  it('stops at unknown keys', () => {
    const c = ctx('width=2 unknown=5');
    const allowed = ['width'];
    const result = executeKwargs(c, allowed, '');
    expect(result).toEqual({ width: 2 });
  });

  it('handles identifier values (enums)', () => {
    const c = ctx('align=middle fit=cover');
    const allowed = ['align', 'fit'];
    const result = executeKwargs(c, allowed, '');
    expect(result).toEqual({ align: 'middle', fit: 'cover' });
  });

  it('handles string values', () => {
    const c = ctx('src="url.png"');
    const allowed = ['src'];
    const result = executeKwargs(c, allowed, '');
    expect(result).toEqual({ src: 'url.png' });
  });
});

describe('executeFlags', () => {
  it('consumes declared flags', () => {
    const c = ctx('bold mono');
    const allowed = ['bold', 'mono', 'visible'];
    const result = executeFlags(c, allowed, '');
    expect(result).toEqual({ bold: true, mono: true });
  });

  it('stops at non-flag identifiers', () => {
    const c = ctx('bold someOtherIdentifier');
    const allowed = ['bold'];
    const result = executeFlags(c, allowed, '');
    expect(result).toEqual({ bold: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/dsl/hintExecutors.test.ts -t "executeKwargs|executeFlags"`
Expected: FAIL — functions not exported

- [ ] **Step 3: Implement executors**

Append to `src/dsl/hintExecutors.ts`:

```typescript
/**
 * Consume key=value pairs where key is in the allowed list.
 * Stops when next token is not an allowed kwarg key.
 */
export function executeKwargs(
  ctx: WalkContext,
  allowed: string[],
  schemaPath: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const allowedSet = new Set(allowed);

  while (!ctx.atEnd() && ctx.is('identifier')) {
    const keyTok = ctx.peek()!;
    if (!allowedSet.has(keyTok.value)) break;
    if (ctx.peek(1)?.type !== 'equals') break;
    ctx.next(); // consume key
    ctx.next(); // consume =

    const valTok = ctx.peek();
    if (!valTok) break;
    let value: unknown;
    if (valTok.type === 'number') value = parseFloat(valTok.value);
    else if (valTok.type === 'string') value = valTok.value;
    else if (valTok.type === 'identifier') value = valTok.value;
    else if (valTok.type === 'hexColor') value = valTok.value;
    else break;
    ctx.next();

    result[keyTok.value] = value;
    ctx.emitLeaf({
      schemaPath: `${schemaPath}.${keyTok.value}`,
      from: keyTok.offset,
      to: keyTok.offset + keyTok.value.length,
      value: keyTok.value,
      dslRole: 'kwarg-key',
    });
    ctx.emitLeaf({
      schemaPath: `${schemaPath}.${keyTok.value}`,
      from: valTok.offset,
      to: valTok.offset + valTok.value.length,
      value,
      dslRole: 'kwarg-value',
    });
  }
  return result;
}

/**
 * Consume bare flag identifiers from the allowed list.
 * Stops when next token is not an allowed flag.
 */
export function executeFlags(
  ctx: WalkContext,
  allowed: string[],
  schemaPath: string,
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  const allowedSet = new Set(allowed);

  while (!ctx.atEnd() && ctx.is('identifier')) {
    const tok = ctx.peek()!;
    if (!allowedSet.has(tok.value)) break;
    // Must not be a kwarg (not followed by =)
    if (ctx.peek(1)?.type === 'equals') break;
    ctx.next();
    result[tok.value] = true;
    ctx.emitLeaf({
      schemaPath: `${schemaPath}.${tok.value}`,
      from: tok.offset,
      to: tok.offset + tok.value.length,
      value: true,
      dslRole: 'flag',
    });
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/dsl/hintExecutors.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/dsl/hintExecutors.ts src/__tests__/dsl/hintExecutors.test.ts
git commit -m "feat: kwargs and flags hint executors

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Keyword matcher — dispatch entry point

A single function that looks at the current token position and matches it against a schema's hints (keyword → positional → kwargs → flags). This is the main "parse a construct" executor.

**Files:**
- Modify: `src/dsl/hintExecutors.ts`
- Test: `src/__tests__/dsl/hintExecutors.test.ts` (append)

- [ ] **Step 1: Write failing test**

```typescript
// Append to src/__tests__/dsl/hintExecutors.test.ts
import { executeSchema } from '../../dsl/hintExecutors';
import { RectGeomSchema, EllipseGeomSchema } from '../../types/node';
import { StrokeSchema, TransformSchema } from '../../types/properties';

describe('executeSchema - schema dispatch', () => {
  it('parses rect geometry', () => {
    const c = ctx('rect 100x200');
    const result = executeSchema(c, RectGeomSchema, 'rect');
    expect(result).toEqual({ w: 100, h: 200 });
  });

  it('parses rect with radius kwarg', () => {
    const c = ctx('rect 100x200 radius=8');
    const result = executeSchema(c, RectGeomSchema, 'rect');
    expect(result).toEqual({ w: 100, h: 200, radius: 8 });
  });

  it('parses transform with positional + kwargs', () => {
    const c = ctx('at 200,150 rotation=45');
    const result = executeSchema(c, TransformSchema, 'transform');
    expect(result).toEqual({ x: 200, y: 150, rotation: 45 });
  });

  it('parses stroke with color + width kwarg', () => {
    const c = ctx('stroke red width=2');
    const result = executeSchema(c, StrokeSchema, 'stroke');
    expect(result).toEqual({ color: 'red', width: 2 });
  });

  it('parses ellipse with dimension transform', () => {
    const c = ctx('ellipse 100x60');
    const result = executeSchema(c, EllipseGeomSchema, 'ellipse');
    expect(result).toEqual({ rx: 50, ry: 30 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/dsl/hintExecutors.test.ts -t "executeSchema"`
Expected: FAIL — function not exported

- [ ] **Step 3: Implement executeSchema**

Append to `src/dsl/hintExecutors.ts`:

```typescript
import { getDsl, type DslHints } from './dslMeta';
import type { z } from 'zod';

/**
 * Parse a construct driven by a schema's DslHints.
 * Consumes: keyword → positional args → kwargs/flags (in any order).
 */
export function executeSchema(
  ctx: WalkContext,
  schema: z.ZodType,
  schemaPath: string,
): Record<string, unknown> | null {
  const hints = getDsl(schema);
  if (!hints) return null;

  // Match keyword if required
  if (hints.keyword) {
    if (!ctx.is('identifier', hints.keyword)) return null;
    const kwTok = ctx.next()!;
    ctx.emitLeaf({
      schemaPath,
      from: kwTok.offset,
      to: kwTok.offset + kwTok.value.length,
      value: kwTok.value,
      dslRole: 'keyword',
    });
  }

  const result: Record<string, unknown> = {};

  // Positional args
  if (hints.positional) {
    for (const posHint of hints.positional) {
      const posResult = executePositional(ctx, posHint, schemaPath);
      if (posResult) Object.assign(result, posResult);
    }
  }

  // Kwargs and flags interleaved
  while (!ctx.atEnd() && ctx.is('identifier')) {
    const tok = ctx.peek()!;
    const isKwarg = ctx.peek(1)?.type === 'equals';
    if (isKwarg && hints.kwargs?.includes(tok.value)) {
      const kw = executeKwargs(ctx, hints.kwargs, schemaPath);
      Object.assign(result, kw);
    } else if (!isKwarg && hints.flags?.includes(tok.value)) {
      const fl = executeFlags(ctx, hints.flags, schemaPath);
      Object.assign(result, fl);
    } else {
      break;
    }
  }

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/dsl/hintExecutors.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/dsl/hintExecutors.ts src/__tests__/dsl/hintExecutors.test.ts
git commit -m "feat: executeSchema — dispatch keyword/positional/kwargs/flags from DslHints

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Color schema variants

Colors are a union of schemas (named, hex, rgb, hsl). Parse the appropriate one based on the first token.

**Files:**
- Modify: `src/dsl/hintExecutors.ts`
- Test: `src/__tests__/dsl/hintExecutors.test.ts` (append)

- [ ] **Step 1: Write failing tests**

```typescript
// Append to src/__tests__/dsl/hintExecutors.test.ts
import { executeColor } from '../../dsl/hintExecutors';

describe('executeColor', () => {
  it('parses named color', () => {
    const c = ctx('red');
    expect(executeColor(c, 'fill')).toBe('red');
  });

  it('parses hex color', () => {
    const c = ctx('#ff0000');
    expect(executeColor(c, 'fill')).toBe('#ff0000');
  });

  it('parses hsl color', () => {
    const c = ctx('hsl 200 80 50');
    expect(executeColor(c, 'fill')).toEqual({ h: 200, s: 80, l: 50 });
  });

  it('parses rgb color', () => {
    const c = ctx('rgb 255 0 0');
    expect(executeColor(c, 'fill')).toEqual({ r: 255, g: 0, b: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/dsl/hintExecutors.test.ts -t "executeColor"`
Expected: FAIL

- [ ] **Step 3: Implement executeColor**

Append to `src/dsl/hintExecutors.ts`:

```typescript
import { HslColorSchema, RgbColorSchema } from '../types/properties';

/**
 * Parse a color value — named, hex, hsl, or rgb form.
 */
export function executeColor(ctx: WalkContext, schemaPath: string): unknown {
  const tok = ctx.peek();
  if (!tok) return null;

  if (tok.type === 'hexColor') {
    ctx.next();
    ctx.emitLeaf({
      schemaPath,
      from: tok.offset,
      to: tok.offset + tok.value.length,
      value: tok.value,
      dslRole: 'value',
    });
    return tok.value;
  }

  if (tok.type === 'identifier') {
    if (tok.value === 'hsl') {
      return executeSchema(ctx, HslColorSchema, schemaPath);
    }
    if (tok.value === 'rgb') {
      return executeSchema(ctx, RgbColorSchema, schemaPath);
    }
    // Named color
    ctx.next();
    ctx.emitLeaf({
      schemaPath,
      from: tok.offset,
      to: tok.offset + tok.value.length,
      value: tok.value,
      dslRole: 'value',
    });
    return tok.value;
  }

  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/dsl/hintExecutors.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/dsl/hintExecutors.ts src/__tests__/dsl/hintExecutors.test.ts
git commit -m "feat: executeColor — handles named, hex, hsl, rgb variants

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Annotate DocumentSchema with topLevel hints

**Files:**
- Modify: `src/types/schemaRegistry.ts`
- Test: `src/__tests__/dsl/walkerParity.test.ts` (create)

- [ ] **Step 1: Write failing test**

```typescript
// src/__tests__/dsl/walkerParity.test.ts
import { describe, it, expect } from 'vitest';
import { getDsl } from '../../dsl/dslMeta';
import { DocumentSchema } from '../../types/schemaRegistry';
import { z } from 'zod';

describe('DocumentSchema top-level annotations', () => {
  it('each field has topLevel hint', () => {
    const shape = (DocumentSchema as any).shape;
    const fieldsToCheck = ['name', 'description', 'background', 'viewport'];
    for (const field of fieldsToCheck) {
      const inner = (shape[field] as any)._def?.innerType ?? shape[field];
      const hints = getDsl(inner as z.ZodType);
      expect(hints?.topLevel, `${field} should have topLevel: true`).toBe(true);
    }
  });

  it('name field has keyword and positional quoted', () => {
    const shape = (DocumentSchema as any).shape;
    const inner = (shape.name as any)._def.innerType;
    const hints = getDsl(inner)!;
    expect(hints.keyword).toBe('name');
    expect(hints.positional?.[0].format).toBe('quoted');
  });

  it('viewport field has keyword and positional dimension', () => {
    const shape = (DocumentSchema as any).shape;
    const inner = (shape.viewport as any)._def.innerType;
    const hints = getDsl(inner)!;
    expect(hints.keyword).toBe('viewport');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/dsl/walkerParity.test.ts`
Expected: FAIL — hints not registered yet

- [ ] **Step 3: Annotate DocumentSchema fields**

Modify `src/types/schemaRegistry.ts`. Replace the `DocumentSchema` export with:

```typescript
import { dsl } from '../dsl/dslMeta';

const nameField = dsl(z.string().describe('Document name (shown as tab label)'), {
  topLevel: true,
  keyword: 'name',
  positional: [{ keys: ['_value'], format: 'quoted' }],
});

const descriptionField = dsl(z.string().describe('Document description (metadata)'), {
  topLevel: true,
  keyword: 'description',
  positional: [{ keys: ['_value'], format: 'quoted' }],
});

const backgroundField = dsl(z.string().describe('Background color (CSS color string)'), {
  topLevel: true,
  keyword: 'background',
  positional: [{ keys: ['_value'] }],
});

const viewportField = dsl(
  z.union([
    z.string(),
    z.object({ width: z.number(), height: z.number() }),
  ]).describe('Viewport dimensions'),
  {
    topLevel: true,
    keyword: 'viewport',
    positional: [{ keys: ['width', 'height'], format: 'dimension' }],
  },
);

export const DocumentSchema = z.object({
  name: nameField.optional(),
  description: descriptionField.optional(),
  objects: z.array(z.lazy(() => NodeSchema)).describe('Top-level scene objects').optional(),
  styles: z.record(z.string(), z.unknown()).describe('Named style definitions').optional(),
  animate: AnimConfigSchema.describe('Animation configuration').optional(),
  background: backgroundField.optional(),
  viewport: viewportField.optional(),
  images: z.record(z.string(), z.string()).describe('Named image sources (id → URL)').optional(),
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/dsl/walkerParity.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/types/schemaRegistry.ts src/__tests__/dsl/walkerParity.test.ts
git commit -m "feat: annotate DocumentSchema fields with topLevel hints

name, description, background, viewport now carry DslHints declaring
their DSL keyword, positional format, and topLevel flag.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: walkDocument entry point — top-level keyword dispatch

**Files:**
- Create: `src/dsl/schemaWalker.ts`
- Test: `src/__tests__/dsl/schemaWalker.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/__tests__/dsl/schemaWalker.test.ts
import { describe, it, expect } from 'vitest';
import { walkDocument } from '../../dsl/schemaWalker';

describe('walkDocument - top-level fields', () => {
  it('parses name', () => {
    const { model } = walkDocument('name "My Scene"');
    expect(model.name).toBe('My Scene');
  });

  it('parses background', () => {
    const { model } = walkDocument('background white');
    expect(model.background).toBe('white');
  });

  it('parses viewport', () => {
    const { model } = walkDocument('viewport 800x600');
    expect(model.viewport).toEqual({ width: 800, height: 600 });
  });

  it('parses multiple top-level fields', () => {
    const { model } = walkDocument(`name "Test"
description "A test"
background white`);
    expect(model.name).toBe('Test');
    expect(model.description).toBe('A test');
    expect(model.background).toBe('white');
  });

  it('emits AST leaves for each value', () => {
    const { ast } = walkDocument('name "My Scene"');
    const leaves = ast.astLeaves();
    const nameLeaf = leaves.find(l => l.schemaPath === 'name._value');
    expect(nameLeaf).toBeDefined();
    expect(nameLeaf?.value).toBe('My Scene');
    expect(nameLeaf?.dslRole).toBe('value');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/dsl/schemaWalker.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement walkDocument**

```typescript
// src/dsl/schemaWalker.ts
import { tokenize } from './tokenizer';
import { WalkContext } from './walkContext';
import { executeSchema } from './hintExecutors';
import { getDsl } from './dslMeta';
import { DocumentSchema } from '../types/schemaRegistry';
import type { z } from 'zod';

export interface WalkResult {
  model: Record<string, any>;
  ast: WalkContext;
}

/**
 * Main entry point: walk a DSL document using DocumentSchema as the root.
 * Returns the parsed model and the walker's AST output.
 */
export function walkDocument(text: string): WalkResult {
  const tokens = tokenize(text);
  const ctx = new WalkContext(tokens, text);
  const model: Record<string, any> = { objects: [] };

  const shape = (DocumentSchema as any).shape;
  const topLevelFields = collectTopLevelFields(shape);

  while (!ctx.atEnd()) {
    ctx.skipNewlines();
    if (ctx.atEnd()) break;

    const tok = ctx.peek();
    if (!tok || tok.type !== 'identifier') {
      // Skip unknown
      ctx.next();
      continue;
    }

    // Match against top-level fields by keyword
    const matched = matchTopLevel(ctx, tok.value, topLevelFields, model);
    if (matched) {
      ctx.skipNewlines();
      continue;
    }

    // Unknown — skip token
    ctx.next();
  }

  return { model, ast: ctx };
}

interface TopLevelField {
  name: string;       // field name in model
  keyword: string;    // DSL keyword
  schema: z.ZodType;
}

function collectTopLevelFields(shape: Record<string, z.ZodType>): TopLevelField[] {
  const fields: TopLevelField[] = [];
  for (const [name, field] of Object.entries(shape)) {
    const inner = (field as any)._def?.innerType ?? field;
    const hints = getDsl(inner);
    if (hints?.topLevel && hints.keyword) {
      fields.push({ name, keyword: hints.keyword, schema: inner });
    }
  }
  return fields;
}

function matchTopLevel(
  ctx: WalkContext,
  keyword: string,
  fields: TopLevelField[],
  model: Record<string, any>,
): boolean {
  const field = fields.find(f => f.keyword === keyword);
  if (!field) return false;

  const result = executeSchema(ctx, field.schema, field.name);
  if (result == null) return false;

  // If positional has a single _value key, unwrap to scalar
  if ('_value' in result && Object.keys(result).length === 1) {
    model[field.name] = result._value;
  } else {
    model[field.name] = result;
  }
  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/dsl/schemaWalker.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/dsl/schemaWalker.ts src/__tests__/dsl/schemaWalker.test.ts
git commit -m "feat: walkDocument — top-level keyword dispatch via DslHints

Entry point for the schema-driven walker. Reads DocumentSchema's
top-level-hinted fields and dispatches to executeSchema for each.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: instanceDeclaration hint for objects array

Make the walker handle `box: rect 100x200` as an instance declaration inside the objects array.

**Files:**
- Modify: `src/types/schemaRegistry.ts` (annotate objects field)
- Modify: `src/dsl/schemaWalker.ts`
- Modify: `src/dsl/hintExecutors.ts` (executeInstance)
- Test: `src/__tests__/dsl/schemaWalker.test.ts` (append)

- [ ] **Step 1: Write failing tests**

```typescript
// Append to src/__tests__/dsl/schemaWalker.test.ts
describe('walkDocument - instance declarations', () => {
  it('parses a single node declaration', () => {
    const { model } = walkDocument('box: rect 100x60');
    expect(model.objects).toHaveLength(1);
    expect(model.objects[0].id).toBe('box');
    expect(model.objects[0].rect).toEqual({ w: 100, h: 60 });
  });

  it('parses multiple nodes', () => {
    const { model } = walkDocument(`box: rect 100x60
circle: ellipse 50x50`);
    expect(model.objects).toHaveLength(2);
    expect(model.objects[0].id).toBe('box');
    expect(model.objects[1].id).toBe('circle');
  });

  it('parses node with fill', () => {
    const { model } = walkDocument('box: rect 100x60 fill red');
    expect(model.objects[0].fill).toBe('red');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/dsl/schemaWalker.test.ts -t "instance"`
Expected: FAIL

- [ ] **Step 3: Annotate objects field in DocumentSchema**

Modify `src/types/schemaRegistry.ts`, replace the `objects` field:

```typescript
const objectsField = dsl(
  z.array(z.lazy(() => NodeSchema)).describe('Top-level scene objects'),
  {
    instanceDeclaration: { idKey: 'id', colon: 'required' },
    flatReference: true,
  },
);

// In DocumentSchema:
objects: objectsField.optional(),
```

- [ ] **Step 4: Add executeInstance to hintExecutors**

Append to `src/dsl/hintExecutors.ts`:

```typescript
/**
 * Parse a single instance declaration: `id: body` or `id body`.
 * The idKey is assigned from the identifier. The body is parsed
 * against the instance schema.
 */
export function executeInstance(
  ctx: WalkContext,
  instanceSchema: z.ZodType,
  idKey: string,
  colonMode: 'required' | 'optional',
  schemaPath: string,
): Record<string, unknown> | null {
  if (!ctx.is('identifier')) return null;
  const idTok = ctx.peek()!;
  const id = idTok.value;

  // Check for colon
  const hasColon = ctx.peek(1)?.type === 'colon';
  if (colonMode === 'required' && !hasColon) return null;

  ctx.next(); // consume identifier
  if (hasColon) ctx.next(); // consume colon

  ctx.emitLeaf({
    schemaPath: `${schemaPath}.${idKey}`,
    from: idTok.offset,
    to: idTok.offset + id.length,
    value: id,
    dslRole: 'value',
  });

  const result: Record<string, unknown> = { [idKey]: id };

  // Parse the body using the instance schema (NodeSchema-like)
  const body = executeNodeBody(ctx, instanceSchema, schemaPath);
  if (body) Object.assign(result, body);

  return result;
}

/**
 * Parse the body of a node: geometry + properties.
 * Uses the schema's hints to determine what to look for.
 */
export function executeNodeBody(
  ctx: WalkContext,
  schema: z.ZodType,
  schemaPath: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const hints = getDsl(schema);
  if (!hints) return result;

  // Use geometry + inlineProps hints to drive parsing
  const geometry = hints.geometry ?? [];
  const inlineProps = hints.inlineProps ?? [];

  // Try to match a geometry keyword
  while (!ctx.atEnd() && ctx.is('identifier')) {
    const tok = ctx.peek()!;

    // Check geometry types
    if (geometry.includes(tok.value)) {
      const geomSchema = resolveFieldSchema(schema, tok.value);
      if (geomSchema) {
        const geom = executeSchema(ctx, geomSchema, `${schemaPath}.${tok.value}`);
        if (geom) result[tok.value] = geom;
        continue;
      }
    }

    // Check inline props
    if (inlineProps.includes(tok.value)) {
      const propSchema = resolveFieldSchema(schema, tok.value);
      if (propSchema) {
        const parsed = executeSchema(ctx, propSchema, `${schemaPath}.${tok.value}`);
        if (parsed != null) {
          // If property is a compound (stroke, transform), assign object
          // If single-value (fill), the schema's keyword already consumed it
          result[tok.value] = parsed;
          continue;
        }
      }
      // Special handling for 'fill' (color union)
      if (tok.value === 'fill') {
        ctx.next(); // consume 'fill' keyword
        const color = executeColor(ctx, `${schemaPath}.fill`);
        if (color != null) result.fill = color;
        continue;
      }
    }

    // Sigil (@style)
    if (hints.sigil && ctx.is('atSign' as any)) {
      break;
    }

    break;
  }

  return result;
}

function resolveFieldSchema(schema: z.ZodType, fieldName: string): z.ZodType | null {
  // Walk the schema's shape
  const unwrapped = unwrap(schema);
  if ((unwrapped as any).shape?.[fieldName]) {
    const field = (unwrapped as any).shape[fieldName];
    return unwrap(field);
  }
  return null;
}

function unwrap(schema: z.ZodType): z.ZodType {
  let s = schema;
  while (true) {
    const def = (s as any)._def;
    if (!def) break;
    if (def.innerType) { s = def.innerType; continue; }
    break;
  }
  return s;
}
```

- [ ] **Step 5: Wire executeInstance into walkDocument**

Modify `src/dsl/schemaWalker.ts`. After `matchTopLevel(...)` returns false, add before the "Unknown — skip token" block:

```typescript
    // Try matching an instance declaration against objects field
    if (matchInstance(ctx, tok.value, shape, model)) {
      ctx.skipNewlines();
      continue;
    }
```

And add the helper function:

```typescript
function matchInstance(
  ctx: WalkContext,
  _firstWord: string,
  shape: Record<string, z.ZodType>,
  model: Record<string, any>,
): boolean {
  // Find any field with instanceDeclaration hint (typically 'objects')
  for (const [name, field] of Object.entries(shape)) {
    const inner = (field as any)._def?.innerType ?? field;
    const hints = getDsl(inner);
    if (!hints?.instanceDeclaration) continue;

    // The array's element schema is the instance schema
    const arrayDef = (inner as any)._def;
    const elementSchema = arrayDef?.element ?? arrayDef?.type;
    // Unwrap lazy
    const resolvedSchema = (elementSchema as any)?._def?.getter
      ? (elementSchema as any)._def.getter()
      : elementSchema;

    if (!resolvedSchema) continue;

    const { idKey, colon } = hints.instanceDeclaration;
    // Need executeInstance import
    const instance = executeInstance(ctx, resolvedSchema, idKey, colon, `${name}.${ctx.peek()?.value ?? ''}`);
    if (instance) {
      if (!model[name]) model[name] = [];
      model[name].push(instance);
      return true;
    }
  }
  return false;
}
```

Add the import at the top of `schemaWalker.ts`:

```typescript
import { executeSchema, executeInstance } from './hintExecutors';
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/__tests__/dsl/schemaWalker.test.ts`
Expected: PASS (parses `box: rect 100x60` correctly)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: instanceDeclaration hint for node instances in objects array

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Parity testing — generate sample comparisons

Run the new walker against every sample and compare the model output to the existing parser. Document any differences.

**Files:**
- Modify: `src/__tests__/dsl/walkerParity.test.ts` (append)

- [ ] **Step 1: Write parity test harness**

Append to `src/__tests__/dsl/walkerParity.test.ts`:

```typescript
import { walkDocument } from '../../dsl/schemaWalker';
import { buildAstFromText } from '../../dsl/astParser';
import { v2Samples } from '../../samples';

describe('walker parity with astParser', () => {
  // Only test samples that the walker is expected to handle in the current
  // implementation state. Expand this list as features are added.
  const SUPPORTED_NAMES = new Set<string>([
    'rect', 'ellipse', 'text',
  ]);

  for (const sample of v2Samples) {
    if (!SUPPORTED_NAMES.has(sample.name)) continue;

    it(`parity for ${sample.category}/${sample.name}`, () => {
      const walkerResult = walkDocument(sample.dsl);
      const parserResult = buildAstFromText(sample.dsl);

      // Compare top-level fields (name, background, viewport)
      expect(walkerResult.model.name).toEqual(parserResult.model.name);
      expect(walkerResult.model.background).toEqual(parserResult.model.background);

      // Compare objects count
      expect(walkerResult.model.objects?.length ?? 0)
        .toEqual(parserResult.model.objects?.length ?? 0);
    });
  }
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/__tests__/dsl/walkerParity.test.ts`
Expected: PASS for `rect`, `ellipse`, `text` samples

- [ ] **Step 3: Document gaps found**

Run the tests with every sample in the supported list. Start small and expand. Note any failures as issues to fix before moving to the next task. For any failing sample:
- Identify which construct is failing (e.g., `stroke`, `at`, `@style`, children, etc.)
- Add it to the next task as a specific item to implement

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/dsl/walkerParity.test.ts
git commit -m "test: parity tests between schema walker and existing parser

Tests walker output against astParser output for each supported sample.
Expand the SUPPORTED_NAMES set as walker features are added.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Children and style references

Extend the walker to handle nested children (indented block) and @style sigil references.

**Files:**
- Modify: `src/dsl/hintExecutors.ts`
- Test: `src/__tests__/dsl/schemaWalker.test.ts` (append)

- [ ] **Step 1: Write failing tests**

```typescript
// Append to src/__tests__/dsl/schemaWalker.test.ts
describe('walkDocument - children and sigils', () => {
  it('parses @style sigil reference', () => {
    const { model } = walkDocument('box: rect 100x60 @primary');
    expect(model.objects[0].style).toBe('primary');
  });

  it('parses nested children (indented)', () => {
    const dsl = `parent: rect 200x200
  child1: rect 50x50
  child2: ellipse 30x30`;
    const { model } = walkDocument(dsl);
    expect(model.objects[0].id).toBe('parent');
    expect(model.objects[0].children).toHaveLength(2);
    expect(model.objects[0].children[0].id).toBe('child1');
    expect(model.objects[0].children[1].id).toBe('child2');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/dsl/schemaWalker.test.ts -t "children and sigils"`
Expected: FAIL

- [ ] **Step 3: Extend executeNodeBody to handle sigil and children**

In `src/dsl/hintExecutors.ts`, modify `executeNodeBody` to also handle the sigil and children. Add the following after the "Check inline props" block, inside the while loop:

```typescript
    // Break on end-of-line for inline parsing
    break;
```

Then after the main while loop, add:

```typescript
  // Sigil: @styleName
  if (hints.sigil && ctx.is('atSign' as any)) {
    ctx.next(); // consume @
    if (ctx.is('identifier')) {
      const nameTok = ctx.next()!;
      result[hints.sigil.key] = nameTok.value;
      ctx.emitLeaf({
        schemaPath: `${schemaPath}.${hints.sigil.key}`,
        from: nameTok.offset - 1,
        to: nameTok.offset + nameTok.value.length,
        value: nameTok.value,
        dslRole: 'sigil',
      });
    }
  }

  // Children: indented block
  ctx.skipNewlines();
  if (ctx.is('indent' as any) && hints.children?.children === 'block') {
    ctx.next(); // consume indent
    const children: Array<Record<string, unknown>> = [];
    while (!ctx.atEnd() && !ctx.is('dedent' as any)) {
      ctx.skipNewlines();
      if (ctx.is('dedent' as any)) break;
      // Recursively parse child instance using the same schema
      const child = executeInstance(ctx, schema, 'id', 'required', `${schemaPath}.children`);
      if (child) children.push(child);
      else break;
      ctx.skipNewlines();
    }
    if (ctx.is('dedent' as any)) ctx.next();
    if (children.length > 0) result.children = children;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/dsl/schemaWalker.test.ts -t "children and sigils"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: walker handles @style sigil and indented children

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: sectionKeyword — styles/animate/images blocks

Parse `style name`, `animate 3s`, `images` section headers.

**Files:**
- Modify: `src/types/schemaRegistry.ts` (annotate styles/animate/images)
- Modify: `src/dsl/schemaWalker.ts` (matchSection)
- Test: `src/__tests__/dsl/schemaWalker.test.ts` (append)

- [ ] **Step 1: Write failing tests**

```typescript
// Append to src/__tests__/dsl/schemaWalker.test.ts
describe('walkDocument - sections', () => {
  it('parses style block', () => {
    const dsl = `style primary
  fill red`;
    const { model } = walkDocument(dsl);
    expect(model.styles?.primary).toBeDefined();
    expect(model.styles.primary.fill).toBe('red');
  });

  it('parses animate block', () => {
    const dsl = `animate 3s loop
  1 box.opacity: 1
  2 box.opacity: 0`;
    const { model } = walkDocument(dsl);
    expect(model.animate?.duration).toBe(3);
    expect(model.animate?.loop).toBe(true);
    expect(model.animate?.keyframes).toHaveLength(2);
  });

  it('parses images block', () => {
    const dsl = `images
  logo: "logo.png"
  hero: "hero.jpg"`;
    const { model } = walkDocument(dsl);
    expect(model.images?.logo).toBe('logo.png');
    expect(model.images?.hero).toBe('hero.jpg');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/dsl/schemaWalker.test.ts -t "sections"`
Expected: FAIL

- [ ] **Step 3: Annotate DocumentSchema fields with sectionKeyword**

Modify `src/types/schemaRegistry.ts`:

```typescript
// Replace styles, animate, images field definitions:
const stylesField = dsl(
  z.record(z.string(), z.unknown()).describe('Named style definitions'),
  {
    sectionKeyword: 'style',
    instanceDeclaration: { idKey: 'name', colon: 'optional' },
    indentedEntries: true,
  },
);

const imagesField = dsl(
  z.record(z.string(), z.string()).describe('Named image sources (id → URL)'),
  {
    sectionKeyword: 'images',
    indentedEntries: true,
  },
);

// animate already has dsl() hints on AnimConfigSchema with keyword 'animate'
// Just need to annotate it as a top-level section

// In DocumentSchema:
styles: stylesField.optional(),
animate: AnimConfigSchema.optional(),  // AnimConfigSchema already has keyword hint
images: imagesField.optional(),
```

- [ ] **Step 4: Add matchSection to schemaWalker**

Modify `src/dsl/schemaWalker.ts`. Add after `matchInstance` logic (before "Unknown — skip token"):

```typescript
    // Try matching a section keyword (style/animate/images)
    if (matchSection(ctx, tok.value, shape, model)) {
      ctx.skipNewlines();
      continue;
    }
```

And add the helper:

```typescript
function matchSection(
  ctx: WalkContext,
  keyword: string,
  shape: Record<string, z.ZodType>,
  model: Record<string, any>,
): boolean {
  for (const [name, field] of Object.entries(shape)) {
    const inner = (field as any)._def?.innerType ?? field;
    const hints = getDsl(inner);
    if (!hints) continue;

    // sectionKeyword field (styles, images)
    if (hints.sectionKeyword === keyword) {
      ctx.next(); // consume section keyword

      if (hints.instanceDeclaration) {
        // style name -> followed by indented props
        const nameTok = ctx.peek();
        if (nameTok?.type === 'identifier') {
          const entryName = nameTok.value;
          ctx.next();
          // Parse indented block as a property bag
          const props = parsePropertyBlock(ctx, `${name}.${entryName}`);
          if (!model[name]) model[name] = {};
          model[name][entryName] = props;
        }
      } else if (hints.indentedEntries) {
        // images: key: "value" entries
        const entries = parseKeyValueBlock(ctx, name);
        if (!model[name]) model[name] = {};
        Object.assign(model[name], entries);
      }
      return true;
    }

    // animate uses keyword on the schema itself
    if (hints.keyword === keyword) {
      const parsed = executeSchema(ctx, inner, name);
      if (parsed) model[name] = parsed;
      return true;
    }
  }
  return false;
}

function parsePropertyBlock(ctx: WalkContext, schemaPath: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  ctx.skipNewlines();
  if (!ctx.is('indent' as any)) return result;
  ctx.next();
  while (!ctx.atEnd() && !ctx.is('dedent' as any)) {
    ctx.skipNewlines();
    if (ctx.is('dedent' as any)) break;
    const tok = ctx.peek();
    if (!tok || tok.type !== 'identifier') { ctx.next(); continue; }
    if (tok.value === 'fill') {
      ctx.next();
      // Import at top: executeColor
      const { executeColor } = require('./hintExecutors');
      const c = executeColor(ctx, `${schemaPath}.fill`);
      if (c != null) result.fill = c;
    } else {
      ctx.next(); // skip unknown
    }
    ctx.skipNewlines();
  }
  if (ctx.is('dedent' as any)) ctx.next();
  return result;
}

function parseKeyValueBlock(ctx: WalkContext, schemaPath: string): Record<string, string> {
  const result: Record<string, string> = {};
  ctx.skipNewlines();
  if (!ctx.is('indent' as any)) return result;
  ctx.next();
  while (!ctx.atEnd() && !ctx.is('dedent' as any)) {
    ctx.skipNewlines();
    if (ctx.is('dedent' as any)) break;
    if (!ctx.is('identifier')) { ctx.next(); continue; }
    const keyTok = ctx.next()!;
    if (!ctx.is('colon')) continue;
    ctx.next();
    if (!ctx.is('string')) continue;
    const valTok = ctx.next()!;
    result[keyTok.value] = valTok.value;
    ctx.skipNewlines();
  }
  if (ctx.is('dedent' as any)) ctx.next();
  return result;
}
```

Note: replace `require('./hintExecutors')` with a proper top-level import.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/dsl/schemaWalker.test.ts -t "sections"`
Expected: PASS for style and images. The animate block test may fail — that's OK, tackle in the next task.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: sectionKeyword hint — style, images blocks

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Animate block with keyframes

The animate block has complex grammar: `animate 3s loop`, chapters, keyframe timestamps with change paths.

**Files:**
- Modify: `src/dsl/hintExecutors.ts`
- Test: `src/__tests__/dsl/schemaWalker.test.ts`

- [ ] **Step 1: Ensure animate test passes**

Re-run: `npx vitest run src/__tests__/dsl/schemaWalker.test.ts -t "animate"`

If failing, analyse what's missing. Animate is `executeSchema(ctx, AnimConfigSchema, 'animate')`:
- keyword: 'animate'
- positional: `{ keys: ['duration'], suffix: 's' }` — e.g., `3s`
- flags: `['loop', 'autoKey']`
- kwargs: `['easing']`
- children: `{ keyframes: 'block', chapters: 'block' }`

- [ ] **Step 2: Add suffix support to positional**

Check `executePositional` default case. Need to handle `3s` (number+suffix). Modify the default single-value block in `executePositional` to strip a trailing letter suffix from numbers:

```typescript
  // Default: single value with optional suffix
  const tok = ctx.peek();
  if (!tok) return null;
  const [k] = hint.keys;
  if (tok.type === 'number') {
    result[k] = parseFloat(tok.value);
    ctx.next();
    // Consume optional suffix identifier (e.g., 's' after duration)
    if (hint.suffix && ctx.is('identifier', hint.suffix)) {
      ctx.next();
    }
    ctx.emitLeaf({
      schemaPath: `${schemaPath}.${k}`,
      from: tok.offset,
      to: tok.offset + tok.value.length,
      value: result[k],
      dslRole: 'value',
    });
    return result;
  }
```

Wait — check how the tokenizer actually emits `3s`. If it emits as number(3) + identifier(s), this works. If it emits as a single token, different handling needed.

Verify: `npx vitest run src/__tests__/dsl/schemaWalker.test.ts -t "animate" --reporter=verbose`

- [ ] **Step 3: Add keyframe block parsing**

The `children: { keyframes: 'block' }` hint says keyframes are indented entries. Each keyframe starts with a number (timestamp) followed by changes.

Add a specialized `parseKeyframes` function called from within `executeSchema` when it encounters a children block:

```typescript
// In hintExecutors.ts, after executeSchema, add:
export function parseKeyframesBlock(ctx: WalkContext, schemaPath: string): any[] {
  const keyframes: any[] = [];
  ctx.skipNewlines();
  if (!ctx.is('indent' as any)) return keyframes;
  ctx.next();

  while (!ctx.atEnd() && !ctx.is('dedent' as any)) {
    ctx.skipNewlines();
    if (ctx.is('dedent' as any)) break;
    if (!ctx.is('number')) { ctx.next(); continue; }

    const timeTok = ctx.next()!;
    const kf: any = { time: parseFloat(timeTok.value), changes: {} };

    // Optional easing on timestamp line: "1.5 easing=easeIn"
    if (ctx.is('identifier', 'easing') && ctx.peek(1)?.type === 'equals') {
      ctx.next(); ctx.next();
      if (ctx.is('identifier')) {
        kf.easing = ctx.next()!.value;
      }
    }

    // Inline change on same line: "1.5 box.opacity: 1"
    if (ctx.is('identifier')) {
      const { key, value } = parseChangeInline(ctx);
      if (key) kf.changes[key] = value;
    }

    ctx.skipNewlines();

    // Indented changes block
    if (ctx.is('indent' as any)) {
      ctx.next();
      while (!ctx.atEnd() && !ctx.is('dedent' as any)) {
        ctx.skipNewlines();
        if (ctx.is('dedent' as any)) break;
        if (!ctx.is('identifier')) { ctx.next(); continue; }
        const { key, value } = parseChangeInline(ctx);
        if (key) kf.changes[key] = value;
        ctx.skipNewlines();
      }
      if (ctx.is('dedent' as any)) ctx.next();
    }

    keyframes.push(kf);
    ctx.skipNewlines();
  }

  if (ctx.is('dedent' as any)) ctx.next();
  return keyframes;
}

function parseChangeInline(ctx: WalkContext): { key: string | null; value: unknown } {
  // Parse dotted path: box.opacity or box.transform.x
  const parts: string[] = [];
  while (ctx.is('identifier')) {
    parts.push(ctx.next()!.value);
    if (ctx.is('dot')) { ctx.next(); continue; }
    break;
  }
  if (!ctx.is('colon')) return { key: null, value: null };
  ctx.next();

  const valTok = ctx.peek();
  if (!valTok) return { key: parts.join('.'), value: null };
  let value: unknown;
  if (valTok.type === 'number') value = parseFloat(valTok.value);
  else if (valTok.type === 'string' || valTok.type === 'identifier' || valTok.type === 'hexColor') {
    value = valTok.value;
  }
  ctx.next();
  return { key: parts.join('.'), value };
}
```

- [ ] **Step 4: Wire animate block into schema executor**

Modify `executeSchema` to handle the animate children case. After the kwargs/flags loop, add:

```typescript
  // Children block: keyframes specifically
  if (hints.children?.keyframes === 'block') {
    const keyframes = parseKeyframesBlock(ctx, schemaPath);
    if (keyframes.length > 0) result.keyframes = keyframes;
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/dsl/schemaWalker.test.ts -t "animate"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: walker handles animate block with keyframes

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: Expand parity test coverage

Run parity tests across more samples, tracking which ones pass.

**Files:**
- Modify: `src/__tests__/dsl/walkerParity.test.ts`

- [ ] **Step 1: Expand SUPPORTED_NAMES and run**

Edit the `SUPPORTED_NAMES` set in `walkerParity.test.ts`:

```typescript
const SUPPORTED_NAMES = new Set<string>([
  'rect', 'ellipse', 'text',
  'named-styles', 'style-animation',
  'opacity-animation',
]);
```

Run: `npx vitest run src/__tests__/dsl/walkerParity.test.ts`

- [ ] **Step 2: For each failing sample, identify the gap**

For each sample that fails:
- Extract the minimal DSL snippet that breaks
- Add a focused test in `schemaWalker.test.ts`
- Fix the walker or annotate the missing schema
- Re-run

- [ ] **Step 3: Continue expanding until all supported samples pass**

Target getting these sample categories to 100% parity:
- Primitives (all)
- Colors (all)
- Styles (all)

- [ ] **Step 4: Commit iteratively**

```bash
git add -A
git commit -m "test: expand walker parity coverage to primitives, colors, styles

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: Migrate completions to use walker

Switch `astCompletions.ts` from using the old parser's AST to using the walker's schema-walk capability.

**Files:**
- Modify: `src/editor/plugins/completionPlugin.ts`

- [ ] **Step 1: Write failing test (or update existing)**

Ensure existing completion tests still pass as we migrate:

Run: `npx vitest run src/__tests__/editor/completionPlugin.test.ts src/__tests__/editor/completionIntegration.test.ts`
Expected: PASS before changes

- [ ] **Step 2: Update completionPlugin to use walkDocument**

In `src/editor/plugins/completionPlugin.ts`, replace the `buildAstFromText` call with `walkDocument`:

```typescript
import { walkDocument } from '../../dsl/schemaWalker';

// In getCompletions:
let ast = null;
let model = null;
try {
  const result = walkDocument(text);
  ast = result.ast; // WalkContext with astLeaves()
  model = result.model;
} catch { /* partial parse is ok */ }
```

Note: The old `completionsAt(ast, pos, lineText, model)` function works with the OLD AST format. For now, keep both paths working — pass the walker's model but fall back to the old parser's AST for `completionsAt` until `completionsAt` itself is migrated.

This is an incremental migration: model from walker, AST from old parser, until we rewrite completionsAt.

- [ ] **Step 3: Run all completion tests**

Run: `npx vitest run src/__tests__/editor/completionPlugin.test.ts src/__tests__/editor/completionIntegration.test.ts src/__tests__/editor/completionFiltering.test.ts src/__tests__/editor/completionWithSelection.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: completion plugin uses walker for model, parser for AST (interim)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 17: Switch parseScene to use walker

**Files:**
- Modify: `src/parser/parser.ts`

- [ ] **Step 1: Check existing parser tests**

Run: `npx vitest run src/__tests__/parser/parser.test.ts`
Expected: PASS baseline

- [ ] **Step 2: Replace buildAstFromText with walkDocument in parseScene**

In `src/parser/parser.ts`:

```typescript
import { walkDocument } from '../dsl/schemaWalker';

export function parseScene(input: string): ParsedScene {
  registerBuiltinTemplates();
  const trimmed = input.trim();
  const raw = walkDocument(trimmed).model;
  // ... rest of parseScene unchanged
}
```

- [ ] **Step 3: Run all parser tests**

Run: `npx vitest run`
Expected: All tests pass. If some fail, those are gaps in walker parity — fix them before proceeding.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: parseScene uses schema walker instead of astParser

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 18: Delete old parser once all tests pass

**Files:**
- Delete: `src/dsl/astParser.ts`
- Modify: `src/editor/plugins/completionPlugin.ts` (remove old parser import)
- Modify: `src/editor/io/importDsl.ts` if needed (switch to walker)
- Modify: `src/editor/io/exportDsl.ts` if needed

- [ ] **Step 1: Find all uses of astParser**

Run: `grep -rn "buildAstFromText\|from.*astParser" src/ --include="*.ts" --include="*.tsx"`

For each usage, switch to `walkDocument` from schemaWalker.

- [ ] **Step 2: Switch completions plugin fully to walker**

Update `completionPlugin.ts` — remove any residual `buildAstFromText` usage.

- [ ] **Step 3: Rewrite completionsAt to use walker**

This is the last coupling point. `src/dsl/astCompletions.ts` uses `AstNode` from the old parser.

Option A: Update `astCompletions.ts` to accept walker's leaf list instead.
Option B: Keep a small adapter that produces an `AstNode`-compatible tree from walker leaves.

Recommended: Option B for minimal blast radius. Write an adapter `walkerLeavesToAstNode(leaves): AstNode`.

- [ ] **Step 4: Run ALL tests**

Run: `npx vitest run`
Expected: 100% pass (849+ tests)

- [ ] **Step 5: Delete astParser.ts**

```bash
rm src/dsl/astParser.ts
```

Run: `npx tsc --noEmit`
Expected: No type errors

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: delete astParser.ts — schema walker is now the only DSL parser

All consumers migrated. Schema-driven walker is the sole source of
DSL parsing truth, driven entirely by Zod schemas + DslHints.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Notes

### If parity breaks during migration

The existing parser handles many edge cases accumulated over time. When parity tests fail:

1. Extract the minimal failing DSL into a focused test
2. Either: add the missing hint to the relevant schema, OR add the missing executor capability
3. Never hide grammar in walker code — if a form can't be expressed in hints, STOP and extend the hint vocabulary first

### Flat references (task deferred)

`box.fill: red` at top level is modeled by the `flatReference: true` hint. Implement this when a sample needs it. The executor: match `identifier (.identifier)+ :` then parse value against the resolved schema path.

### Connections (`a -> b`)

Connections are instance declarations with a PathGeomSchema route variant. When the instance body matches `identifier -> ...`, use the route variant. Add this to `executeNodeBody` when needed.
