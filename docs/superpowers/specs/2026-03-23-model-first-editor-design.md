# Model-First Editor Redesign

## Problem

The current DSL/JSON5 editor interaction is fundamentally fragile. Popups attempt surgical text replacement on DSL strings using span tracking, but spans drift, compound targets force full document regeneration, and multiple race-condition flags (`externalUpdate`, `popupEditingRef`, `dslTargetRef`) paper over timing issues. The result is frequent popup corruption and formatting loss.

The root cause: DSL text is treated as a disposable view of the canonical JSON model, yet popups try to edit that disposable text directly. Every popup must understand DSL formatting, handle compound tokens, and track positions through concurrent changes.

## Solution

Popups edit the JSON model directly. DSL is always regenerated from the model (like `gofmt` or Prettier). A parallel format hints structure preserves the user's inline/block preferences across regenerations.

## Architecture

### The `_json` Object

`_json` is the raw scene object — the same shape produced by both `parseDsl()` and `JSON5.parse()` on a scene document. It has top-level keys: `objects` (array), `styles` (object), `animate` (object), `name`, `description`, `background`, `viewport`, `images`. This is the shape that `parseScene()` also accepts, and what the generator consumes.

Both parse paths produce this same shape, so `_json` is format-agnostic.

### Path Contracts

Two path formats exist in the codebase and serve different purposes:

- **Model paths** (from cursor context): `objects.0.rect.w`, `objects.0.fill.h`, `styles.primary.fill.s`. These locate values within `_json` and are used by `updateProperty` and `getNestedValue`.
- **Schema paths** (for registry lookups): `rect.w`, `fill.h`, `transform.x`. These are the model path with the `objects.N.` or `styles.NAME.` prefix stripped. Used by `schemaRegistry.getPropertySchema()` and popup widget selection.

V2Editor's click handler translates between these: strip the `objects.N.` or `styles.NAME.` prefix from the model path before querying the schema registry. This is a simple string operation.

### Two Edit Paths

**Typing path** (user edits text):
```
User types in editor
  -> CodeMirror updateListener fires
  -> modelManager.setText(text, format)
  -> Debounced parse:
       DSL mode:  parseDsl(text) -> JSON + extract FormatHints
       JSON5 mode: JSON5.parse(text) -> JSON
  -> On success: update model, emit modelChange (diagram re-renders)
  -> On failure: keep last valid model, emit validationError
  -> Editor text is NOT touched (user keeps what they typed)
```

**Popup path** (popup modifies model):
```
User clicks value in editor
  -> getDslCursorContext(text, cursor) -> CursorContext { path }  (model path)
  -> Strip objects.N. / styles.NAME. prefix -> schema path
  -> Look up current value from modelManager.json at model path
  -> Look up schema from schemaRegistry at schema path for popup widget selection
  -> Open popup with (modelPath, value, schema)

User drags slider / picks color:
  -> modelManager.updateProperty(modelPath, newValue)
  -> Mutate _json at model path
  -> Re-validate via parseScene
  -> Emit modelChange (diagram re-renders)
  -> Emit textChange (editor receives regenerated text)
       DSL mode:  generateDsl(json, formatHints)
       JSON5 mode: JSON5.stringify(json, null, 2)
```

### Key Invariant

`setText()` never emits `textChange` (the editor already has the text — no round-trip).
`updateProperty()` always emits `textChange` (the editor needs the regenerated text).

This eliminates the entire class of round-trip race conditions that plague the current implementation.

### Format Hints

```typescript
interface FormatHints {
  nodes: Record<string, NodeFormat>;  // keyed by node ID
}

interface NodeFormat {
  display: 'inline' | 'block';  // single line vs expanded with indented properties
}
```

Style blocks are always rendered in block format (they always have indented properties), so they don't need format hints.

**Extraction**: `parseDsl` gains an optional second return value via a new function `parseDslWithHints(text: string): { scene: object; formatHints: FormatHints }`. This avoids changing the return type of `parseDsl` (preserving all existing callers). The hint extraction examines whether each node's properties appear on the same line as the header (inline) or on subsequent indented lines (block). This is cheap to detect during parsing since the tokenizer already tracks indentation.

**Usage**: `generateDsl(model, formatHints)` replaces the current heuristic in `shouldRenderBlock()` (which counts properties to guess). If no hint exists for a node (e.g., newly created), falls back to the existing heuristic (expand if > 4 properties).

**Persistence**: Format hints live on ModelManager alongside the JSON model. They survive popup edits (popup changes the model, hints are unchanged) and mode toggles (hints aren't stored in text). They're only updated when the user types DSL and it parses successfully.

### ModelManager Redesign

The current ModelManager has the right idea but is underused — V2Editor reimplements most of its logic with refs. The new ModelManager becomes the single authority.

```typescript
class ModelManager {
  // Canonical state
  private _json: object;              // the raw JSON scene object
  private _model: ModelState;         // parsed/validated (nodes, trackPaths, etc.)
  private _formatHints: FormatHints;  // extracted from user's DSL formatting

  // View state
  private _viewFormat: 'json5' | 'dsl';

  // --- Input methods ---

  // Path 1: User types text (from editor keystrokes)
  setText(text: string, format: 'json5' | 'dsl'): void;
    // Debounced parse
    // If DSL: parseDsl -> extract formatHints -> store JSON
    // If JSON5: JSON5.parse -> store JSON (no hints change)
    // On success: update _model, emit modelChange
    // On failure: keep last valid _model, emit validationError
    // Does NOT emit textChange

  // Path 2: Popup/programmatic edit (mutate model directly)
  updateProperty(path: string, value: unknown): void;
    // Mutate _json at path
    // Re-validate via parseScene
    // Emit modelChange (for diagram)
    // Emit textChange (for editor)

  // --- View format ---

  setViewFormat(format: 'json5' | 'dsl'): void;
    // Update _viewFormat
    // Emit textChange (editor receives text in new format)

  getDisplayText(): string;
    // DSL mode:  generateDsl(_json, _formatHints)
    // JSON5 mode: JSON5.stringify(_json, null, 2)

  // --- Output signals ---

  onModelChange(cb: (state: ModelState) => void): () => void;  // diagram subscribes
  onTextChange(cb: (text: string) => void): () => void;         // editor subscribes
  onValidationChange(cb: (errors: ZodError | Error | null) => void): () => void;
    // Emits ZodError for schema validation failures
    // Emits Error for JSON5/DSL parse failures
    // Emits null when text is valid
    // The DSL linter independently handles parse error display in the editor
}
```

### V2Editor Simplification

V2Editor drops from ~1010 lines to a thin component focused on CodeMirror integration and popup rendering.

**Keeps:**
- CodeMirror setup (extensions, compartments, theme)
- `dslCompletionSource` / `dslLinter` / syntax highlighting (unchanged)
- Click handler: cursor position -> model path via `getDslCursorContext`
- Popup rendering (ColorPicker, NumberSlider, EnumDropdown, etc.)

**Removes:**
- `json5TextRef`, `lastValidRawRef`, `popupEditingRef`, `externalUpdate` — coordination refs
- `dslTargetRef` and all span-tracking logic
- `handlePopupChange` text-surgery branches (both DSL and JSON5 paths)
- `useEffect([value])` round-trip suppression logic
- Duplicated parse/serialize logic

**New wiring:**

```typescript
// On keystroke:
updateListener -> modelManager.setText(text, currentFormat)

// On popup change:
onPopupChange(path, value) -> modelManager.updateProperty(path, value)

// Receiving text updates (from popup edits / mode toggle):
modelManager.onTextChange(text => {
  externalDispatch(text)  // replace editor content, suppress updateListener
})
```

One guard flag (`externalDispatch`) prevents `updateListener` from firing when pushing text into the editor. It is a React ref (`useRef<boolean>`) set synchronously around `view.dispatch(...)` calls — the same pattern as the current `externalUpdate` ref but with only one purpose instead of four interleaved concerns.

**Popup click resolution:**

`getDslCursorContext` currently resolves paths for completions/hover but needs enhancement for click-to-edit. Specifically:

- **Boolean keywords** (`bold`, `mono`, `smooth`, `closed`): currently fall through to `isPropertyName: true`. Must be enhanced to return the correct model path (e.g., `objects.0.text.bold`) with `isPropertyName: false` so the popup opens.
- **`fill`/`stroke` keyword clicks**: must resolve to the compound color path (e.g., `objects.0.fill`) so a color picker opens.
- **Dimension tokens** (`100x200`): already partially handled via `detectDimensionsAtCursor` — needs to return the correct geometry path (e.g., `objects.0.rect.w`).

These enhancements are additions to `getDslCursorContext`, not new files. The function already has the token-walking and section-tracking infrastructure; it just needs a few more match cases for click targets.

```typescript
function handleClick(view, pos) {
  const ctx = getDslCursorContext(view.state.doc.toString(), pos);
  if (ctx.path && !ctx.isPropertyName) {
    const schemaPath = stripModelPrefix(ctx.path);  // objects.0.rect.w -> rect.w
    const value = getNestedValue(modelManager.json, ctx.path);
    const schema = schemaRegistry.getPropertySchema(schemaPath);
    openPopup(ctx.path, value, schema);
  }
}
```

No span resolution, no compound targets, no text surgery. The popup knows the model path and current value. Slider drags call `modelManager.updateProperty(path, newValue)`.

### Mode Toggle

```typescript
setViewFormat(format: 'json5' | 'dsl'): void {
  this._viewFormat = format;
  this._emitTextChange();  // editor receives regenerated text in new format
}
```

Format hints are preserved across toggles because they live on ModelManager, not in text. Toggling to JSON5 and back produces the same inline/block layout.

## Edge Cases

**Invalid text while typing**: Editor shows whatever the user typed. ModelManager keeps last valid model for diagram. Linter shows errors. No regeneration happens.

**Popup while text is invalid**: Popups operate on the last valid model. `getDslCursorContext` works on the current text (resilient to partial parses via tokenizer), but the value comes from the last valid JSON model. When the popup commits, editor text is regenerated from the updated model, which also fixes the parse error.

**Newly created nodes (no format hint)**: Falls back to existing heuristic in `shouldRenderBlock` — count properties, expand if > 4. Once the user edits the DSL and it parses, the hint is captured.

**JSON5 mode popups**: Same flow. Click -> `getCursorContext` (JSON5 version) -> resolve model path -> popup -> `updateProperty` -> ModelManager emits regenerated JSON5.

## Code Changes

### Deleted (~810 lines)

| File | Lines | Reason |
|---|---|---|
| `editor/dslClickTarget.ts` | 689 | Span tracking, compound targets, `applyDslPopupChange` — all replaced by model-path popups |
| `editor/textReplace.ts` | 121 | Surgical JSON5 text replacement — no longer needed |

### Rewritten

| File | Change |
|---|---|
| `editor/modelManager.ts` | Rewrite as single authority with `setText` / `updateProperty` / format hints |
| `app/components/V2Editor.tsx` | Remove ~500-600 lines of coordination logic, ref management, popup text surgery (from ~1010 lines) |

### Modified

| File | Change |
|---|---|
| `dsl/parser.ts` | Add `parseDslWithHints()` that returns `{ scene, formatHints }` alongside existing `parseDsl()` |
| `dsl/generator.ts` | Wire up `FormatHints` properly (already accepts `nodeFormats`, formalize the type) |
| `editor/dslCursorPath.ts` | Enhance `getDslCursorContext` for click-to-edit: handle boolean keywords, fill/stroke keyword clicks, dimension tokens |

### Unchanged

- `dsl/tokenizer.ts`, `dsl/colorNames.ts`, `dsl/resolveShortcut.ts`, `dsl/types.ts`
- `editor/dslCompletionSource.ts` — autocompletion
- `editor/dslLinter.ts` — linting
- `editor/dslLanguage.ts` — syntax highlighting
- `editor/cursorPath.ts` — JSON5 cursor-to-path mapping
- All popup widgets (ColorPicker, NumberSlider, EnumDropdown, PointRefEditor, etc.)
- `editor/theme.ts`
- Parser, renderer, animation engine, layout, templates, tree utilities

## Success Criteria

1. All existing popup types (color, number, enum, boolean, point ref) work in both DSL and JSON5 modes without text corruption
2. User's inline/block formatting choices survive popup edits
3. Mode toggle (DSL <-> JSON5) preserves formatting intent via hints
4. Autocompletion and linting continue to work unchanged
5. No race conditions or flag-based coordination between editor and model
6. Net reduction in editor code complexity (~800 lines removed)
