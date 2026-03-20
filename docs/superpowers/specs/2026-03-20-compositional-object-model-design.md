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

### Rendering Primitives

Five geometry types. A node with one of these fields is a leaf-level renderable:

| Primitive  | Fields                              | SVG output   |
|------------|-------------------------------------|--------------|
| `rect`     | `w`, `h`, `radius`                  | `<rect>`     |
| `ellipse`  | `rx`, `ry`                          | `<ellipse>`  |
| `text`     | `content`, `size`, `lineHeight`, `align`, `bold`, `mono` | `<text>` |
| `path`     | `points`, `closed`, `smooth`        | `<path>`     |
| `image`    | `src`, `fit`, `padding`, `w`, `h`   | `<image>`    |

### Property Sub-Objects

Attached to any node:

- **fill**: `{ h, s, l }` — HSL color
- **stroke**: `{ h, s, l, width, dash }` — HSL color + line style
- **transform**: `{ x, y, rotation, scale, anchor }` — position & orientation relative to parent
- **opacity**: plain number (0-1)
- **depth**: plain number for z-ordering

### Color Representation

Colors are stored internally as HSL. Multiple input formats are accepted and normalized at parse time:

```js
fill: { h: 210, s: 80, l: 50 }        // HSL object (canonical)
fill: { r: 100, g: 150, b: 255 }       // RGB object → converted to HSL
fill: "dodgerblue"                      // named → resolved to HSL
fill: "#3399ff"                         // hex → resolved to HSL
```

Animation interpolation happens in HSL space, enabling smooth hue rotation and perceptually uniform transitions.

### Inheritance

**All properties inherit from parent to child.** Unset properties on a child resolve to the parent's value. Explicitly set properties override.

No categories of "inheritable" vs "non-inheritable" — one uniform rule. Well-designed compositions (templates) set properties explicitly on each child, so inheritance only affects properties intentionally left unset.

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
    { id: "conn1.path", path: { from: "a", to: "b", smooth: true }, stroke: { h: 0, s: 0, l: 60, width: 2 } },
    { id: "conn1.arrowEnd", path: { points: [...] }, fill: { h: 0, s: 0, l: 60 } },
    { id: "conn1.label", text: { content: "calls", size: 11 }, transform: { pathFollow: "conn1.path", progress: 0.5 } }
  ]
}
```

Sub-elements like arrowheads and line patterns are independently animatable:

- `conn1.arrowEnd.fill.h`
- `conn1.path.stroke.width`
- `conn1.label.transform.progress`

Line pattern properties live on the path node:

```js
{ id: "conn1.path", path: {...}, stroke: {...}, pattern: { type: "dashed", length: 8, gap: 4 } }
```

## Animation System

### Track Generation

At scene init, the node tree is walked depth-first. Every leaf value becomes a track target using dot-notation:

- `mybox.transform.x`
- `mybox.bg.fill.h`
- `mybox.bg.rect.radius`
- `mybox.label.text.content` (string — step-interpolated)

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

### Easing

Per-track or per-keyframe. Each leaf track interpolates independently — hue can ease linearly while lightness bounces.

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

## Layout System

### Pluggable Strategies

Layout is a separate pass with a registry of strategies:

```ts
type LayoutStrategy = (node: Node, children: Node[]) => ChildPlacement[]
```

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

Layout hints are animatable: `item.layoutHint.grow` is a valid track target.

### Layout Parameters Are Animatable

`container.layout.gap`, `container.layout.direction` — all valid track targets. Animating a flex container's gap smoothly repositions children.

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

## Templates

### Definition

A template is a node tree with `$` placeholders:

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
- `$propName` → replaced with value from `props`
- `$propName:default` → default value if prop not provided

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
- `line` → path + arrowheads + label + pattern
- `textblock` → multiple text nodes with layout
- `codeblock` → textblock + syntax highlighting

### Complex Templates (Future)

Pre-built compositions for Mermaid-style structures: flowchart nodes, sequence diagram participants, etc.

## Renderer

### Single Recursive Walk

One universal render function replaces all per-type renderers. At each node:

1. Apply `transform` — emit SVG `<g>` with translate/rotate/scale
2. Resolve inherited properties from parent chain
3. If node has a geometry field, render the corresponding SVG element
4. Apply `fill`, `stroke`, `opacity` as SVG attributes (HSL → CSS `hsl()` at render time)
5. Recurse into `children`

### Render Order

Depth-first by default, overridable via `depth` property.

### Layout Pass

Runs before rendering. Walks the tree, finds nodes with `layout` declarations, invokes the registered strategy, applies computed positions to children.

## Parser

1. Parse JSON5
2. Resolve color strings → HSL objects
3. Expand templates (`$` substitution)
4. Merge styles (style properties as defaults)
5. Build node tree (parent-child from `children` arrays)
6. Generate track targets (walk tree, register every leaf path)

Shape-specific shorthand knowledge moves into template definitions. The parser becomes simpler — tree construction, template expansion, style merging.

Validation via Zod schemas at the node level — one base schema for all nodes (id, transform, opacity, children, style, layout, layoutHint) plus optional geometry fields.

## Implementation Phases

### Phase 1 — Core Model & Tree Walker
Node type definitions, property sub-objects, HSL color representation with parsing from all input formats. Tree walker that generates track paths. Types and tests only.

### Phase 2 — Animation Engine
Track generation from node tree, keyframe evaluation with dot-notation targeting, interpolation (numeric lerp, HSL, string step). Effects as ephemeral track entries.

### Phase 3 — Layout System
Pluggable strategy registry, port current flex implementation as first strategy, layout hints, animatable layout params.

### Phase 4 — Renderer
Single recursive renderer, HSL → CSS conversion, transform composition down tree. Replaces all per-type renderers.

### Phase 5 — Templates
Template registry, `$` substitution with defaults, built-in templates replicating current shape types. Existing diagrams reproducible in new system.

### Phase 6 — Parser & Migration
New parser for compositional DSL. Compatibility layer translating old-format DSL into node trees.

### Phase 7 — Samples Overhaul
Rewrite all samples in new DSL. Comprehensive coverage of every feature: color formats, layout strategies, template customization, fine-grained track targeting.

### Phase 8 — Complex Templates
Pre-built Mermaid-style compositions: flowchart nodes, sequence diagram participants, state machines, etc.
