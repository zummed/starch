# Starch DSL Design

A compact, human-readable syntax for authoring Starch diagrams. JSON5 remains the canonical storage format; the DSL is a presentation layer that can be used as an alternative editor view and as an input format.

## Goals

- **Approachable**: non-technical users can read and write diagrams without knowing JSON
- **Complete**: every JSON5 feature is expressible in the DSL (with inline `{...}` JSON as a fallback for edge cases)
- **Bidirectional**: mechanical, lossless conversion between DSL and JSON5
- **Same editor intelligence**: autocomplete, property popups, hover descriptions, and linting work identically in both views
- **Embeddable**: the DSL makes inline editing viable in contexts where raw JSON would be intimidating (docs, blogs, presentations)

## Design Decisions

- **JSON5 is canonical storage**. The DSL is a generated view. Edits in the DSL view produce JSON patches against the underlying JSON5 source.
- **No formatting preservation problem**. Since JSON is always the source, the DSL view is regenerated fresh on every change. JSON formatting is preserved through surgical text edits.
- **Option C (layered)**. The DSL covers all features with dedicated syntax. Inline `{...}` JSON literals are accepted anywhere a property value is expected, as a fallback for exotic or future features.
- **Indentation + flat references coexist**. Children are expressed via indentation, but D2-style dot-path references can be used from anywhere in the file.
- **Mixed property style**. Common properties (geometry, color, position) get positional shorthands. Uncommon properties use `key=value`. Booleans are bare keywords.

---

## Section 1: Core Node Syntax

Every node follows the pattern:

```
id: geometry [inline-props...] [at position]
```

### Geometry Shorthands

| DSL | JSON5 |
|-----|-------|
| `rect 160x100` | `rect: { w: 160, h: 100 }` |
| `ellipse 8x8` | `ellipse: { rx: 8, ry: 8 }` |
| `text "Hello"` | `text: { content: "Hello" }` |
| `image "photo.png"` | `image: { src: "photo.png" }` |
| `camera` | `camera: {}` |
| *(no geometry)* | *(group/container node)* |

A node with no geometry keyword is a container (ID with properties and/or children).

### Inline Properties

Properties follow the geometry on the same line, parsed left to right:

```
box: rect 160x100 radius=8 @primary fill 210 70 45 opacity=0.8 bold at 200,150
```

Rules:

- **Geometry** is always first after the `:`
- **`@name`** — style reference (maps to `style: "name"`)
- **`fill H S L`** — three bare numbers after `fill` are HSL. Also accepts named colors (`fill white`), hex (`fill #3B82F6`), and alpha (`fill 210 70 45 a=0.5`)
- **`stroke H S L`** — same as fill, with optional `width=N`
- **`at x,y`** — position (maps to `transform: { x, y }`). Partial form: `at y=-20`
- **`key=value`** — any named property: `radius=8`, `opacity=0.8`, `scale=2`, `rotation=45`, `depth=3`, `slot=container`, `size=14`, `align=middle`
- **Bare keywords** — booleans: `bold`, `mono`, `closed`, `smooth`, `loop`, `active`, `visible=false`

### Block Properties

Any property can go on its own indented line instead of inline:

```
card: rect 160x100 at 200,150
  radius=8
  fill 210 70 45
  stroke 210 80 30 width=2
  @primary
```

This is equivalent to the inline form. The choice is the author's formatting preference.

### Children

Indented under the parent:

```
card: rect 160x100 at 200,150
  title: text "Hello" size=14 bold fill white at y=-20
  badge: ellipse 8x8 fill 120 70 45 at 55,-30
```

### Flat References

Dot-path references work from anywhere in the file:

```
card: rect 160x100 at 200,150
  title: text "Hello" size=14
  badge: ellipse 8x8

// override from outside the block
card.badge.fill: 120 70 45
card.title.fill: white
```

### Connections (Arrow Syntax)

Connections use `->` between PointRefs. The unified `route` model replaces the old `from`/`to`/`route` separation:

```
link: a -> b stroke 0 0 60 width=2
link: a -> b bend=1.5 gap=4
link: a -> (250,100) -> (250,200) -> b smooth radius=15
```

Each entry in the route is a PointRef:
- Node ID: `a`, `b`
- Coordinates: `(250,100)`
- Node + offset: `("b", 0, -30)`

| DSL | JSON5 |
|-----|-------|
| `a -> b` | `path: { route: ["a", "b"] }` |
| `a -> (250,100) -> b` | `path: { route: ["a", [250,100], "b"] }` |
| `a -> ("b", 0, -30)` | `path: { route: ["a", ["b", 0, -30]] }` |

Path modifiers (`bend`, `smooth`, `radius`, `gap`, `fromGap`, `toGap`, `drawProgress`, `fromAnchor`, `toAnchor`, `closed`) remain as separate named properties.

### Explicit Point Paths

```
triangle: path (0,-40) (40,30) (-40,30) closed fill 280 60 45
zigzag: path (0,0) (30,-30) (60,0) (90,-30) stroke 40 90 50 width=2
```

### Camera

```
cam: camera look=all zoom=1.5
cam: camera look="nodeId" zoom=2 ratio=1.78
cam: camera look=(300,200) zoom=1.5
cam: camera look=("b", 0, -100)
```

### Comments

```
// line comment
```

### JSON Escape Hatch

Any property value can be an inline JSON literal:

```
card: rect 160x100 layout={ type: "flex", direction: "row", gap: 10 }
```

---

## Section 2: Styles, Document-Level, and Templates

### Document Metadata

Top of file, bare keywords:

```
name "My Diagram"
description "Demonstrates flex layout"
background "#1a1a2e"
viewport 600x400
```

### Images

```
images
  photo: "https://example.com/photo.png"
  logo: "data:image/png;base64,..."
```

### Styles

Named blocks referenced with `@`:

```
style primary
  fill 210 70 45
  stroke 210 80 30 width=2

style danger
  fill 0 80 45
  stroke 0 90 30 width=2

box: rect 100x60 @primary at 100,150
alert: rect 100x60 @danger at 250,150

// override one property from the style
custom: rect 100x60 @primary fill 120 70 45 at 400,150
```

Styles hold visual properties: `fill`, `stroke`, `opacity`, `dash`. Animatable via track paths: `primary.fill.h`.

### Layout

```
// inline with JSON escape hatch
row: rect 400x80 layout={ type: "flex", direction: "row", gap: 10 } at 200,150

// DSL form
row: rect 400x80 at 200,150
  layout flex row gap=10 padding=8 justify=center align=stretch
```

The `layout` keyword takes: `flex|absolute|grid|circular`, then optional `row|column`, then named params.

### Slots

Items reference their container:

```
left: at 120,150
  layout flex column gap=8 padding=10

right: at 350,150
  layout flex column gap=8 padding=10

itemA: rect 120x30 fill 210 60 45 slot=left
itemB: rect 120x30 fill 120 60 45 slot=right
```

### Templates

```
template Card(title, color=210)
  bg: rect 160x100 radius=8 fill $color 50 20
  label: text $title size=14 fill white

// instantiate
myCard: Card("Hello", color=0) at 200,150
otherCard: Card("World") at 400,150
```

`$param` references template parameters. Defaults are supported. Maps to existing `template`/`props` JSON fields.

---

## Section 3: Animation Syntax

Three forms that all merge into a single timeline.

### Form 1: Flat Timeline

No scoping, full or shortcut paths:

```
animate 3s loop easing=easeInOut
  0.0  card.badge.fill.h: 120
  1.5  card.badge.fill.h: 0 easing=bounce
  3.0  card.badge.fill.h: 120
```

### Form 2: Scoped Blocks

Group by target, shorter paths:

```
animate 3s loop easing=easeInOut
  card.badge:
    0.0  fill.h: 120
    1.5  fill.h: 0 easing=bounce
    3.0  fill.h: 120
  other:
    0.0  opacity: 0
    1.5  opacity: 1
```

Forms 1 and 2 are the same grammar; Form 1 is Form 2 without a scope prefix.

### Form 3: Inline on Node

Animation lives inside the target:

```
card: rect 160x100 at 200,150
  badge: ellipse 8x8 fill 120 70 45 at 55,-30
    animate
      0.0  fill.h: 120
      1.5  fill.h: 0 easing=bounce
      3.0  fill.h: 120
```

Inline `animate` blocks inherit global `duration`, `loop`, `easing` from the top-level `animate` declaration. Without a top-level `animate`, at least `duration` must be specified on the inline block.

### The `..` Shortcut

Double-dot skips intermediate path segments, resolving to the unique match:

```
animate 6s
  0.0  cam..zoom: 1         // resolves to cam.camera.zoom
  0.0  card..size: 14       // resolves to card.title.text.size (if unambiguous)
  1.5  badge..h: 0          // resolves to card.badge.fill.h (if badge is unique)
```

If ambiguous, the parser emits an error: `"badge..h" is ambiguous: matches card.badge.fill.h, card.badge.stroke.h`. The editor autocomplete offers the resolved options.

### Keyframe Timing

```
animate 6s
  0.0   box..x: 100                   // absolute time
  +2.0  box..x: 400                   // relative: 2s after previous (= 2.0)
  +1.0  box..x: 400 easing=easeOut    // = 3.0
```

`+` prefix maps to the existing `plus` field.

### Multi-Line Keyframes

A single timestamp can span multiple lines. Continuation lines without a timestamp belong to the previous time:

```
animate 6s loop
  0.0  cam..look: (300,200)
       cam..zoom: 1
       cam..rotation: 0
       cam..ratio: 1.78
  1.5  cam..look: "e"
       cam..zoom: 5
       cam..rotation: 25
```

Alternatively, repeating the timestamp is equivalent (the parser merges identical consecutive times):

```
animate 6s loop
  0.0  cam..look: (300,200)
  0.0  cam..zoom: 1
  0.0  cam..rotation: 0
  1.5  cam..look: "e"
  1.5  cam..zoom: 5
```

### Chapters

```
animate 6s
  chapter "Introduction" at 0
  chapter "Build Phase" at 2
  chapter "Result" at 4.5

  0.0  box..x: 100
  2.0  box..x: 400
```

### Effects

Fire-and-forget visual modifiers. Bare ID + effect name, no colon:

```
animate 6s
  1.5  card pulse
  2.0  badge flash
  3.0  box shake
  4.0  title glow
```

---

## Section 4: Bidirectional Mapping Engine

### Canonical Format: JSON5

JSON5 is always the source of truth. The DSL is a presentation layer generated from the JSON AST and parsed back to JSON on input.

### JSON -> DSL (Rendering)

The generator walks the parsed node tree and emits DSL text:

| JSON5 | DSL |
|-------|-----|
| `rect: { w: 160, h: 100 }` | `rect 160x100` |
| `ellipse: { rx: 8, ry: 8 }` | `ellipse 8x8` |
| `text: { content: "Hello", size: 14, bold: true }` | `text "Hello" size=14 bold` |
| `fill: { h: 210, s: 70, l: 45 }` | `fill 210 70 45` (or named color if match) |
| `fill: { h: 0, s: 0, l: 100 }` | `fill white` |
| `stroke: { h: 210, s: 80, l: 30, width: 2 }` | `stroke 210 80 30 width=2` |
| `transform: { x: 200, y: 150 }` | `at 200,150` |
| `transform: { y: -20 }` | `at y=-20` |
| `style: "primary"` | `@primary` |
| `path: { route: ["a", "b"] }` | `a -> b` |
| `path: { route: ["a", [250,100], "b"] }` | `a -> (250,100) -> b` |
| `layout: { type: "flex", direction: "row", gap: 10 }` | `layout flex row gap=10` |

Rendering heuristics:

- **Inline vs block**: nodes with 4 or fewer properties render inline; more complex nodes use block form with properties on separate lines. Per-node overrides stored in tab metadata.
- **Colors**: check named color table first (`white`, `black`, `red`...), then emit `H S L`.
- **Animation paths**: emit full paths by default. Authors can manually shorten to `..` form.
- **Children**: indented under parent.

### DSL -> JSON (Parsing)

Two scenarios:

1. **Loading/pasting DSL**: full parse to JSON5, which becomes the stored source.
2. **Editing in DSL view**: DSL text is re-parsed to a JSON AST, diffed against the current JSON source, and surgical JSON text patches are applied.

Each DSL construct deterministically produces one JSON shape (same mapping table, reversed). The `..` shortcut resolves to full paths during parsing. Ambiguity is a parse error.

### Format Detection

Heuristic on load/paste: content starting with `{` is JSON5, otherwise DSL.

---

## Section 5: Editor Integration

### Architecture

```
+---------------------------------------+
|          JSON5 Source                  |
|     (stored, edited, shared)          |
+----------+-----------------+----------+
           |                 |
     +-----v-----+    +-----v------+
     | JSON View  |    | DSL View   |
     | (direct)   |    | (generated)|
     +-----+------+    +-----+-----+
           |                  |
           v                  v
   +----------------------------------+
   |    Schema Registry (shared)      |
   | Autocomplete, Popups, Linting,   |
   | Hover Descriptions               |
   +----------------------------------+
```

Both views are backed by the same JSON source and the same schema infrastructure.

### Format Toggle Button

A toolbar button showing the current view:

```
[JSON5] <-> [DSL]
```

- Switches the editor between views
- No warning needed since JSON is always the source
- View preference stored per-tab

### How DSL Edits Work

When the user edits in the DSL view:

1. User types/modifies text in DSL view.
2. DSL parser re-parses the full DSL text, producing a new JSON AST.
3. New AST is diffed against the current JSON source.
4. Surgical JSON text patches applied to JSON5 source (preserving JSON formatting).
5. DSL view re-renders from updated JSON.

For popup edits (ColorPicker, NumberSlider, etc.):

1. Cursor position in DSL view resolves to a JSON path (e.g., `objects[2].fill.h`).
2. Popup edits the JSON source directly via existing `textReplace.ts`.
3. DSL view re-renders.

All popup logic is identical in both views. The only new code is the DSL cursor-to-JSON-path resolver.

### Autocomplete in DSL Mode

Same schema-driven completions as JSON, adapted to DSL grammar:

- After `id:` — suggest geometry types (`rect`, `ellipse`, `text`, `path`, `camera`, `image`)
- After geometry — suggest property keywords (`fill`, `stroke`, `at`, `@`, `opacity=`, `radius=`, etc.)
- After `fill` — suggest named colors, accept HSL or hex
- After `@` — suggest defined style names
- After `->` — suggest node IDs
- In `animate` blocks — suggest track paths with `..` shortcut options
- After `easing=` — suggest easing names

Completions are driven by the same schema registry. The difference is only in what text gets inserted (DSL tokens vs JSON keys/values).

### Hover Descriptions

On hover over any DSL token, show a tooltip:

- Full JSON path (e.g., `card.rect.radius`)
- Description from Zod schema (requires adding `.describe()` to all schema fields)
- Type and constraints (e.g., `number, 0-50`)
- Current value

Works identically in both views since both resolve to the same schema paths.

### Inline/Expand Toggle

A subtle gutter icon per node. Click to toggle between collapsed (inline) and expanded (block) form. Since the DSL view is always generated, this is a rendering preference stored per-node in tab metadata.

### Linting in DSL Mode

DSL-specific lint errors show inline:

- Syntax errors (bad indentation, unknown keywords)
- Ambiguous `..` paths
- Unknown node IDs in connections/animations
- Schema validation (out of range, wrong type)

JSON linting continues unchanged in JSON view.

### DSL as Input Format

When loading or pasting DSL from outside:

1. Detect format (starts with `{` = JSON5, otherwise = DSL).
2. If DSL: parse to JSON, store JSON as source.
3. User sees it in whichever view they have active.

---

## Section 6: Embedded Editor (Player-as-Editor)

### Concept

Anywhere a Starch diagram is rendered (docs, blog, presentation, mkdocs), the viewer can access editing capabilities. This differentiates Starch from Mermaid/PlantUML where editing requires a separate tool.

### Interface

The player widget gets an optional edit affordance (pencil icon or "Edit" button). Activating it opens the DSL view inline or in a slide-up panel:

```
+------------------------------+
|                              |
|    [diagram rendering]       |
|                              |
+------------------------------+
| DSL View (editable)          |
|                              |
| box: rect 160x100 fill ...   |
|   title: text "Hello" ...    |
|                              |
| [JSON5] <-> [DSL]   [Reset] |
+------------------------------+
```

### Behaviors

- **Live preview**: edits update the diagram immediately.
- **Full editor intelligence**: autocomplete, popups, hover descriptions, linting.
- **DSL as default view**: embedded contexts default to DSL since it is more approachable.
- **Reset button**: restores the original diagram. Edits are ephemeral unless explicitly saved.
- **Shareable**: encode current state into a URL hash or copy DSL to clipboard.

### Scope Levels

Three tiers controlled via an embed attribute:

1. **View only** (`mode="view"`): just the diagram, no editing. Default for most embeds.
2. **Interactive** (`mode="interactive"`): click nodes to see properties, hover for descriptions, no code editing.
3. **Editable** (`mode="editable"`): full DSL/JSON editor panel with autocomplete, popups, the works.

Example: `<starch-diagram src="..." mode="editable">`

### Architectural Requirements

- Player, editor, and schema infrastructure bundled as a single embeddable widget (web component or standalone JS bundle).
- Editor intelligence (`src/editor/`) is already decoupled from the App shell.
- New work: packaging pipeline and embed shell UI.

### Relationship to the DSL

The DSL makes embedded editing viable. Raw JSON5 would be intimidating to a casual viewer on a docs page. The DSL view reads almost like pseudocode, making "edit this diagram" approachable in any context.

---

## Path Model Change: Unified Route

As part of this work, the path model is simplified. The separate `from`, `to`, and `route` attributes are unified into a single `route` array of PointRefs.

### Before (v2 current)

```json5
{ path: { from: "a", to: "b", route: [[250, 100], [250, 200]] } }
```

### After

```json5
{ path: { route: ["a", [250, 100], [250, 200], "b"] } }
```

Each entry is a PointRef:
- String: node ID (`"a"`)
- Tuple `[x, y]`: coordinates (`[250, 100]`)
- Tuple `[id, dx, dy]`: node + offset (`["b", 0, -30]`)

First and last entries are endpoints; everything in between is waypoints. All existing path modifiers (`bend`, `smooth`, `radius`, `gap`, `fromGap`, `toGap`, `drawProgress`, `fromAnchor`, `toAnchor`, `closed`) remain as separate properties.

The parser can accept the old `from`/`to` form and normalize during a transition period.

---

## Complete Example

### DSL

```
name "Architecture Overview"
background "#1a1a2e"
viewport 600x400

style service
  fill 210 50 20
  stroke 210 70 50 width=2

style database
  fill 150 50 20
  stroke 150 70 45 width=2

api: rect 140x70 radius=8 @service at 150,120
  label: text "API Server" size=12 bold fill white

db: rect 140x70 radius=8 @database at 420,120
  label: text "PostgreSQL" size=12 bold fill white

cache: rect 100x50 radius=6 @service at 280,250
  label: text "Redis" size=11 fill white

conn1: api -> db stroke 0 0 60 width=2
conn2: api -> cache stroke 0 0 60 width=2
conn3: cache -> db stroke 0 0 40 width=1 dash=dashed

cam: camera look=all zoom=1

animate 8s loop easing=easeInOutCubic
  chapter "Overview" at 0
  chapter "API Detail" at 2
  chapter "Data Flow" at 5

  cam:
    0.0  camera.look: all
         camera.zoom: 1
    2.0  camera.look: "api"
         camera.zoom: 2.5
    5.0  camera.look: ("db", -60, 0)
         camera.zoom: 2
    8.0  camera.look: all
         camera.zoom: 1

  conn1:
    2.0  path.drawProgress: 0
    3.5  path.drawProgress: 1 easing=easeOut

  5.0  cache pulse
```

### Equivalent JSON5

```json5
{
  name: "Architecture Overview",
  background: "#1a1a2e",
  viewport: { width: 600, height: 400 },
  styles: {
    service: { fill: { h: 210, s: 50, l: 20 }, stroke: { h: 210, s: 70, l: 50, width: 2 } },
    database: { fill: { h: 150, s: 50, l: 20 }, stroke: { h: 150, s: 70, l: 45, width: 2 } }
  },
  objects: [
    {
      id: "api", rect: { w: 140, h: 70, radius: 8 }, style: "service",
      transform: { x: 150, y: 120 },
      children: [
        { id: "label", text: { content: "API Server", size: 12, bold: true }, fill: { h: 0, s: 0, l: 100 } }
      ]
    },
    {
      id: "db", rect: { w: 140, h: 70, radius: 8 }, style: "database",
      transform: { x: 420, y: 120 },
      children: [
        { id: "label", text: { content: "PostgreSQL", size: 12, bold: true }, fill: { h: 0, s: 0, l: 100 } }
      ]
    },
    {
      id: "cache", rect: { w: 100, h: 50, radius: 6 }, style: "service",
      transform: { x: 280, y: 250 },
      children: [
        { id: "label", text: { content: "Redis", size: 11 }, fill: { h: 0, s: 0, l: 100 } }
      ]
    },
    { id: "conn1", path: { route: ["api", "db"] }, stroke: { h: 0, s: 0, l: 60, width: 2 } },
    { id: "conn2", path: { route: ["api", "cache"] }, stroke: { h: 0, s: 0, l: 60, width: 2 } },
    { id: "conn3", path: { route: ["cache", "db"] }, stroke: { h: 0, s: 0, l: 40, width: 1 }, dash: { pattern: "dashed" } },
    { id: "cam", camera: { look: "all", zoom: 1 } }
  ],
  animate: {
    duration: 8,
    loop: true,
    easing: "easeInOutCubic",
    chapters: [
      { name: "Overview", time: 0 },
      { name: "API Detail", time: 2 },
      { name: "Data Flow", time: 5 }
    ],
    keyframes: [
      { time: 0, changes: { "cam.camera.look": "all", "cam.camera.zoom": 1 } },
      { time: 2, changes: { "cam.camera.look": "api", "cam.camera.zoom": 2.5 } },
      { time: 2, changes: { "conn1.path.drawProgress": 0 } },
      { time: 3.5, changes: { "conn1.path.drawProgress": { value: 1, easing: "easeOut" } } },
      { time: 5, changes: { "cam.camera.look": ["db", -60, 0], "cam.camera.zoom": 2 } },
      { time: 5, changes: { "cache": "pulse" } },
      { time: 8, changes: { "cam.camera.look": "all", "cam.camera.zoom": 1 } }
    ]
  }
}
```
