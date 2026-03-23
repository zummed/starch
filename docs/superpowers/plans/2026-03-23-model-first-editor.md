# Model-First Editor Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragile text-surgery popup system with model-first editing where popups modify the JSON model directly and DSL is always regenerated.

**Architecture:** ModelManager becomes the single source of truth. Two clean edit paths: `setText()` for typing (no text round-trip), `updateProperty()` for popups (regenerates text). Format hints preserve inline/block choices across regenerations.

**Tech Stack:** TypeScript, Vitest, CodeMirror v6, React, JSON5, Zod

**Spec:** `docs/superpowers/specs/2026-03-23-model-first-editor-design.md`

---

## Chunk 1: Foundation — Format Hints & Generator

### Task 1: Add FormatHints type and parseDslWithHints()

**Files:**
- Create: `src/dsl/formatHints.ts`
- Modify: `src/dsl/parser.ts` (add after line 1274)
- Create: `src/__tests__/dsl/formatHints.test.ts`

- [ ] **Step 1: Write the failing tests for format hint extraction**

```typescript
// src/__tests__/dsl/formatHints.test.ts
import { describe, it, expect } from 'vitest';
import { parseDslWithHints } from '../../dsl/parser';

describe('parseDslWithHints', () => {
  it('returns scene and formatHints', () => {
    const { scene, formatHints } = parseDslWithHints('box: rect 100x200');
    expect(scene.objects).toHaveLength(1);
    expect(formatHints).toBeDefined();
    expect(formatHints.nodes).toBeDefined();
  });

  it('detects inline node (everything on one line)', () => {
    const { formatHints } = parseDslWithHints('box: rect 100x200 fill 210 70 45');
    expect(formatHints.nodes['box']).toEqual({ display: 'inline' });
  });

  it('detects block node (properties on indented lines)', () => {
    const dsl = `box: rect 100x200
  fill 210 70 45
  stroke 0 0 0`;
    const { formatHints } = parseDslWithHints(dsl);
    expect(formatHints.nodes['box']).toEqual({ display: 'block' });
  });

  it('handles mixed inline and block nodes', () => {
    const dsl = `label: text "hi" fill 210 70 45
box: rect 100x200
  fill 0 80 50`;
    const { formatHints } = parseDslWithHints(dsl);
    expect(formatHints.nodes['label']).toEqual({ display: 'inline' });
    expect(formatHints.nodes['box']).toEqual({ display: 'block' });
  });

  it('nodes with no indented children are inline', () => {
    const { formatHints } = parseDslWithHints('dot: ellipse 10x10');
    expect(formatHints.nodes['dot']).toEqual({ display: 'inline' });
  });

  it('preserves parseDsl scene output exactly', () => {
    const { scene } = parseDslWithHints('box: rect 100x200 fill 210 70 45');
    expect(scene.objects[0].id).toBe('box');
    expect(scene.objects[0].rect).toEqual({ w: 100, h: 200 });
    expect(scene.objects[0].fill).toEqual({ h: 210, s: 70, l: 45 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/dsl/formatHints.test.ts`
Expected: FAIL — `parseDslWithHints` does not exist

- [ ] **Step 3: Create FormatHints type**

```typescript
// src/dsl/formatHints.ts
export interface FormatHints {
  nodes: Record<string, NodeFormat>;
}

export interface NodeFormat {
  display: 'inline' | 'block';
}

export function emptyFormatHints(): FormatHints {
  return { nodes: {} };
}
```

- [ ] **Step 4: Implement parseDslWithHints in parser.ts**

Add the new export at the end of `src/dsl/parser.ts`, after the existing `parseDsl` function. The logic:

1. Tokenize the input (same as `parseDsl`)
2. Walk the token stream, tracking which node IDs are followed by an `indent` token (→ block) vs a `newline` or `eof` (→ inline)
3. Call `parseDsl(input)` for the scene
4. Return `{ scene, formatHints }`

The hint detection is a separate pass over the tokens — it does NOT modify `parseDsl` itself. This is important: `parseDsl` stays unchanged and all its callers remain unaffected.

```typescript
import type { FormatHints } from './formatHints';
import { emptyFormatHints } from './formatHints';

export function parseDslWithHints(input: string): { scene: any; formatHints: FormatHints } {
  const scene = parseDsl(input);
  const formatHints = extractFormatHints(input);
  return { scene, formatHints };
}

function extractFormatHints(input: string): FormatHints {
  const hints = emptyFormatHints();
  const tokens = tokenize(input);

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    // Node definition: identifier colon ...
    if (tok.type === 'identifier' && tokens[i + 1]?.type === 'colon') {
      const id = tok.value;
      // Skip document-level keywords (DOC_KEYWORDS is already defined in this file)
      if (DOC_KEYWORDS.has(id)) continue;

      // Scan forward past the colon to find the next newline or indent
      let j = i + 2; // past identifier + colon
      while (j < tokens.length && tokens[j].type !== 'newline' && tokens[j].type !== 'eof') {
        j++;
      }
      // After the newline (or eof), check if next token is indent
      if (j < tokens.length && tokens[j].type === 'newline') {
        const afterNewline = tokens[j + 1];
        if (afterNewline && afterNewline.type === 'indent') {
          hints.nodes[id] = { display: 'block' };
        } else {
          hints.nodes[id] = { display: 'inline' };
        }
      } else {
        // Last line or eof — inline
        hints.nodes[id] = { display: 'inline' };
      }
    }
  }

  return hints;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/dsl/formatHints.test.ts`
Expected: PASS — all 6 tests green

- [ ] **Step 6: Run existing parser tests to verify no regression**

Run: `npx vitest run src/__tests__/dsl/`
Expected: All existing tests pass

- [ ] **Step 7: Commit**

```bash
git add src/dsl/formatHints.ts src/dsl/parser.ts src/__tests__/dsl/formatHints.test.ts
git commit -m "feat: add parseDslWithHints() for format hint extraction"
```

---

### Task 2: Wire FormatHints into the DSL generator

**Files:**
- Modify: `src/dsl/generator.ts:5-7,269-275`
- Modify: `src/__tests__/dsl/generator.test.ts`

- [ ] **Step 1: Write the failing tests for FormatHints in generator**

Add to `src/__tests__/dsl/generator.test.ts`:

```typescript
describe('format hints', () => {
  it('renders node as inline when hint says inline', () => {
    const scene = {
      objects: [{
        id: 'box',
        rect: { w: 100, h: 200 },
        fill: { h: 210, s: 70, l: 45 },
        stroke: { h: 0, s: 0, l: 0 },
        transform: { x: 100, y: 200 },
        opacity: 0.5,
      }],
    };
    // Without hints, this has 5+ props → heuristic renders block
    const blockDsl = generateDsl(scene);
    expect(blockDsl).toContain('\n  fill');

    // With inline hint, force single line
    const inlineDsl = generateDsl(scene, { nodeFormats: { box: 'inline' } });
    expect(inlineDsl).not.toContain('\n  fill');
  });

  it('renders node as block when hint says block even with few props', () => {
    const scene = {
      objects: [{ id: 'dot', ellipse: { rx: 5, ry: 5 }, fill: { h: 0, s: 80, l: 50 } }],
    };
    // Without hints, few props → heuristic renders inline
    const inlineDsl = generateDsl(scene);
    expect(inlineDsl).not.toContain('\n  fill');

    // With block hint, force expanded
    const blockDsl = generateDsl(scene, { nodeFormats: { dot: 'block' } });
    expect(blockDsl).toContain('\n  fill');
  });

  it('falls back to heuristic when no hint for a node', () => {
    const scene = {
      objects: [{ id: 'box', rect: { w: 100, h: 200 } }],
    };
    const dsl = generateDsl(scene, { nodeFormats: { other: 'block' } });
    // 'box' has no hint, uses heuristic (few props → inline)
    expect(dsl).toContain('box: rect 100x200');
  });
});
```

- [ ] **Step 2: Run tests to verify the Step 1 tests pass (they use existing `nodeFormats` API)**

Run: `npx vitest run src/__tests__/dsl/generator.test.ts`
Expected: PASS — the generator already accepts `nodeFormats` via `GeneratorOptions`. The three tests in Step 1 validate existing behavior. (The Step 4 test uses the new `formatHints` field which doesn't exist yet — don't add it until Step 4.)

- [ ] **Step 3: Update the GeneratorOptions type to accept FormatHints**

In `src/dsl/generator.ts`, update the options interface to also accept `FormatHints` as an alternative:

```typescript
import type { FormatHints } from './formatHints';

interface GeneratorOptions {
  nodeFormats?: Record<string, 'inline' | 'block'>;
  formatHints?: FormatHints;
}
```

And update `shouldRenderBlock` to check `formatHints` too:

```typescript
function shouldRenderBlock(node: any, options?: GeneratorOptions): boolean {
  const id = node.id;
  // Explicit per-node format takes precedence
  if (options?.nodeFormats?.[id] === 'inline') return false;
  if (options?.nodeFormats?.[id] === 'block') return true;
  // FormatHints (from DSL parser)
  if (options?.formatHints?.nodes[id]?.display === 'inline') return false;
  if (options?.formatHints?.nodes[id]?.display === 'block') return true;
  // Heuristic fallback
  return countProps(node) > 4;
}
```

- [ ] **Step 4: Add a test for the new formatHints option**

```typescript
it('accepts formatHints as alternative to nodeFormats', () => {
  const scene = {
    objects: [{ id: 'dot', ellipse: { rx: 5, ry: 5 }, fill: { h: 0, s: 80, l: 50 } }],
  };
  const dsl = generateDsl(scene, { formatHints: { nodes: { dot: { display: 'block' } } } });
  expect(dsl).toContain('\n  fill');
});
```

- [ ] **Step 5: Run all generator tests**

Run: `npx vitest run src/__tests__/dsl/generator.test.ts`
Expected: PASS

- [ ] **Step 6: Run roundtrip tests to verify no regression**

Run: `npx vitest run src/__tests__/dsl/roundtrip.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/dsl/generator.ts src/__tests__/dsl/generator.test.ts
git commit -m "feat: wire FormatHints into DSL generator"
```

---

## Chunk 2: ModelManager Rewrite

### Task 3: Rewrite ModelManager with setText/updateProperty/formatHints

**Prerequisite:** Tasks 1 and 2 must be complete. Verify `parseDslWithHints` is exported from `src/dsl/parser.ts` before proceeding.

**Files:**
- Rewrite: `src/editor/modelManager.ts`
- Rewrite: `src/__tests__/editor/modelManager.test.ts`

- [ ] **Step 1: Write the new ModelManager tests**

Replace `src/__tests__/editor/modelManager.test.ts` entirely. The new test file covers:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { ModelManager } from '../../editor/modelManager';

describe('ModelManager', () => {
  // --- Construction ---
  it('starts with empty model', () => {
    const mm = new ModelManager(0);
    expect(mm.realModel.nodes).toEqual([]);
    expect(mm.json).toEqual({});
    mm.destroy();
  });

  // --- setText (JSON5) ---
  it('setText with json5 parses and emits modelChange', () => {
    const mm = new ModelManager(0);
    const onChange = vi.fn();
    mm.onModelChange(onChange);

    mm.setText('{ objects: [{ id: "a", rect: { w: 100, h: 60 } }] }', 'json5');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(mm.realModel.nodes).toHaveLength(1);
    expect(mm.realModel.nodes[0].id).toBe('a');
    mm.destroy();
  });

  it('setText does NOT emit textChange', () => {
    const mm = new ModelManager(0);
    const onText = vi.fn();
    mm.onTextChange(onText);

    mm.setText('{ objects: [{ id: "a", rect: { w: 100, h: 60 } }] }', 'json5');
    expect(onText).not.toHaveBeenCalled();
    mm.destroy();
  });

  it('setText keeps last valid model on parse error', () => {
    const mm = new ModelManager(0);
    mm.setText('{ objects: [{ id: "a", rect: { w: 100, h: 60 } }] }', 'json5');
    expect(mm.realModel.nodes).toHaveLength(1);

    mm.setText('{ invalid !!!', 'json5');
    expect(mm.realModel.nodes).toHaveLength(1);
    expect(mm.realModel.nodes[0].id).toBe('a');
    mm.destroy();
  });

  // --- setText (DSL) ---
  it('setText with dsl parses and emits modelChange', () => {
    const mm = new ModelManager(0);
    const onChange = vi.fn();
    mm.onModelChange(onChange);

    mm.setText('box: rect 100x60', 'dsl');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(mm.realModel.nodes).toHaveLength(1);
    expect(mm.realModel.nodes[0].id).toBe('box');
    mm.destroy();
  });

  it('setText with dsl extracts format hints', () => {
    const mm = new ModelManager(0);
    mm.setText('box: rect 100x60 fill 210 70 45', 'dsl');
    expect(mm.formatHints.nodes['box']).toEqual({ display: 'inline' });

    mm.setText('box: rect 100x60\n  fill 210 70 45', 'dsl');
    expect(mm.formatHints.nodes['box']).toEqual({ display: 'block' });
    mm.destroy();
  });

  it('setText with invalid DSL does NOT update format hints', () => {
    const mm = new ModelManager(0);
    mm.setText('box: rect 100x60 fill 210 70 45', 'dsl');
    expect(mm.formatHints.nodes['box']).toEqual({ display: 'inline' });

    // Invalid DSL should not wipe hints
    mm.setText('box: rect ??? invalid', 'dsl');
    expect(mm.formatHints.nodes['box']).toEqual({ display: 'inline' });
    mm.destroy();
  });

  it('setText with json5 does NOT change format hints', () => {
    const mm = new ModelManager(0);
    mm.setText('box: rect 100x60 fill 210 70 45', 'dsl');
    expect(mm.formatHints.nodes['box']).toEqual({ display: 'inline' });

    // Switch to JSON5 — hints should be preserved
    mm.setText('{ objects: [{ id: "box", rect: { w: 200, h: 60 } }] }', 'json5');
    expect(mm.formatHints.nodes['box']).toEqual({ display: 'inline' });
    mm.destroy();
  });

  // --- updateProperty ---
  it('updateProperty mutates json and emits modelChange + textChange', () => {
    const mm = new ModelManager(0);
    mm.setViewFormat('json5');
    mm.setText('{ objects: [{ id: "a", rect: { w: 100, h: 60 } }] }', 'json5');

    const onModel = vi.fn();
    const onText = vi.fn();
    mm.onModelChange(onModel);
    mm.onTextChange(onText);

    mm.updateProperty('objects.0.rect.w', 200);

    expect(onModel).toHaveBeenCalled();
    expect(onText).toHaveBeenCalled();
    // Updated value in json
    expect(mm.json.objects[0].rect.w).toBe(200);
    mm.destroy();
  });

  it('updateProperty regenerates DSL when in DSL mode', () => {
    const mm = new ModelManager(0);
    mm.setViewFormat('dsl');
    mm.setText('box: rect 100x60', 'dsl');

    const onText = vi.fn();
    mm.onTextChange(onText);

    mm.updateProperty('objects.0.rect.w', 200);

    expect(onText).toHaveBeenCalled();
    const newText = onText.mock.calls[0][0];
    expect(newText).toContain('200');
    expect(newText).toContain('box');
    mm.destroy();
  });

  // --- setViewFormat ---
  it('setViewFormat emits textChange with regenerated text', () => {
    const mm = new ModelManager(0);
    mm.setText('{ objects: [{ id: "a", rect: { w: 100, h: 60 } }] }', 'json5');

    const onText = vi.fn();
    mm.onTextChange(onText);

    mm.setViewFormat('dsl');
    expect(onText).toHaveBeenCalled();
    const dslText = onText.mock.calls[0][0];
    expect(dslText).toContain('a: rect 100x60');
    mm.destroy();
  });

  // --- getDisplayText ---
  it('getDisplayText returns DSL when in DSL mode', () => {
    const mm = new ModelManager(0);
    mm.setViewFormat('dsl');
    mm.setText('box: rect 100x60', 'dsl');
    const display = mm.getDisplayText();
    expect(display).toContain('box: rect 100x60');
    mm.destroy();
  });

  it('getDisplayText returns JSON5 when in JSON5 mode', () => {
    const mm = new ModelManager(0);
    mm.setViewFormat('json5');
    mm.setText('{ objects: [{ id: "a", rect: { w: 100, h: 60 } }] }', 'json5');
    const display = mm.getDisplayText();
    expect(display).toContain('"a"');
    mm.destroy();
  });

  // --- debounce ---
  it('debounces setText calls', async () => {
    const mm = new ModelManager(50);
    const onChange = vi.fn();
    mm.onModelChange(onChange);

    mm.setText('{ objects: [{ id: "d", rect: { w: 10, h: 10 } }] }', 'json5');
    expect(onChange).not.toHaveBeenCalled();

    await new Promise(resolve => setTimeout(resolve, 100));
    expect(onChange).toHaveBeenCalledTimes(1);
    mm.destroy();
  });

  // --- validation ---
  it('emits validation error on parse failure', () => {
    const mm = new ModelManager(0);
    const onValidation = vi.fn();
    mm.onValidationChange(onValidation);

    mm.setText('{ invalid !!!', 'json5');
    expect(onValidation).toHaveBeenCalled();
    const err = onValidation.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    mm.destroy();
  });

  it('emits null validation on successful parse', () => {
    const mm = new ModelManager(0);
    const onValidation = vi.fn();
    mm.onValidationChange(onValidation);

    mm.setText('{ objects: [] }', 'json5');
    expect(onValidation).toHaveBeenCalledWith(null);
    mm.destroy();
  });

  // --- cleanup ---
  it('unsubscribes listeners correctly', () => {
    const mm = new ModelManager(0);
    const onChange = vi.fn();
    const unsub = mm.onModelChange(onChange);

    mm.setText('{ objects: [] }', 'json5');
    expect(onChange).toHaveBeenCalledTimes(1);

    unsub();
    mm.setText('{ objects: [{ id: "x", rect: { w: 1, h: 1 } }] }', 'json5');
    expect(onChange).toHaveBeenCalledTimes(1);
    mm.destroy();
  });

  it('extracts background from parsed scene', () => {
    const mm = new ModelManager(0);
    mm.setText('{ background: "#1a1a2e", objects: [] }', 'json5');
    expect(mm.realModel.background).toBe('#1a1a2e');
    mm.destroy();
  });

  it('extracts animate config', () => {
    const mm = new ModelManager(0);
    mm.setText('{ objects: [{ id: "a", rect: { w: 10, h: 10 } }], animate: { duration: 3, keyframes: [] } }', 'json5');
    expect(mm.realModel.animate?.duration).toBe(3);
    mm.destroy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/editor/modelManager.test.ts`
Expected: FAIL — new API methods don't exist

- [ ] **Step 3: Rewrite modelManager.ts**

Replace `src/editor/modelManager.ts` with the new implementation per the spec. Key points:

- `_json: any` holds the raw scene object (same shape as `parseDsl` / `JSON5.parse` output)
- `_formatHints: FormatHints` from `parseDslWithHints`
- `setText(text, format)`: debounced parse, does NOT emit textChange
- `updateProperty(path, value)`: mutate `_json`, then serialize via `JSON5.stringify(_json, null, 2)` and pass to `parseScene()` for validation (parseScene accepts a string, not an object). Emit both modelChange + textChange.
- `setViewFormat(format)`: emit textChange with regenerated text
- `getDisplayText()`: generate from `_json` + `_formatHints`
- Expose `get json(): any { return this._json; }` getter for popup value lookups
- Expose `get formatHints(): FormatHints { return this._formatHints; }` getter
- `ValidationCallback` type is `(errors: ZodError | Error | null) => void` — emit the caught `Error` directly on parse failures (not `null`), emit `ZodError` for schema validation failures, emit `null` on success
- Keep `setTextImmediate(text, format)` for initial load (no debounce variant of `setText`)

Import `parseDslWithHints` from `../dsl/parser` and `generateDsl` from `../dsl/generator`. Import `parseScene` from `../parser/parser` for validation. Import `JSON5` for serialization.

The `setNestedValue` utility stays. Add a `getNestedValue` utility:

```typescript
export function getNestedValue(obj: any, path: string): unknown {
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return current;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/editor/modelManager.test.ts`
Expected: PASS

- [ ] **Step 5: Run ALL tests to check for regressions**

Run: `npx vitest run`
Expected: All pass. The old ModelManager API is used in V2Editor — those tests may still reference old methods. That's fine since V2Editor tests (if any) are integration-level and will be updated in Task 5. The unit tests here should all pass.

- [ ] **Step 6: Commit**

```bash
git add src/editor/modelManager.ts src/__tests__/editor/modelManager.test.ts
git commit -m "feat: rewrite ModelManager with setText/updateProperty/formatHints"
```

---

## Chunk 3: dslCursorPath Enhancements

### Task 4: Enhance getDslCursorContext for click-to-edit

**Files:**
- Modify: `src/editor/dslCursorPath.ts:276-295`
- Modify: `src/__tests__/editor/dslCursorPath.test.ts`

- [ ] **Step 1: Write the failing tests for boolean keyword resolution**

Add to `src/__tests__/editor/dslCursorPath.test.ts`:

```typescript
// ─── Boolean keyword context ────────────────────────────────────
describe('boolean keywords', () => {
  it('resolves bold on its own indented line', () => {
    const result = ctx('box: text "hi"\n  bol|d');
    expect(result.path).toContain('text');
    expect(result.path).toContain('bold');
    expect(result.isPropertyName).toBe(false);
  });

  it('resolves mono on its own indented line', () => {
    const result = ctx('box: text "hi"\n  mon|o');
    expect(result.path).toContain('text');
    expect(result.path).toContain('mono');
    expect(result.isPropertyName).toBe(false);
  });

  it('resolves smooth for path nodes', () => {
    const result = ctx('line: path (0,0) (100,100)\n  smoot|h');
    expect(result.path).toContain('path');
    expect(result.path).toContain('smooth');
    expect(result.isPropertyName).toBe(false);
  });

  it('resolves closed for path nodes', () => {
    const result = ctx('line: path (0,0) (100,100)\n  close|d');
    expect(result.path).toContain('path');
    expect(result.path).toContain('closed');
    expect(result.isPropertyName).toBe(false);
  });

  it('resolves inline bold keyword', () => {
    const result = ctx('box: text "hi" bol|d');
    expect(result.path).toContain('text');
    expect(result.path).toContain('bold');
    expect(result.isPropertyName).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/editor/dslCursorPath.test.ts`
Expected: FAIL — boolean keywords currently fall through to `isPropertyName: true`

- [ ] **Step 3: Add boolean keyword detection to buildContext**

In `src/editor/dslCursorPath.ts`, in the `buildContext` function's `case 'node':` block (around line 294), add a detection branch before the final `else { isPropertyName = true }`:

These boolean sets don't exist in `dslCursorPath.ts` yet — add them near the top (around line 23):

```typescript
const TEXT_BOOLEANS = new Set(['bold', 'mono']);
const PATH_BOOLEANS = new Set(['closed', 'smooth']);
const NODE_BOOLEANS = new Set(['active']);
const ALL_BOOLEANS = new Set([...TEXT_BOOLEANS, ...PATH_BOOLEANS, ...NODE_BOOLEANS]);
```

Then in `buildContext`, `case 'node':`, add before the final `else`. **Important:** The cursor may be mid-word (e.g., `bol|d`), so `lineTextToCursor` only has the prefix. We must read the full word by also scanning forward from the cursor in `fullText`:

```typescript
} else {
  // Check if cursor is on a boolean keyword.
  // lineTextToCursor may only have a partial word (e.g., "bol" for "bold"),
  // so extract the full word spanning the cursor position.
  const wordStart = lineTextToCursor.match(/(\w+)$/);
  const wordEnd = fullText.slice(cursorOffset).match(/^(\w*)/);
  const fullWord = (wordStart ? wordStart[1] : '') + (wordEnd ? wordEnd[1] : '');
  if (fullWord && ALL_BOOLEANS.has(fullWord)) {
    appendPropertyPath(parts, fullWord, info.geomType);
    currentKey = fullWord;
  } else {
    isPropertyName = true;
  }
}
```

Note: `buildContext` already receives `fullText` and `cursorOffset` as parameters (line 220), so these are available.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/editor/dslCursorPath.test.ts`
Expected: PASS — all tests including new boolean keyword tests

- [ ] **Step 5: Run existing dslCursorPath tests to verify no regression**

Run: `npx vitest run src/__tests__/editor/dslCursorPath.test.ts`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/editor/dslCursorPath.ts src/__tests__/editor/dslCursorPath.test.ts
git commit -m "feat: enhance dslCursorPath to resolve boolean keyword clicks"
```

---

## Chunk 4: V2Editor Rewrite & Cleanup

### Task 5: Rewrite V2Editor to use ModelManager

**Files:**
- Rewrite: `src/app/components/V2Editor.tsx`
- Delete: `src/editor/dslClickTarget.ts`
- Delete: `src/editor/textReplace.ts`
- Delete: `src/__tests__/editor/dslClickTarget.test.ts`

This is the largest task. The V2Editor component is rewritten to:

1. Accept a `ModelManager` instance as a prop (or create one internally)
2. On keystroke: call `modelManager.setText(text, format)`
3. On popup change: call `modelManager.updateProperty(path, value)`
4. Subscribe to `modelManager.onTextChange` to receive regenerated text
5. Subscribe to `modelManager.onModelChange` to trigger diagram re-renders
6. Use `getDslCursorContext` / `getCursorContext` for click → model path resolution
7. Use `getNestedValue(modelManager.json, path)` to get current values for popups

- [ ] **Step 1: Add the stripModelPrefix utility**

Create a small utility function (can be added to `dslCursorPath.ts` or a new `pathUtils.ts` — prefer adding to existing file for simplicity):

Add to `src/editor/dslCursorPath.ts`:

```typescript
/**
 * Strip the model prefix from a path to get a schema-compatible path.
 * "objects.0.rect.w" -> "rect.w"
 * "styles.primary.fill.h" -> "fill.h"
 */
export function stripModelPrefix(path: string): string {
  // objects.N.rest -> rest
  const objMatch = path.match(/^objects\.\d+\.(.+)$/);
  if (objMatch) return objMatch[1];
  // styles.name.rest -> rest
  const styleMatch = path.match(/^styles\.[^.]+\.(.+)$/);
  if (styleMatch) return styleMatch[1];
  return path;
}
```

- [ ] **Step 2: Test the utility**

Add to `src/__tests__/editor/dslCursorPath.test.ts`:

```typescript
import { stripModelPrefix } from '../../editor/dslCursorPath';

describe('stripModelPrefix', () => {
  it('strips objects.N prefix', () => {
    expect(stripModelPrefix('objects.0.rect.w')).toBe('rect.w');
    expect(stripModelPrefix('objects.3.fill.h')).toBe('fill.h');
  });

  it('strips styles.name prefix', () => {
    expect(stripModelPrefix('styles.primary.fill.s')).toBe('fill.s');
  });

  it('passes through paths without prefix', () => {
    expect(stripModelPrefix('animate.duration')).toBe('animate.duration');
  });
});
```

Run: `npx vitest run src/__tests__/editor/dslCursorPath.test.ts`
Expected: PASS

- [ ] **Step 3: Rewrite V2Editor.tsx**

This is the core refactor. The component should be rewritten with these principles:

**Keep these sections from the current V2Editor:**
- CodeMirror extension setup (language, linter, completions, theme compartments)
- Editor mount/unmount lifecycle
- Popup rendering (ColorPicker, NumberSlider, EnumDropdown, PropertyPopup, etc.)
- `handleEditorClick` → but rewrite to use `getDslCursorContext` + `stripModelPrefix` + `getNestedValue`

**Remove these sections:**
- All refs: `json5TextRef`, `lastValidRawRef`, `popupEditingRef`, `externalUpdate`, `dslTargetRef`
- `handlePopupChange` with its DSL/JSON5 text surgery branches
- `useEffect([value])` round-trip with `popupEditingRef` guard
- Duplicate format toggle logic (both `handleFormatToggle` and `useEffect([viewFormat])`)
- All `applyDslPopupChange` / `resolveDslClick` imports

**New wiring pattern:**

```typescript
// Single guard ref
const externalDispatch = useRef(false);

// Subscribe to ModelManager
useEffect(() => {
  const unsubText = modelManager.onTextChange((text) => {
    const view = viewRef.current;
    if (!view) return;
    externalDispatch.current = true;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
    });
    externalDispatch.current = false;
  });
  return unsubText;
}, [modelManager]);

// Update listener
const updateListener = EditorView.updateListener.of((update) => {
  if (update.docChanged && !externalDispatch.current) {
    modelManager.setText(update.state.doc.toString(), formatRef.current);
  }
});

// Popup change handler (replaces entire handlePopupChange)
const handlePopupChange = useCallback((path: string, value: unknown) => {
  modelManager.updateProperty(path, value);
}, [modelManager]);

// Click handler (replaces handleEditorClick)
const handleClick = useCallback((view: EditorView, pos: number) => {
  const doc = view.state.doc.toString();
  const ctx = formatRef.current === 'dsl'
    ? getDslCursorContext(doc, pos)
    : getCursorContext(doc, pos);

  if (ctx.path && !ctx.isPropertyName) {
    const schemaPath = stripModelPrefix(ctx.path);  // for schema registry lookup
    const value = getNestedValue(modelManager.json, ctx.path);  // full model path for value
    // Note: the existing V2Editor has a `resolveDslPath` helper that handles
    // the `animate` section with a different root schema. Preserve that logic
    // when looking up schema — animate paths need AnimConfigSchema as root.
    const schema = getPropertySchema(schemaPath);
    if (schema) {
      openPopup(ctx.path, value, schema, pos);
    }
  }
}, [modelManager]);
```

**For mode toggle:**

```typescript
const handleFormatToggle = useCallback((newFormat: 'json5' | 'dsl') => {
  formatRef.current = newFormat;
  modelManager.setViewFormat(newFormat);
  // Reconfigure compartments
  const view = viewRef.current;
  if (view) {
    view.dispatch({
      effects: [
        langCompartment.current.reconfigure(/* ... */),
        linterCompartment.current.reconfigure(/* ... */),
        completionCompartment.current.reconfigure(/* ... */),
      ],
    });
  }
}, [modelManager]);
```

- [ ] **Step 4: Delete dslClickTarget.ts and textReplace.ts**

```bash
rm src/editor/dslClickTarget.ts
rm src/editor/textReplace.ts
rm src/__tests__/editor/dslClickTarget.test.ts
```

- [ ] **Step 5: Verify the build compiles**

Run: `npx tsc --noEmit`
Expected: No type errors. Fix any remaining imports that reference deleted files.

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: All tests pass. The deleted `dslClickTarget.test.ts` won't run. Any tests that imported from deleted files will need import updates.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: rewrite V2Editor to use ModelManager, delete text-surgery code"
```

---

### Task 6: Update App.tsx integration

**Files:**
- Modify: `src/app/App.tsx`

- [ ] **Step 1: Update App.tsx to create and pass ModelManager**

The app currently manages tab state with `value`/`onChange`/`viewFormat`/`onViewFormatChange`/`nodeFormats`/`onNodeFormatsChange` props flowing into V2Editor. These are replaced by a single `ModelManager` instance.

Specific changes:

1. **One ModelManager per tab.** Store it on the `EditorTab` type (or in a `useRef` map keyed by tab ID). Create it when a tab is created, destroy it when a tab is closed.
2. **Remove `EditorTab.dsl` / `EditorTab.nodeFormats` fields** — the ModelManager holds the canonical JSON and format hints. Tab persistence (`saveStoredTabs` / `loadStoredTabs`) should serialize `modelManager.getDisplayText()` and restore via `modelManager.setTextImmediate()`.
3. **Remove the `onChange` callback chain** — V2Editor no longer emits text changes to the parent. Instead, App.tsx subscribes to `modelManager.onModelChange` to get the `ModelState` for the diagram component.
4. **Diagram integration:** The current `useV2Diagram({ dsl: activeDsl })` takes a string. Replace with subscribing to `modelManager.onModelChange` and passing the `ModelState` (or the DSL string from `modelManager.getDisplayText()`) to the diagram. The simplest approach: keep a `const [modelState, setModelState] = useState(...)` that updates via the `onModelChange` subscription.
5. **Remove `nodeFormats` / `onNodeFormatsChange` props** — format hints now live inside ModelManager and are extracted automatically from user-typed DSL.
6. **Pass `modelManager` as a prop to V2Editor** instead of `value`/`onChange`.

- [ ] **Step 2: Verify the dev server works**

Run: `npm run dev`
Open http://localhost:5173/ in a browser. Verify:
- Editor loads with DSL text
- Typing updates the diagram
- Clicking a value opens the correct popup
- Dragging a slider updates both diagram and editor text
- Mode toggle (DSL ↔ JSON5) works
- Loading samples works

- [ ] **Step 3: Commit**

```bash
git add src/app/App.tsx
git commit -m "refactor: wire ModelManager into App.tsx"
```

---

### Task 7: Manual smoke test of all popup types

**Files:** None — this is a verification task

- [ ] **Step 1: Test color picker popup**

In the dev playground, write DSL with a fill property:
```
box: rect 100x60 fill 210 70 45
```
Click on the fill numbers. Verify a color picker opens and dragging it:
- Updates the diagram colors in real-time
- Updates the editor text with the new values
- Does NOT corrupt the DSL formatting

- [ ] **Step 2: Test number slider popup**

Click on a dimension (e.g., `100` in `100x60`) or a `radius=5` value. Verify:
- Number slider opens
- Dragging updates diagram and text
- No text corruption

- [ ] **Step 3: Test boolean toggle**

Write DSL with a boolean keyword:
```
label: text "hi" bold
```
Click on `bold`. Verify a toggle popup opens and toggling it:
- Removes/adds the `bold` keyword in regenerated DSL
- Updates the diagram

- [ ] **Step 4: Test enum dropdown**

Click on properties like `align=center` or `fit=cover`. Verify dropdown opens with valid options.

- [ ] **Step 5: Test in JSON5 mode**

Toggle to JSON5 mode. Verify all popup types work there too.

- [ ] **Step 6: Test mode toggle preserves format hints**

1. Write DSL with mixed inline/block nodes
2. Toggle to JSON5, toggle back to DSL
3. Verify inline nodes stay inline and block nodes stay block

- [ ] **Step 7: Commit any fixes discovered during testing**

```bash
git add -A
git commit -m "fix: address issues found during popup smoke testing"
```
