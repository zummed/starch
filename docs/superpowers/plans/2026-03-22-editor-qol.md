# Editor QoL Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add name/description DSL fields, tab label sync, tab persistence, and editor toolbar with save/load/close.

**Architecture:** Parser extracts `name`/`description` into `ParsedScene`. `useV2Diagram` exposes `name`. App syncs parsed name to tab label, persists user tabs to localStorage, and renders a toolbar with file save/load and tab close.

**Tech Stack:** TypeScript, React hooks, Vitest, localStorage, Blob/FileReader APIs

---

## Chunk 1: Parser & Hook

### Task 1: Parser — Extract name and description

**Files:**
- Modify: `src/parser/parser.ts:10-18` (ParsedScene interface), `src/parser/parser.ts:36-71` (parseScene function)
- Test: `src/__tests__/parser/parser.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/__tests__/parser/parser.test.ts`:

```typescript
it('extracts name and description', () => {
  const input = `{
    name: "My Diagram",
    description: "A test diagram",
    objects: [{ id: "n1", rect: { w: 10, h: 10 } }]
  }`;
  const scene = parseScene(input);
  expect(scene.name).toBe('My Diagram');
  expect(scene.description).toBe('A test diagram');
});

it('returns undefined name and description when absent', () => {
  const input = `{ objects: [{ id: "n1", rect: { w: 10, h: 10 } }] }`;
  const scene = parseScene(input);
  expect(scene.name).toBeUndefined();
  expect(scene.description).toBeUndefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/parser/parser.test.ts`
Expected: FAIL — `scene.name` is undefined in first test because `ParsedScene` doesn't have it yet.

- [ ] **Step 3: Implement parser changes**

In `src/parser/parser.ts`, add `name` and `description` to the `ParsedScene` interface:

```typescript
export interface ParsedScene {
  name?: string;
  description?: string;
  nodes: Node[];
  styles: Record<string, any>;
  animate?: AnimConfig;
  background?: string;
  viewport?: string | { width: number; height: number };
  images?: Record<string, string>;
  trackPaths: string[];
}
```

In `parseScene()`, extract them after line 39 (`const raw = JSON5.parse(input);`), same pattern as `background`:

```typescript
const name = typeof raw.name === 'string' ? raw.name : undefined;
const description = typeof raw.description === 'string' ? raw.description : undefined;
```

Add them to the return object:

```typescript
return {
  name,
  description,
  nodes: allNodes,
  styles,
  animate,
  background,
  viewport,
  images,
  trackPaths,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/parser/parser.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/parser/parser.ts src/__tests__/parser/parser.test.ts
git commit -m "feat: extract name and description from DSL into ParsedScene"
```

### Task 2: V2Diagram hook — expose name

**Files:**
- Modify: `src/app/components/V2Diagram.tsx:277-294` (return object)

- [ ] **Step 1: Add name to the hook return object**

In `src/app/components/V2Diagram.tsx`, add `name: scene.name` to the return object (line 286, alongside the existing `background: scene.background`):

```typescript
return {
  containerRef,
  time,
  duration,
  playing,
  speed,
  chapters,
  keyframeTimes,
  viewport: viewport ? { width: vpW, height: vpH } : undefined,
  background: scene.background,
  name: scene.name,
  cameraRatio,
  computeFitAll,
  seek,
  play: useCallback(() => setPlaying(true), []),
  pause: useCallback(() => setPlaying(false), []),
  setPlaying,
  setSpeed,
};
```

- [ ] **Step 2: Run existing tests to verify nothing is broken**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/components/V2Diagram.tsx
git commit -m "feat: expose parsed name from useV2Diagram hook"
```

## Chunk 2: Tab Label Sync & Persistence

### Task 3: Tab label sync from parsed name

**Files:**
- Modify: `src/app/App.tsx:94-96` (after activeTab derivation), `src/app/App.tsx:267-269` (tab label display)

- [ ] **Step 1: Add a useEffect to sync parsed name to tab label**

In `src/app/App.tsx`, after line 112 (where `diagram` is created from `useV2Diagram`), add:

```typescript
// Sync parsed name to tab label (user tabs only)
useEffect(() => {
  if (!activeTab.closable) return;
  const raw = diagram.name;
  const name = typeof raw === 'string' && raw.trim() ? raw.trim() : 'Untitled';
  if (name !== activeTab.label) {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, label: name } : t));
  }
}, [diagram.name, activeTab.closable, activeTab.label, activeTabId]);
```

- [ ] **Step 2: Truncate tab labels for display**

In the tab bar rendering (line 268, where `{tab.label}` is rendered), replace with:

```typescript
{tab.label.length > 30 ? tab.label.slice(0, 30) + '...' : tab.label}
```

- [ ] **Step 3: Test manually**

Run: `npm run dev`
- Create a new tab with "+"
- Type `{ name: "Hello World", objects: [] }` — tab label should update to "Hello World"
- Remove the `name` field — tab label should revert to "Untitled"
- The "Sample" tab label should never change regardless of its content

- [ ] **Step 4: Commit**

```bash
git add src/app/App.tsx
git commit -m "feat: sync parsed name to editor tab label"
```

### Task 4: Tab persistence to localStorage

**Files:**
- Modify: `src/app/App.tsx`

This task makes several changes to `App.tsx`. Apply them all, then test.

- [ ] **Step 1: Add persistence constants and functions**

Add after line 12 (`const PREFS_KEY = ...`):

```typescript
const TABS_KEY = 'starch-tabs';

interface StoredTabs {
  tabs: { id: string; label: string; dsl: string }[];
  activeTabId: string;
  nextTabId: number;
}

function loadStoredTabs(): StoredTabs | null {
  try {
    const stored = localStorage.getItem(TABS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0) return parsed as StoredTabs;
    }
  } catch { /* ignore */ }
  return null;
}

function saveStoredTabs(tabs: EditorTab[], activeTabId: string, nextTabId: number) {
  try {
    const userTabs = tabs.filter(t => t.id !== 'sample').map(({ id, label, dsl }) => ({ id, label, dsl }));
    const data: StoredTabs = { tabs: userTabs, activeTabId, nextTabId };
    localStorage.setItem(TABS_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}
```

- [ ] **Step 2: Replace module-level nextTabId with useRef initialized from storage**

Remove the module-level `let nextTabId = 1;` (line 23).

Inside `App()`, before the `tabs` state, add:

```typescript
const storedTabs = useRef(loadStoredTabs());
const nextTabIdRef = useRef(storedTabs.current?.nextTabId ?? 1);
```

- [ ] **Step 3: Initialize tabs and activeTabId from storage**

Replace the `tabs` and `activeTabId` state initialization:

```typescript
const [tabs, setTabs] = useState<EditorTab[]>(() => {
  const sampleTab: EditorTab = { id: 'sample', label: 'Sample', dsl: DEFAULT_DSL, closable: false };
  const stored = storedTabs.current;
  if (!stored || stored.tabs.length === 0) return [sampleTab];
  const restored = stored.tabs.map(t => ({ ...t, closable: true }));
  return [sampleTab, ...restored];
});
const [activeTabId, setActiveTabId] = useState(() => {
  const stored = storedTabs.current;
  if (stored?.activeTabId) {
    const exists = stored.activeTabId === 'sample' || stored.tabs.some(t => t.id === stored.activeTabId);
    if (exists) return stored.activeTabId;
  }
  return 'sample';
});
```

- [ ] **Step 4: Update addTab to use nextTabIdRef**

Replace the `addTab` callback:

```typescript
const addTab = useCallback(() => {
  const id = 'tab-' + (nextTabIdRef.current++);
  setTabs(prev => [...prev, {
    id, label: 'Untitled',
    dsl: '{\n  objects: [],\n  animate: {\n    duration: 3,\n    loop: true,\n    keyframes: [],\n  },\n}',
    closable: true,
  }]);
  setActiveTabId(id);
}, []);
```

- [ ] **Step 5: Fix handleSampleClick closable inconsistency**

In `handleSampleClick`, change line 124 from `closable: true` to `closable: false`:

```typescript
return [{ id: 'sample', label: 'Sample', dsl: sample.dsl, closable: false }, ...prev];
```

- [ ] **Step 6: Add debounced persistence useEffect**

Add after the existing "Persist prefs" useEffect:

```typescript
// Persist user tabs (debounced)
const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
useEffect(() => {
  if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  saveTimerRef.current = setTimeout(() => {
    saveStoredTabs(tabs, activeTabId, nextTabIdRef.current);
  }, 500);
  return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
}, [tabs, activeTabId]);
```

- [ ] **Step 7: Test manually**

Run: `npm run dev`
- Create a new tab, type some DSL content
- Reload the page — the tab should still be there with its content
- The "Sample" tab should always be fresh (DEFAULT_DSL)
- Close a user tab, reload — it should stay closed
- Create multiple tabs, reload — all restored, active tab restored

- [ ] **Step 8: Run all tests**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 9: Commit**

```bash
git add src/app/App.tsx
git commit -m "feat: persist user-created tabs to localStorage"
```

## Chunk 3: Editor Toolbar

### Task 5: Editor toolbar with Save, Load, and Close buttons

**Files:**
- Modify: `src/app/App.tsx:250-277` (editorContent block)

- [ ] **Step 1: Add save/load/close handler functions**

Add these callbacks in `App()`, after the `closeTab` callback:

```typescript
const saveTabToFile = useCallback(() => {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab) return;
  const raw = diagram.name;
  const name = typeof raw === 'string' && raw.trim() ? raw.trim().replace(/[^\w\s-]/g, '_') : 'untitled';
  const blob = new Blob([tab.dsl], { type: 'application/json5' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name + '.json5';
  a.click();
  URL.revokeObjectURL(url);
}, [tabs, activeTabId, diagram.name]);

const loadFileToTab = useCallback(() => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json5,.json';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateTabDsl(reader.result);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}, [updateTabDsl]);
```

- [ ] **Step 2: Add toolbar row to editorContent**

In the `editorContent` block, between the tab bar wrapper's closing `</div>` (line 272) and the editor `<div style={{ flex: 1, overflow: 'hidden' }}>` (line 273), insert the toolbar:

```typescript
{activeTab.closable && (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
    borderBottom: '1px solid #1a1d24', flexShrink: 0, background: '#0a0c10',
  }}>
    {[
      { label: 'Save', onClick: saveTabToFile },
      { label: 'Load', onClick: loadFileToTab },
      { label: 'Close', onClick: () => closeTab(activeTabId) },
    ].map(btn => (
      <button
        key={btn.label}
        onClick={btn.onClick}
        style={{
          padding: '3px 8px', borderRadius: 4, fontSize: 10, fontFamily: FONT,
          border: '1px solid #2a2d35', background: '#14161c', color: '#6b7280',
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        {btn.label}
      </button>
    ))}
  </div>
)}
```

- [ ] **Step 3: Test manually**

Run: `npm run dev`
- Create a new tab — toolbar with Save, Load, Close should appear
- Switch to "Sample" tab — toolbar should disappear
- Click Save — browser should download a `.json5` file
- Type `{ name: "Test", objects: [] }`, click Save — file should be named `Test.json5`
- Click Load — file picker should open; select a `.json5` file, editor content should update
- Click Close — tab should close, switches to another tab

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All PASS (no UI tests broken)

- [ ] **Step 5: Commit**

```bash
git add src/app/App.tsx
git commit -m "feat: add editor toolbar with save, load, and close buttons"
```
