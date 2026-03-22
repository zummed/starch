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

### V2Editor.tsx V1 Dependency

`V2Editor.tsx` imports V1's CodeMirror theme:
```typescript
import { starchTheme, starchHighlight } from '../../../editor/theme';
```

This V1 theme file must be preserved and moved into the V2 editor directory, or the theme definitions inlined.

### Build Configuration

- `vite.v2.config.ts` becomes the main `vite.config.ts`
- Update root/entry paths to reflect the flattened structure
- The existing `vite.config.ts` (V1 library build) is replaced

### package.json

- Remove V1-specific scripts (`dev`, `build`, `build:app`)
- Promote V2 scripts to be the defaults:
  - `dev:v2` → `dev`
  - `build:v2` → `build`
- Update `exports` and `main` fields to point to V2 output
- Do NOT bump version (release pipeline handles this)

## Order of Operations

1. Delete the backward-compat layer (`compat.ts` + test)
2. Preserve the V1 editor theme (copy into V2 editor before deletion)
3. Delete all V1 source files and directories
4. Delete V1 entry points and root `index.html`
5. `git mv` each V2 directory from `src/v2/` to `src/`
6. `git mv` the V2 app's `index.html` to root
7. Fix all import paths across the codebase
8. Update build configs (`vite.v2.config.ts` → `vite.config.ts`, delete V1 configs)
9. Update `package.json` scripts and exports
10. Run tests to verify nothing broke

## Out of Scope

- Version bump (handled by release pipeline)
- New features or refactoring beyond the migration
- Renaming V2-prefixed components (e.g., `V2Diagram` → `Diagram`) — can be done later
