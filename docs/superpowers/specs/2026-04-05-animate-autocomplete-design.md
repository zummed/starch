# Context-Aware Animate Autocomplete

**Date:** 2026-04-05
**Status:** Draft

## Problem

Autocomplete inside `animate` blocks does not reflect the scene being edited. Two concrete failures motivate this work:

1. **Header completions miss flags and kwargs.** Typing `animate 10s ` + ctrl+space shows top-level/object-shaped suggestions instead of the animate-config flags (`loop`, `autoKey`) and kwargs (`easing=`) defined on `AnimConfigSchema`.
2. **Keyframe paths are blind to the scene.** Typing a keyframe assignment like `card.bg.f` + ctrl+space does not enumerate reachable paths from the scene — the user must remember every node id, sub-object, and animatable leaf.

Underneath both failures is the same root cause: the completion system treats the `animate` section as a single bucket (`sectionCompletions` for `sp === 'animate'` returns only flags + `chapter`) and never routes to the specific *sub-context* the cursor is in.

## Goal

Autocomplete inside `animate` blocks recognises four distinct cursor contexts and, for keyframe paths, enumerates scene-reachable properties tiered by how they're already used. Context detection is structural — derived from AST position, schemaPath, and tokenizer indent — never from pattern-matching regexes on content.

## Scope

**In scope:**
- Structural sub-context taxonomy for cursor positions inside an `animate` block.
- Tiered, progressive path completion for keyframe assignments (main feature).
- Schema-driven value completion after `:` on a keyframe change line.
- Header-flags bug fix (item 1 above).
- A general-purpose model-path walker utility (reusable beyond this spec).

**Out of scope (captured as future direction below):**
- Composite click-popups for intermediate path segments.
- Reformulating remaining regex branches in `lineTextCompletions` as structural dispatches.
- Generalising the model-path walker into hover/diagnostics.
- The separate bug where pressing Tab erases in-progress edits (a ProseMirror keyboard-handling issue, not a completion issue).

## Principle: structural context, scanned partials

Two different "text reading" activities need to be kept distinct:

1. **Context detection** — where in the document the cursor is, and what the user is doing — is derived purely from structural sources: AST position, schemaPath, enclosing section, tokenizer-provided indent and line positions. Never from content pattern matching.
2. **Partial-token extraction** — what prefix the user has typed so far to filter against — is extracted by a simple backward character scan from the cursor to the nearest delimiter (whitespace, colon, equals). This is tokenisation-style scanning for a single delimiter, not pattern matching on content shape. Completion inherently needs to know the prefix to filter.

The regexes this spec objects to — and eliminates for the animate case — are context-detection regexes: patterns like `\b(\w+)\s+\w*$` that infer "we're in a keyword-plus-positional context" from content shape. These duplicate information the parser already has and are fragile under partial input.

## Design

### 1. Context taxonomy

An `animate` block has four cursor contexts, each structurally distinguishable:

| Context | Structural signature | Completions |
|---|---|---|
| **Header** | Cursor's enclosing section is `animate`, AND `lineOf(cursor) === lineOf(animateSection.from)` (the section's start position, which is at the `animate` keyword) | Flags (`loop`, `autoKey`) and kwarg snippets (`easing=${1}`) from `AnimConfigSchema` hints |
| **Keyframe-start** | Enclosing section is `animate`, cursor line > header line, cursor indent equals the block's keyframe indent (one level deeper than the header), no existing keyframe AST node covers the cursor line | Numeric timestamp snippet, `chapter` keyword |
| **Path** | Enclosing section is `animate`, and either (a) cursor is on a line whose first token is a numeric timestamp already present in the AST (inline change after the timestamp), or (b) cursor indent is deeper than the nearest preceding keyframe's timestamp indent (indented change block under that keyframe) | Tiered path completions (see §2) |
| **Value** | Cursor is after a `:` token on a keyframe change line — i.e., nearest preceding AST node on the line has `schemaPath` matching `animate.keyframes.N.changes.X.path` | Schema-type-driven values for the resolved path (see §3) |

Context detection uses two new structural helpers in `astTypes.ts`:
- `lineOf(pos, text)` — returns the line index for a position. Text is read only to count newlines; no content matching.
- `indentOf(pos, text)` — returns the count of leading whitespace characters on the line containing `pos`.

Both helpers consume text positionally (line and indent are structural). Neither does content pattern matching.

### 2. Path-completion algorithm

When the cursor is in Path context with a partial string like `card.bg.f`:

**Step 1 — Extract the partial path.** Scan backward from the cursor to the nearest delimiter (whitespace or `:`). Split the result by `.` into segments. The last segment is a prefix; earlier segments are complete.

**Step 2 — Resolve the walk.** Using `resolvePath(modelJson, segments[0..n-1])`:
- Segment 0 must be a scene node id → look up in the model's object tree.
- Each subsequent complete segment resolves to a child node, a sub-object (stroke, transform, dash, layout), or a leaf property. The walker steps one schema at a time, using Zod schemas to know what keys are valid.
- If resolution fails at any step (e.g., segment 0 doesn't name a real node): fall back by returning all scene nodes as tier-3 candidates, with a single extra `CompletionItem` of type `'info'` and label `no match for "<segment>"` so the user sees why the list is unfiltered.

**Step 3 — Enumerate next-level keys.** At the resolved location, return:
- For a node: child-node ids + the node's directly-declared properties from its Zod schema (each property appears exactly once, classified by its schema type as either a leaf or a drill target per Step 5).
- For a sub-object: the sub-object schema's declared fields (again classified by type).
- Scalar leaves are returned as **terminal** completions (they auto-insert a trailing `:` and do not continue drilling).

**Step 4 — Tier results.** Let `prefix = segments[0..n-1].join('.')`. For each candidate `c`:
- **Tier 1 — "animated"**: some existing animated path in `animate.keyframes[*].changes[*].path` starts with `prefix + '.' + c` (or equals it for leaves). Drill targets count as tier 1 if any animated path descends through them.
- **Tier 2 — "set"**: for leaves, the property has an explicit value in the scene model (not a Zod default). For drill targets, any descendant leaf has an explicit value.
- **Tier 3 — "available"**: schema-reachable but not in either of the above.

Tier membership is encoded in each `CompletionItem`'s existing `detail` field using short markers: `animated`, `set: <current value>`, `available`. Tiers order the result list (tier 1 first). Current values are included in the `set` detail where concise (colors, numbers, enums); omitted otherwise.

**Step 5 — Leaf policy.** A "leaf" is any scalar animatable property (color, number, boolean, enum). Color sub-objects (e.g., `fill`) are offered as single-value leaves because they interpolate whole. Multi-field sub-objects (`stroke`, `transform`) are offered as drill targets; their sub-fields appear on the next dot.

### 3. Value completions after `:`

After a `:` is typed, completion uses the same path walker to resolve the full path and then `detectSchemaType` on the resolved Zod schema:

- `color` → `colorCompletions()` (existing helper: named colors + `hsl`/`rgb`/`hex` snippets).
- `enum` → `getEnumValues()` → list values.
- `number` → no free list of values.
- `boolean` → `true` / `false`.

Across all types, when the scene has a current concise value for the resolved path, it's included as a top-ranked completion item with detail `current: <value>` so the user can hold a starting value without retyping. "Concise" means: named colors, short hex/hsl/rgb forms, numbers, booleans, enum values. Longer/structured values are omitted from this current-value item (the type-specific list still offers the normal options).

All existing helpers are reused — no new enum/colour/number machinery.

### 4. Header-flags bug fix

`completionsAt` is updated to detect Header context **before** delegating to `lineTextCompletions`. When `findNearestContext(ast, pos)` returns the animate section and `lineOf(pos) === lineOf(animateSection.from)`, control routes directly to `animateHeaderCompletions()`, which emits:
- Each entry in `AnimConfigSchema` hints' `flags` as a keyword completion.
- Each entry in `kwargs` as a snippet completion `<key>=${1}` (so the cursor lands past the `=`).

This short-circuits the existing regex-based keyword-plus-positional branch for the animate case. Other `lineTextCompletions` branches are untouched — they remain candidates for the same structural treatment in a follow-up.

## Files

**New:**
- `src/dsl/animateCompletions.ts` — the four context-specific completion handlers.
- `src/dsl/modelPathWalker.ts` — `resolvePath`, `enumerateNextSegments`, `pathExists`, `currentValueAt`. General-purpose; consumable from other completion contexts and future features (hover, diagnostics).
- `src/__tests__/dsl/animateCompletions.test.ts`
- `src/__tests__/dsl/modelPathWalker.test.ts`

**Modified:**
- `src/dsl/astCompletions.ts` — context-detection dispatch for animate sub-contexts before existing fallbacks.
- `src/dsl/astTypes.ts` — add `lineOf(pos, text)` and `indentOf(pos, text)` structural helpers.
- `src/__tests__/dsl/astCompletions.test.ts` — cases covering routing decisions (which context maps to which handler).

## Testing

**Header context:**
- `animate 10s <cursor>` → flags + easing kwarg snippet.
- `animate 10s loop <cursor>` → flags minus the already-used `loop` + easing kwarg.
- `animate 10s easing=<cursor>` → `EasingName` enum values (regression guard; this already works via existing kwarg-value path and must continue to).

**Keyframe-start context:**
- Fresh indented line under `animate 5s` → numeric snippet + `chapter` keyword.

**Path context (tiering):**
Fixture scene: `card.bg` is `rect fill midnightblue stroke steelblue`, animate block already animates `card.bg.fill`.
- `<cursor>` → all scene node ids, with `card` tier-1 (appears under an animated path).
- `card.<cursor>` → `bg` tier-1, `badge`/`title`/`body` tier-2 (if explicitly set on the card tree) or tier-3.
- `card.bg.<cursor>` → `fill` tier-1 (animated), `stroke` tier-2 (set, as drill target), `opacity` tier-3.
- `card.bg.stroke.<cursor>` → `color` tier-2 (set), `width` tier-2 (set).
- `typo.<cursor>` → all scene nodes tier-3 + info item `no match for "typo"`.

**Value context:**
- `card.bg.fill: <cursor>` → named colours + `hsl`/`rgb`/`hex` snippets, with `current: midnightblue` top-ranked.
- `card.bg.opacity: <cursor>` → single item `current: 1` + (nothing else, number type has no enumerable values).
- `card.bg.dash.pattern: <cursor>` → enum values from `DashSchema`.

**Regression:**
- Existing `astCompletions.test.ts` tests for non-animate contexts all continue to pass.
- Existing animate-section flag completions (`sp === 'animate'` case) still work when the user is past the header line but on an empty line before any keyframe.

## Future direction

- **Composite click-popups on path segments.** Clicking an intermediate segment like `bg` in `card.bg.fill` would open a composite editor for all animatable properties under that segment, with edits writing new keyframe changes back to the block. Builds on `modelPathWalker` introduced here. Worth its own brainstorm for the writeback semantics (which keyframe receives edits, multi-field layout).
- **Structural rewrite of remaining `lineTextCompletions` branches.** The `@style`, `->` connection, `\w+:` geometry, and keyword-plus-positional branches currently use content regex for context detection. Each can be reformulated as an AST-position + schemaPath dispatch in the same style as this spec. Deferred to a follow-up refactor so this spec stays focused on animate.
- **Hover and diagnostics from `modelPathWalker`.** `pathExists` + `resolvePath` are the building blocks for "this path doesn't exist in the scene" diagnostics and hover tooltips showing current-value + type. Not built here, but designed to support these consumers.
