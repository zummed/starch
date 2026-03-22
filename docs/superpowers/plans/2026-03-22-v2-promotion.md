# V2 Promotion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all V1 code and promote V2 from `src/v2/` to `src/`, making V2 the sole codebase.

**Architecture:** Delete V1 directories and files, use `git mv` to move V2 directories up one level, then fix imports, build configs, and CI workflows. Three V1 files used by V2 (editor theme, Timeline component, Chapter type) must be resolved before deletion.

**Tech Stack:** TypeScript, React, Vite, Vitest, CodeMirror, Zod

---

## Chunk 1: Resolve V1 Dependencies and Delete V1

### Task 1: Delete the backward-compat parser layer

**Files:**
- Delete: `src/v2/parser/compat.ts`
- Delete: `src/v2/__tests__/parser/compat.test.ts`

- [ ] **Step 1: Delete compat files**

```bash
git rm src/v2/parser/compat.ts src/v2/__tests__/parser/compat.test.ts
```

- [ ] **Step 2: Run tests to make sure nothing depended on it**

Run: `npx vitest run`
Expected: All tests pass (compat was only imported by its own test)

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "refactor: remove v1 backward-compat parser layer"
```

---

### Task 2: Preserve the V1 editor theme into V2

The V1 file `src/editor/theme.ts` is used by `src/v2/app/components/V2Editor.tsx`. Copy it into the V2 editor directory before V1 deletion.

**Files:**
- Create: `src/v2/editor/theme.ts` (copy from `src/editor/theme.ts`)
- Modify: `src/v2/app/components/V2Editor.tsx:14`

- [ ] **Step 1: Copy the theme file into V2**

Copy `src/editor/theme.ts` to `src/v2/editor/theme.ts` (identical contents — the file exports `starchTheme` and `starchHighlight` CodeMirror extensions).

- [ ] **Step 2: Update the import in V2Editor.tsx**

In `src/v2/app/components/V2Editor.tsx`, change line 14 from:
```typescript
import { starchTheme, starchHighlight } from '../../../editor/theme';
```
to:
```typescript
import { starchTheme, starchHighlight } from '../../editor/theme';
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/v2/editor/theme.ts src/v2/app/components/V2Editor.tsx
git commit -m "refactor: copy editor theme into v2 directory"
```

---

### Task 3: Preserve the V1 Timeline component into V2

The V1 `Timeline` component (`src/components/Timeline.tsx`) is used by `src/v2/app/App.tsx`. It must be moved into V2 and updated to use V2's `Chapter` type.

**Files:**
- Create: `src/v2/app/components/Timeline.tsx` (adapted from `src/components/Timeline.tsx`)
- Modify: `src/v2/app/App.tsx:5`
- Modify: `src/v2/app/components/V2Diagram.tsx:3,59`

- [ ] **Step 1: Create the V2 Timeline component**

Copy `src/components/Timeline.tsx` to `src/v2/app/components/Timeline.tsx` and update it:

1. Change the Chapter import from:
   ```typescript
   import type { Chapter } from '../core/types';
   ```
   to:
   ```typescript
   import type { Chapter } from '../../types/animation';
   ```

2. In the chapter markers section, replace `ch.id` with `ch.name` and `ch.title` with `ch.name`:
   ```typescript
   // Before:
   key={ch.id}
   title={ch.title}
   // After:
   key={ch.name}
   title={ch.name}
   ```

- [ ] **Step 2: Update App.tsx import**

In `src/v2/app/App.tsx`, change line 5 from:
```typescript
import { Timeline } from '../../components/Timeline';
```
to:
```typescript
import { Timeline } from './components/Timeline';
```

- [ ] **Step 3: Update V2Diagram.tsx to use V2 Chapter type**

In `src/v2/app/components/V2Diagram.tsx`:

1. Change line 3 from:
   ```typescript
   import type { Chapter } from '../../../core/types';
   ```
   to:
   ```typescript
   import type { Chapter } from '../../types/animation';
   ```

2. Change line 59 — the mapping is no longer needed since Timeline now uses V2's Chapter type. Change from:
   ```typescript
   const chapters: Chapter[] = animConfig.chapters?.map(c => ({ id: c.name, name: c.name, title: c.name, time: c.time })) ?? [];
   ```
   to:
   ```typescript
   const chapters: Chapter[] = animConfig.chapters ?? [];
   ```

- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/v2/app/components/Timeline.tsx src/v2/app/App.tsx src/v2/app/components/V2Diagram.tsx
git commit -m "refactor: move Timeline component into v2, use v2 Chapter type"
```

---

### Task 4: Delete all V1 code

Now that V2 has no dependencies on V1, delete everything.

**Files:**
- Delete: `src/core/` (entire directory)
- Delete: `src/engine/` (entire directory)
- Delete: `src/parser/` (entire directory)
- Delete: `src/renderer/` (entire directory)
- Delete: `src/editor/` (entire directory)
- Delete: `src/components/` (entire directory)
- Delete: `src/samples/` (entire directory)
- Delete: `src/__tests__/` (entire directory)
- Delete: `src/main.tsx`
- Delete: `src/App.tsx`
- Delete: `src/StarchDiagram.ts`
- Delete: `src/embed.ts`
- Delete: `src/index.ts`
- Delete: `index.html` (root V1 HTML entry)

- [ ] **Step 1: Delete V1 directories**

```bash
git rm -r src/core src/engine src/parser src/renderer src/editor src/components src/samples src/__tests__
```

- [ ] **Step 2: Delete V1 root files and index.html**

```bash
git rm src/main.tsx src/App.tsx src/StarchDiagram.ts src/embed.ts src/index.ts index.html
```

- [ ] **Step 3: Run tests to confirm V2 tests still pass**

Run: `npx vitest run`
Expected: All V2 tests pass (they have no V1 dependencies after Tasks 2-3)

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor: delete all v1 source code"
```

---

## Chunk 2: Promote V2 to src/ via git mv

### Task 5: Move V2 directories up to src/

With V1 deleted, the target directory names are free. Use `git mv` to preserve history.

**Directories to move (11 total):**

| From | To |
|------|-----|
| `src/v2/animation` | `src/animation` |
| `src/v2/app` | `src/app` |
| `src/v2/editor` | `src/editor` |
| `src/v2/layout` | `src/layout` |
| `src/v2/parser` | `src/parser` |
| `src/v2/renderer` | `src/renderer` |
| `src/v2/samples` | `src/samples` |
| `src/v2/templates` | `src/templates` |
| `src/v2/tree` | `src/tree` |
| `src/v2/types` | `src/types` |
| `src/v2/__tests__` | `src/__tests__` |

- [ ] **Step 1: git mv all V2 directories**

```bash
git mv src/v2/animation src/animation
git mv src/v2/app src/app
git mv src/v2/editor src/editor
git mv src/v2/layout src/layout
git mv src/v2/parser src/parser
git mv src/v2/renderer src/renderer
git mv src/v2/samples src/samples
git mv src/v2/templates src/templates
git mv src/v2/tree src/tree
git mv src/v2/types src/types
git mv src/v2/__tests__ src/__tests__
```

- [ ] **Step 2: Remove the now-empty src/v2/ directory**

```bash
rmdir src/v2
```

(If `git mv` moved everything, this should be empty. If not, check for stray files.)

- [ ] **Step 3: Update index.html title**

The `index.html` stays in `src/app/` (Vite `root` points there, so it must remain). Just update the title from "starch v2" to "starch playground":

In `src/app/index.html`, change:
```html
<title>starch v2</title>
```
to:
```html
<title>starch playground</title>
```

The `src="./main.tsx"` script path remains correct since Vite resolves it relative to `root`.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor: promote v2 directories to src/ via git mv"
```

---

### Task 6: Fix import paths across the codebase

Since all V2 directories moved up one level together, most relative imports between sibling modules are unchanged. The imports that DO change are:

1. **`src/app/` files importing from sibling modules** — these previously used `../../` to escape `v2/app/` into `v2/`, now they use `../` to escape `app/` into `src/`. The depth decreased by one `../` segment.

Specifically, scan all files in `src/app/` and `src/__tests__/` for imports that reference `../../` paths pointing to sibling V2 modules, and verify/fix them.

- [ ] **Step 1: Find all imports that need updating**

Search for import paths in all `.ts` and `.tsx` files under `src/` that might have incorrect relative paths. The key pattern: any file in `src/app/components/` that imports from `../../animation/`, `../../types/`, `../../renderer/`, etc. — these are correct (app/components → app → src → target). But files in `src/app/` importing from `../animation/` were previously `../../animation/` — verify these.

Run a grep to find all relative imports and check them:
```bash
grep -rn "from '\.\." src/app/ src/__tests__/
```

- [ ] **Step 2: Fix any broken import paths**

For each broken import, reduce the `../` depth by one level since files are now one directory closer to their targets. The pattern:
- Files in `src/app/components/` importing `../../module/` → still correct (traverses components → app → src)
- Files in `src/app/` importing `../module/` → still correct (traverses app → src)
- Files in `src/__tests__/module/` importing `../../module/` → still correct (traverses test-subdir → __tests__ → src)

If the V2 code was already structured with `src/v2/` as the conceptual root, most paths should work. Fix any that don't.

- [ ] **Step 3: Run tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit (if any changes were needed)**

```bash
git add -A && git commit -m "refactor: fix import paths after v2 promotion"
```

---

## Chunk 3: Update Build Configs, package.json, and CI

### Task 7: Update Vite configuration

Replace the V1 build configs with a single config based on the V2 config.

**Files:**
- Delete: `vite.app.config.ts`
- Delete: `vite.embed.config.ts`
- Rewrite: `vite.config.ts` (replace V1 library build with V2 app build)
- Delete: `vite.v2.config.ts` (after its contents become the new `vite.config.ts`)

- [ ] **Step 1: Delete V1-only build configs**

```bash
git rm vite.app.config.ts vite.embed.config.ts
```

- [ ] **Step 2: Replace vite.config.ts with promoted V2 config**

Overwrite `vite.config.ts` with the V2 config, updated for the new directory structure:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'src/app',
  base: './',
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    fs: {
      allow: [path.resolve(__dirname)],
    },
  },
});
```

Changes from `vite.v2.config.ts`:
- `root`: `src/v2/app` → `src/app`
- `build.outDir`: `dist-v2` → `dist`
- Removed the unused `@` alias

- [ ] **Step 3: Delete the old V2 config**

```bash
git rm vite.v2.config.ts
```

- [ ] **Step 4: Test dev server starts**

Run: `npx vite --config vite.config.ts`
Expected: Dev server starts on port 5174, app loads without errors. Ctrl+C to stop.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor: consolidate vite configs for v2-only build"
```

---

### Task 8: Update package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update scripts**

Replace the scripts section:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

This removes: `build:embed`, `build:app`, `build:all`, `dev:v2`, `build:v2`.
The `dev` and `build` commands now use the single `vite.config.ts` (the promoted V2 config).
The `tsc -b` step is removed from `build` since the V2 app build doesn't use it.

- [ ] **Step 2: Update exports, main, module, types**

For now, since the V2 build is app-only (no library build), remove the library-oriented fields. If a library build is needed later, they can be re-added:

Remove these fields:
```json
"main": "./dist/starch.js",
"module": "./dist/starch.js",
"types": "./dist/index.d.ts",
"exports": {
  ".": { "import": "./dist/starch.js", "types": "./dist/index.d.ts" },
  "./embed": "./dist/starch-embed.iife.js"
},
"publishConfig": {
  "access": "public"
}
```

- [ ] **Step 3: Remove library-oriented fields from package.json**

Also remove the `"files": ["dist"]` field (no library to publish).

- [ ] **Step 4: Remove dead dependencies**

Remove from `dependencies`:
```
prismjs
```

Remove from `devDependencies`:
```
@types/prismjs
vite-plugin-dts
```

Run:
```bash
npm uninstall prismjs @types/prismjs vite-plugin-dts semantic-release
```

- [ ] **Step 5: Clean up .gitignore**

Remove the `dist-app` entry (no longer produced). If a `dist-v2/` directory exists on disk from previous builds, delete it.

- [ ] **Step 6: Clean up tsconfig.json**

Remove library-oriented fields that are no longer needed: `declaration`, `declarationMap`. Delete `tsconfig.tsbuildinfo` if it exists (stale artifact from `tsc -b`).

- [ ] **Step 7: Run tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .gitignore tsconfig.json
git commit -m "refactor: update package.json, tsconfig, and gitignore for v2-only project"
```

---

### Task 9: Update CI workflows

**Files:**
- Modify: `.github/workflows/deploy-pages.yml`
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Update deploy-pages.yml**

Change the build step and artifact path:

```yaml
      - name: Build playground
        run: npm run build

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist
```

Changes: `npm run build:app` → `npm run build`, `dist-app` → `dist`.

- [ ] **Step 2: Update release.yml**

Change the build step to remove the embed build:

```yaml
      - name: Build
        run: npm run build
```

Changes: `npm run build && npm run build:embed` → `npm run build`.

Also remove the `semantic-release` step and its `NPM_TOKEN` env var — there is no library to publish now that the library exports have been removed. The release workflow should only run tests and build to verify correctness. If npm publishing is re-added later (with a V2 library build), `semantic-release` can be restored.

Remove the "Release" step:
```yaml
      # Remove this entire step:
      - name: Release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: npx semantic-release
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-pages.yml .github/workflows/release.yml
git commit -m "ci: update workflows for v2-only build"
```

---

### Task 10: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build completes successfully, output in `dist/`

- [ ] **Step 3: Verify no V1 remnants**

```bash
# Should find nothing:
find src -path '*/v2/*' -o -name 'StarchDiagram*' -o -name 'embed.ts' 2>/dev/null
# Should find no imports referencing v1 paths:
grep -rn "from '.*core/types" src/ || echo "Clean"
grep -rn "from '.*components/Timeline" src/app/App.tsx || echo "Clean"
```

- [ ] **Step 4: Verify git log --follow works on a moved file**

```bash
git log --follow --oneline -5 src/animation/timeline.ts
```

Expected: Shows commit history including commits from before the move.
