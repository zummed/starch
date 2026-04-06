# Schema-Mapped Editor with Direct-Binding Popups

## Problem

The current popup system has multiple layers of indirection: click → cursor path inference → stripModelPrefix → schema resolution → bubbling heuristics → popup state (navStack, wrappedOnChange) → diffAndUpdate → updateProperty. Each layer was added incrementally to fix edge cases, resulting in ~1500 lines of fragile code where small issues (e.g., clicking flex-grow children changes the parent root) require disproportionate effort to fix.

The root cause: the text generator knows what every token means at emit time, but throws that context away as a plain string. Every downstream consumer (click handling, popups, completions) must independently reconstruct that context from cursor position — and each reconstruction has its own bugs.

## Solution

A schema-driven rendering pipeline where text and schema annotations are produced in a single pass. CodeMirror decorations carry schema metadata on every text range. Clicks read the decoration. Popups bind directly to the model. One source of truth flows through the entire system.

Additionally: drop JSON5 rendering entirely, DSL only.

## Architecture

### 1. Schema-Driven Text Renderer

One renderer walks the model. For each value, the zod schema determines how to emit DSL text. It produces text + spans in a single pass:

```typescript
interface SchemaSpan {
  from: number;        // character offset in text
  to: number;
  schemaPath: string;  // e.g., "stroke.color" — for schema lookup
  modelPath: string;   // e.g., "objects.box.stroke.color" — for model read/write (node ID, not array index)
  section: 'node' | 'style' | 'animate' | 'images';  // determines root schema
}

interface RenderResult {
  text: string;
  spans: SchemaSpan[];
}
```

The renderer visits each node in the model, looks up its schema, and dispatches to format functions per schema type:
- Numbers emit as numbers
- Colors emit as HSL shorthand or named color
- Objects emit their keyword + children indented
- Enums emit their string value

Each format function records the character range and schema/model path of what it emits.

**Section-aware schema resolution:** The `section` field determines which root schema to resolve `schemaPath` against:
- `'node'` → `NodeSchema`
- `'style'` → `NodeSchema` (styles are node property sets)
- `'animate'` → `AnimConfigSchema`
- `'images'` → image-specific schema

This allows the same `schemaPath` (e.g., `"duration"`) to resolve correctly in different sections.

**Inline composite tokens:** The DSL packs multiple values on one line (e.g., `rect 140x80 fill blue stroke red width=2`). The renderer must produce fine-grained per-token spans for each sub-value. This is real complexity — but it moves from post-hoc cursor inference to the renderer, where the schema context already exists. Each token in `140x80` gets its own span (`rect.w` for `140`, `rect.h` for `80`). The renderer knows what it's emitting, so this is a matter of tracking offsets, not re-inferring meaning.

**Structural syntax:** Characters that are syntax rather than values (`:`, indentation, `->`, `at`, `=`, blank lines) do not get spans. Only value tokens are spanned.

**FormatHints:** The renderer accepts `FormatHints` to determine inline vs. block layout for each node, preserving the existing toggle behavior.

Adding a new property to a zod schema automatically gets rendering, click targeting, popup support, and completion — the renderer discovers properties from the schema, not from hardcoded format logic.

Replaces the current `dslEmitter` which has per-property special-casing.

### 2. Span Map as CodeMirror Decorations

The span array from the renderer gets applied to CodeMirror as `Decoration.mark` with metadata. Each decoration carries its `schemaPath`, `modelPath`, and `section`.

**On click:** Read the decoration at the click position. You immediately have:
- What schema type it is (look up `schemaPath` against the root schema for `section`)
- Where to read/write the value (the `modelPath`)
- If the click lands on unspanned syntax (whitespace, `:`, etc.), no popup opens

**On hover:** Read the decoration to show schema type and description as a tooltip. Replaces the current hover tooltip system that uses cursor-path inference.

**On text edit:** CodeMirror handles the keystroke normally → ModelManager parses the new text → renderer re-emits text + spans → decorations are **fully replaced** (not incrementally mapped, since character offsets shift on edit).

**Model path stability:** `modelPath` uses node IDs rather than array indices (e.g., `"objects.box.stroke.color"` not `"objects.0.stroke.color"`). Array indices shift when nodes are added/removed/reordered; node IDs are stable. The ModelManager resolves ID-based paths at write time: scan `_json.objects` by `id` field to find the array index, replace the ID segment with the index, then call `setNestedValue`. This scan is O(n) per write but trivial for typical scene sizes. Style paths use their named key directly (e.g., `"styles.headline.fill.color"`) — style keys are already stable string identifiers, no resolution needed.

Replaces `dslCursorPath.ts` (526 lines), `cursorPath.ts` (175 lines), and the bubbling/stripModelPrefix logic in V2Editor.

### 3. Direct-Binding Popups

When you click a span, the click handler walks up the `schemaPath` to find the nearest compound ancestor (using `detectSchemaType` — compounds are 'object' or 'color'). The popup opens at the compound level.

The popup queries `getAvailableProperties(schemaPath)` and builds a widget for each sub-property, each bound directly to the model:

```
Click on "width" span inside stroke
  → leaf schemaPath: "stroke.width", section: "node"
  → parent compound: "stroke", modelPath: "objects.box.stroke"

Popup builds:
  color widget → reads/writes modelManager.updateProperty("objects.box.stroke.color", value)
  width slider → reads/writes modelManager.updateProperty("objects.box.stroke.width", value)
```

**Alignment quality-of-life:** When a leaf span is clicked, the popup receives an `initialFocusKey` prop (e.g., `"width"`). This does not navigate into a sub-view — the popup always shows the full compound. Instead, it scrolls the compound widget list so the `initialFocusKey` widget is visually aligned with the click point, and optionally highlights/focuses that widget's input.

**Node-level clicks:** If walking up `schemaPath` reaches the root (empty string), the popup opens for the node itself. The popup must filter geometry properties to only show the active geometry type (e.g., only `rect` fields if the node has `rect`), not all six geometry schemas simultaneously.

**Animation section:** Popups for animation spans resolve against `AnimConfigSchema`. The `section` field on the span tells the popup which root schema to use.

No navStack. No wrappedOnChange. No diffAndUpdate. No value reconstruction. Each widget is an independent pipe to the model.

### 4. Schema-Driven Completions

When the user triggers completion, read the span at or adjacent to the cursor:

- **Inside a compound span** → `getAvailableProperties()` → suggest remaining sub-properties
- **At a value position** → schema type determines suggestions (named colors for ColorSchema, enum values for enums, etc.)
- **At node level** → NodeSchema shape gives all top-level property names minus what's already present
- **Number position** → `getNumberConstraints()` for validation
- **Animation section** → completions resolve against `AnimConfigSchema`

**Mid-typing fallback:** Spans reflect the last valid parse. When the user is mid-keystroke and the document doesn't parse, the completion provider falls back to the most recent valid span map. The span adjacent to or containing the cursor position (from the last valid state) provides approximate context. This is good enough — the user is typing a value they already know, they just need suggestions narrowed to the right type.

One completion provider, driven entirely by schema introspection. No per-property special cases.

### 5. What Gets Deleted

| File/Code | Lines | Replaced By |
|-----------|-------|-------------|
| `dslCursorPath.ts` | 526 | Span lookup on decoration |
| `cursorPath.ts` | 175 | Deleted (JSON5 gone) |
| JSON5 emitter/rendering | ~200 | Deleted (DSL only) |
| `stripModelPrefix()` | ~10 | Spans carry both paths |
| Bubbling logic (V2Editor 395-408) | ~15 | Walk up schemaPath to compound |
| `navStack` + `wrappedOnChange` + `diffAndUpdate` (PropertyPopup/V2Editor) | ~150 | Direct model bindings |
| `handleEditorClick` inference chain (V2Editor 349-430) | ~80 | Read decoration metadata |
| Hover tooltip cursor-path inference (V2Editor 136-214) | ~80 | Span lookup on decoration |

**Estimated net change:** ~1500 lines deleted, replaced by schema renderer + span map (~300-400 lines) and simplified popup (~150-200 lines).

### 6. Gutter Toggle

The existing inline/block gutter toggle identifies node-header lines by regex. After the refactor, the gutter can use span metadata to identify node-header lines (any line containing a span with a node-level `modelPath`). The `FormatHints` toggle behavior is unchanged — clicking the gutter flips the hint and re-renders.

## Data Flow

```
Model + FormatHints (source of truth)
  ↓
SchemaRenderer walks model + zod schemas + FormatHints
  ↓
RenderResult { text, spans[] }
  ↓
CodeMirror document ← text
CodeMirror decorations ← spans (with schemaPath + modelPath + section metadata)
  ↓
User clicks → read decoration → resolve section root schema → open popup at compound level
  ↓
Popup widgets → each calls modelManager.updateProperty(modelPath, value) directly
  ↓
ModelManager resolves ID-based modelPath → updates model → re-render → new text + spans → CodeMirror updated
```

```
User types → CodeMirror handles edit → ModelManager.setText() parses
  ↓
ModelManager updates model → re-render → new text + spans → decorations fully replaced
```

## Key Invariants

1. **Spans and text are always in sync** — produced by the same traversal, fully replaced on every re-render
2. **Every value token belongs to exactly one span** — structural syntax (`:`, `=`, whitespace, keywords) has no span
3. **Schema is the single source of truth** — rendering, click targets, popups, completions, hover tooltips, and validation all derive from zod schemas
4. **Popups have no internal navigation state** — they render what the schema says, widgets bind directly to model paths
5. **Adding a property to a zod schema is sufficient** — rendering, editing, and completion follow automatically
6. **Model paths use node IDs, not array indices** — paths are stable across edits that reorder nodes

## Open Questions

- **ModelManager internal round-trip:** `updateProperty` currently uses `JSON5.stringify` → `parseScene` internally to rebuild `_model` after a mutation. With JSON5 rendering removed from the UI, this internal round-trip can remain as an implementation detail (it's not user-facing), or be replaced with direct model mutation + DSL re-emission. The simpler path is to leave it for now and clean up later.
- **Undo/redo for popup edits:** Currently, popup edits bypass CodeMirror's history stack (they mutate the model directly and push new text). This means Ctrl+Z doesn't undo popup changes. This is a pre-existing limitation, not introduced by this design, but worth noting as a future improvement.
