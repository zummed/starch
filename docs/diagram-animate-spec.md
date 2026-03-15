# diagram-animate: Animated Diagram Library

## Project Specification & Build Guide

---

## 1. Overview

Build a TypeScript library for defining, rendering, and animating SVG diagrams. The library has two interfaces: a programmatic API (primary) for constructing scenes in code, and a text-based DSL (secondary) that parses into the same API. Rendering is SVG-based via React components. Animation is keyframe-driven with per-segment easing and anchor-aware scaling.

The target use case is documenting application internals — state machines, data flow, pipelines, architecture diagrams — with animated transitions that show how data moves and state changes over time.

### Stack

- Vite + React + TypeScript
- Zero runtime dependencies beyond React
- SVG rendering (no Canvas, no WebGL)
- Publishable as an npm library with a `<Diagram />` component and a programmatic scene API

---

## 2. Architecture

```
src/
  core/
    types.ts              # All type definitions (objects, props, keyframes, tracks)
    Scene.ts              # Programmatic scene builder API
  parser/
    tokenizer.ts          # DSL text → token stream
    parser.ts             # Token stream → Scene (object defs + animation config)
  engine/
    timeline.ts           # Build animation tracks from keyframes, sorted by time
    interpolate.ts        # Value interpolation (numeric lerp, colour lerp, discrete)
    easing.ts             # Easing function registry (named functions + custom cubic-bezier)
    anchor.ts             # Scale-around-anchor transform maths
    evaluator.ts          # Per-frame: walk all tracks, produce animated prop snapshots
  renderer/
    svg/
      SvgCanvas.tsx       # Root SVG element, grid background, defs
      BoxRenderer.tsx     # Rounded rect with text
      CircleRenderer.tsx  # Circle with text
      TextRenderer.tsx    # Standalone text label
      TableRenderer.tsx   # Column headers + data rows
      LineRenderer.tsx    # Connecting line with arrowhead and label
    EdgeGeometry.ts       # Ray-vs-rect and ray-vs-circle intersection for line endpoints
  components/
    Diagram.tsx           # Public component: takes DSL string or Scene, renders + animates
    Timeline.tsx          # Playback controls (play/pause, scrub, speed)
    Editor.tsx            # DSL text editor panel (optional, for dev/playground)
  index.ts                # Public exports
```

### Data Flow

```
DSL string                     Programmatic API
    │                                │
    ▼                                ▼
  Parser ──────────────────► Scene (objects + animConfig)
                                     │
                                     ▼
                              Timeline Builder
                              (group keyframes into tracks,
                               sorted by time, with easing)
                                     │
                                     ▼
                              Evaluator (per frame)
                              walks tracks at current time,
                              interpolates with easing,
                              produces animated props snapshot
                                     │
                                     ▼
                              Renderer
                              maps each object type to SVG component
                              using animated props
```

---

## 3. Type System

These are the core types the entire system is built on. Getting these right is critical — they define the contract between parser, engine, and renderer.

### 3.1 Object Types

```typescript
type ObjectType = 'box' | 'circle' | 'text' | 'table' | 'line';

// Base properties shared by all objects
interface BaseProps {
  x: number;
  y: number;
  opacity?: number;          // 0-1, default 1
  scale?: number;            // default 1
  anchor?: AnchorPoint;      // default 'center'
}

type AnchorPoint =
  | 'center' | 'top' | 'bottom' | 'left' | 'right'
  | 'topleft' | 'topright' | 'bottomleft' | 'bottomright';

interface BoxProps extends BaseProps {
  w: number;                 // width
  h: number;                 // height
  fill?: string;             // hex colour, default '#1a1d24'
  stroke?: string;           // hex colour, default '#22d3ee'
  strokeWidth?: number;      // default 1.5
  radius?: number;           // corner radius, default 8
  text?: string;             // centered label
  textColor?: string;        // default '#e2e5ea'
  textSize?: number;         // default 13
  bold?: boolean;
}

interface CircleProps extends BaseProps {
  r: number;                 // radius
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  text?: string;
  textColor?: string;
  textSize?: number;
}

interface TextProps extends BaseProps {
  text: string;
  color?: string;
  size?: number;
  bold?: boolean;
  align?: 'start' | 'middle' | 'end';  // SVG text-anchor
}

interface TableProps extends BaseProps {
  cols: string[];            // column headers
  rows: string[][];          // data rows
  colWidth?: number;         // per-column width in px, default 100
  rowHeight?: number;        // per-row height in px, default 30
  fill?: string;             // row background
  stroke?: string;           // grid line colour
  headerFill?: string;
  textColor?: string;
  headerColor?: string;
  textSize?: number;
  strokeWidth?: number;
}

interface LineProps {
  // Connection mode: reference two object IDs
  from?: string;
  to?: string;
  // Explicit coordinate mode (fallback if from/to not set)
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  // Appearance
  stroke?: string;
  strokeWidth?: number;
  dashed?: boolean;
  arrow?: boolean;           // default true
  // Label
  label?: string;
  labelColor?: string;
  labelSize?: number;
  // Animation
  opacity?: number;
  progress?: number;         // 0-1, draws partial line from start. default 1
}

// Discriminated union for all scene objects
interface SceneObject<T extends ObjectType = ObjectType> {
  type: T;
  id: string;
  props: T extends 'box' ? BoxProps
       : T extends 'circle' ? CircleProps
       : T extends 'text' ? TextProps
       : T extends 'table' ? TableProps
       : T extends 'line' ? LineProps
       : never;
}
```

### 3.2 Animation Types

```typescript
type EasingName =
  | 'linear'
  | 'easeIn' | 'easeOut' | 'easeInOut'
  | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic'
  | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart'
  | 'easeInBack' | 'easeOutBack'
  | 'bounce' | 'elastic' | 'spring'
  | 'snap' | 'step';

interface Keyframe {
  time: number;              // seconds
  target: string;            // object ID
  prop: string;              // property name
  value: number | string | boolean;
  easing: EasingName;        // applied to the segment ARRIVING at this keyframe
}

interface AnimConfig {
  duration: number;          // total duration in seconds
  loop: boolean;
  keyframes: Keyframe[];
}

// After building the timeline: keyframes grouped by target.prop, sorted by time
interface TrackKeyframe {
  time: number;
  value: number | string | boolean;
  easing: EasingName;
}

type Tracks = Record<string, TrackKeyframe[]>;  // key = "objectId.propName"
```

---

## 4. DSL Specification

The DSL is a plain-text format that parses into the type system above. It supports comments, multi-line and inline object definitions, and a keyframe animation block.

### 4.1 Comments and Whitespace

```
# This is a comment (line must start with #)
# Blank lines are ignored
```

### 4.2 Object Definitions

**Multi-line form:**

```
type id {
  prop: value
  prop: value
}
```

**Inline form (all properties on one line):**

```
type id { prop: value  prop: value  prop: value }
```

**Object types and their properties:**

```
box myBox {
  pos: 400 170          # shorthand: sets x and y
  size: 130 46          # shorthand: sets w and h
  x: 400                # explicit x (alternative to pos)
  y: 170                # explicit y
  w: 130                # explicit width
  h: 46                 # explicit height
  fill: #1a1d24
  stroke: #22d3ee
  strokeWidth: 1.5
  radius: 8
  text: "Idle"
  textColor: #e2e5ea
  textSize: 13
  bold: true
  opacity: 1
  scale: 1
  anchor: center        # center|top|bottom|left|right|topleft|topright|bottomleft|bottomright
}

circle myCircle {
  pos: 400 90
  r: 12
  fill: #22d3ee
  stroke: #22d3ee
  text: "S"
}

text myLabel {
  pos: 400 35
  text: "Title"
  size: 18
  color: #e2e5ea
  bold: true
  align: middle         # start|middle|end
}

table myTable {
  pos: 300 280
  cols: Field | Type | Nullable
  row: id | u64 | no
  row: name | String | yes
  colWidth: 100
  rowHeight: 30
  fill: #1a1d24
  stroke: #2a2d35
  headerFill: #14161c
  textColor: #c9cdd4
  headerColor: #e2e5ea
  textSize: 12
}

line myLine {
  from: myBox            # references object ID — auto-routes to edge
  to: myCircle
  stroke: #22d3ee
  strokeWidth: 1.5
  dashed: true
  arrow: true
  label: "connect()"
  labelColor: #8a8f98
  labelSize: 11
  progress: 1            # 0-1, for animating line drawing
}

# Lines can also use explicit coordinates instead of from/to:
line directLine {
  x1: 100
  y1: 100
  x2: 400
  y2: 300
  stroke: #f472b6
}
```

### 4.3 Value Types

The parser auto-detects types:

- **Numbers**: `42`, `3.14`, `-10` → parsed as float
- **Booleans**: `true`, `false`
- **Strings**: `"hello"` or `'hello'` (quotes stripped) or bare words like `#ff0000`, `center`
- **Pipe-separated lists**: `Field | Type | Nullable` (used by `cols` and `row`)
- **Space-separated pairs**: `400 170` (used by `pos` and `size`)

### 4.4 Animation Block

```
@animate duration:8s loop:true {
  # Basic keyframe: time: target.prop = value
  0.0s: myBox.scale = 1.12

  # With easing (applied to the interpolation ARRIVING at this keyframe):
  0.4s: myBox.scale = 1 ease:easeOutBack

  # Multiple assignments on one line (comma-separated):
  2.0s: myBox.scale = 1.12, myBox.fill = #2a2410

  # Each assignment can have its own easing:
  2.5s: myBox.scale = 1 ease:easeOutBack, myBox.fill = #191710 ease:easeOut

  # Animate line drawing with progress:
  0.5s: myLine.progress = 0
  1.5s: myLine.progress = 1 ease:easeInOut

  # Move objects:
  0.0s: myBox.x = 100
  2.0s: myBox.x = 500 ease:easeOutCubic

  # Animate colours (RGB lerp):
  0.0s: myBox.fill = #1a1d24
  1.0s: myBox.fill = #2a2410 ease:easeOut
}
```

**Easing semantics**: The easing function on a keyframe controls the curve of the interpolation segment from the PREVIOUS keyframe to THIS keyframe. If omitted, defaults to `linear`.

---

## 5. Programmatic API

The API-first approach. The DSL parser produces the same structures.

```typescript
const scene = new Scene();

// Add objects — returns a typed handle for animation references
const idle = scene.box('idle', {
  x: 400, y: 170, w: 130, h: 46,
  fill: '#0f1923', stroke: '#22d3ee',
  text: 'Idle', anchor: 'bottom',
});

const connecting = scene.box('connecting', {
  x: 180, y: 300, w: 150, h: 46,
  fill: '#191710', stroke: '#fbbf24',
  text: 'Connecting', anchor: 'top',
});

const s1 = scene.line('s1', {
  from: 'idle', to: 'connecting',
  stroke: '#fbbf24', label: 'connect()',
});

// Define animation
scene.animate({ duration: 8, loop: true })
  .at(0.8, 'idle', 'scale', 1.12)
  .at(1.2, 'idle', 'scale', 1, 'easeOutBack')
  .at(1.2, 's1', 'progress', 0)
  .at(2.0, 's1', 'progress', 1, 'easeInOut')
  .at(2.0, 'connecting', 'scale', 1.12)
  .at(2.0, 'connecting', 'fill', '#2a2410')
  .at(2.5, 'connecting', 'scale', 1, 'easeOutBack')
  .at(2.5, 'connecting', 'fill', '#191710', 'easeOut');

// Usage in React
<Diagram scene={scene} autoplay speed={1} />

// Or from DSL string
<Diagram dsl={dslString} autoplay />
```

---

## 6. Engine Implementation Details

### 6.1 Timeline Builder

Takes the flat keyframe array and groups into tracks:

```
Input:  [{ time: 0, target: 'box1', prop: 'x', value: 100, easing: 'linear' },
         { time: 2, target: 'box1', prop: 'x', value: 500, easing: 'easeOut' }]

Output: { 'box1.x': [{ time: 0, value: 100, easing: 'linear' },
                      { time: 2, value: 500, easing: 'easeOut' }] }
```

Each track is sorted by time. Multiple tracks per object are independent.

### 6.2 Interpolation

For each track at a given time `t`:

1. If `t <= firstKeyframe.time`, return `firstKeyframe.value`
2. If `t >= lastKeyframe.time`, return `lastKeyframe.value`
3. Find the segment where `keyframes[i].time <= t <= keyframes[i+1].time`
4. Compute raw progress: `rawT = (t - kf[i].time) / (kf[i+1].time - kf[i].time)`
5. Apply easing from the DESTINATION keyframe: `easedT = easing(rawT)`
6. Interpolate based on value type:
   - **Numbers**: `a + (b - a) * easedT`
   - **Hex colours**: Component-wise RGB lerp (parse `#rrggbb`, lerp each channel, reassemble)
   - **Strings/booleans**: Discrete switch at `easedT < 0.5 ? a : b`

### 6.3 Easing Functions

All easing functions map `t ∈ [0,1] → [0,1]` (though some overshoot like `easeOutBack` and `elastic`).

```typescript
const EASINGS: Record<EasingName, (t: number) => number> = {
  linear:        t => t,
  easeIn:        t => t * t,
  easeOut:       t => t * (2 - t),
  easeInOut:     t => t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t,
  easeInCubic:   t => t * t * t,
  easeOutCubic:  t => { const u = t-1; return u*u*u + 1; },
  easeInOutCubic:t => t < 0.5 ? 4*t*t*t : (t-1)*(2*t-2)*(2*t-2) + 1,
  easeInQuart:   t => t * t * t * t,
  easeOutQuart:  t => { const u = t-1; return 1 - u*u*u*u; },
  easeInOutQuart:t => { const u = t-1; return t < 0.5 ? 8*t*t*t*t : 1 - 8*u*u*u*u; },
  easeOutBack:   t => { const c = 1.70158; return 1 + (c+1)*Math.pow(t-1,3) + c*Math.pow(t-1,2); },
  easeInBack:    t => { const c = 1.70158; return (c+1)*t*t*t - c*t*t; },
  bounce:        t => {
    if (t < 1/2.75) return 7.5625*t*t;
    if (t < 2/2.75) { const u = t - 1.5/2.75; return 7.5625*u*u + 0.75; }
    if (t < 2.5/2.75) { const u = t - 2.25/2.75; return 7.5625*u*u + 0.9375; }
    const u = t - 2.625/2.75; return 7.5625*u*u + 0.984375;
  },
  elastic:       t => t === 0 || t === 1 ? t
                      : -Math.pow(2, 10*(t-1)) * Math.sin((t-1.1) * 5 * Math.PI),
  spring:        t => 1 - Math.cos(t * 4.5 * Math.PI) * Math.exp(-t * 6),
  snap:          t => { const s = t*t*(3-2*t); return s*s*(3-2*s); },  // double smoothstep
  step:          t => t < 1 ? 0 : 1,
};
```

### 6.4 Anchor System

The anchor determines which point stays fixed during scaling. Objects are drawn centered at local origin `(0,0)`. The anchor is a point on the object's bounding box.

**Key maths:**

```typescript
// Local-space anchor point relative to object center
function anchorLocal(anchor: AnchorPoint, hw: number, hh: number): { ax: number, ay: number } {
  let ax = 0, ay = 0;
  if (anchor.includes('top'))    ay = -hh;
  if (anchor.includes('bottom')) ay =  hh;
  if (anchor.includes('left'))   ax = -hw;
  if (anchor.includes('right'))  ax =  hw;
  return { ax, ay };
}
```

**Rendering uses two nested SVG `<g>` transforms** (this is critical — a single `translate+scale` group causes drift because SVG applies scale relative to the SVG root, not the group origin):

```xml
<!-- Outer: position object in world space -->
<g transform="translate(x, y)">
  <!-- Inner: scale around anchor point using translate-scale-translate-back -->
  <g transform="translate(ax*(1-s), ay*(1-s)) scale(s)">
    <!-- Object content drawn centered at (0, 0) -->
    <rect x="{-w/2}" y="{-h/2}" width="{w}" height="{h}" />
  </g>
</g>
```

Where `(ax, ay)` is the anchor point in local space (from `anchorLocal`), and `s` is the scale factor.

**For line endpoint calculations**, the visual center of a scaled+anchored object shifts. Compute where the center ends up:

```typescript
function scaledCenter(x, y, scale, anchor, hw, hh) {
  const { ax, ay } = anchorLocal(anchor, hw, hh);
  // Anchor stays fixed at world position (x + ax, y + ay).
  // Center (local 0,0) ends up at: x + ax*(1 - scale), y + ay*(1 - scale)
  return { cx: x + ax*(1-scale), cy: y + ay*(1-scale) };
}
```

### 6.5 Edge Geometry (Line Routing)

Lines that reference `from` and `to` object IDs auto-route their start and end points to the boundary of each object. The algorithm:

1. Look up the visual bounds of both objects (center position, half-width, half-height, shape type). Bounds account for current animated scale and anchor offset.
2. Compute the angle from source center to target center: `atan2(ty - sy, tx - sx)`.
3. For the **source**, cast a ray at that angle from its center and find where it exits the bounding shape.
4. For the **target**, cast a ray at the **reversed angle** (`angle + π`) and find where it exits — this gives the point on the near side of the target.

**Circle intersection**: Trivial — `center + direction * radius`.

**Rectangle intersection**: Test the ray against all four edges. For each edge, compute where the parametric ray `center + t * direction` intersects the edge line, check the intersection falls within the edge bounds, filter to intersections that point in the correct direction (dot product with ray direction > 0), and pick the closest.

```typescript
function edgePoint(bounds: ObjectBounds, angle: number): { x: number, y: number } {
  if (bounds.type === 'circle') {
    return {
      x: bounds.x + Math.cos(angle) * bounds.hw,
      y: bounds.y + Math.sin(angle) * bounds.hh,
    };
  }

  // Rectangle: test ray against all 4 edges
  const { hw, hh } = bounds;
  const tanA = Math.tan(angle);
  const candidates = [];

  // Right edge (x = +hw)
  let y = tanA * hw;
  if (Math.abs(y) <= hh) candidates.push({ x: bounds.x + hw, y: bounds.y + y });

  // Left edge (x = -hw)
  y = -tanA * hw;
  if (Math.abs(y) <= hh) candidates.push({ x: bounds.x - hw, y: bounds.y - y });

  // Bottom edge (y = +hh)
  let x = hh / (tanA || 0.001);
  if (Math.abs(x) <= hw) candidates.push({ x: bounds.x + x, y: bounds.y + hh });

  // Top edge (y = -hh)
  x = -hh / (tanA || 0.001);
  if (Math.abs(x) <= hw) candidates.push({ x: bounds.x + x, y: bounds.y - hh });

  // Filter to points in the correct direction, pick closest
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const valid = candidates.filter(c => {
    const dx = c.x - bounds.x, dy = c.y - bounds.y;
    return dx * cos + dy * sin > -0.01;
  });
  // ... pick nearest valid candidate
}
```

### 6.6 Colour Interpolation

Parse hex `#rrggbb` into RGB channels, lerp each independently, reassemble:

```typescript
function lerpColor(a: string, b: string, t: number): string {
  // Parse both hex colours
  // Lerp: channel = Math.round(aChannel * (1-t) + bChannel * t)
  // Reassemble: #rrggbb
}
```

Non-hex colours (named colours, rgba, etc.) are not interpolated — they switch discretely at `t = 0.5`.

### 6.7 Line Drawing Animation

Lines have a `progress` property (0 to 1). When progress < 1, the line is partially drawn:

- Compute the full line vector and length
- Draw only `length * progress` worth of the line
- Position the arrowhead at the drawn endpoint
- Show the label only when `progress > 0.4` (avoids label appearing before the line reaches it)

### 6.8 Playback Loop

Standard `requestAnimationFrame` loop:

```typescript
const tick = (now: number) => {
  const dt = ((now - lastFrame) / 1000) * speed;
  lastFrame = now;
  time += dt;
  if (time >= duration) {
    time = loop ? time % duration : duration;
    if (!loop) pause();
  }
  // evaluateAnimatedProps(objects, tracks, time) → render
  raf = requestAnimationFrame(tick);
};
```

### 6.9 Render Order

Objects are rendered in this order (back to front):

1. Text labels (background layer)
2. Lines / arrows (middle layer)
3. Shapes: boxes, circles, tables (front layer)

This ensures lines appear behind the nodes they connect.

---

## 7. Renderer Details

### 7.1 SVG Canvas

The root SVG uses `width="100%" height="100%"` and contains:

- A `<defs>` block with a subtle grid pattern
- A full-size `<rect>` filled with the grid pattern
- All object renderers in render order

### 7.2 Box Renderer

Draws a `<rect>` centered at local origin with `x={-w/2} y={-h/2}`. Text is centered with `text-anchor="middle"` and `dominant-baseline="middle"`. Wrapped in the two-group anchor transform structure.

### 7.3 Table Renderer

Draws a header row (distinct fill) followed by data rows. Each cell is a `<rect>` + `<text>`. The whole table is centered at `(x, y)` by offsetting all rects to `(-totalW/2, -totalH/2)`. Wrapped in anchor transform groups.

### 7.4 Line Renderer

If `from` and `to` are set, computes endpoints via edge geometry. Otherwise uses explicit `x1,y1,x2,y2`. Draws:

- A `<line>` element (with optional dash pattern)
- A `<polygon>` arrowhead at the drawn endpoint
- A label at the midpoint, with a small background rect for readability

### 7.5 Arrowhead Geometry

The arrowhead is a filled triangle. Given the line's unit direction vector `(nx, ny)` and the drawn endpoint `(ex, ey)`:

```typescript
const arrowSize = 8;
// Three points of the triangle:
// tip:   (ex, ey)
// left:  (ex - nx*arrowSize - ny*4, ey - ny*arrowSize + nx*4)
// right: (ex - nx*arrowSize + ny*4, ey - ny*arrowSize - nx*4)
```

The perpendicular offset `(ny, -nx)` and `(-ny, nx)` creates the two base corners of the arrowhead.

---

## 8. DSL Parser Implementation Notes

### 8.1 Two Modes for Object Blocks

The parser must handle both multi-line and inline forms:

```
# Multi-line: { on first line, properties on separate lines, } on its own line
box myBox {
  x: 400
  y: 170
}

# Inline: everything between { and } on one line
box myBox { x: 400  y: 170  size: 130 46  fill: #1a1d24 }
```

**Detection**: After matching `type id {`, check if `}` appears on the same line.

**Inline parsing**: Find all `key:` positions using regex, then slice value as everything between one key's colon and the next key's match start. This correctly handles multi-word values like `size: 60 26` because the value runs until the next key word is encountered.

### 8.2 Animation Block Parsing

```
@animate duration:8s loop:true {
  0.5s: obj.prop = value ease:easing, obj2.prop2 = value2 ease:easing2
}
```

1. Parse duration and loop from the `@animate` line
2. For each line inside braces:
   - Extract time: `^(\d+\.?\d*)s:\s*(.+)`
   - Split remainder on `,` for multiple assignments
   - Each assignment: `(\w+)\.(\w+)\s*=\s*(.+)`
   - Check for trailing `ease:(\w+)` on the value; strip it and store separately
   - Default easing is `linear`

### 8.3 Value Parsing

```typescript
function parseValue(val: string): number | boolean | string {
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(val)) return parseFloat(val);
  if ((val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))) return val.slice(1, -1);
  return val;  // bare string (hex colour, anchor name, etc.)
}
```

---

## 9. Known Limitations & Future Work

Current limitations worth addressing as the project matures:

### Rendering
- **No curved lines**: All connections are straight segments. Add quadratic/cubic bezier support for aesthetics, and orthogonal routing (H-V-H segments with rounded corners) for cleaner diagrams.
- **No self-loops**: A state transitioning to itself has no visual representation. Needs a loopback arc renderer.
- **No obstacle avoidance**: Lines can overlap or pass through objects. Consider basic routing that avoids occupied bounding boxes.
- **Line-to-cell targeting**: Lines connect to the whole table, not individual rows or columns.

### Animation
- **No relative values**: Keyframes are absolute. Consider supporting `+=10` or `-=0.2` for relative changes.
- **No stagger/repeat helpers**: Common patterns like "animate each node in sequence with 0.2s delay" require manual keyframe entry. A stagger utility would reduce boilerplate.
- **No animation chaining**: Can't say "after line finishes drawing, scale the target node." Would need a dependency/sequencing system.
- **Custom cubic-bezier**: Currently only named easing presets. Could add `ease:cubic(0.4, 0, 0.2, 1)` syntax.

### Layout
- **Manual positioning only**: All objects need explicit `x, y` coordinates. Consider optional auto-layout via topological layering (Sugiyama-style) or force-directed placement.
- **No grouping/containers**: Can't define a group of objects that move together. Would need a `group` object type that acts as a transform parent.

### Parser
- **No error recovery**: A malformed line silently fails. Should produce error messages with line numbers.
- **No multi-line strings**: Text values can't span lines. Consider a block string syntax.
- **No variables/constants**: Can't define `$primary: #22d3ee` and reference it. Would reduce repetition.

### Export
- **No static export**: Can't export to SVG, PNG, GIF, or video. The renderer is live-only.
- **No embed mode**: No way to embed an animation in a static page without the full React runtime.

---

## 10. Example Diagrams

### 10.1 State Machine

```
# HTTP Connection State Machine

text title {
  x: 400
  y: 35
  text: "Connection Lifecycle"
  size: 18
  color: #e2e5ea
  bold: true
}

circle start {
  x: 400
  y: 90
  r: 12
  fill: #22d3ee
  stroke: #22d3ee
}

box idle {
  x: 400
  y: 170
  size: 130 46
  fill: #0f1923
  stroke: #22d3ee
  radius: 23
  text: "Idle"
  anchor: bottom
}

box connecting {
  x: 180
  y: 300
  size: 150 46
  fill: #191710
  stroke: #fbbf24
  radius: 8
  text: "Connecting"
  anchor: top
}

box connected {
  x: 400
  y: 430
  size: 150 46
  fill: #0f1916
  stroke: #34d399
  radius: 8
  text: "Connected"
  anchor: top
}

box error {
  x: 620
  y: 300
  size: 130 46
  fill: #1c0f0f
  stroke: #ef4444
  radius: 8
  text: "Error"
  anchor: top
}

line s0 { from: start  to: idle  stroke: #22d3ee  label: "init" }
line s1 { from: idle  to: connecting  stroke: #fbbf24  label: "connect()" }
line s2 { from: connecting  to: connected  stroke: #34d399  label: "TCP established" }
line s3 { from: connecting  to: error  stroke: #ef4444  label: "timeout / refused" }
line s4 { from: error  to: idle  stroke: #8a8f98  label: "retry()"  dashed: true }
line s5 { from: connected  to: idle  stroke: #8a8f98  label: "close()"  dashed: true }

@animate duration:8s loop:true {
  0.0s: start.scale = 1.3
  0.4s: start.scale = 1 ease:easeOutCubic
  0.2s: s0.progress = 0
  0.8s: s0.progress = 1 ease:easeInOut
  0.8s: idle.scale = 1.12
  1.2s: idle.scale = 1 ease:easeOutBack
  1.2s: s1.progress = 0
  2.0s: s1.progress = 1 ease:easeInOut
  2.0s: connecting.scale = 1.12, connecting.fill = #2a2410
  2.5s: connecting.scale = 1 ease:easeOutBack, connecting.fill = #191710 ease:easeOut
  2.5s: s2.progress = 0
  3.3s: s2.progress = 1 ease:easeInOut
  3.3s: connected.scale = 1.12, connected.fill = #1a2e22
  3.8s: connected.scale = 1 ease:easeOutBack, connected.fill = #0f1916 ease:easeOut
  4.2s: s5.progress = 0
  5.0s: s5.progress = 1 ease:easeInOut
  5.0s: idle.scale = 1.12
  5.4s: idle.scale = 1 ease:easeOutBack
  5.4s: s1.progress = 0
  6.0s: s1.progress = 1 ease:easeInOut
  6.0s: connecting.scale = 1.12
  6.3s: connecting.scale = 1 ease:easeOutBack
  6.3s: s3.progress = 0
  7.0s: s3.progress = 1 ease:easeInOut
  7.0s: error.scale = 1.15, error.fill = #2c1010
  7.4s: error.scale = 1 ease:bounce, error.fill = #1c0f0f ease:easeOut
  7.4s: s4.progress = 0
  8.0s: s4.progress = 1 ease:easeInOut
}
```

### 10.2 ETL Data Pipeline

```
text title {
  x: 450
  y: 30
  text: "ETL Pipeline"
  size: 18
  color: #e2e5ea
  bold: true
}

box ingest    { x: 100  y: 120  size: 130 50  fill: #131825  stroke: #60a5fa  text: "Ingest" }
box validate  { x: 300  y: 120  size: 130 50  fill: #131825  stroke: #60a5fa  text: "Validate" }
box transform { x: 500  y: 120  size: 140 50  fill: #131825  stroke: #a78bfa  text: "Transform" }
box load      { x: 700  y: 120  size: 130 50  fill: #131825  stroke: #34d399  text: "Load" }

table schema {
  x: 300
  y: 280
  cols: Field | Type | Nullable
  row: id | u64 | no
  row: name | String | no
  row: score | f64 | yes
  row: ts | DateTime | no
}

table metrics {
  x: 650
  y: 310
  cols: Metric | Value
  row: rows/s | 12,450
  row: errors | 0.02%
  row: p99 lat | 23ms
}

line l1 { from: ingest    to: validate   stroke: #60a5fa  label: "raw bytes" }
line l2 { from: validate  to: transform  stroke: #a78bfa  label: "parsed rows" }
line l3 { from: transform to: load       stroke: #34d399  label: "clean records" }
line l4 { from: validate  to: schema     stroke: #3a3f49  label: "check against"  dashed: true }
line l5 { from: load      to: metrics    stroke: #3a3f49  label: "report"  dashed: true }

@animate duration:6s loop:true {
  0.0s: ingest.scale = 1.1, ingest.fill = #1a2540
  0.4s: ingest.scale = 1 ease:easeOutBack, ingest.fill = #131825 ease:easeOut
  0.3s: l1.progress = 0
  1.0s: l1.progress = 1 ease:easeInOut
  1.0s: validate.scale = 1.1
  1.4s: validate.scale = 1 ease:easeOutBack
  1.0s: l4.progress = 0
  1.8s: l4.progress = 1 ease:easeInOut
  1.4s: schema.opacity = 0.4
  2.0s: schema.opacity = 1 ease:easeOut
  1.5s: l2.progress = 0
  2.3s: l2.progress = 1 ease:easeInOut
  2.3s: transform.scale = 1.1, transform.fill = #1c1840
  2.7s: transform.scale = 1 ease:easeOutBack, transform.fill = #131825 ease:easeOut
  2.7s: l3.progress = 0
  3.5s: l3.progress = 1 ease:easeInOut
  3.5s: load.scale = 1.1, load.fill = #132e22
  3.9s: load.scale = 1 ease:easeOutBack, load.fill = #131825 ease:easeOut
  3.5s: l5.progress = 0
  4.3s: l5.progress = 1 ease:easeInOut
  4.3s: metrics.opacity = 0.4
  5.0s: metrics.opacity = 1 ease:easeOut
}
```

### 10.3 Easing Function Comparison

```
text title { x: 400  y: 30  text: "Easing Functions"  size: 18  color: #e2e5ea  bold: true }

text t1 { x: 100  y: 80   text: "linear"       size: 11  color: #4a4f59 }
text t2 { x: 100  y: 130  text: "easeInOut"     size: 11  color: #4a4f59 }
text t3 { x: 100  y: 180  text: "easeOutCubic"  size: 11  color: #4a4f59 }
text t4 { x: 100  y: 230  text: "easeOutBack"   size: 11  color: #4a4f59 }
text t5 { x: 100  y: 280  text: "bounce"        size: 11  color: #4a4f59 }
text t6 { x: 100  y: 330  text: "elastic"       size: 11  color: #4a4f59 }
text t7 { x: 100  y: 380  text: "spring"        size: 11  color: #4a4f59 }
text t8 { x: 100  y: 430  text: "snap"          size: 11  color: #4a4f59 }

box b1 { x: 200  y: 80   size: 60 26  fill: #131825  stroke: #60a5fa  radius: 4 }
box b2 { x: 200  y: 130  size: 60 26  fill: #131825  stroke: #22d3ee  radius: 4 }
box b3 { x: 200  y: 180  size: 60 26  fill: #131825  stroke: #34d399  radius: 4 }
box b4 { x: 200  y: 230  size: 60 26  fill: #131825  stroke: #a78bfa  radius: 4 }
box b5 { x: 200  y: 280  size: 60 26  fill: #131825  stroke: #f472b6  radius: 4 }
box b6 { x: 200  y: 330  size: 60 26  fill: #131825  stroke: #fbbf24  radius: 4 }
box b7 { x: 200  y: 380  size: 60 26  fill: #131825  stroke: #fb923c  radius: 4 }
box b8 { x: 200  y: 430  size: 60 26  fill: #131825  stroke: #ef4444  radius: 4 }

@animate duration:4s loop:true {
  0.0s: b1.x = 200, b2.x = 200, b3.x = 200, b4.x = 200
  0.0s: b5.x = 200, b6.x = 200, b7.x = 200, b8.x = 200
  2.0s: b1.x = 650 ease:linear
  2.0s: b2.x = 650 ease:easeInOut
  2.0s: b3.x = 650 ease:easeOutCubic
  2.0s: b4.x = 650 ease:easeOutBack
  2.0s: b5.x = 650 ease:bounce
  2.0s: b6.x = 650 ease:elastic
  2.0s: b7.x = 650 ease:spring
  2.0s: b8.x = 650 ease:snap
  3.0s: b1.x = 650, b2.x = 650, b3.x = 650, b4.x = 650
  3.0s: b5.x = 650, b6.x = 650, b7.x = 650, b8.x = 650
  4.0s: b1.x = 200 ease:linear
  4.0s: b2.x = 200 ease:easeInOut
  4.0s: b3.x = 200 ease:easeOutCubic
  4.0s: b4.x = 200 ease:easeOutBack
  4.0s: b5.x = 200 ease:bounce
  4.0s: b6.x = 200 ease:elastic
  4.0s: b7.x = 200 ease:spring
  4.0s: b8.x = 200 ease:snap
}
```
