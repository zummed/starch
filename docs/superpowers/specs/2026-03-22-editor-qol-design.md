# Editor Quality-of-Life: Name/Description Fields, Tab Persistence & Editor Toolbar

## Summary

Add optional top-level `name` and `description` fields to the DSL format, use `name` to drive editor tab labels, persist user-created tabs to localStorage, and add a toolbar to the editor panel with load, save, and close buttons.

## 1. DSL Schema Changes

Add optional `name` (string) and `description` (string) to the top-level DSL document:

```json5
{
  name: "My Diagram",
  description: "Shows how auth tokens flow through the system",
  objects: [...],
  animate: {...},
}
```

### Parser changes

`ParsedScene` gains two optional fields:

```typescript
export interface ParsedScene {
  name?: string;
  description?: string;
  // ... existing fields unchanged
}
```

`parseScene()` extracts them from the raw parsed object, same pattern as `background` and `viewport`:

```typescript
const name = raw.name as string | undefined;
const description = raw.description as string | undefined;
```

No Zod validation needed — simple optional strings passed through.

## 2. Tab Label Sync

When a user-created tab's DSL parses successfully and contains a `name` field, the tab label updates to match.

### Mechanism

- `useV2Diagram` already calls `parseScene()` on each DSL change. The hook must be updated to expose `name` — it currently does not return it.
- App reads the exposed `name` and updates the active tab's label if it differs.
- Only applies to user-created tabs (closable tabs). The "Sample" tab label stays fixed.
- When `name` is absent, empty, or whitespace-only, the tab label falls back to `"Untitled"`.
- Tab labels are truncated to 30 characters for display to prevent tab bar overflow.
- On parse failure, the tab label retains its current value (the fallback scene preserves the last successful parse, so the name naturally stays stable).

### Data flow

```
DSL text changed → parseScene() succeeds → ParsedScene.name extracted
  → if user tab and name differs from label → update tab label
```

## 3. Tab Persistence

User-created tabs are persisted to localStorage so work is not lost between reloads.

### Storage

- Key: `starch-tabs`
- Value: JSON object with:
  - `tabs`: array of `{ id, label, dsl }` (only user-created/closable tabs, filtered by `id !== 'sample'`)
  - `activeTabId`: the last active tab ID
  - `nextTabId`: counter to avoid ID collisions after reload

### Save triggers

- On every tab state change: create, close, switch, DSL update, label update.
- Debounced write using `useRef`-based `setTimeout`/`clearTimeout` pattern (500ms). No external dependency needed.

### Load behavior

- On app init, read `starch-tabs` from localStorage.
- Restore user-created tabs with `closable: true`.
- The "Sample" tab is always created fresh from `DEFAULT_DSL` (never persisted).
- Restore `activeTabId` if the referenced tab still exists, otherwise default to "sample".
- Restore `nextTabId` counter via a `useRef` initialized from localStorage (not the current module-level `let`, which resets on HMR).
- If no stored tabs or parse error, fall back to current behavior (single "sample" tab).

### Fix: `handleSampleClick` closable inconsistency

Currently `handleSampleClick` re-creates the sample tab with `closable: true` when it doesn't exist. This must be fixed to always use `closable: false` so the sample tab is never accidentally persisted.

### Tab structure

```typescript
interface EditorTab {
  id: string;       // e.g. "tab-1", "tab-2"
  label: string;    // derived from DSL name field, or "Untitled"
  dsl: string;      // full JSON5 document text
  closable: boolean; // true for user tabs, false for "sample"
}
```

## 4. Editor Toolbar

A small toolbar row between the tab bar and the CodeMirror editor, visible when a user-created tab is active. Contains three buttons: **Save**, **Load**, and **Close**.

### Save button

- Triggers a browser file download of the active tab's DSL content.
- Filename: the raw (un-truncated) `name` field sanitized for filesystem + `.json5`, or `untitled.json5` if no name. Sanitization: replace characters matching `/[^\w\s-]/g` with underscores.
- Uses the standard `<a download>` + `Blob` + `URL.createObjectURL` pattern. Revoke the object URL after triggering the download.

### Load button

- Opens a file picker (hidden `<input type="file" accept=".json5,.json">` created dynamically per click) to load a `.json5` or `.json` file.
- Reads the file content via `FileReader.readAsText()` and replaces the active tab's DSL.
- After load, a successful parse will update the tab label from the `name` field automatically.
- If the loaded file fails to parse, the standard parse-failure fallback applies (tab label unchanged, last successful scene preserved).

### Close button

- Closes the active tab (same as the existing `closeTab` logic).
- Only shown for closable tabs (user-created tabs, not "sample").
- The toolbar provides the close affordance rather than individual tab close buttons, reducing accidental tab closure.

### Layout

```
┌─────────────────────────────────────────┐
│ [Sample] [My Diagram] [+]              │  ← tab bar (no close buttons)
├─────────────────────────────────────────┤
│ 💾 Save   📂 Load   ✕ Close            │  ← toolbar (user tabs only)
├─────────────────────────────────────────┤
│                                         │
│         CodeMirror editor               │
│                                         │
└─────────────────────────────────────────┘
```

Buttons styled consistently with the existing header buttons (small, monospace, `#14161c` background, `#2a2d35` border). Text-only labels, no emoji — the diagram above is illustrative only.

## 5. Non-goals

- `description` is not displayed in the UI — it's metadata inside the document only.
- No tab renaming UI — the name comes from the DSL.
- No IndexedDB — localStorage is sufficient.
- No cloud sync.

## 6. Files to modify

| File | Change |
|------|--------|
| `src/parser/parser.ts` | Extract `name` and `description` into `ParsedScene` |
| `src/app/components/V2Diagram.tsx` | Expose `name: scene.name` from the hook return object (parallels existing `background: scene.background`) |
| `src/app/App.tsx` | Tab label sync, tab persistence (save/load to localStorage), debounced writes, `nextTabId` as `useRef`, fix `handleSampleClick` closable, editor toolbar with save/load/close buttons |
