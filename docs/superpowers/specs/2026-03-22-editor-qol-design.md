# Editor Quality-of-Life: Name/Description Fields & Tab Persistence

## Summary

Add optional top-level `name` and `description` fields to the DSL format, use `name` to drive editor tab labels, and persist user-created tabs to localStorage so work survives reloads.

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

- `useV2Diagram` already calls `parseScene()` on each DSL change and exposes the result.
- `ParsedScene.name` is exposed from the hook (or read by App after parsing).
- App compares the parsed name to the current tab label and updates if different.
- Only applies to user-created tabs (closable tabs). The "Sample" tab label stays fixed.
- When `name` is absent or empty, the tab label falls back to `"Untitled"`.

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
  - `tabs`: array of `{ id, label, dsl }` (only user-created/closable tabs)
  - `activeTabId`: the last active tab ID
  - `nextTabId`: counter to avoid ID collisions after reload

### Save triggers

- On every tab state change: create, close, switch, DSL update, label update.
- Debounced write (e.g. 500ms) to avoid excessive localStorage writes during typing.

### Load behavior

- On app init, read `starch-tabs` from localStorage.
- Restore user-created tabs with `closable: true`.
- The "Sample" tab is always created fresh from `DEFAULT_DSL` (never persisted).
- Restore `activeTabId` if the referenced tab still exists, otherwise default to "sample".
- Restore `nextTabId` counter.
- If no stored tabs or parse error, fall back to current behavior (single "sample" tab).

### Tab structure reminder

```typescript
interface EditorTab {
  id: string;       // e.g. "tab-1", "tab-2"
  label: string;    // derived from DSL name field, or "Untitled"
  dsl: string;      // full JSON5 document text
  closable: boolean; // true for user tabs, false for "sample"
}
```

## 4. Non-goals

- `description` is not displayed in the UI — it's metadata inside the document only.
- No tab renaming UI — the name comes from the DSL.
- No IndexedDB — localStorage is sufficient.
- No cloud sync or export/import.

## 5. Files to modify

| File | Change |
|------|--------|
| `src/parser/parser.ts` | Extract `name` and `description` into `ParsedScene` |
| `src/app/App.tsx` | Tab label sync from parsed name, tab persistence (save/load), debounced writes |
| `src/app/components/V2Diagram.tsx` | Expose `ParsedScene.name` from the hook |
