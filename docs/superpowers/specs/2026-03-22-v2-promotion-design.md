# V2 Promotion: Remove V1, Flatten V2 to src/

## Goal

Remove all V1 code and promote V2 from `src/v2/` to `src/`, making V2 the sole codebase for a clean 2.0 release. Use `git mv` to preserve file history.

## What Gets Deleted

### V1 Source Directories (~69 files)

- `src/core/` — V1 object types and Scene class
- `src/engine/` — V1 animation evaluator, timeline, layout, rendering
- `src/parser/` — V1 DSL parser (`parser.ts`, `shorthands.ts`)
- `src/renderer/` — V1 SVG rendering (React components + DOM helpers)
- `src/editor/` — V1 CodeMirror editor setup (theme, completions, linter)
- `src/components/` — V1 React UI (Diagram, Editor, Timeline, SampleBrowser)
- `src/samples/` — V1 sample definitions
- `src/__tests__/` — V1 tests (1 integration test)

### V1 Entry Points

- `src/main.tsx` — V1 dev server entry
- `src/App.tsx` — V1 playground app
- `src/StarchDiagram.ts` — V1 diagram engine class
- `src/embed.ts` — V1 custom element wrapper
- `src/index.ts` — V1 library exports
- `/index.html` — V1 dev HTML entry

### V1-Only Build Configs

- `vite.app.config.ts` — V1 app build
- `vite.embed.config.ts` — V1 embed build

### Backward-Compatibility Layer

- `src/v2/parser/compat.ts` — V1-to-V2 format converter
- `src/v2/__tests__/parser/compat.test.ts` — Tests for the above

## What Moves (via `git mv`)

All contents of `src/v2/` move up one level to `src/`:

| From | To |
|------|-----|
| `src/v2/animation/` | `src/animation/` |
| `src/v2/app/` | `src/app/` |
| `src/v2/editor/` | `src/editor/` |
| `src/v2/layout/` | `src/layout/` |
| `src/v2/parser/` | `src/parser/` |
| `src/v2/renderer/` | `src/renderer/` |
| `src/v2/samples/` | `src/samples/` |
| `src/v2/templates/` | `src/templates/` |
| `src/v2/tree/` | `src/tree/` |
| `src/v2/types/` | `src/types/` |
| `src/v2/__tests__/` | `src/__tests__/` |

The `src/v2/app/index.html` becomes the root `/index.html`.

## What Gets Updated

### Import Paths

All V2 internal imports use relative paths. Since the files move up one directory level, imports that cross module boundaries may need path adjustments. Specifically:

- `src/v2/app/components/` files that import from `../../animation/` etc. will now import from the same relative path (unchanged since both caller and callee move up together)
- The main change is removing any `v2/` segments from paths

### V1 Dependencies Used by V2

Three V2 files import from V1 code. These must be resolved before V1 deletion:

1. **`V2Editor.tsx`** imports V1's CodeMirror theme:
   ```typescript
   import { starchTheme, starchHighlight } from '../../../editor/theme';
   ```
   The V1 theme file must be preserved and moved into the V2 editor directory, or the theme definitions inlined.

2. **`V2Diagram.tsx`** imports V1's `Chapter` type:
   ```typescript
   import type { Chapter } from '../../../core/types';
   ```
   V2 already defines its own `Chapter` type in `src/v2/types/animation.ts`. The V1 `Chapter` (id/time/title/description) differs from V2's (name/time). The import should be switched to V2's type, and the mapping code in `V2Diagram.tsx` updated accordingly.

3. **`App.tsx`** imports V1's `Timeline` component:
   ```typescript
   import { Timeline } from '../../components/Timeline';
   ```
   The `Timeline` component must be preserved and moved into the V2 app directory. It also imports V1's `Chapter` type and accesses `ch.id` and `ch.title` fields — these must be updated to use V2's `Chapter` type (`ch.name` replaces both `ch.id` and `ch.title`).

### Build Configuration

- `vite.v2.config.ts` becomes the main `vite.config.ts`
- Update root from `src/v2/app` to `src/app`
- The existing `vite.config.ts` (V1 library build) is replaced
- Update output directory from `dist-v2` to `dist` (or `dist-app`)
- Update `index.html` script src to match the new vite root
- Remove the unused `@` alias (no V2 code uses it)

### package.json

- Remove V1-specific scripts (`dev`, `build`, `build:app`, `build:all`, `build:embed`)
- Promote V2 scripts to be the defaults:
  - `dev:v2` → `dev`
  - `build:v2` → `build`
- Update `exports` and `main` fields to point to V2 output
- Remove the `./embed` export (V1 artifact)
- Remove dead dependencies: `prismjs`, `@types/prismjs`, `vite-plugin-dts` (V1-only)
- Do NOT bump version (release pipeline handles this)

### CI Workflows

- `.github/workflows/deploy-pages.yml` — update `npm run build:app` to the new build command and output directory
- `.github/workflows/release.yml` — update `npm run build` and remove `npm run build:embed` (no V2 embed equivalent)

## Order of Operations

1. Delete the backward-compat layer (`compat.ts` + test)
2. Preserve V1 files needed by V2 (editor theme, Timeline component) — copy into V2 directories before deletion
3. Update V2 files that import V1 code (`V2Diagram.tsx` → use V2 `Chapter` type, `App.tsx` → import preserved Timeline, `V2Editor.tsx` → import preserved theme)
4. Delete all V1 source files and directories
5. Delete V1 entry points and root `index.html`
6. `git mv` each V2 directory from `src/v2/` to `src/`
7. `git mv` the V2 app's `index.html` to root, update script src path
8. Fix all import paths across the codebase
9. Update build configs (`vite.v2.config.ts` → `vite.config.ts`, delete V1 configs, update output dir)
10. Update `package.json` scripts, exports, and remove dead dependencies
11. Update CI workflows (deploy-pages.yml, release.yml)
12. Run tests to verify nothing broke

## Out of Scope

- Version bump (handled by release pipeline)
- New features or refactoring beyond the migration
- Renaming V2-prefixed components (e.g., `V2Diagram` → `Diagram`) — can be done later
