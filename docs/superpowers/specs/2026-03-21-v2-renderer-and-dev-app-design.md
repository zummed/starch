# V2 Pluggable Renderer & Dev App

**Date**: 2026-03-21
**Status**: Draft
**Branch**: feat/animatable-styles
**Depends on**: Compositional Object Model (src/v2/ — Phases 1-8 complete)

## Overview

Build a pluggable renderer architecture with a command-based drawing API, implement SVG as the first backend, and create a standalone v2 dev app (`npm run dev:v2`) with a full playground UI.

## Goals

- Pluggable renderer backends via a command-based `RenderBackend` interface
- SVG backend as the first implementation
- Command emitter that bridges the v2 node tree to any backend
- Standalone v2 dev app with full playground (sample browser, editor, timeline, viewport controls)
- V1 remains untouched — v2 runs alongside

## RenderBackend Interface

The renderer abstraction. Each backend implements these methods:

```ts
interface RendererInfo {
  name: string;           // "svg", "canvas2d", "three", "ascii"
  supports2D: boolean;
  supports3D: boolean;
  supportsInteraction: boolean;  // click/hover on elements
}

interface RgbaColor {
  r: number;  // 0-255
  g: number;  // 0-255
  b: number;  // 0-255
  a: number;  // 0-1
}

interface StrokeStyle {
  color: RgbaColor;
  width: number;
  dash?: { length: number; gap: number; pattern?: string };
}

interface RenderBackend {
  readonly info: RendererInfo;

  // Lifecycle
  mount(container: HTMLElement): void;
  destroy(): void;
  beginFrame(): void;
  endFrame(): void;

  // Viewport
  setViewBox(x: number, y: number, w: number, h: number): void;
  clearViewBox(): void;
  setBackground(color: RgbaColor | 'transparent'): void;

  // Transform stack
  pushTransform(x: number, y: number, rotation: number, scale: number): void;
  popTransform(): void;

  // Opacity stack (multiplicative)
  pushOpacity(opacity: number): void;
  popOpacity(): void;

  // Draw commands
  drawRect(w: number, h: number, radius: number, fill: RgbaColor | null, stroke: StrokeStyle | null): void;
  drawEllipse(rx: number, ry: number, fill: RgbaColor | null, stroke: StrokeStyle | null): void;
  drawText(content: string, size: number, fill: RgbaColor, align: 'start' | 'middle' | 'end', bold: boolean, mono: boolean): void;
  drawPath(points: [number, number][], closed: boolean, smooth: boolean, fill: RgbaColor | null, stroke: StrokeStyle | null, drawProgress?: number): void;
  drawImage(src: string, w: number, h: number, fit: 'contain' | 'cover' | 'fill'): void;
}
```

**Color convention**: Colors are passed as RGBA with `a` always `1.0`. Opacity is handled entirely by the `pushOpacity`/`popOpacity` stack, not baked into fill/stroke alpha. This avoids double-application in backends (like SVG) where group opacity composes natively.

**Opacity stack contract**: `pushOpacity`/`popOpacity` are always called in matched pairs, one per node. Implementations must maintain an internal multiplicative stack. The composed product at any point is `opacity_1 * opacity_2 * ... * opacity_n` where each value was passed via `pushOpacity`. How the backend applies this product is implementation-specific:
- SVG: Sets `opacity` attribute on the `<g>` wrapper (SVG composes natively)
- Canvas2D: Tracks composed value, sets `ctx.globalAlpha` before draws
- Three.js: Applies to material opacity

**Dash pattern**: `StrokeStyle.dash` includes an optional `pattern` string for backends that support custom dash arrays (e.g., SVG's `stroke-dasharray`). Backends that don't support custom patterns should fall back to using `length` and `gap`.

**Smooth paths**: `drawPath` includes a `smooth` flag. When true, the points should be rendered as a Catmull-Rom spline. Backends that support curves (SVG, Canvas2D) should implement this; backends that don't (ASCII) can fall back to straight segments.

**Draw progress**: `drawPath` includes an optional `drawProgress` (0-1). When set, only the first portion of the path is rendered. SVG implements this via `stroke-dasharray`/`stroke-dashoffset`. Canvas2D can use partial path tracing.

**Future renderers**: Canvas2D, Three.js/WebGL, ASCII. Each just implements this interface.

## Command Emitter

The bridge between the v2 node tree and any backend. Lives in `src/v2/renderer/emitter.ts`.

**Responsibilities:**
- Walks the evaluated node tree depth-first
- Resolves inheritance (fill, stroke from parent chain)
- Resolves opacity (passes node's own opacity value to pushOpacity; the stack composes multiplicatively)
- Sorts siblings by depth
- Skips invisible nodes (but does not skip their animation evaluation — visibility is render-time only)
- Resolves connection endpoints (from/to object IDs → coordinates, with anchor resolution)
- Resolves pathFollow/pathProgress transforms
- Converts HSL colors to RGBA before passing to backend
- Folds node `dash` into `StrokeStyle`

### emitFrame signature

```ts
function emitFrame(
  backend: RenderBackend,
  nodes: Node[],
  allRoots: Node[],           // full tree for connection/pathFollow resolution
  viewBox?: ViewBox,          // pre-computed by caller (V2Diagram)
): void
```

The caller (V2Diagram) is responsible for finding the camera node, calling `computeViewBox`, and passing the result. The emitter calls `backend.setViewBox()` if a viewBox is provided, or `backend.clearViewBox()` if not.

### Algorithm

```
emitFrame(backend, nodes, allRoots, viewBox?):
  backend.beginFrame()
  if viewBox:
    backend.setViewBox(viewBox.x, viewBox.y, viewBox.w, viewBox.h)
  else:
    backend.clearViewBox()
  for each root node (sorted by depth, excluding camera nodes):
    emitNode(backend, node, allRoots, parentFill=undefined, parentStroke=undefined)
  backend.endFrame()

emitNode(backend, node, allRoots, parentFill, parentStroke):
  if not visible: return

  resolve transform:
    if node.transform.pathFollow is set:
      look up referenced path node in allRoots by ID
      compute position at node.transform.pathProgress along that path
      compute tangent rotation if path has direction
      x, y = resolved position; rotation = tangent angle + node.rotation
    else:
      x = node.transform.x ?? 0
      y = node.transform.y ?? 0
      rotation = node.transform.rotation ?? 0
    scale = node.transform.scale ?? 1
  backend.pushTransform(x, y, rotation, scale)

  opacity = node.opacity ?? 1
  backend.pushOpacity(opacity)

  resolve fill: node.fill ?? parentFill → hslToRgba (a=1.0)
  resolve stroke: node.stroke ?? parentStroke → { color: hslToRgba (a=1.0), width }

  fold node.dash into stroke:
    if node.dash: stroke.dash = { length, gap, pattern }

  emit geometry:
    rect    → backend.drawRect(w, h, radius, fill, stroke)
    ellipse → backend.drawEllipse(rx, ry, fill, stroke)
    text    → backend.drawText(content, size, fill, align, bold, mono)
    path:
      if points: use points directly
      else if from/to: resolve connection endpoints with anchor resolution
      backend.drawPath(resolvedPoints, closed, smooth, fill, stroke, drawProgress)
    image   → backend.drawImage(src, w, h, fit)

  for each child (sorted by depth):
    emitNode(backend, child, allRoots, fill, stroke)

  backend.popOpacity()
  backend.popTransform()
```

### Anchor Resolution

When a path has `from`/`to` referencing object IDs with `fromAnchor`/`toAnchor`:

1. Find the target node in `allRoots` by ID
2. Get the target's world-space position (transform.x, transform.y)
3. Get the target's bounding box from its geometry (rect.w/h, ellipse.rx/ry, or size.w/h)
4. Resolve the anchor to an offset:
   - Named anchors (N, NE, E, etc.) map to edge points on the bounding box
   - Float anchors [fx, fy] interpolate across the bounding box (0,0 = top-left, 1,1 = bottom-right)
5. World position = target center + anchor offset

### PathFollow Resolution

When a node has `transform.pathFollow` set:

1. Find the referenced path node in `allRoots` by ID
2. Get the path's resolved points (either direct points or resolved connection endpoints)
3. Compute arc-length parameterization of the path
4. Interpolate position at `transform.pathProgress` (0-1) along the path
5. Optionally compute tangent direction for rotation (the node rotates to follow the path)
6. The resolved (x, y) replaces the node's transform.x/y for `pushTransform`

**Key design point**: The emitter is the only code that imports from the node/tree layer. Backends have no knowledge of starch's data model — they are pure drawing implementations.

## HSL → RGBA Conversion

New utility function: `hslToRgba(hsl: HslColor): RgbaColor`

Converts HSL to RGBA with `a` always `1.0`. Opacity is not baked into the color — it is handled entirely by the `pushOpacity`/`popOpacity` stack. This avoids double-application in SVG (where group `opacity` and fill `rgba` alpha would multiply).

This is net-new code — the existing `hslToCSS` produces CSS strings. `hslToRgba` produces numeric RGBA for the renderer-agnostic interface.

## SVG Backend

First `RenderBackend` implementation. Maps draw commands to SVG DOM elements.

**Lifecycle:**
- `mount(container)`: Creates `<svg>` element with `width="100%" height="100%"`, a background `<rect>`, and a `<g>` content group. Appends to container.
- `destroy()`: Removes the SVG element.
- `beginFrame()`: Clears the content group (removes all children).
- `endFrame()`: No-op (DOM is already live).

**Transform stack:**
- `pushTransform(x, y, r, s)`: Creates a `<g>` element with `transform="translate(x,y) rotate(r) scale(s)"`. Appends to current parent `<g>`. Pushes onto internal stack.
- `popTransform()`: Pops from stack, restores previous `<g>` as current parent.

**Opacity stack:**
- `pushOpacity(opacity)`: Sets `opacity` attribute on the current `<g>` (the one created by the most recent `pushTransform`). SVG handles multiplicative composition natively via nested group opacity.
- `popOpacity()`: No explicit action needed for SVG — the opacity attribute lives on the `<g>` element that `popTransform` will leave. However, implementations must maintain the stack contract (matched push/pop pairs).

**Draw commands:**
- `drawRect` → appends `<rect>` to current `<g>` with x/y centered
- `drawEllipse` → appends `<ellipse>` to current `<g>`
- `drawText` → appends `<text>` with `text-anchor`, `dominant-baseline`, font attributes
- `drawPath` → appends `<path>`. When `smooth=true`, converts points to SVG cubic bezier curve commands (Catmull-Rom → Bezier). When `drawProgress` < 1, uses `stroke-dasharray`/`stroke-dashoffset`.
- `drawImage` → appends `<image>` with `href`, `preserveAspectRatio`

**Colors**: `RgbaColor` → `rgba(r, g, b, a)` CSS strings.

**ViewBox**: Sets SVG `viewBox` and `preserveAspectRatio` attributes.

**Performance note**: Full re-render per frame (clear + rebuild). This matches v1's current approach. For typical diagram sizes (10-200 nodes), this is adequate. If needed later, a diffing optimization can be added inside the backend without changing the interface.

## V2 Dev App

Standalone playground at `src/v2/app/`, accessible via `npm run dev:v2`.

### File Structure

```
src/v2/app/
├── index.html        — Vite HTML entry
├── main.tsx          — React mount
├── App.tsx           — Main app layout (header, panels, canvas)
└── components/
    ├── V2Diagram.tsx  — Manages v2 pipeline + backend lifecycle
    └── V2SampleBrowser.tsx — Browse v2 samples by category
```

### Reused Components

These v1 components are imported directly (they are presentation-only, no v1 pipeline dependency):

- `src/components/Timeline.tsx` — play/pause, scrub, speed, chapters
- `src/components/Editor.tsx` — CodeMirror editor

### V2Diagram Component

The core React component. Manages:

1. **Backend lifecycle**: Creates SVG backend on mount, destroys on unmount. Holds a ref to the container div.
2. **Animation loop**: `requestAnimationFrame` tick → evaluate tracks → apply to tree → run layout → emit frame to backend.
3. **Camera**: Finds camera node in evaluated tree, computes viewBox via `computeViewBox()`, passes to `emitFrame`.
4. **Props**: Receives `dsl`, `autoplay`, `speed`, `debug`. Exposes `time`, `duration`, `playing`, `seek`, `play`, `pause`, chapter controls.

### Pipeline per frame

```
DSL string
  → parseScene()           // v2 parser (once, on DSL change)
  → buildTimeline()        // v2 timeline (once, on DSL change)
  → evaluateAllTracks(t)   // per frame
  → applyTrackValues()     // per frame (returns cloned tree)
  → runLayout()            // per frame (mutates the clone — safe because applyTrackValues always produces a fresh copy)
  → find camera node, computeViewBox()  // per frame
  → emitFrame(backend, nodes, allRoots, viewBox)  // per frame → SVG backend
```

**Static diagrams**: When `ParsedScene.animate` is undefined (no animation block), the timeline and evaluation steps are skipped. The frame renders the static node tree directly: `parseScene → applyTrackValues(nodes, emptyMap) → runLayout → emitFrame`.

**Mutation safety**: `runLayout` mutates nodes in-place (void return). This is safe because it always operates on the cloned tree returned by `applyTrackValues`. The original `ParsedScene.nodes` are never mutated. This dependency is documented here — do not reorder the pipeline steps.

### Camera integration

Camera handling lives in `V2Diagram`, not in the emitter:

1. After `applyTrackValues` + `runLayout`, find any node with `.camera` set
2. Call `computeViewBox(cameraNode, evaluatedNodes, defaultViewBox)` from `src/v2/renderer/camera.ts`
3. Pass the result to `emitFrame` as the `viewBox` parameter
4. The emitter calls `backend.setViewBox()` or `backend.clearViewBox()`
5. Default viewBox comes from the diagram's `viewport` setting (or 800x500 fallback)

### App Layout

Same layout as v1 playground:

- **Header bar**: Logo, "Samples" toggle, "Debug" toggle, "Viewport" ratio toggle, "Fit All", "Lock View", "Hide/Edit" toggle
- **Left panel** (collapsible): Sample browser with v2 samples organized by category
- **Center-left panel** (collapsible, resizable): Code editor with tab bar
- **Center panel**: Diagram canvas (SVG backend renders here)
- **Bottom bar**: Timeline with play/pause, scrub, speed control, chapter markers

### Viewport Controls

Carried over from v1:

- **Pan**: Click-drag on canvas translates the viewBox
- **Zoom**: Mouse wheel zooms toward cursor position
- **Fit All**: Auto-zoom to encompass all objects
- **Lock View**: Freezes camera animation, allows manual navigation
- **Viewport ratio**: Toggle aspect ratio preview based on diagram's `viewport` setting
- **Copy Camera**: Copies current view position as a DSL camera snippet

These all operate by manipulating the viewBox passed to `emitFrame`.

### Vite Configuration

New file: `vite.v2.config.ts` in project root.

Uses `build.rollupOptions.input` pointing to `src/v2/app/index.html` rather than `root: 'src/v2/app'` — this avoids module resolution problems with imports that cross directory boundaries (e.g., `src/v2/types/color.ts` importing from `../../core/colours`).

```ts
export default defineConfig({
  build: {
    rollupOptions: {
      input: 'src/v2/app/index.html',
    },
  },
  // standard React + TypeScript config
})
```

### npm Script

```json
"dev:v2": "vite --config vite.v2.config.ts"
```

## Implementation Phases

### Phase 1 — RenderBackend interface & color utilities
Type definitions for `RenderBackend`, `RgbaColor`, `StrokeStyle`, `RendererInfo`. `hslToRgba` conversion utility. Tests for color conversion.

### Phase 2 — Command emitter
`emitFrame` and `emitNode` functions that walk the node tree and call backend methods. Anchor resolution. PathFollow resolution. Tests using a mock backend that records calls.

### Phase 3 — SVG backend
`SvgRenderBackend` implementing the interface. Catmull-Rom → Bezier conversion for smooth paths. Draw progress via dasharray. Tests for DOM output.

### Phase 4 — V2Diagram React component
Component wrapping the full pipeline (parse → timeline → evaluate → apply → layout → camera → emit). Animation loop. Camera support. Static diagram handling.

### Phase 5 — V2 Dev App
App shell, sample browser, editor integration, timeline integration, viewport controls. Vite config. `npm run dev:v2`.
