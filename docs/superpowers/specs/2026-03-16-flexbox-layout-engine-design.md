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
| `rotation` | `number` | `0` | Rotation in degrees (currently only on GroupProps, promoted to BaseProps) |

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
3. Type priority (paths < labels < containers < shapes < lines). An object counts as a container if it has `direction` set — this ensures container backgrounds render below their children and below non-container shapes at the same depth.

### 4. Parent Transform Cascade

When a container has `scale`, `opacity`, or `rotation`, these cascade to children by default:

- **opacity:** `child.opacity *= parent.opacity` (multiplicative)
- **scale:** child positions scaled relative to parent origin, child scale multiplied
- **rotation:** child positions rotated around parent origin

**Opt-out:** Three boolean properties on the **container** controlling whether it cascades each transform to its children. All default `true`:
- `cascadeOpacity`
- `cascadeScale`
- `cascadeRotation`

Set to `false` to stop that transform from cascading to children. These are animatable — a container can stop/start cascading transforms mid-animation via keyframes.

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
2. If `wrap: true` and total exceeds container main-axis size, break into wrap lines. Each wrap line is a separate row/column of children.
3. For each line, distribute remaining space:
   - If children have `grow > 0`, distribute extra space proportionally to grow values
   - If children overflow and have `shrink > 0`, reduce sizes proportionally to `shrink * childSize`
   - Otherwise position according to `justify`:
     - `start` — pack children to the start of the main axis
     - `center` — center the block of children
     - `end` — pack children to the end of the main axis
     - `spaceBetween` — equal gaps between children, no gap at edges
     - `spaceAround` — equal gaps around each child (half-gap at edges)

**Cross axis:**
For each child, apply `alignSelf` (or container `align`):
- `start` — align to cross-axis start
- `center` — center on cross axis
- `end` — align to cross-axis end
- `stretch` — expand child cross-axis size to fill the line

When `wrap: true` produces multiple lines, each line occupies its own cross-axis band. Lines are packed to the start of the cross axis with no extra space between them (equivalent to CSS `align-content: flex-start`). Multi-line alignment control may be added in a future iteration.

**Note on step ordering:** Auto-sizing and world-space conversion happen during depth-first processing. For each container (inner-first):
1. Lay out its children on main/cross axes
2. If no explicit `w`/`h`, compute auto-size from children extent
3. Convert child positions to world-space by adding container's world position

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

**Track building:** Keyframe blocks are flattened into per-property tracks (same internal `Tracks` structure as today — `Record<string, TrackKeyframe[]>`). The easing cascade is resolved during this step — each track keyframe gets its resolved easing attached.

The new input format replaces the current `AnimConfig` type. The old per-property keyframe format (`{ time, target, prop, value, easing }[]`) is replaced by the keyframe-block format. The internal `Tracks` type remains unchanged — only the input format and the `buildTimeline` function change.

**New `AnimConfig` type:**
```ts
interface AnimConfig {
  easing?: EasingName;           // animation-level default
  duration?: number;             // total animation duration (retained from current type)
  loop?: boolean;                // loop playback (retained from current type)
  keyframes: KeyframeBlock[];
}

interface KeyframeBlock {
  time: number;
  easing?: EasingName;           // keyframe-level default
  changes: Record<string, ObjectChanges>;
}

interface ObjectChanges {
  easing?: EasingName;           // per-object default
  [prop: string]: unknown;       // property values
}
```

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

**Initial layout (no blend):** When the evaluator first runs (t=0 or after a seek), layout positions are applied instantly with no blending. Blending only activates when a layout position changes between consecutive frames during playback.

This makes the evaluator slightly stateful — it tracks active blends across frames. The state is minimal and resets cleanly on seek (all active blends are cleared, positions snap to layout-computed values).

### 9. Validation

- If `group` references a nonexistent object ID, the item is treated as ungrouped (positioned at its own x/y).
- If `group` references create a cycle (A in B, B in A), behaviour is undefined. The depth-first processing will skip one of them. No explicit cycle detection is required in v1 — this is a user error.

### 10. Chapters

Deferred. Chapters will be revisited as named keyframes in a future iteration. The existing `Chapter` type and `getActiveChapter()` remain temporarily unchanged.

### 11. Intentional Simplifications

- `padding` is a single number (uniform on all sides), not per-side. This may be extended later.
- No `align-content` for wrapped layouts — wrapped lines pack to start. May be added later.

### 12. What Stays the Same

- **Interpolation engine** — lerp numbers, lerp colors, snap strings/booleans
- **All existing easing functions** (linear, easeIn, easeOut, easeInOut, cubic/quart variants, easeInBack, easeOutBack, bounce, elastic, spring, snap, step)
- **Line/path system** — from/to connections, bezier curves, splines, path following
- **Anchor system** — named/float anchors for scale pivot points
- **SVG renderers** — BoxRenderer, CircleRenderer, LabelRenderer, TableRenderer, LineRenderer, PathRenderer (GroupRenderer removed)
- **Diagram component** — playback controls, requestAnimationFrame loop
- **Editor component** — CodeMirror live editing

### 13. Changes Summary

| Area | Change |
|------|--------|
| Types | Remove `GroupProps`, `'group'` from ObjectType. Add layout/child/cascade props, `rotation` to BaseProps. New `AnimConfig` with keyframe-block format. |
| Layout engine | Full rewrite — flexbox algorithm, world-space, eval-time |
| Evaluator | Add layout + position blending (stateful) + parent transform cascade |
| Timeline builder | Accept keyframe blocks, resolve easing cascade |
| Renderer | Remove GroupRenderer. All objects render top-level, world-space |
| Render order | Nesting depth from `group` membership instead of `groupId` |
| Scene API | Remove `scene.group()`. Layout props on all creation methods |
| Parser | Accept keyframe block format and new props |
