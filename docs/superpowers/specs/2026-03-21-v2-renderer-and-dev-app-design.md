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
  dash?: { length: number; gap: number };
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
  drawPath(points: [number, number][], closed: boolean, fill: RgbaColor | null, stroke: StrokeStyle | null): void;
  drawImage(src: string, w: number, h: number, fit: 'contain' | 'cover' | 'fill'): void;
}
```

**Color convention**: Colors are passed as RGBA (converted from HSL at the command emission layer). Backends never see HSL — they receive renderer-ready color values.

**Future renderers**: Canvas2D, Three.js/WebGL, ASCII. Each just implements this interface.

## Command Emitter

The bridge between the v2 node tree and any backend. Lives in `src/v2/renderer/emitter.ts`.

**Responsibilities:**
- Walks the evaluated node tree depth-first
- Resolves inheritance (fill, stroke from parent chain)
- Resolves opacity (multiplicative composition via push/pop)
- Sorts siblings by depth
- Skips invisible nodes (but does not skip their animation evaluation — visibility is render-time only)
- Resolves connection endpoints (from/to object IDs → coordinates)
- Converts HSL colors to RGBA before passing to backend
- Applies dash patterns

**Algorithm:**

```
emitFrame(backend, nodes):
  backend.beginFrame()
  for each root node (sorted by depth, excluding camera nodes):
    emitNode(backend, node, parentFill, parentStroke)
  backend.endFrame()

emitNode(backend, node, parentFill, parentStroke):
  if not visible: return

  resolve transform: x, y, rotation, scale (default 0, 0, 0, 1)
  backend.pushTransform(x, y, rotation, scale)

  resolve opacity (own ?? 1)
  backend.pushOpacity(opacity)

  resolve fill: own → style → parent (convert HSL → RGBA)
  resolve stroke: own → style → parent (convert HSL → RGBA + width)

  emit geometry:
    rect    → backend.drawRect(w, h, radius, fill, stroke)
    ellipse → backend.drawEllipse(rx, ry, fill, stroke)
    text    → backend.drawText(content, size, fill, align, bold, mono)
    path    → resolve points or connection endpoints, backend.drawPath(points, closed, fill, stroke)
    image   → backend.drawImage(src, w, h, fit)

  for each child (sorted by depth):
    emitNode(backend, child, fill, stroke)

  backend.popOpacity()
  backend.popTransform()
```

**Key design point**: The emitter is the only code that imports from the node/tree layer. Backends have no knowledge of starch's data model — they are pure drawing implementations.

## HSL → RGBA Conversion

The emitter converts `HslColor { h, s, l }` to `RgbaColor { r, g, b, a }` before calling backend methods. This conversion happens in a utility function `hslToRgba(hsl: HslColor, opacity?: number): RgbaColor`.

The `a` channel combines the node's resolved opacity. This way backends receive a single RGBA value per fill/stroke and don't need to handle opacity separately for color rendering (though the `pushOpacity`/`popOpacity` stack is still used for child element composition).

## SVG Backend

First `RenderBackend` implementation. Maps draw commands to SVG DOM elements.

**Lifecycle:**
- `mount(container)`: Creates `<svg>` element with `width="100%" height="100%"`, a background `<rect>`, and a `<g>` content group. Appends to container.
- `destroy()`: Removes the SVG element.
- `beginFrame()`: Clears the content group (removes all children).
- `endFrame()`: No-op (DOM is already live).

**Transform stack:**
- `pushTransform(x, y, r, s)`: Creates a `<g>` element with `transform="translate(x,y) rotate(r) scale(s)"`. Appends to current parent `<g>`. Pushes onto stack.
- `popTransform()`: Pops from stack, restores previous `<g>` as current parent.

**Opacity stack:**
- `pushOpacity(opacity)`: Sets `opacity` attribute on the current `<g>`. SVG handles multiplicative composition natively via nested group opacity.
- `popOpacity()`: No explicit action needed (handled by popTransform since opacity lives on the `<g>` element).

**Draw commands:**
- `drawRect` → appends `<rect>` to current `<g>` with x/y centered
- `drawEllipse` → appends `<ellipse>` to current `<g>`
- `drawText` → appends `<text>` with `text-anchor`, `dominant-baseline`, font attributes
- `drawPath` → appends `<path>` with computed `d` attribute from points
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
3. **Camera**: Finds camera node in evaluated tree, computes viewBox, calls `backend.setViewBox()`.
4. **Props**: Receives `dsl`, `autoplay`, `speed`, `debug`. Exposes `time`, `duration`, `playing`, `seek`, `play`, `pause`, chapter controls.

### Pipeline per frame

```
DSL string
  → parseScene()           // v2 parser (once, on DSL change)
  → buildTimeline()        // v2 timeline (once, on DSL change)
  → evaluateAllTracks(t)   // per frame
  → applyTrackValues()     // per frame
  → runLayout()            // per frame
  → emitFrame(backend)     // per frame → SVG backend
```

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

These all operate by manipulating the viewBox passed to `backend.setViewBox()`.

### Vite Configuration

New file: `vite.v2.config.ts`

```ts
export default defineConfig({
  root: 'src/v2/app',
  // ...standard React + TypeScript config
})
```

### npm Script

```json
"dev:v2": "vite --config vite.v2.config.ts"
```

## Implementation Phases

### Phase 1 — RenderBackend interface & color utilities
Type definitions for `RenderBackend`, `RgbaColor`, `StrokeStyle`, `RendererInfo`. HSL → RGBA conversion utility. Tests for color conversion.

### Phase 2 — Command emitter
`emitFrame` function that walks the node tree and calls backend methods. Tests using a mock backend that records calls.

### Phase 3 — SVG backend
`SvgRenderBackend` implementing the interface. Tests for DOM output.

### Phase 4 — V2Diagram React component
Component wrapping the full pipeline (parse → timeline → evaluate → apply → layout → emit). Animation loop. Camera support.

### Phase 5 — V2 Dev App
App shell, sample browser, editor integration, timeline integration, viewport controls. Vite config. `npm run dev:v2`.
