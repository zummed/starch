# starch

Animated diagram library for documenting application internals. Define objects and keyframe animations with a concise DSL or programmatic API, and render interactive SVG diagrams in React apps or any webpage.

> **Note:** This entire project — code, architecture, and documentation — was built agentically using [Claude Code](https://claude.com/claude-code). It is under active development as an experiment in agentic software engineering. The library is at version 0.0.1 and the API may change.

## Try It — Interactive Playground

The fastest way to start is the built-in playground. It gives you a live editor alongside the rendered diagram with playback controls, so you can experiment with the DSL in real time.

```bash
git clone https://github.com/zummed/starch.git
cd starch
npm install
npm run dev
```

This opens a split-pane view with a CodeMirror editor on the left, the animated SVG canvas on the right, and a timeline with play/pause/seek/speed controls at the bottom. Several built-in examples (state machine, data pipeline, container layout, path motion) are available from a dropdown to get started.

The `Editor` and `Timeline` components used in the playground are exported from the library, so you can build your own editor experiences with them.

## Install

```bash
npm install starch
```

Requires React 18 or 19 as a peer dependency.

## Usage

### React

```tsx
import { Diagram } from 'starch';

const dsl = `{
  objects: [
    { box: "server", at: [200, 100], colour: "#34d399", text: "Server" },
    { box: "client", at: [200, 250], colour: "#22d3ee", text: "Client" },
    { line: "req", from: "client", to: "server", colour: "#fbbf24", label: "request", progress: 0 },
  ],
  animate: {
    duration: 3,
    keyframes: [
      { time: 1.5, changes: {
        req: { progress: 1, easing: "easeInOut" },
        client: { pulse: 0.1 },
        server: { pulse: 0.1 },
      }},
    ]
  }
}`;

function App() {
  return <Diagram dsl={dsl} autoplay />;
}
```

### Any Webpage (No React Required)

Include the standalone embed bundle and use the `<starch-diagram>` custom element:

```html
<script src="https://unpkg.com/starch/dist/starch-embed.iife.js"></script>

<starch-diagram autoplay speed="1">
{
  objects: [
    { box: "server", at: [200, 100], colour: "#34d399", text: "Server" },
    { box: "client", at: [200, 250], colour: "#22d3ee", text: "Client" },
    { line: "req", from: "client", to: "server", colour: "#fbbf24", label: "request", progress: 0 },
  ],
  animate: {
    duration: 3,
    keyframes: [
      { time: 1.5, changes: {
        req: { progress: 1, easing: "easeInOut" },
        client: { pulse: 0.1 },
        server: { pulse: 0.1 },
      }},
    ]
  }
}
</starch-diagram>
```

The embed bundle is self-contained (~100KB gzip) with React bundled in.

## DSL

Diagrams are defined in a JSON5-based format with these object types:

- **box** — rectangle with optional text, rounded corners, fill (default 140x46)
- **circle** — circle with radius
- **label** — standalone text
- **table** — rows and columns
- **line** — connects two objects with optional label, bend, and dashing
- **path** — arbitrary point sequence with spline curves

Any box can act as a **flex container** by setting `direction: "row"` or `direction: "column"`. Children declare membership via the `group` property. Containers auto-size to fit their contents.

```
{ box: "row1", at: [400, 120], direction: "row", gap: 30, padding: 16, colour: "#2a2d35" },
{ box: "s1", colour: "#22d3ee", text: "Idle", group: "row1" },
{ box: "s2", colour: "#fbbf24", text: "Active", group: "row1" },
```

Container properties: `direction`, `gap`, `padding`, `justify` (start/center/end/spaceBetween/spaceAround), `align` (start/center/end/stretch), `wrap`. Child properties: `group`, `order`, `grow`, `shrink`, `alignSelf`.

### Animation

Keyframes use a time-first block format where simultaneous changes are grouped together:

```
animate: {
  duration: 6, loop: false,
  keyframes: [
    { time: 1.0, changes: {
      l1: { progress: 1, easing: "easeInOut" },
      ingest: { pulse: 0.1 },
      validate: { pulse: 0.1 },
    }},
    { time: 2.0, changes: {
      l2: { progress: 1, easing: "easeInOut" },
    }},
  ]
}
```

Properties that the user explicitly sets on the object definition (e.g., `progress: 0`) are automatically used as the starting value, with the transition happening between adjacent keyframe blocks.

A per-object shorthand is also supported for simple cases:

```
keyframes: {
  myBox: [[0, "pathProgress", 0], [8, "pathProgress", 1, "linear"]],
}
```

Supported easings: `linear`, `easeIn`, `easeOut`, `easeInOut`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, `easeOutBack`, `easeInBack`, `bounce`, `elastic`, `spring`, `snap`, `step`.

### Effects

Effects are additive, fire-and-forget visual modifiers declared in keyframes. They trigger at the keyframe time and decay automatically — no need to animate back to the base value.

| Effect | What it does | Example |
|--------|-------------|---------|
| `pulse` | Temporary scale bump | `{ pulse: 0.12 }` — 12% scale increase |
| `flash` | Temporary opacity spike | `{ flash: 0.3 }` — opacity +0.3 |
| `shake` | Temporary random offset | `{ shake: 5 }` — up to 5px displacement |
| `glow` | Temporary strokeWidth increase | `{ glow: 3 }` — strokeWidth +3 |

```
{ time: 2.0, changes: {
  arrow: { progress: 1, easing: "easeInOut" },
  source: { pulse: 0.12 },
  target: { pulse: 0.12 },
}}
```

### Auto-Key

By default (`autoKey: true`), properties are held at each keyframe block boundary. This means transitions only happen between adjacent blocks — you don't get unexpected slow interpolations spanning the entire animation. Disable with `autoKey: false` for intentional long-window interpolations.

### Chapters

Named time markers for navigation and pause points:

```
chapters: [
  { time: 0, title: "Start", description: "Client initiates connection" },
  { time: 3, title: "Handshake", description: "Server responds" },
]
```

## API

### `<Diagram>` Component

```tsx
<Diagram
  dsl={string}        // DSL string
  scene={Scene}       // or a programmatic Scene instance
  autoplay={boolean}
  speed={number}
  debug={boolean}
  onEvent={(e) => {}} // chapter enter/exit, animation end/loop
/>
```

Accepts a `ref` exposing `DiagramHandle`:

```tsx
const ref = useRef<DiagramHandle>(null);

ref.current.play();
ref.current.pause();
ref.current.seek(2.5);
ref.current.nextChapter();
ref.current.prevChapter();
ref.current.goToChapter('step-2');
```

### `useDiagram` Hook

For custom layouts and full state access:

```tsx
const diagram = useDiagram({ dsl, autoplay: true });

// State
diagram.time        // current time
diagram.duration    // total duration
diagram.playing     // playback state
diagram.speed       // playback speed
diagram.chapters    // chapter definitions
diagram.activeChapter // currently active chapter

// Methods
diagram.play()
diagram.pause()
diagram.seek(time)
diagram.nextChapter()
diagram.prevChapter()
diagram.goToChapter(id)

// Rendering data
diagram.objects       // parsed scene objects
diagram.animatedProps // current animated properties per object
diagram.renderOrder   // depth-sorted render order
```

### `Scene` (Programmatic API)

```tsx
import { Scene, Diagram } from 'starch';

const scene = new Scene();
scene.box('server', { x: 200, y: 100, w: 120, h: 50, text: 'Server', stroke: '#34d399' });
scene.line('conn', { from: 'client', to: 'server', stroke: '#fbbf24' });

const anim = scene.animate({ duration: 5 });
anim.at(0, 'conn', 'progress', 0);
anim.at(2, 'conn', 'progress', 1, 'easeInOut');
anim.chapter(0, 'start', 'Start');

<Diagram scene={scene} autoplay />
```

### `<starch-diagram>` Custom Element

Attributes: `autoplay`, `speed`, `debug`, `src`

```html
<!-- Inline DSL -->
<starch-diagram autoplay>
  ...DSL here...
</starch-diagram>

<!-- External DSL file -->
<starch-diagram src="/diagrams/my-diagram.starch" autoplay></starch-diagram>
```

JavaScript interaction:

```js
const el = document.querySelector('starch-diagram');

// Control
el.play();
el.pause();
el.seek(2.5);
el.goToChapter('step-2');

// Read state
el.time;          // current time
el.duration;      // total duration
el.playing;       // boolean
el.chapters;      // array

// Events
el.addEventListener('starch:chapterenter', (e) => {
  console.log('Entered chapter:', e.detail.chapter);
});
el.addEventListener('starch:chapterexit', (e) => { ... });
el.addEventListener('starch:event', (e) => { ... });
```

## MkDocs Integration

For MkDocs sites, starch can render fenced code blocks as live diagrams.

1. Add the scripts to your `mkdocs.yml`:

```yaml
extra_javascript:
  - https://unpkg.com/starch/dist/starch-embed.iife.js
  - js/starch-init.js
```

2. Copy `docs/mkdocs-snippet.js` to your MkDocs `docs/js/starch-init.js`.

3. Use fenced code blocks in your markdown:

````markdown
```starch
{
  objects: [
    { box: "api", at: [200, 100], colour: "#34d399", text: "API" }
  ],
  animate: { duration: 3 }
}
```
````

The snippet finds `language-starch` code blocks and replaces them with live `<starch-diagram>` elements.

## Development

```bash
npm run dev          # Start dev server with playground
npm run build        # Build React library
npm run build:embed  # Build standalone embed
npm run build:all    # Build both
```

## License

ISC
