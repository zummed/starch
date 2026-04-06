# Code Block Editor Refactor

**Date:** 2026-04-04
**Status:** Approved
**Replaces:** Fine-grained structural NodeView editor (starchSchema with 15 node types, reactNodeView, all NodeView components)

## Problem

The structural editor with one ProseMirror node per DSL property creates unusable cursor behavior. Every node boundary is a cursor position, Enter/arrow keys jump unpredictably, and clicking to place a cursor is unreliable. ProseMirror is a text editor — we should use it as one.

## Design

Replace the 15-node-type schema with a single `code_block` node containing `text`. The entire DSL document is editable text. Structure comes from parsing and decorations, not from the node tree.

### Schema

```typescript
const schema = new Schema({
  nodes: {
    doc: { content: 'code_block' },
    code_block: { content: 'text*', code: true, defining: true, toDOM: () => ['pre', ['code', 0]] },
    text: { group: 'inline' },
  },
});
```

### Data Flow

```
User types in code_block
  → debounced parse via buildAstFromText()
  → model JSON extracted from parse result
  → onModelChange callback → renderer
```

No intermediate ProseMirror node structure. No extractModel walking a node tree. The parser already converts DSL text → model JSON — we just call it.

### StructuralEditor Component

Props unchanged: `{ initialDsl: string, onModelChange: (model) => void, height?: string }`

Internals simplified:
- Create `EditorState` with the code_block schema and the DSL text as content
- Mount `EditorView` with plugins: history, keymap, syntax highlighting, parse-on-change
- Parse-on-change plugin: on every doc change (debounced ~100ms), call `buildAstFromText(doc.textContent)`, extract model, call `onModelChange`
- `loadDsl(text)` replaces the entire doc content
- `getDsl()` returns `doc.textContent`

### Syntax Highlighting

A ProseMirror plugin that:
1. On doc change, tokenizes the text via the existing tokenizer
2. Builds `DecorationSet` with `Decoration.inline` ranges
3. Each decoration has a CSS class: `.dsl-keyword`, `.dsl-nodeId`, `.dsl-number`, `.dsl-string`, `.dsl-color`, `.dsl-comment`, etc.

The tokenizer already exists at `src/dsl/tokenizer.ts` and produces tokens with types and positions.

### Plugins

- `history()` + undo/redo keymap — standard
- `keymap(baseKeymap)` — standard text editing
- Syntax highlight plugin — decorations from tokenizer
- Parse-on-change plugin — debounced model extraction

### Files to Delete

- `src/editor/schema/starchSchema.ts`
- `src/editor/schema/schemaBuilder.ts`
- `src/editor/schema/draftNode.ts`
- `src/editor/reactNodeView.tsx`
- `src/editor/extractModel.ts`
- `src/editor/io/importDsl.ts`
- `src/editor/io/exportDsl.ts`
- `src/editor/views/SceneNodeView.tsx`
- `src/editor/views/PropertySlotView.tsx`
- `src/editor/views/CompoundSlotView.tsx`
- `src/editor/views/SectionView.tsx`
- `src/editor/views/MetadataView.tsx`
- `src/editor/views/KeyframeView.tsx`
- `src/editor/views/inlineSummary.ts`
- `src/editor/plugins/navigationPlugin.ts`
- `src/editor/plugins/completionPlugin.ts`
- `src/editor/plugins/draftResolverPlugin.ts`
- `src/editor/editorStyles.css`
- All tests in `src/__tests__/editor/` (except pmImports.test.ts)

### Files to Create/Rewrite

- `src/editor/StructuralEditor.tsx` — rewritten, much simpler
- `src/editor/plugins/syntaxHighlight.ts` — decoration plugin using tokenizer
- `src/editor/plugins/parseOnChange.ts` — debounced model extraction
- `src/editor/editorStyles.css` — just syntax highlighting classes + editor base styles

### Files Preserved As-Is

- `src/dsl/astParser.ts` — parser
- `src/dsl/astEmitter.ts` — emitter
- `src/dsl/tokenizer.ts` — tokenizer (used for highlighting)
- `src/dsl/dslMeta.ts`, `src/dsl/formatHints.ts`, `src/dsl/astTypes.ts`
- `src/types/` — all Zod schemas
- `src/parser/parser.ts` — parseScene
- `src/renderer/`, `src/animation/`, `src/templates/`
- `src/app/App.tsx` — unchanged (same StructuralEditor interface)
- `src/samples/index.ts` — unchanged
- `src/editor/views/widgets/` — kept for future popup integration

### Widget Integration (Future)

Not part of this refactor. The widgets (ColorPicker, NumberSlider, etc.) remain in `src/editor/views/widgets/` for later integration. They can be triggered by clicking on highlighted tokens — using ProseMirror widget decorations or React portals positioned via `view.coordsAtPos()`. This is a follow-up task.
