# Schema-Driven DSL Parser

**Date:** 2026-04-04
**Status:** Approved
**Replaces:** `src/dsl/astParser.ts` (hand-coded recursive descent parser)

## Problem

The current DSL parser has hand-coded grammar for every construct. Zod schemas are the source of truth for types, but parsing behaviour lives in the parser. Consequences:

- Adding a schema doesn't automatically get parsing, completions, popups, or placeholders.
- The AST builder is inconsistent — node bodies get detailed leaf nodes, but metadata sections (`name`, `background`, `viewport`), styles, animate, and images get only section markers.
- Consumers (completions, click popups, placeholders, tooltips, validation) end up with ad-hoc logic per section type.
- Future grammar changes require updating multiple places; hidden special cases accumulate.

## Goal

Every DSL grammar form is expressible via `DslHints` on Zod schemas. A single walker interprets the schemas + hints to produce both the model JSON and a uniform AST. Every schema-defined property gets completions, popup, placeholder, tooltip, and validation for free.

## Architecture

### Single walker, schema-driven

```
walkDocument(text) → { model, ast }
```

The walker is a recursive interpreter:

1. Reads the current schema's `DslHints`.
2. Matches tokens against expected forms (keyword, positional args, kwargs, flags, sigil, children, variants, etc.).
3. Recurses into child schemas for nested constructs.
4. Emits AST leaves at every schema-defined position with uniform shape:
   ```typescript
   interface AstLeaf {
     schemaPath: string;
     modelPath: string;
     from: number;
     to: number;
     value: unknown;
     dslRole: 'keyword' | 'value' | 'kwarg-key' | 'kwarg-value' | 'flag' | 'sigil';
     schema: z.ZodType;
   }
   ```
5. Accumulates model data into the correct shape.

No per-section special cases in walker code. Every grammar form is declared via hints and executed by a single handler.

### Complete DslHints vocabulary

Every DSL grammar form maps to a hint type. Existing hints plus the following additions cover 100% of DSL surface.

**Existing hints (unchanged):**

| Hint | Purpose |
|---|---|
| `keyword` | Identifier marker |
| `positional` with `format` (quoted, dimension, joined, spaced, arrow, tuples) | Positional args |
| `kwargs` | `key=value` pairs |
| `flags` | Bare flag names |
| `sigil` | `@name` references |
| `children` | Indented sub-items (block/inline) |
| `record` | Keyed entry maps |
| `variants` | Context-switching within a schema |

**New hints:**

| Hint | Purpose | Example |
|---|---|---|
| `topLevel: true` | Marks a field as valid at document root | `name "..."`, `background` |
| `instanceDeclaration: { idKey, colon: 'required' \| 'optional' }` | Array items are user-named instances | `box: rect 100x60` |
| `flatReference: true` | Allows `id.field: value` assignments | `box.fill: red` at top level |
| `sectionKeyword: string` | Header keyword for a sectioned field | `style name`, `animate 3s` |
| `indentedEntries: true` | Section body is indented entries | keyframes, images |

**Not in hints — universal DSL syntax (documented in tokenizer):**

- Comments (`//`)
- Whitespace / newlines / indentation tokens
- Token type rules (identifier, number, string, operators)

### Walker algorithm

**Entry point:**

```
walkDocument(tokens): { model, ast }
```

Starts at DocumentSchema. For each field in its shape, dispatches by hint type:

- `topLevel` fields: match keyword, parse value via the field's positional/kwargs hints
- `sectionKeyword` fields: match section header, parse body as indented entries or instance list
- `instanceDeclaration` on array fields: parse each line as a named instance using the array's element schema
- `flatReference` on array fields: match dotted-identifier paths at top level, walk into array by id, resolve remaining path against instance schema, parse value against resolved schema

**Nested walks:**

For each instance, `walkInstance(tokens, schema, modelPath)` consumes tokens guided by the schema's hints:

- `positional` → consume N values in declared formats
- `kwargs` → consume `key=val` pairs where key is in the declared list
- `flags` → consume bare identifier flags from the declared list
- `sigil` → consume sigil-prefixed reference
- `children` → parse indented block using the children schema

**Variants:**

When a schema has `variants`, the walker peeks ahead to pick the variant (e.g., PathGeomSchema picks route-variant if arrow is present, points-variant if parens).

## Consumer interactions

All five interactions read from the same AST + schema:

- **Autocomplete:** schema-walk from cursor position lists allowed next tokens + their hints → completion items
- **Click popup:** `nodeAt(pos)` → `schemaPath` + `schema` → `detectSchemaType` → matching widget
- **Placeholders:** snippet templates derived from `positional`/`kwargs` hints uniformly
- **Hover tooltips:** `nodeAt(pos)` → `schema.description` + `detectSchemaType`
- **Validation:** `schema.safeParse(value)` on each leaf, mark invalid ones

No separate codepaths. Background colour, node fill, keyframe time — all resolve through the same lookup.

## Migration plan

Parallel implementation, section-by-section swap:

1. **Build new walker** (`src/dsl/schemaWalker.ts`) driven by DocumentSchema.
2. **Extend `DslHints`** in `src/dsl/dslMeta.ts` with the new hint types.
3. **Annotate schemas** — add new hints to `DocumentSchema`, array fields, sectioned fields.
4. **Parity tests** — run new walker alongside existing parser; assert identical model output across all samples + existing tests.
5. **Migrate consumers section-by-section:**
   - Completions switch to walker-based schema walk
   - Click popup reads from walker-built AST
   - Snippet templates generated from hints via walker
   - Renderer uses model from walker
6. **Delete old parser** once all consumers migrated and all tests pass on the new walker.

At every step all existing tests (884+) keep passing. If a grammar form resists expression via hints, we stop and redesign the hint system — never hide it in walker code.

## Files

**New:**

- `src/dsl/schemaWalker.ts` — the walker interpreter
- `src/dsl/walkContext.ts` — walker state (token cursor, model path, AST accumulator)
- `src/dsl/hintExecutors.ts` — per-hint-type handlers (kwargs, positional, children, etc.)
- `src/__tests__/dsl/schemaWalker.test.ts` — walker unit tests
- `src/__tests__/dsl/schemaWalkerParity.test.ts` — parity with existing parser

**Modified:**

- `src/dsl/dslMeta.ts` — add new hint type definitions
- `src/types/schemaRegistry.ts` — annotate DocumentSchema fields with new hints
- `src/types/node.ts`, `src/types/properties.ts`, `src/types/animation.ts` — annotate schemas where needed
- `src/dsl/astTypes.ts` — may simplify now that AST shape is uniform
- `src/dsl/astCompletions.ts` — rewrite to use walker-based schema traversal
- `src/editor/plugins/clickPopupPlugin.ts` — read walker AST
- `src/editor/plugins/completionPlugin.ts` — use walker for context detection
- `src/parser/parser.ts` — thin wrapper over walker

**Deleted after migration:**

- `src/dsl/astParser.ts` — hand-coded parser

**Preserved:**

- `src/dsl/tokenizer.ts`
- `src/dsl/types.ts` (Token types)
- `src/dsl/astEmitter.ts` (model → text, separate concern)
- All Zod schemas

## Testing strategy

- **Hint executor unit tests**: each hint type tested in isolation (keyword, positional per format, kwargs, flags, sigil, children, variants, topLevel, instanceDeclaration, flatReference, sectionKeyword, indentedEntries).
- **Walker unit tests**: walker against small DocumentSchema-annotated examples, asserting model + AST output.
- **Parity tests**: all existing samples + test DSL fed through both parsers; model output must match exactly.
- **Interaction tests**: completions, click popups, placeholders verified against the walker's AST for each section type.

## Success criteria

For every property defined in a Zod schema:

- Autocomplete ✓
- Click popup ✓
- Placeholders when completing ✓
- Hover tooltip with description ✓
- Inline validation ✓

If any are ✗, either the schema lacks hints OR the walker is incomplete — both immediately actionable. The audit runs automatically as a test.
