# ProseMirror Structural Editor

**Date:** 2026-04-04
**Status:** Approved
**Replaces:** CodeMirror 6 editor (`V2Editor.tsx`, `modelManager.ts`, `dslLanguage.ts`, `astDecorations.ts`)

## Problem

The current editor is built on CodeMirror 6 — a text buffer with structural overlays. This creates an impedance mismatch: the Zod model is the real data, but the editor treats text as the source of truth, requiring constant bridging (AST parse/emit cycles, decoration overlays, portal-based popups, cursor-to-path mapping). Every editor feature must translate between character positions and model paths.

## Vision

Replace CM6 with a ProseMirror-based structural editor where the document model is a typed node tree generated from Zod schemas. The editor directly manipulates structure, not text. DSL text becomes a serialization format for import/export only.

## Architectural Principle: One-Way Data Flow

```
Zod Schemas (source of truth for types)
    |
ProseMirror Schema (generated once at startup)
    |
ProseMirror Doc (the live document - typed nodes)
    |
Model JSON (extracted from doc - pure derivation)
    |
Renderer (consumes model, produces SVG)
```

**Rules:**

1. **Zod schemas define what exists.** Every node type, property, constraint, and hint originates from Zod + DslHints. Nothing else declares types.
2. **ProseMirror doc is the single live state.** There is no separate model object that needs syncing. The doc *is* the model, viewed structurally.
3. **Model JSON is derived, not stored.** A pure function `extractModel(doc) -> JSON` runs on every transaction. No manager holding parallel state.
4. **DSL text is a serialization format.** `toText(doc)` and `fromText(text)` are import/export. Never part of the editing loop.
5. **NodeViews are pure renderers of their node.** They read attrs and content, render UI, and dispatch transactions. No side-channel state.

## Zod-to-ProseMirror Schema Bridge

A function `buildProseMirrorSchema(zodSchemas)` walks annotated Zod schemas and emits ProseMirror NodeSpecs.

### Mapping

| Zod concept | ProseMirror concept |
|---|---|
| `DocumentSchema` | `doc` node (top-level) |
| `NodeSchema` (rect, ellipse, text...) | Custom node types with typed attrs |
| Leaf properties (number, string, enum, boolean) | Inline "slot" nodes with editable text + schema constraint |
| `HslColor`, `Stroke`, compound objects | Compound node types with child slots |
| `StyleSchema`, `AnimateSchema` | Section node types (block content) |
| Unresolved user input | `draft` node type with raw text + schemaPath context |

### DraftNode

A special node type: `{ text: string, schemaPath: string, expectedType: string }`.

- When the user types in any slot, it may temporarily become a DraftNode
- A plugin watches DraftNodes and attempts to resolve them against the slot's Zod schema on every transaction
- When valid: replaced with the correctly typed node
- When invalid: stays as draft with inline diagnostic hint
- Because the schema context is always known (the DraftNode knows it's in the `fill` slot of a `rect`), completions and hints are always scoped correctly

## Rendering: NodeViews

Each ProseMirror node type gets a React NodeView controlling appearance and behavior.

### Document structure

```
doc
+-- scene-node ("myRect")          -> keyword line: "rect 100x200"
|   +-- geometry-slot              -> inline editable: "100x200"
|   +-- property-slot ("fill")     -> "fill hsl(200, 80%, 50%)" + color swatch
|   +-- property-slot ("opacity")  -> "opacity 0.5" + inline slider on hover
|   +-- style-section              -> collapsible "@style { ... }"
|   |   +-- property-slots...
|   +-- animate-section            -> collapsible "animate { ... }"
|       +-- keyframe-nodes...
+-- scene-node ("myCircle")
    +-- ...
```

### NodeView types

| NodeView | Renders as | Inline widgets |
|---|---|---|
| `SceneNodeView` | Keyword + name + positional args, collapsible body | Fold gutter marker |
| `PropertySlotView` | Key = value text, editable | Type-aware: color swatch, enum badge, number scrubber |
| `CompoundView` | Grouped child slots (e.g., HslColor -> h/s/l slots) | Compound popup on click |
| `DraftView` | Raw text with dimmed schema hint | Expected type, completion trigger |
| `SectionView` | Collapsible block with header (style, animate) | Fold/unfold |

### Styling

The editor looks like code — monospace font, indentation, keyword coloring — but styling comes from CSS on NodeView elements (`.keyword`, `.value.number`, `.value.color`) rather than token-based highlighting. This allows styling based on schema type, not syntax tokens.

### Widgets

Existing popup components are reused inside NodeViews:
- `ColorPicker` — mounted by PropertySlotView when schema type is color
- `NumberSlider` — mounted for number types with min/max constraints
- `EnumDropdown` — mounted for enum types
- `PointRefEditor` — mounted for PointRef types
- `AnchorEditor` — mounted for anchor types

These are anchored to their NodeView's DOM naturally. No portals, no z-index fights.

## Input, Navigation, and Editing

### Text input

- Clicking or navigating into a slot activates normal text editing (characters, backspace, selection, copy/paste, IME) handled natively by ProseMirror
- Each keystroke triggers draft resolution against the slot's Zod schema
- Valid input resolves immediately; invalid input shows inline hint

### Structural navigation

- `Alt+Up/Down` — move between sibling nodes (fill -> opacity -> stroke)
- `Alt+Left/Right` — move between parent/child (rect node -> its first property, or back out)
- `Tab/Shift+Tab` — move between editable slots within a node
- Plain arrow keys — character movement within current slot

### Selection

- **Slot editing:** cursor in one text slot at a time
- **Node selection:** `Escape` or clicking keyword/gutter selects the whole node (visual outline). `Delete` removes, `Enter` enters, arrows move between siblings
- **Multi-node:** Shift+click or Shift+Alt+Arrow for range selection (cut/copy/delete)

### Completions

- Triggered by `Ctrl+Space` or automatically in draft slots
- Plugin reads current node's schemaPath from doc structure directly
- Core lookup logic reused from existing `astCompletions.ts`
- Rendered as floating menu anchored to slot DOM
- Rich items: color swatches, type badges, grouped by category

### Undo/Redo

- ProseMirror's built-in history plugin
- Operates at structural level: "changed fill from red to blue" not "deleted 3 chars, typed 4"

### Clipboard

- Copy node: clipboard holds DSL text (external paste) + ProseMirror slice (structural paste)
- Paste DSL text: parsed via `importDsl()` into typed nodes, inserted structurally
- Paste within editor: structural insert preserving types

## Integration with Existing Systems

### Reused as-is

- All Zod schemas + DslHints (`dsl()`, `dslMeta.ts`) — still the single source of truth
- `schemaRegistry.ts` — NodeViews use `detectSchemaType()`, `getEnumValues()`, `getNumberConstraints()`
- Popup components (ColorPicker, NumberSlider, EnumDropdown, PointRefEditor, AnchorEditor) — moved to `widgets/`, CM6 deps stripped
- Completion logic from `astCompletions.ts` — core lookups reused, delivery changes
- Renderer (V2Diagram, SVG backend) — untouched, still receives model JSON
- Animation engine, templates, layout — untouched

### Adapted

- `astParser.ts` — becomes the engine behind `importDsl(text): ProseMirrorDoc`. Used on file load and paste only.
- `astEmitter.ts` — becomes the engine behind `exportDsl(doc): string`. Used on file save and copy only.
- `formatHints.ts` — inline/block preference stored as ProseMirror node attrs on the node itself.

### Removed

- `ModelManager` (`modelManager.ts`) — replaced by `extractModel(doc)` pure function
- `astDecorations.ts` — structure is the document, not an overlay
- `dslLanguage.ts` (CM6 tokenizer) — replaced by CSS on NodeView elements
- `theme.ts` (CM6 theme) — replaced by standard CSS
- `V2Editor.tsx` (CM6 setup) — replaced by `StructuralEditor.tsx`
- CM6 hover tooltip plugin — replaced by NodeView-native tooltips
- CM6 autocompletion adapter — replaced by ProseMirror completion plugin

## Module Structure

```
src/editor/
+-- schema/
|   +-- bridgeSchema.ts      -- Zod+DslHints -> ProseMirror NodeSpecs
|   +-- draftNode.ts         -- DraftNode type + resolution plugin
+-- views/
|   +-- SceneNodeView.tsx     -- rect, ellipse, text, etc.
|   +-- PropertySlotView.tsx  -- single typed property
|   +-- CompoundView.tsx      -- grouped sub-properties
|   +-- SectionView.tsx       -- style/animate blocks
|   +-- widgets/              -- ColorPicker, NumberSlider, etc.
+-- plugins/
|   +-- completionPlugin.ts   -- schema-aware completions
|   +-- navigationPlugin.ts   -- Alt+Arrow structural nav, Tab between slots
|   +-- draftResolver.ts      -- watches DraftNodes, resolves when valid
+-- io/
|   +-- importDsl.ts          -- text -> ProseMirror doc
|   +-- exportDsl.ts          -- ProseMirror doc -> text
+-- extractModel.ts           -- doc -> JSON (pure function)
+-- StructuralEditor.tsx      -- mounts ProseMirror, connects to renderer
```

## Dependencies

### Add

- `prosemirror-model` — document model and schema
- `prosemirror-state` — editor state and transactions
- `prosemirror-view` — editor view and NodeViews
- `prosemirror-transform` — document transformations
- `prosemirror-history` — undo/redo
- `prosemirror-keymap` — key bindings
- `prosemirror-commands` — basic editing commands
- `prosemirror-inputrules` — input rule triggers
- `@prosemirror-adapter/react` — React integration for NodeViews (provides `useNodeViewFactory` hook, avoids manual DOM↔React bridging)

### Remove

- `@codemirror/autocomplete`
- `@codemirror/commands`
- `@codemirror/lang-json`
- `@codemirror/language`
- `@codemirror/state`
- `@codemirror/view`
- `@codemirror/lint`

## Testing Strategy

- **Schema bridge:** Unit tests that Zod schemas produce correct ProseMirror NodeSpecs
- **extractModel:** Unit tests that doc -> JSON produces expected model for each node type
- **Import/Export round-trip:** DSL text -> importDsl -> exportDsl -> same text (reuse existing parity tests)
- **DraftNode resolution:** Unit tests that typed text resolves to correct node types
- **NodeView rendering:** Component tests for each view type
- **Navigation:** Integration tests for Alt+Arrow, Tab, Escape key behaviors
- **Completions:** Unit tests that schema-scoped suggestions match existing completion test cases
