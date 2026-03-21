# Structured Editor

**Date**: 2026-03-21
**Status**: Draft
**Branch**: feat/animatable-styles
**Depends on**: V2 Compositional Object Model, V2 Dev App

## Overview

Re-architect the editor so the object model is the source of truth, not the text. The text editor becomes a view onto the model with bidirectional sync. Zod schemas drive validation, completion, and property popups. This enables a future visual builder without further architectural changes.

## Goals

- Zod schemas as the single source of truth for the object model (TypeScript types derived via `z.infer<>`)
- Model → staging → real pipeline with per-keystroke validation
- Schema-driven autocompletion (no hand-maintained completion strings)
- Type-aware property popups (color picker, slider, dropdown, toggle)
- Canvas always renders a valid model — typing errors don't break the diagram
- Text format is JSON5 initially; architecture supports alternative serializations later

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Text View  │◄───►│   Staging    │────►│  Real Model  │────► Canvas
│ (CodeMirror)│     │   Layer      │     │  (Node[])    │
└─────────────┘     └──────────────┘     └──────────────┘
                           ▲
                    ┌──────┴──────┐
                    │ Zod Schema  │
                    │  Registry   │
                    └─────────────┘
```

- **Real Model**: The `Node[]` tree. Source of truth for rendering. Only updated when staging produces a valid tree.
- **Staging Layer**: Attempts to parse every keystroke (debounced ~100ms). If valid → promotes to real model. If invalid → holds last valid state. Completion queries staging + cursor context.
- **Text View**: CodeMirror editor. Serializes real model → JSON5 text. User edits flow back through staging.
- **Zod Schema Registry**: Defines every node, property, and geometry type. The editor queries it for completions, property popups, and validation.

**Key invariant**: The canvas always renders a valid model. Typing errors don't break the diagram — the last valid state persists until the edit becomes valid again.

## Zod Schema Registry

### Schema-first types

All v2 TypeScript interfaces are replaced with Zod schemas. Types are derived:

```ts
// Schema is the source of truth
export const HslColorSchema = z.object({
  h: z.number().min(0).max(360).describe('Hue (degrees)'),
  s: z.number().min(0).max(100).describe('Saturation (%)'),
  l: z.number().min(0).max(100).describe('Lightness (%)'),
});

// Type is derived
export type HslColor = z.infer<typeof HslColorSchema>;
```

This applies to all types: `HslColor`, `Stroke`, `Transform`, `Dash`, `Layout`, `Size`, `RectGeom`, `EllipseGeom`, `TextGeom`, `PathGeom`, `ImageGeom`, `Node`, `AnimConfig`, `KeyframeBlock`, etc.

The inferred types are structurally identical to the current hand-written interfaces, so all existing code that uses these types continues working with zero changes.

### Schema registry

A module that exports all schemas and lookup functions:

```ts
// Get the schema for a dotted property path
function getPropertySchema(path: string): z.ZodType | null
// getPropertySchema('rect.radius') → z.number().min(0).optional()
// getPropertySchema('fill') → z.union([HslColorSchema, ...])

// Get all valid property names for a given context
function getAvailableProperties(path: string): PropertyDescriptor[]
// getAvailableProperties('') → [{name: 'id', schema: z.string(), ...}, {name: 'rect', ...}, ...]
// getAvailableProperties('rect') → [{name: 'w', ...}, {name: 'h', ...}, {name: 'radius', ...}]

interface PropertyDescriptor {
  name: string;
  schema: z.ZodType;
  description?: string;
  required: boolean;
  category: string;  // 'geometry', 'visual', 'transform', 'layout', 'animation'
}
```

### What the editor extracts from schemas

- `NodeSchema.shape` → list of all valid property names for completion
- `z.number().min(0).max(360)` → slider with bounds in popup
- `HslColorSchema` → detected as color type, shows color picker
- `.describe()` strings → hints in completion dropdown
- `.optional()` → required vs optional indication
- `z.enum(['start', 'middle', 'end'])` → dropdown in popup
- `z.boolean()` → toggle in popup

## Text ↔ Model Sync

### Model → Text (serialization)

When the real model changes (sample selection, popup edit), serialize to JSON5 and update CodeMirror content. Uses `JSON5.stringify(model, null, 2)` with formatting preferences.

### Text → Model (staging)

On every CodeMirror change (debounced ~100ms):

1. Attempt `JSON5.parse(text)` → raw object
2. Run through Zod validation (`NodeSchema.safeParse`)
3. If valid: run template expansion → staging tree → promote to real model → canvas updates
4. If invalid: real model stays unchanged, editor shows inline error markers (red underlines at Zod error paths)

Completion always works against the last valid staging state + cursor context.

### Conflict resolution

- User is typing → text is the driver, staging attempts parse
- Popup edits a property → model is the driver, text re-serializes
- No simultaneous conflicts because popups pause text editing (modal interaction)

## Cursor-to-Path Mapping

Given a cursor position (line, column) in the JSON5 text, determine the model path (e.g., `nodes[0].rect.radius`).

Uses a lightweight JSON5 AST walk:
1. Parse the text into a JSON5 AST with character offsets (using `json5` or a custom tokenizer)
2. Walk the AST to find which key-value pair the cursor is inside
3. Build a dotted path from root to cursor position
4. The schema registry answers "what's valid at this path"

Example: cursor at position inside `rect: { w: 100, | }`:
- AST walk: root → objects[0] → rect → (after `w`)
- Path: `[0].rect`
- Schema: `RectGeomSchema` → available properties: `h`, `radius` (since `w` is already present)

## Schema-Driven Completion

Replace the current hand-maintained CodeMirror completion source with one that queries the schema registry via cursor-to-path.

### How it works

1. CodeMirror triggers completion (typing or Ctrl+Space)
2. Get cursor position → map to model path via AST walk
3. Determine context:
   - **Property name position**: query `getAvailableProperties(path)`, filter out already-present keys
   - **Property value position**: query `getPropertySchema(path + '.' + key)` for valid values
   - **Inside an enum value**: show enum options
   - **Inside a color value**: show named colors + format hints
4. Return completion items with labels, descriptions, and insert text

### Partial object handling

When the user has typed `{ id: "box1", re` and presses autocomplete:
- The text is not valid JSON5 yet
- The completion system uses the last valid staging state to know the cursor is at the top level of a node
- Queries `NodeSchema` for properties starting with `re` → suggests `rect`
- Selecting `rect` inserts `rect: { w: , h: }` and places cursor at the first value

## Property Popups

### Value popup (click on a property value)

1. Detect click position in CodeMirror → map to model path
2. Look up Zod schema at that path
3. Show type-appropriate editor:

| Schema type | Popup widget |
|---|---|
| `z.number().min().max()` | Slider with bounds |
| `z.number()` | Number input |
| `HslColorSchema` or color union | Color picker (HSL sliders + hex input + named colors) |
| `z.enum([...])` | Dropdown list |
| `z.boolean()` | Toggle switch |
| `z.string()` | Text input |
| Nested `z.object()` | Mini form with fields |

4. Edits update the model directly → text re-serializes
5. Popup appears anchored below the clicked text
6. Dismisses on click-outside or Escape

### Add-property popup

1. Triggered by a "+" button at the end of a node, or by typing at the end of a node's properties
2. Queries schema for all valid properties at this node level
3. Filters out properties already present
4. Shows a searchable list with:
   - Property name
   - Description (from `.describe()`)
   - Type indicator (number, color, enum, etc.)
   - Category grouping (geometry, visual, transform, layout)
5. Selecting a property inserts it with a sensible default and places cursor at the value

### Popup implementation

- React floating panel components (not modal dialogs)
- Positioned relative to CodeMirror cursor coordinates
- Don't block the editor — clicking back into text dismisses them
- Use the same styling as the rest of the v2 app (dark theme, purple accents)

## ModelManager

Central class managing the model lifecycle:

```ts
class ModelManager {
  // State
  readonly realModel: Node[];
  readonly stagingModel: Node[] | null;
  readonly validationErrors: ZodError | null;
  readonly text: string;

  // Text input (from editor)
  setText(text: string): void;  // debounced parse → validate → promote

  // Direct model mutation (from popups, visual builder)
  updateProperty(path: string, value: unknown): void;
  addProperty(nodePath: string, key: string, defaultValue: unknown): void;
  removeProperty(nodePath: string, key: string): void;

  // Events
  onModelChange(callback: (nodes: Node[]) => void): void;
  onTextChange(callback: (text: string) => void): void;
  onValidationChange(callback: (errors: ZodError | null) => void): void;

  // Schema queries (delegates to registry)
  getSchemaAt(path: string): z.ZodType | null;
  getAvailableProperties(path: string): PropertyDescriptor[];
}
```

The V2Diagram component, the editor, and the popups all interact through the ModelManager. It is the single coordination point.

## Implementation Phases

### Phase 1 — Zod schema migration
Replace all hand-written TypeScript interfaces in `src/v2/types/` with Zod schemas. Types derived via `z.infer<>`. Create schema registry with `getPropertySchema(path)` and `getAvailableProperties(path)`. All existing code keeps working since inferred types are structurally identical. Tests for schema validation and registry queries.

### Phase 2 — ModelManager and staging layer
`ModelManager` class with real model, staging, text sync. Debounced parse → validate → promote pipeline. Emits change events. Returns Zod validation errors with paths. Tests for the sync lifecycle.

### Phase 3 — Cursor-to-path mapping
JSON5 AST walker that maps cursor position to model path. Tests for various cursor positions (property name, value, nested object, array element).

### Phase 4 — Schema-driven completion
Replace current CodeMirror completion source with one that queries the schema registry via cursor-to-path. Property name completion, value completion, enum completion, partial object handling. Tests for completion suggestions.

### Phase 5 — Property popups
Value popups (color picker, slider, dropdown, toggle) and add-property popup. React floating panel components. Wire to ModelManager for direct model updates. Tests for popup trigger detection.

### Phase 6 — Integration
Wire ModelManager into V2Diagram and App.tsx. The editor, canvas, and popups all talk through the ModelManager. Remove old completion code. End-to-end testing.
