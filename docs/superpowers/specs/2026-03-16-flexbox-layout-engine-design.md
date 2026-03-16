# Flexbox Layout Engine & Keyframe Animation

**Date:** 2026-03-16
**Status:** Draft

## Overview

Replace starch's current layout system with a full CSS flexbox-style layout engine that runs at eval-time (every animation frame). Remove the dedicated `group` object type — any object can be a flex container. Introduce keyframe-block-based animation where changes are grouped by time rather than by target. All rendering moves to world-space coordinates with flat SVG output (no nested `<g>` transforms).

## Motivation

The current layout engine is limited: groups own children via a `children` array, layout runs once at parse time, and children are positioned in the group's local coordinate space. This makes it difficult to:

- Animate items moving between containers (coordinate system mismatch)
- Handle concurrent moves into the same container (build-time expansion can't predict intermediate states)
- Use familiar CSS flexbox properties like `grow`, `shrink`, `wrap`
- Describe animations naturally (current format is per-object-property, not per-moment-in-time)

## Design

### 1. Any Object Can Be a Flex Container

The `group` object type is removed. Any object (box, circle, table, label) becomes a flex container by setting `direction`.

**Before:**
```js
scene.group("sidebar", { direction: "column", gap: 10, x: 20, y: 50 })
// children declared via children array on group
```

**After:**
```js
scene.box("sidebar", {
  x: 20, y: 50, fill: "#eee", radius: 8,
  direction: "column", gap: 10, padding: 16
})
scene.box("item1", { w: 80, h: 40, group: "sidebar" })
```

**Removals:**
- `GroupProps` type
- `GroupRenderer` component
- `'group'` from `ObjectType` union
- `scene.group()` from Scene API
- `children` array on groups

### 2. Layout Properties

Short CSS-inspired names. No `flex` prefix.

**Container properties (added to BaseProps):**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `direction` | `"row"` \| `"column"` | — | Enables flex layout when set |
| `gap` | `number` | `0` | Space between children |
| `justify` | `"start"` \| `"center"` \| `"end"` \| `"spaceBetween"` \| `"spaceAround"` | `"start"` | Main-axis alignment |
| `align` | `"start"` \| `"center"` \| `"end"` \| `"stretch"` | `"start"` | Cross-axis alignment |
| `wrap` | `boolean` | `false` | Wrap children to next line when overflowing |
| `padding` | `number` | `0` | Inner padding around children |

**Child properties (added to BaseProps):**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `group` | `string` | — | ID of the container this object belongs to |
| `order` | `number` | `0` | Sort order within container (definition order breaks ties) |
| `grow` | `number` | `0` | Proportion of extra space to absorb |
| `shrink` | `number` | `0` | Proportion of overflow to absorb |
| `alignSelf` | `"start"` \| `"center"` \| `"end"` \| `"stretch"` | — | Per-item cross-axis override (inherits container `align` if unset) |

### 3. World-Space Coordinates

All objects are positioned in world-space. Layout computes absolute positions:

```
child.worldX = container.worldX + childLayoutOffset.x
child.worldY = container.worldY + childLayoutOffset.y
```

This is recursive for nested containers. All items render as top-level SVG elements — no nested `<g>` transforms for parent-child relationships.

**Container visuals:** Containers render as their own type. A box with `direction: "column"` renders as a `<rect>` at its world position. Its children render as separate top-level elements.

**Render order:** Determined by:
1. Explicit `depth` property (if set)
2. Nesting depth computed from `group` membership (deeper = higher)
3. Type priority (paths < labels < shapes < lines)

### 4. Parent Transform Cascade

When a container has `scale`, `opacity`, or `rotation`, these cascade to children by default:

- **opacity:** `child.opacity *= parent.opacity` (multiplicative)
- **scale:** child positions scaled relative to parent origin, child scale multiplied
- **rotation:** child positions rotated around parent origin

**Opt-out:** Three boolean properties on the container, all default `true`:
- `inheritOpacity`
- `inheritScale`
- `inheritRotation`

Set to `false` to stop that transform from cascading. These are animatable — a container can stop/start cascading transforms mid-animation via keyframes.

### 5. Auto-Sizing

Containers without explicit `w`/`h` auto-size to fit their children:

```
autoWidth  = padding * 2 + children extent on main/cross axis + gaps
autoHeight = padding * 2 + children extent on cross/main axis
```

The auto-computed size is stored as internal `_layoutW`/`_layoutH` values used by the renderer. These are computed before the parent container processes, so nested containers have correct sizes for their parent's layout.

When `stretch` is applied (via `align` or `alignSelf`), the child's cross-axis size is expanded. This is a computed layout value (`_layoutW`/`_layoutH`) — it does not modify the base `w`/`h` prop.

### 6. Flexbox Layout Algorithm

Runs every frame during evaluation.

**Step 1 — Build membership map:**
Scan all objects, collect `{ containerId → [children] }` sorted by `order` (definition order breaks ties).

**Step 2 — Process depth-first:**
Inner containers first, so their auto-sized dimensions are known when the parent lays them out.

**Step 3 — For each container, compute flexbox layout:**

**Main axis:**
1. Sum children main-axis sizes + gaps
2. If `wrap: true` and total exceeds container main-axis size, break into lines
3. Distribute remaining space:
   - If children have `grow > 0`, distribute extra space proportionally
   - If children overflow and have `shrink > 0`, shrink proportionally
   - Otherwise position according to `justify`

**Cross axis:**
For each child, apply `alignSelf` (or container `align`):
- `start` — align to cross-axis start
- `center` — center on cross axis
- `end` — align to cross-axis end
- `stretch` — expand child cross-axis size to fill the line

**Step 4 — Convert to world-space:**
Add container world position to child offsets (recursive for nesting).

**Step 5 — Auto-size containers:**
Containers without explicit `w`/`h` get sized from children extent. Computed before parent processes them.

### 7. Keyframe-Block Animation

Animation is defined as keyframe blocks — groups of changes at a point in time.

**Format:**
```js
{
  easing: "easeOut",                      // animation-level default
  keyframes: [
    {
      time: 1,
      easing: "easeInOut",                // keyframe-level override
      changes: {
        item1: { group: "containerB" },   // inherits easeInOut
        item2: { x: 200, easing: "linear" } // per-object override
      }
    },
    {
      time: 3,
      changes: {
        item1: { group: "containerC", opacity: 0.5 }
      }
    }
  ]
}
```

**Implicit keyframe 0:** The object definitions serve as keyframe 0. No need to declare initial values in the animation.

**Easing cascade:** Resolved at track-build time. Priority order:
1. Per-property (if ever needed)
2. Per-object
3. Per-keyframe
4. Animation-level default
5. `"linear"` (system default)

**Track building:** Keyframe blocks are flattened into per-property tracks (same internal structure as today). The easing cascade is resolved during this step — each track keyframe gets its resolved easing attached.

**Interpolation:** Unchanged. Numbers lerp, colors lerp, strings/booleans snap. The transition window for any property is from its previous keyframe to the current one.

### 8. Eval-Time Layout with Position Blending

The evaluation pipeline runs every frame:

1. **Interpolate** — walk all tracks at current time, produce animated prop values (same as today)
2. **Layout** — run flexbox on current animated state (group memberships, order, grow, etc.) to compute world-space target positions
3. **Blend** — smooth transitions when layout positions change discontinuously
4. **Transforms** — cascade parent opacity/scale/rotation to children
5. **Resolve** — follow paths, compute edge points for lines
6. **Render** — all items at top level, world-space SVG

**Position blending (Step 3):**

The evaluator maintains a transition map: `{ itemId → { fromX, fromY, targetX, targetY, startTime, endTime, easing } }`

- When layout produces a position different from the current target for an item, a new blend starts
- The blend window comes from the keyframe that caused the change (e.g., the `group` keyframe's time window)
- The rendered position interpolates from `from` to `target` using the easing
- When the blend completes, `from` snaps to `target`

For items that move as a side-effect (siblings reflowing because a new item arrived), the blend uses the same window as the keyframe that caused the reflow.

This makes the evaluator slightly stateful — it tracks active blends across frames. The state is minimal and resets cleanly on seek.

### 9. Chapters

Deferred. Chapters will be revisited as named keyframes in a future iteration.

### 10. What Stays the Same

- **Interpolation engine** — lerp numbers, lerp colors, snap strings/booleans
- **All 15 easing functions**
- **Line/path system** — from/to connections, bezier curves, splines, path following
- **Anchor system** — named/float anchors for scale pivot points
- **SVG renderers** — BoxRenderer, CircleRenderer, LabelRenderer, TableRenderer, LineRenderer, PathRenderer (GroupRenderer removed)
- **Diagram component** — playback controls, requestAnimationFrame loop
- **Editor component** — CodeMirror live editing

### 11. Changes Summary

| Area | Change |
|------|--------|
| Types | Remove `GroupProps`, `'group'` from ObjectType. Add layout/child/inherit props to BaseProps |
| Layout engine | Full rewrite — flexbox algorithm, world-space, eval-time |
| Evaluator | Add layout + position blending (stateful) + parent transform cascade |
| Timeline builder | Accept keyframe blocks, resolve easing cascade |
| Renderer | Remove GroupRenderer. All objects render top-level, world-space |
| Render order | Nesting depth from `group` membership instead of `groupId` |
| Scene API | Remove `scene.group()`. Layout props on all creation methods |
| Parser | Accept keyframe block format and new props |
