# Compositional Object Model

**Date**: 2026-03-20
**Status**: Draft
**Branch**: feat/animatable-styles (current base)

## Overview

Rewrite Starch's object model so that everything is a nested tree of nodes. The current flat shape types (box, circle, label, etc.) become pre-built compositions of rendering primitives. Compound properties (colors, strokes) become structured sub-objects whose leaves are individually animatable via dot-notation tracks.

This unifies the model: a simple box and a complex Mermaid-style flowchart node differ only in nesting depth, not in kind.

## Goals

- Every leaf value in the node tree is an animatable track target
- Shapes are compositions of primitives, not hardcoded types
- Colors support multiple input formats (HSL, RGB, hex, named), normalized to HSL internally for perceptual interpolation
- Layout is a pluggable strategy system, not baked into rendering
- Templates enable user-defined and pre-built complex components
- Clean-room rewrite (Approach A) — new system built alongside, then replaces old

## Node Model

### The Universal Node

Every element in a diagram is a **node**. A node has:

- `id` — unique identifier
- Zero or more **property sub-objects** (fill, stroke, transform, opacity, depth, etc.)
- Zero or more **child nodes** via `children`
- Optional geometry field — makes it a rendering primitive
- Optional `style` reference
- Optional `layout` declaration (makes it a layout container)
- Optional `layoutHint` bag (read by parent's layout strategy)
- Optional `visible` boolean (default true) — controls rendering and hit-testing. Unlike `opacity: 0`, an invisible node does not occupy layout space or receive pointer events.
- Optional `size: { w, h }` — explicit size for layout purposes. Overrides geometry-derived size. Does not affect rendering (a rect still uses `rect.w`/`rect.h` for drawing). Primarily useful for non-geometric container nodes or text nodes that need to participate in layout. Animatable: `node.size.w`, `node.size.h`.

### Rendering Primitives

Five geometry types. A node with one of these fields is a leaf-level renderable. A node must have at most one geometry field.

| Primitive  | Fields                              | SVG output   |
|------------|-------------------------------------|--------------|
| `rect`     | `w`, `h`, `radius`                  | `<rect>`     |
| `ellipse`  | `rx`, `ry`                          | `<ellipse>`  |
| `text`     | `content`, `size`, `lineHeight`, `align`, `bold`, `mono` | `<text>` |
| `path`     | `points`, `closed`, `smooth`, `from`, `to`, `fromAnchor`, `toAnchor`, `bend`, `route`, `radius`, `drawProgress` | `<path>` |
| `image`    | `src`, `fit`, `padding`, `w`, `h`   | `<image>`    |

The `path` primitive handles both freeform point sequences and connections between nodes. See the **Connections** section for details.

### Property Sub-Objects

Attached to any node. These are categorized by their inheritance/composition behavior:

**Visual properties (inherit from parent to child):**
- **fill**: `{ h, s, l }` — HSL color
- **stroke**: `{ h, s, l, width }` — HSL color + line width
- **opacity**: plain number (0-1)

**Transform (parent-relative composition, not inheritance):**
- **transform**: `{ x, y, rotation, scale, anchor, pathFollow, pathProgress }` — position & orientation relative to parent

A child's transform is composed with its parent's: if parent is at (200, 100) and child has `transform: { x: 70, y: 30 }`, the child renders at world-space (270, 130). A child with no transform defaults to (0, 0) relative to its parent — it does **not** inherit the parent's x/y values. Rotation and scale compose multiplicatively. This mirrors SVG's nested `<g>` transform model.

`anchor` sets the pivot point for rotation and scale. Accepts named anchors (`"center"`, `"N"`, `"NE"`, etc. — same set as connection anchors) or float pairs `[fx, fy]` (0-1 range, relative to the node's bounding box). Default: `"center"`. Named anchors are step-interpolated; float pairs are numerically lerped.

When `pathFollow` is set (a path node ID), `pathProgress` (0-1) determines position along that path. The computed position overrides `x`/`y` at render time. Both `pathFollow` (step-interpolated) and `pathProgress` (numeric lerp) are animatable. On closed paths, progress wraps.

**Non-inheritable (node-local only):**
- **depth**: plain number for z-ordering (see Render Order)
- **visible**: boolean
- **geometry fields** (rect, ellipse, text, path, image)
- **layout** and **layoutHint**

### Color Representation

Colors are stored internally as HSL. Multiple input formats are accepted and normalized at parse time:

```js
fill: { h: 210, s: 80, l: 50 }        // HSL object (canonical)
fill: { r: 100, g: 150, b: 255 }       // RGB object → converted to HSL
fill: "dodgerblue"                      // named → resolved to HSL
fill: "#3399ff"                         // hex → resolved to HSL
```

**Numeric ranges:** `h`: 0–360 (degrees), `s`: 0–100 (percent), `l`: 0–100 (percent).

**Hue interpolation:** Takes the shortest arc by default. Interpolating from `h: 350` to `h: 10` goes through 0 (20-degree arc), not through 180 (340-degree arc). To force the long arc, use an intermediate keyframe at the midpoint hue.

**CSS output:** At render time, HSL values are converted to CSS `hsl(h, s%, l%)` strings.

### Inheritance Rules Summary

| Property category | Behavior |
|---|---|
| Visual (fill, stroke) | Inherits from parent. Child's explicit value overrides. |
| Opacity | Composes multiplicatively with parent (SVG-native behavior). Parent 0.5 + child 0.8 = rendered 0.4. |
| Transform (x, y, rotation, scale, anchor, pathFollow, pathProgress) | Composes with parent. Child values are parent-relative. Defaults to identity (0, 0, 0, 1, "center"). |
| Geometry, layout, layoutHint, dash, size, depth, visible | Node-local. Never inherits. |

## Composition

A composition is a node whose children are other nodes. A "box" is sugar for:

```js
{
  id: "mybox",
  transform: { x: 200, y: 100 },
  children: [
    {
      id: "mybox.bg",
      rect: { w: 140, h: 60, radius: 6 },
      fill: { h: 210, s: 70, l: 45 },
      stroke: { h: 210, s: 80, l: 30, width: 2 }
    },
    {
      id: "mybox.label",
      text: { content: "My Box", size: 14, align: "middle" },
      fill: { h: 0, s: 0, l: 100 },
      transform: { x: 70, y: 30 }
    }
  ]
}
```

A "line" is a composition of path + arrowheads + label:

```js
{
  id: "conn1",
  children: [
    {
      id: "conn1.route",
      path: { from: "a", to: "b", smooth: true },
      stroke: { h: 0, s: 0, l: 60, width: 2 },
      dash: { pattern: "dashed", length: 8, gap: 4 }
    },
    {
      id: "conn1.arrowEnd",
      path: { points: [...] },
      fill: { h: 0, s: 0, l: 60 }
    },
    {
      id: "conn1.label",
      text: { content: "calls", size: 11 },
      transform: { pathFollow: "conn1.route", pathProgress: 0.5 }
    }
  ]
}
```

Sub-elements like arrowheads and line patterns are independently animatable:

- `conn1.arrowEnd.fill.h`
- `conn1.route.stroke.width`
- `conn1.route.dash.gap`
- `conn1.label.transform.pathProgress`

### Dash/Pattern

`dash` is a property sub-object on path nodes:

- **dash**: `{ pattern, length, gap }` — where `pattern` is a string (`"solid"`, `"dashed"`, `"dotted"`, or a custom SVG dasharray), `length` and `gap` are numbers. `length` and `gap` are animatable; `pattern` is step-interpolated.

## Connections

The `path` primitive doubles as the connection system. When a path has `from` and/or `to` fields (instead of `points`), it acts as a dynamic connector:

### Endpoint Resolution

`from` and `to` accept the same `PointRef` formats:

```js
path: { from: "objectId", to: "otherId" }                    // center-to-center
path: { from: "objectId", to: [300, 200] }                   // object to coordinate
path: { from: ["objectId", 10, -5], to: "otherId" }          // object + offset
```

### Anchors

`fromAnchor` and `toAnchor` specify where on the source/target the connection attaches:

```js
path: { from: "a", to: "b", fromAnchor: "right", toAnchor: "left" }
```

Named anchors: `center`, `N`, `NE`, `E`, `SE`, `S`, `SW`, `W`, `NW`, `top`, `bottom`, `left`, `right`. Float anchors `[fx, fy]` (0-1 range) for arbitrary edge positions.

### Bend and Routing

- `bend: number` — curve the connection (positive = clockwise, negative = counter-clockwise). Animatable.
- `route: [[x1,y1], [x2,y2], ...]` — waypoints for routed connections.
- `smooth: boolean` — Catmull-Rom spline through waypoints vs. straight segments.
- `radius: number` — corner radius for non-smooth routed connections.

### Draw Progress

`drawProgress: number` (0-1) — controls how much of the path is drawn. Animatable for draw-on effects. Track target: `conn1.route.path.drawProgress` (where `conn1.route` is the node ID and `path` is the geometry field). The `line` built-in template names its path child with a non-`path` ID (e.g., `$.route`) to avoid the awkward `path.path` double-segment in track paths.

### Path Following

A node can follow a path via its transform:

```js
{
  id: "traveler",
  ellipse: { rx: 5, ry: 5 },
  transform: { pathFollow: "conn1.route", pathProgress: 0.5 }
}
```

`pathFollow` references a path node's ID. `pathProgress` (0-1) positions the node along that path. Both are animatable. Track target: `traveler.transform.pathProgress`. On closed paths, progress wraps (1.0 = 0.0).

These are distinct: `drawProgress` is a geometry field on the path itself (how much is rendered), while `pathProgress` is a transform field on a follower node (where it sits along the path).

### Dynamic Tracking

Connections with object-ID endpoints automatically track the target's position during animation. If `from: "a"` and object `a` moves, the connection endpoint follows.

## Camera

Camera is a special top-level node (not a rendering primitive) that controls the viewport:

```js
{
  id: "camera",
  camera: {
    target: "objectId",        // or [x, y] coordinate
    zoom: 1.5,
    fit: ["obj1", "obj2"]      // auto-zoom to fit these objects
  }
}
```

**Animatable properties:**
- `camera.camera.zoom` — numeric lerp
- `camera.camera.target` — step-interpolated (snaps from one target to another). The camera smoothly pans because the viewBox itself is interpolated between the resolved world positions of the old and new targets. String target IDs that reference moving objects resolve to the target's current position each frame.
- `camera.camera.fit` — step-interpolated (snaps to a new set of IDs). The viewBox smoothly transitions to encompass the new set.

The `cut` easing value produces instant camera jumps (no interpolation).

Camera uses a **separate viewBox interpolation pipeline** rather than the standard track system. The track system handles `zoom` (a simple number), but `target` and `fit` are resolved to viewBox rectangles each frame, and the viewBox itself is what gets smoothly interpolated between keyframes. This is the one place where animation operates on a derived value rather than a leaf property directly.

Camera is intentionally not a composition — it has no children and no geometry. It is an evaluated-once control node that sets the SVG viewBox.

## Animation System

### Track Generation

At scene init, the node tree is walked depth-first. Track paths are generated by **walking the tree structure** (parent → child → property → leaf), not by parsing node IDs. The dot-notation path reflects the tree hierarchy:

- `mybox.transform.x` — root node "mybox", transform sub-object, x field
- `mybox.bg.fill.h` — root "mybox", child "bg" (found by tree walk, not by ID prefix), fill sub-object, h field
- `mybox.bg.rect.radius` — geometry sub-object fields are also addressable
- `mybox.label.text.content` (string — step-interpolated)

Node IDs like `mybox.bg` are a naming convention enforced by templates (via `$.`), but the track system does not depend on this — it uses tree position. An ID of `background` on a child of `mybox` would produce tracks like `mybox.background.fill.h`.

**Freeform bags (`layoutHint`)**: Only keys present at init time become track targets. If a child needs `layoutHint.angle` animated, it must declare an initial value (even if `0`).

### Keyframe Targeting

```js
keyframes: [
  { time: 0, changes: {
    "mybox.bg.fill.h": 210,
    "mybox.transform.x": 200
  }},
  { time: 2, changes: {
    "mybox.bg.fill.h": 0,
    "mybox.transform.x": 400
  }}
]
```

### Shorthand Targeting

Target a sub-object to set all its children at once:

```js
{ time: 0, changes: {
  "mybox.bg.fill": { h: 0, s: 100, l: 50 }
}}
```

Expanded into individual track entries: `mybox.bg.fill.h = 0`, `mybox.bg.fill.s = 100`, `mybox.bg.fill.l = 50`.

### AutoKey

AutoKey behavior is preserved from the current system. When `autoKey: true` (the default), the timeline builder inserts hold keyframes at block boundaries to prevent unintended interpolation between blocks. `autoKey: false` on a block allows smooth transitions across block boundaries and enables effect-only blocks mid-transition.

Configurable globally in `animate.autoKey` and overridable per keyframe block.

### Easing

Applied at three levels with cascading priority:

1. **Per-property** (highest) — easing on a specific property within a keyframe change
2. **Per-keyframe block** — easing on the block applies to all properties in that block unless overridden
3. **Global default** (lowest) — `animate.easing` applies to all tracks unless overridden

Easing governs the segment *into* the keyframe (the segment from the previous keyframe to this one).

**Note**: The current system has a per-object easing level (between per-block and global). This is intentionally dropped in the new flat dot-notation format. To apply the same easing to all properties of a node, set per-property easing on each — or group related changes into their own keyframe block with block-level easing.

```js
keyframes: [
  { time: 0, changes: { "box.transform.x": 0 } },
  { time: 2, easing: "easeOutBounce", changes: {
    "box.transform.x": { value: 400, easing: "linear" }  // per-property override
  }}
]
```

### Effects

Effects are no longer a separate system. They are ephemeral additive track entries:

- **pulse** → temporary offset on `transform.scale`
- **shake** → temporary noise on `transform.x`
- **flash** → temporary offset on `opacity`
- **glow** → temporary offset on `stroke.width`

### Style Animation

Styles are partial nodes. Animating a style property updates the resolved value for all nodes referencing that style:

```js
{ time: 2, changes: { "primary.fill.h": 0 } }
```

All nodes with `style: "primary"` shift hue together.

**Namespace rule**: Style names and node IDs share a single namespace. A collision (a style and a node with the same name) is a validation error at parse time. This ensures track targets are unambiguous.

## Layout System

### Pluggable Strategies

Layout is a separate pass with a registry of strategies:

```ts
type ChildPlacement = { id: string, x: number, y: number, w?: number, h?: number }
type LayoutStrategy = (node: Node, children: Node[]) => ChildPlacement[]
```

The layout pass applies returned placements by setting each child's `transform.x` and `transform.y`. If `w`/`h` are returned (e.g., for `grow`-based sizing), they override the child's geometry dimensions for that frame.

**Layout-driven animation**: When layout output changes (due to animated layout params, layout type switching, or children being reordered), the new positions flow through the standard track/easing pipeline. There is no special blending layer — layout-computed positions are target values on transform tracks, and the easing function on the current keyframe segment controls the transition rate. Use `snap` easing for instant repositioning, or any other easing for smooth migration.

A node declares its layout strategy:

```js
{ id: "container", layout: { type: "flex", direction: "row", gap: 12 }, children: [...] }
```

### Built-in Strategies

- **flex** — row/column with gap, justify, align, wrap, grow/shrink
- **absolute** — children use their own transform (default when no layout specified)
- Future: grid, stack, circular

### Layout Hints

Children carry a `layoutHint` property bag — a loosely-typed dict of values that layout strategies read:

```js
{ id: "item", layoutHint: { grow: 1, order: 2 }, rect: {...} }
```

This is intentionally freeform. Each strategy documents which keys it reads. Unknown keys are ignored. This enables animating `container.layout.type` from `"flex"` to `"circular"` — the children's hints don't need to change, the new strategy just reads different keys.

**Track registration**: Only `layoutHint` keys present at init time become track targets. Declare initial values for any keys you intend to animate.

**Layout type animation**: Animating `layout.type` is step-interpolated — the strategy switches instantly. However, the *positions* computed by the new strategy are applied via the normal transform animation pipeline, so children smoothly transition to their new positions.

### Layout Parameters Are Animatable

`container.layout.gap`, `container.layout.direction` — all valid track targets. Numeric properties like `gap` interpolate smoothly. String properties like `direction` and `type` are step-interpolated (instant snap) — the resulting position changes are then smoothly transitioned via the transform pipeline.

### Sizing

A node's size for layout purposes comes from:

1. Geometry fields (rect has w/h, ellipse has rx/ry)
2. Explicit `size: { w, h }` on the node
3. Layout computation (grow fills available space)

Text measurement is not performed — text nodes must declare their size explicitly (via `size: { w, h }`) for layout participation. This is a known limitation that avoids font-measurement complexity.

## Styles

Styles are partial nodes — sets of property sub-objects merged as defaults onto any node referencing them:

```js
styles: {
  "primary": {
    fill: { h: 210, s: 70, l: 45 },
    stroke: { h: 210, s: 80, l: 30, width: 2 }
  },
  "faded": { opacity: 0.4 },
  "primary-faded": { style: "primary", opacity: 0.4 }  // composition
}
```

Applied via `style: "styleName"` on any node. Node's own properties override style defaults.

**Determining "explicitly set"**: A property is "explicitly set" if it appears in the node's definition (before style merging). The parser records an `_ownKeys: Set<string>` on each node during initial construction (before style/inheritance merging). Style properties only fill in properties not in `_ownKeys`. At render time, visual inheritance from the parent chain only applies to properties not in `_ownKeys` and not set by a style — own props take priority over styles, which take priority over inheritance.

**Resolution order for composed styles**: Styles are resolved in dependency order (topological sort) over the **post-template-expansion** node tree. If `primary-faded` references `primary`, then `primary` is resolved first. Circular references are a parse error. Template expansion may introduce new style references not present in the raw input — the topological sort accounts for these.

## Templates

### Definition

A template is a node tree with `$` placeholders. Substitution is **value replacement**, not string interpolation — `$fill` is replaced with the prop's value directly (object, number, string, etc.).

```js
templates: {
  "card": {
    children: [
      { id: "$.bg", rect: { w: "$w", h: "$h:120", radius: 8 }, fill: "$fill" },
      { id: "$.title", text: { content: "$title", size: 16 }, transform: { x: 10, y: 10 } }
    ]
  }
}
```

- `$.` in IDs → replaced with the instance's ID (e.g., `$.bg` → `mycard.bg`)
- `$propName` → replaced with value from `props` (any type — scalar, object, array)
- `$propName:default` → default value if prop not provided (default is a JSON literal)
- Template props cannot reference other template props (no `$w:$h`)

### Usage

```js
{ template: "card", id: "mycard", props: { w: 200, h: 100, title: "Hello", fill: { h: 210, s: 70, l: 45 } } }
```

### Built-in Templates

Replace current shape types:

- `box` → rect + text + fill + stroke
- `circle` → ellipse + text + fill + stroke
- `label` → text + fill
- `table` → rect grid + text cells + header styling
- `line` → path + arrowheads + label + dash
- `textblock` → multiple text child nodes (each line is a child `text` node, animatable via `id.line0.fill.h` etc.)
- `codeblock` → textblock + syntax highlighting

The `box` template includes a `colour` convenience prop that derives matched fill/stroke HSL values (low-saturation/low-lightness fill, full-color stroke), preserving the current `colour` shorthand behavior.

### Complex Templates (Future)

Pre-built compositions for Mermaid-style structures: flowchart nodes, sequence diagram participants, state machines, etc.

## Renderer

### Single Recursive Walk

One universal render function replaces all per-type renderers. At each node:

1. If `visible` is false, skip rendering this node and its children (but tracks for invisible nodes and their children are still evaluated every frame — visibility is a render-time gate only, so animations continue and pathFollow references remain valid)
2. Apply `transform` — emit SVG `<g>` with translate/rotate/scale
3. Resolve inherited visual properties from parent chain
4. If node has a geometry field, render the corresponding SVG element
5. Apply `fill`, `stroke`, `opacity` as SVG attributes (HSL → CSS `hsl()` at render time)
6. Recurse into `children`

### Render Order

`depth` is **sibling-scoped**: it controls ordering among children of the same parent. The renderer sorts siblings by `depth` before recursing. This matches SVG's natural `<g>` stacking model.

For cases where a child node needs to appear above an unrelated ancestor's sibling (e.g., a tooltip), the solution is to place the tooltip at the appropriate level in the tree (as a sibling of the nodes it needs to overlap), not nested inside the triggering node. Templates can emit nodes at multiple tree levels to support this.

### Layout Pass

Runs before rendering. Walks the tree, finds nodes with `layout` declarations, invokes the registered strategy, applies computed positions to children's transforms.

## Parser

1. Parse JSON5
2. Resolve color strings → HSL objects
3. Expand templates (`$` value substitution)
4. Merge styles (style properties as defaults, topological resolution order)
5. Build node tree (parent-child from `children` arrays)
6. Validate (at most one geometry field per node, no circular style refs, no duplicate IDs, no style/node ID collisions, no circular children)
7. Generate track targets (walk tree, register every leaf path)

Shape-specific shorthand knowledge moves into template definitions. The parser becomes simpler — tree construction, template expansion, style merging.

Validation via Zod schemas at the node level — one base schema for all nodes (id, transform, opacity, children, style, layout, layoutHint, visible) plus optional geometry fields and property sub-objects.

## Implementation Phases

### Phase 1 — Core Model & Tree Walker
Node type definitions, property sub-objects, HSL color representation with parsing from all input formats (hex, named, RGB object, HSL object). Color normalization and shortest-arc hue logic. Tree walker that generates track paths. Types and tests only.

### Phase 2 — Animation Engine
Track generation from node tree, keyframe evaluation with dot-notation targeting, shorthand expansion, interpolation (numeric lerp, HSL with shortest-arc hue, string step). Effects as ephemeral track entries. AutoKey behavior preserved.

### Phase 3 — Layout System
Pluggable strategy registry, port current flex implementation as first strategy, layout hints, animatable layout params, text sizing constraints.

### Phase 4 — Renderer
Single recursive renderer, HSL → CSS conversion, transform composition down tree, sibling-scoped depth ordering, visibility gating. Replaces all per-type renderers.

### Phase 5 — Templates
Template registry, `$` value substitution with defaults, built-in templates replicating current shape types (box, circle, label, table, line, textblock, codeblock). Existing diagrams reproducible in new system. `colour` convenience prop in box/circle templates.

### Phase 6 — Parser & Migration
New parser for compositional DSL. Compatibility layer translating old-format DSL into node trees. Camera support.

### Phase 7 — Samples Overhaul
Rewrite all samples in new DSL. Comprehensive coverage of every feature: color formats (HSL, RGB, hex, named), layout strategies, template customization, fine-grained track targeting, connection features (anchors, bend, progress, routing), camera, effects.

### Phase 8 — Complex Templates
Pre-built Mermaid-style compositions: flowchart nodes, sequence diagram participants, state machines, etc.
