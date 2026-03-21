# Connections & Arrows

**Date**: 2026-03-21
**Status**: Draft
**Branch**: feat/animatable-styles
**Depends on**: V2 Compositional Object Model, Pluggable Renderer

## Overview

Restore and improve the v1 connection system in v2. Path primitives gain rich curve modes and edge snapping. A new `arrow` template composes paths with arrowheads and labels. The `RenderBackend.drawPath` interface changes from raw points to a segment-based path description.

## Path Segment Model

Replace the `points: [number, number][]` parameter in `RenderBackend.drawPath` with a typed segment array:

```ts
type PathSegment =
  | { type: 'moveTo'; x: number; y: number }
  | { type: 'lineTo'; x: number; y: number }
  | { type: 'cubicTo'; cx1: number; cy1: number;
      cx2: number; cy2: number; x: number; y: number }
  | { type: 'quadTo'; cx: number; cy: number;
      x: number; y: number }
  | { type: 'close' }
```

Updated backend method:

```ts
drawPath(segments: PathSegment[], fill: RgbaColor | null, stroke: StrokeStyle | null, drawProgress?: number): void
```

The `smooth` parameter is removed from the interface — the emitter converts Catmull-Rom splines into cubic bezier segments before calling `drawPath`. Backends receive final geometry.

## Path Primitive Enhancements

The `PathGeom` schema gains:

- `gap: number` — default spacing (pixels) between resolved edge point and line endpoint on both ends
- `fromGap: number` — override gap at start
- `toGap: number` — override gap at end

Existing fields retained: `points`, `from`, `to`, `fromAnchor`, `toAnchor`, `bend`, `route`, `smooth`, `radius`, `closed`, `drawProgress`.

## Emitter Path Resolution

The emitter converts `PathGeom` into `PathSegment[]` based on the fields present:

### Curve modes

**Straight line** (just endpoints, no `smooth`, no `bend`):
→ `moveTo` + `lineTo`

**Quadratic bend** (`from`/`to` + `bend`, no route):
→ `moveTo` + `quadTo` with control point offset perpendicular to the chord. Positive bend = clockwise, negative = counter-clockwise.

**Catmull-Rom spline** (waypoints + `smooth: true`):
→ `moveTo` + series of `cubicTo` segments. Catmull-Rom control points converted to cubic bezier per-segment using standard tension=0.5 conversion.

**Polyline with rounding** (waypoints + `smooth: false` + optional `radius`):
→ `moveTo` + `lineTo` with `quadTo` at corners for rounded turns.

**Closed path** (`closed: true`):
→ append `close` segment.

### Edge snapping

When `from`/`to` reference an object by ID, resolve to the object's bounding edge, not center:

1. Get the target node's bounding box from its geometry (rect w/h, ellipse rx/ry, image w/h, or `size` for containers). Any node type uses its bounding box — not restricted to specific shapes.
2. If explicit anchor (`fromAnchor`/`toAnchor`): resolve to anchor position on the bounding box.
3. If no explicit anchor: compute the angle from source center toward the next point in the path (first waypoint or target). Find intersection of that ray with the bounding edge:
   - **Rect/image/text/container**: check four edges, pick closest valid intersection.
   - **Ellipse**: point on circumference at angle.
4. Apply gap: offset the resolved edge point along the line direction by `fromGap`/`toGap`/`gap` pixels.

### Route waypoint resolution

Each entry in `route` is a `PointRef` — string (object ID), `[x, y]` (absolute), or `["id", dx, dy]` (object + offset). All resolved to absolute coordinates at render time.

### Tangent extraction

For `pathFollow` positioning (arrowheads, labels), the emitter computes the path direction (tangent) at any progress point. This already exists for `pathFollow`/`pathProgress` — the path segment model makes tangent calculation straightforward (derivative of the segment at the given parameter).

## Arrow Template

New built-in template that composes a path with arrowhead children and an optional label.

### DSL usage

```js
{ template: "arrow", id: "conn1", props: {
    from: "boxA", to: "boxB",
    fromAnchor: "right", toAnchor: "left",
    bend: 0.5,
    smooth: true,
    route: [[200, 100], "waypointNode"],
    arrow: true,        // end arrowhead (default true)
    arrowStart: false,  // start arrowhead (default false)
    label: "sends data",
    colour: { h: 0, s: 0, l: 60 },
    dashed: false,
    drawProgress: 1,
    gap: 4,
}}
```

### Expansion

Expands to:

```js
{
  id: "conn1",
  children: [
    {
      id: "conn1.route",
      path: { from: "boxA", to: "boxB", fromAnchor: "right", toAnchor: "left",
              bend: 0.5, smooth: true, route: [...], drawProgress: 1,
              gap: 4, toGap: 12 },  // toGap auto-set for arrowhead clearance
      stroke: { h: 0, s: 0, l: 60, width: 2 },
    },
    {
      id: "conn1.headEnd",
      path: { points: [[-8, -4], [0, 0], [-8, 4]], closed: true },
      fill: { h: 0, s: 0, l: 60 },
      transform: { pathFollow: "conn1.route", pathProgress: 1.0 },
    },
    {
      id: "conn1.label",
      text: { content: "sends data", size: 11, align: "middle" },
      fill: { h: 0, s: 0, l: 80 },
      transform: { pathFollow: "conn1.route", pathProgress: 0.5 },
    }
  ]
}
```

- **Arrowheads** use `pathFollow` to position at the path endpoints with rotation from tangent
- **Label** uses `pathFollow` at `pathProgress: 0.5` (midpoint)
- **`toGap`** auto-set based on arrowhead size so the arrow tip sits at the edge, line stops short
- If `arrowStart: true`, a second arrowhead child at `pathProgress: 0.0` with reversed triangle
- If no label, label child omitted
- All sub-parts are individually animatable via dot-notation tracks

## PointRef System

Retained unchanged. Any coordinate in the system (`from`, `to`, route waypoints, `at` references) accepts:

- `"objectId"` — resolved to object's position
- `[x, y]` — absolute coordinates
- `["objectId", dx, dy]` — object position + offset

## Implementation Phases

### Phase 1 — PathSegment type and backend update
Define `PathSegment` type in `backend.ts`. Update `drawPath` signature. Update `SvgRenderBackend` to render segments (moveTo→M, lineTo→L, cubicTo→C, quadTo→Q, close→Z). Remove old `points`/`smooth` rendering.

### Phase 2 — Emitter segment generation
Update emitter's `resolvePathPoints` to return `PathSegment[]` instead of `[number, number][]`. Implement curve mode selection (straight, bend, smooth, polyline). Port Catmull-Rom → cubic bezier conversion from v1's `bezier.ts`.

### Phase 3 — Edge snapping
Add `getNodeBounds` and `edgePoint` functions to emitter (port from v1's `EdgeGeometry.ts`). Update connection resolution to snap to edges instead of centers. Implement gap offset.

### Phase 4 — Arrow template
New `arrowTemplate` in templates/builtins. Register as built-in. Arrowhead children with `pathFollow`. Auto-gap for arrowhead clearance.

### Phase 5 — Path schema update
Add `gap`, `fromGap`, `toGap` to `PathGeomSchema`. Update samples to use arrows. Add edge-snapping and arrow samples.
