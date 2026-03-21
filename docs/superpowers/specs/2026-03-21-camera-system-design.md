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

### Phase 1 — Track expansion (at timeline build time)

Same pattern as slot expansion in `timeline.ts`:

1. At each keyframe boundary, evaluate the camera's `fit`, `target`, `zoom`, and `ratio` values
2. Compute the corresponding view area (bounding box, centered position, scaled dimensions, ratio-constrained proportions)
3. Expand into concrete tracks: `cameraId.rect.w`, `cameraId.rect.h`, `cameraId.transform.x`, `cameraId.transform.y`
4. The track system interpolates these values between keyframes with easing

This means:
- `fit: ["a", "b"]` changing to `fit: ["c", "d"]` produces a **smooth rect transition**, even though the string array itself steps
- `zoom` and `ratio` changes are smooth because they affect rect dimensions
- `target` changes (even between different node IDs) are smooth because they affect transform position

### Phase 2 — Render (every frame)

`computeViewBox` becomes trivial:
1. Find the active camera node (walk tree, find nodes with `camera` property, pick first with `active !== false`)
2. Read the camera node's already-animated `rect` and `transform`
3. Return that as the viewbox

No bounding box computation at render time. The heavy lifting is done once during track expansion.

### Emergent capabilities

Since the camera's view is a standard rect + transform, the following come for free with no additional code:

- **Rotation**: Rotate the camera node's transform to get a rotated view
- **Scale**: Animate transform scale independently of zoom
- **Stretch**: Non-uniform scaling for distortion effects
- All composable with easing through the existing animation system

### Edge cases

- **No camera in scene**: Use the default viewport (current behavior)
- **Camera with no settings**: No rect produced, default viewport used
- **fit: "all"**: At expansion time, collect all non-camera node IDs
- **Multiple active cameras**: First active camera wins (document this)
- **Camera targeting a moving node**: Track expansion evaluates node positions at keyframe times; the interpolated rect follows the motion path smoothly between keyframes

## Editor Integration

### Ratio preview toggle

A button in the preview panel toolbar:
- **Active**: Renders letterbox/pillarbox bars as CSS overlays on the preview viewport, visualizing the active camera's ratio constraint
- **Inactive**: Full unconstrained view
- Bars update live as the camera ratio animates
- The SVG remains full-size; bars are purely visual overlay

### Schema-driven editing (no changes needed)

`CameraSchema` is already part of `NodeSchema`, so the editor picks up all camera properties automatically:
- `target` → existing `PointRefEditor` popup (mode switching between coordinate, node ID, node+offset)
- `zoom`, `ratio` → jog wheel (number editor)
- `active` → boolean toggle
- `fit` → string array editor (list of node IDs) or `"all"` string

## Files to Modify

1. **`src/v2/types/node.ts`** — Extend `CameraSchema` with `ratio`, `active`, update `fit` to accept `"all"`
2. **`src/v2/animation/timeline.ts`** — Add camera track expansion (resolve camera settings → rect/transform tracks at keyframe boundaries)
3. **`src/v2/renderer/camera.ts`** — Simplify `computeViewBox` to read active camera rect/transform. Add `findActiveCamera`. Remove current bounding box computation (moved to track expansion).
4. **`src/v2/app/components/V2Diagram.tsx`** (or equivalent render loop) — Wire `findActiveCamera` → viewbox from rect/transform each frame
5. **Editor toolbar** — Add ratio preview toggle button with CSS overlay

## Non-goals

- DSL shorthand for cameras (deferred to future DSL simplification work)
- Multiple simultaneous viewports
- Smooth transitions between camera switches (switching is a cut; smooth transitions are achieved by animating a single camera's properties)
- Camera-specific editor panel or template
