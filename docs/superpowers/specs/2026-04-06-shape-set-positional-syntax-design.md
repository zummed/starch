# Shape Set Positional Syntax Design

**Date:** 2026-04-06
**Goal:** Make shape set shapes feel like primitives — positional args, snippet templates, and full autocomplete help, all driven by `dsl()` hints on existing zod schemas.

## Problem

Primitives like `rect` use `dsl()` to annotate their zod schemas with `DslHints`. This gives them positional argument parsing (`rect 100x200`), snippet templates (`rect ${1:W}x${2:H}`), and contextual completions.

Shape set shapes (e.g., `core.box`) have bare zod schemas with no `DslHints`. They only support `key=val` kwargs (`box w=100 h=50 text="Hello"`), with no positional parsing, no snippets, and no post-keyword help. This makes them feel second-class compared to primitives.

## Approach

Wrap each shape's existing `props` zod schema with `dsl()` — the same pattern primitives already use. The parser and editor already know how to handle `DslHints`; they just need access to the shape schemas.

## Shape Syntax Mapping

### Text + dimensions (quoted + dimension positionals)

| Shape | Syntax Example | Positionals | Kwargs |
|-------|---------------|-------------|--------|
| `box` | `box "Login" 200x80` | text (quoted), w×h (dimension) | radius, color, textColor, textSize |
| `pill` | `pill "Tag" 80x30` | text (quoted), w×h (dimension) | color |
| `note` | `note "Remember" 140x80` | text (quoted), w×h (dimension) | color |
| `card` | `card "Title" 180x100` | title (quoted), w×h (dimension) | body, color |
| `group` | `group "Services" 300x200` | label (quoted), w×h (dimension) | color, direction, gap |
| `state.region` | `region "Main" 300x200` | label (quoted), w×h (dimension) | color, direction, gap |

### Text + radius (quoted + single number)

| Shape | Syntax Example | Positionals | Kwargs |
|-------|---------------|-------------|--------|
| `circle` | `circle "Label" 40` | text (quoted), r (spaced) | color, textSize |

### Text only (quoted positional)

| Shape | Syntax Example | Positionals | Kwargs |
|-------|---------------|-------------|--------|
| `state.node` | `node "Idle"` | name (quoted) | entry, exit, w, h, color |

### Connection shapes (arrow positional)

| Shape | Syntax Example | Positionals | Kwargs |
|-------|---------------|-------------|--------|
| `arrow` | `arrow A -> B` | from→to (arrow) | label, bend, color, dashed, gap |
| `line` | `line A -> B` | from→to (arrow) | label, bend, color, dashed |

### No positional (kwargs only)

| Shape | Syntax Example | Positionals | Kwargs |
|-------|---------------|-------------|--------|
| `table` | `table cols=... rows=...` | — | cols, rows, colWidth, rowHeight |
| `codeblock` | `codeblock lines=...` | — | lines, size |
| `textblock` | `textblock lines=...` | — | lines, size, color, mono, bold |
| `state.initial` | `initial` | — | color, r |
| `state.final` | `final` | — | color, r |
| `state.choice` | `choice` | — | color, size |

All positionals are optional (the underlying zod fields are optional). The fully-qualified (`core.box`) and shortcut (`box`) syntaxes behave identically.

## Implementation Changes

### 1. Add `dsl()` hints to shape prop schemas

Each shape's `props` schema gets wrapped with `dsl()`. Example for `box`:

```ts
export const boxProps = dsl(z.object({
  text: z.string().describe('Label text').optional(),
  w: z.number().min(1).describe('Width').optional(),
  h: z.number().min(1).describe('Height').optional(),
  radius: z.number().min(0).describe('Corner radius').optional(),
  color: z.string().describe('Color').optional(),
  textColor: z.string().describe('Text color').optional(),
  textSize: z.number().min(1).describe('Font size').optional(),
}), {
  positional: [
    { keys: ['text'], format: 'quoted' },
    { keys: ['w', 'h'], format: 'dimension' },
  ],
  kwargs: ['radius', 'color', 'textColor', 'textSize'],
});
```

### 2. Parser: use DslHints when parsing template props

In `hintExecutors.ts`, after resolving the template name (both explicit `template` and implicit paths), look up the `ShapeDefinition` from the registry, get the `dsl()` hints from its `props` schema, and call the existing `executePositional()` before the `key=val` loop.

Flow:
1. Detect template name (e.g., `box`, `core.box`)
2. Resolve `ShapeDefinition` → get `props` schema → get `DslHints`
3. Parse positionals via existing `executePositional()`
4. Parse remaining `key=val` kwargs (existing code)
5. Merge both into `result.props`

### 3. Completions: derive snippets from shape schemas

In `astCompletions.ts`, when generating completions for shape names (after `id:` or after `setName.`), look up the shape's `DslHints` via the registry and call `buildSnippetTemplate()` to generate snippet templates.

The existing completion infrastructure already handles:
- `buildSnippetTemplate()` — generates full snippets like `box "${1:text}" ${2:W}x${3:H}`
- `buildPositionalOnlySnippet()` — generates post-keyword snippets like `"${1:text}" ${2:W}x${3:H}`
- `kwargValueCompletions()` — type-aware value suggestions from zod schema

These functions currently look up schemas from the static `ANNOTATED_SCHEMAS` table. They need a fallback path that queries the shape registry when the schema isn't found in the static table.

### Files to modify

| File | Change |
|------|--------|
| `src/templates/sets/core/box.ts` | Wrap `boxProps` with `dsl()` |
| `src/templates/sets/core/circle.ts` | Wrap `circleProps` with `dsl()` |
| `src/templates/sets/core/arrow.ts` | Wrap `arrowProps` with `dsl()` |
| `src/templates/sets/core/line.ts` | Wrap `lineProps` with `dsl()` |
| `src/templates/sets/core/pill.ts` | Wrap `pillProps` with `dsl()` |
| `src/templates/sets/core/card.ts` | Wrap `cardProps` with `dsl()` |
| `src/templates/sets/core/note.ts` | Wrap `noteProps` with `dsl()` |
| `src/templates/sets/core/group.ts` | Wrap `groupProps` with `dsl()` |
| `src/templates/sets/core/textblock.ts` | No `dsl()` (no positional) |
| `src/templates/sets/core/codeblock.ts` | No `dsl()` (no positional) |
| `src/templates/sets/core/table.ts` | No `dsl()` (no positional) |
| `src/templates/sets/state/node.ts` | Wrap with `dsl()` |
| `src/templates/sets/state/region.ts` | Wrap with `dsl()` |
| `src/templates/sets/state/initial.ts` | No `dsl()` (no positional) |
| `src/templates/sets/state/final.ts` | No `dsl()` (no positional) |
| `src/templates/sets/state/choice.ts` | No `dsl()` (no positional) |
| `src/dsl/hintExecutors.ts` | Use DslHints for positional parsing in template paths |
| `src/dsl/astCompletions.ts` | Query registry for shape schemas in completion lookups |
| `src/templates/registry.ts` | Expose `getShapePropsSchema()` helper |

### Note on arrow/line positional format

The `arrow` positional format used by primitive paths produces a `route` array. The arrow/line template functions currently expect separate `from` and `to` string props. The positional hint for these shapes should use `format: 'spaced'` with two keys (`from`, `to`) rather than the `arrow` format, since the template functions handle route construction internally. Alternatively, if the arrow format can be configured to emit `from`/`to` instead of `route`, that would also work. The implementation should verify which approach fits the existing `executePositional()` logic.

### Testing

- Existing integration tests in `src/__tests__/templates/integration.test.ts` verify the old `key=val` syntax — these should still pass (kwargs still work)
- Add new test cases for positional syntax: `box "Login"`, `box "Login" 200x80`, `arrow A -> B`, etc.
- Verify snippet generation for shape completions
- Verify mixed positional + kwargs: `box "Login" 200x80 color=blue`
