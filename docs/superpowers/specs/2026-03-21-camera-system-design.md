# Camera System Design

## Overview

Add camera controls to v2 by fleshing out the existing `camera` property on nodes. A camera is simply a node with an `id` and a `camera` struct — no new node types or subsystems. Camera settings resolve into a rect + transform on the camera node, making all transitions animatable through the existing track system.

## Camera Schema

Extend `CameraSchema` on the existing `NodeSchema`:

```typescript
camera?: {
  target?: PointRef;          // [x,y] | "nodeId" | ["nodeId", dx, dy]
  zoom?: number;              // default 1, scales the view area
  fit?: string[] | "all";     // fit specific node IDs or all nodes in view
  ratio?: number;             // width/height aspect ratio (e.g. 16/9, 2.35)
  active?: boolean;           // which camera is used (default true, step-interpolated)
}
```

### Property behavior

- **target**: Uses the existing `PointRef` type. Coordinates, node IDs, and node+offset all work. When targeting a node, the camera tracks the node's position each frame.
- **zoom**: Numeric, lerp-interpolated. `2` means 2x closer (halves the view area dimensions).
- **fit**: Accepts an array of node IDs or the string `"all"`. Computes a bounding box of the specified nodes and sizes the camera view to contain them with margin.
- **ratio**: Numeric, lerp-interpolated. Constrains the camera rect proportions (`w/h === ratio`). Enables cinematic effects like animated letterboxing.
- **active**: Boolean, step-interpolated. Determines which camera node provides the viewbox. First active camera wins if multiple are active.

## Camera-to-Rect Resolution

The key insight: camera settings resolve into a **rect + transform on the camera node**, just like layouts auto-size containers. This makes all camera transitions smoothly animatable through the existing track system.

### Phase 1 — Track expansion (multi-pass, after all other tracks are built)

Camera expansion runs as a **second pass** after all non-camera tracks are built, avoiding circular dependencies:

1. `buildTimeline()` builds all tracks normally (including slot expansion)
2. Camera expansion pass: for each keyframe boundary time, use `evaluateAllTracks` and `applyTrackValues` (imported from `evaluator.ts` and `applyTracks.ts`) to get animated node positions at that time
3. Resolve camera `fit`, `target`, `zoom`, and `ratio` at each keyframe time using those evaluated positions:
   - **target as `[x, y]`**: Use coordinates directly as camera center
   - **target as `"nodeId"`**: Look up node's animated position as camera center
   - **target as `["nodeId", dx, dy]`**: Look up node's animated position, add offset `(x + dx, y + dy)` as camera center
   - **fit**: Compute bounding box of specified nodes → camera center + dimensions
   - **zoom**: Scale dimensions by `1/zoom`
   - **ratio**: Constrain rect proportions — expand the smaller dimension so `w/h === ratio` (letterbox/pillarbox, never clip)
4. Expand into concrete tracks: `cameraId.rect.w`, `cameraId.rect.h`, `cameraId.transform.x`, `cameraId.transform.y`
5. The track system interpolates these values between keyframes with easing

**Approximation trade-off**: The camera rect is computed at keyframe times and interpolated between them. If fitted nodes follow non-linear paths between keyframes, the camera rect interpolation is an approximation — it lerps between two snapshots rather than tracking the exact bounding box every frame. This is acceptable for most use cases and avoids per-frame bounding box computation. For frame-accurate tracking, users can add more keyframes.

This means:
- `fit: ["a", "b"]` changing to `fit: ["c", "d"]` produces a **smooth rect transition**, even though the string array itself steps
- `zoom` and `ratio` changes are smooth because they affect rect dimensions
- `target` changes (even between different node IDs) are smooth because they affect transform position

### Phase 2 — Render (every frame)

`computeViewBox` signature changes from `(cameraNode, roots, defaultViewBox)` to simply reading the active camera's rect + transform:

1. `findActiveCamera(roots)`: walk root-level nodes, find first with `camera` property and `active !== false`
2. Read the camera node's already-animated `rect` (w, h) and `transform` (x, y, rotation)
3. Return `{ x: transform.x - rect.w/2, y: transform.y - rect.h/2, w: rect.w, h: rect.h, rotation: transform.rotation }` as the viewbox
4. If no active camera or no rect on camera, fall back to default viewport

No bounding box computation at render time. The heavy lifting is done once during track expansion.

### Emergent capabilities

Since the camera's view is a standard rect + transform:

- **Scale**: Animate transform scale independently of zoom — works immediately
- **Stretch**: Non-uniform scaling for distortion effects — works immediately
- **Rotation**: The camera node's `transform.rotation` rotates the view. SVG `viewBox` is axis-aligned, so the SVG backend applies the inverse rotation to the content `<g>` group: `transform="rotate(-angle, cx, cy)"`. Implementation requires:
  1. Add optional `rotation` parameter to `RenderBackend.setViewBox`
  2. In `SvgRenderBackend.setViewBox`, apply the counter-rotation to `_content`
  3. In `emitFrame`, read the camera's `transform.rotation` and pass it through

  ~10 lines across 3 files.

### Edge cases

- **Camera nodes must be root-level**: Camera nodes must be declared at the root of the node tree, not nested inside other nodes. This is required because `applyTrackValues` resolves the first ID segment against root nodes only, and `emitFrame` only filters camera nodes at root level. Nested camera nodes would have their expanded tracks silently dropped and would be rendered as visible geometry.
- **No camera in scene**: Use the default viewport (current behavior)
- **Camera with no settings**: No rect produced, default viewport used
- **fit: "all"**: At expansion time, collect all non-camera node IDs
- **fit changes to empty list**: Falls back to default viewport dimensions for that keyframe
- **Multiple active cameras**: First active camera in root-node order wins
- **Camera targeting a moving node**: Track expansion evaluates node positions at keyframe times; interpolation between snapshots is an approximation (see Phase 1 trade-off note)

## Editor Integration

### Ratio preview toggle

A button in the preview panel toolbar:
- **Active**: Renders letterbox/pillarbox bars as CSS overlays on the preview viewport, visualizing the active camera's ratio constraint
- **Inactive**: Full unconstrained view
- Bars update live as the camera ratio animates
- The SVG remains full-size; bars are purely visual overlay

### Schema-driven editing

`CameraSchema` is part of `NodeSchema`, so the editor picks up camera properties via autocomplete and popups. Note: the `NodeInput` and `Node` interfaces in `node.ts` are hand-coded (not derived from `CameraSchema` via `z.infer`), so they must be updated separately when adding `ratio`, `active`, and the `fit: "all"` union.
- `target` → existing `PointRefEditor` popup (mode switching between coordinate, node ID, node+offset)
- `zoom`, `ratio` → jog wheel (number editor)
- `active` → boolean toggle
- `fit` → string array editor (list of node IDs) or `"all"` string

## Files to Modify

1. **`src/v2/types/node.ts`** — Update `CameraSchema` (Zod) with `ratio`, `active`, and `fit` as `z.union([z.array(z.string()), z.literal("all")])`. Update both hand-coded `NodeInput` and `Node` interfaces to match (they do not derive from `CameraSchema`).
2. **`src/v2/animation/timeline.ts`** — Add camera track expansion as a second pass after all other tracks (including slot expansion) are built. Import `evaluateAllTracks` from `evaluator.ts` and `applyTrackValues` from `applyTracks.ts` to evaluate node positions at each keyframe time.
3. **`src/v2/renderer/camera.ts`** — Replace `computeViewBox` with new signature that reads camera rect/transform directly (including rotation). Add `findActiveCamera` (root-level scan). Remove `lerpViewBox` (interpolation now handled by track system).
4. **`src/v2/__tests__/renderer/camera.test.ts`** — Update tests: remove `lerpViewBox` tests, add tests for new `computeViewBox` contract and `findActiveCamera`.
5. **`src/v2/renderer/backend.ts`** — Add optional `rotation` parameter to `setViewBox`
6. **`src/v2/renderer/svgBackend.ts`** — Apply counter-rotation to `_content` group in `setViewBox`
7. **`src/v2/renderer/emitter.ts`** — Read camera `transform.rotation` and pass to `setViewBox`
8. **`src/v2/app/components/V2Diagram.tsx`** (or equivalent render loop) — Replace `animated.find(n => n.camera)` with `findActiveCamera`.
9. **Editor toolbar** — Add ratio preview toggle button with CSS overlay

## Non-goals

- DSL shorthand for cameras (deferred to future DSL simplification work)
- Multiple simultaneous viewports
- Smooth transitions between camera switches (switching is a cut; smooth transitions are achieved by animating a single camera's properties)
- Camera-specific editor panel or template
