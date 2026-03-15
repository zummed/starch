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
    { box: "server", at: [200, 100], size: [120, 50], colour: "#34d399", text: "Server" },
    { box: "client", at: [200, 250], size: [120, 50], colour: "#22d3ee", text: "Client" },
    { line: "req", from: "client", to: "server", colour: "#fbbf24", label: "request" },
  ],
  animate: {
    duration: 3,
    keyframes: {
      req: [[1.5, "progress", 1, "easeInOut"]],
      server: [[1.5, "scale", 1.1], [2, "scale", 1, "easeOutBack"]],
    }
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
    { box: "server", at: [200, 100], size: [120, 50], colour: "#34d399", text: "Server" },
    { box: "client", at: [200, 250], size: [120, 50], colour: "#22d3ee", text: "Client" },
    { line: "req", from: "client", to: "server", colour: "#fbbf24", label: "request" },
  ],
  animate: {
    duration: 3,
    keyframes: {
      req: [[1.5, "progress", 1, "easeInOut"]],
      server: [[1.5, "scale", 1.1], [2, "scale", 1, "easeOutBack"]],
    }
  }
}
</starch-diagram>
```

The embed bundle is self-contained (~100KB gzip) with React bundled in.

## DSL

Diagrams are defined in a JSON5-based format with these object types:

- **box** — rectangle with optional text, rounded corners, fill
- **circle** — circle with radius
- **label** — standalone text
- **table** — rows and columns
- **line** — connects two objects with optional label, bend, and dashing
- **path** — arbitrary point sequence with spline curves
- **group** — container with flex-like layout (direction, gap, padding)

### Animation

Keyframes target any object property at a given time with an optional easing. Properties that the user explicitly sets on the object definition are automatically used as the starting value, so you only need to specify the destination:

```
// A box defined with at: [100, 200]
keyframes: {
  myBox: [
    [2, "x", 300, "easeOutBack"],  // slides from x=100 (the defined value) to 300
  ]
}
```

Supported easings: `linear`, `easeIn`, `easeOut`, `easeInOut`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, `easeOutBack`, `easeInBack`, `bounce`, `elastic`, `spring`, `snap`, `step`.

Chapters define named time markers for navigation:

```
chapters: [
  [0, "intro", "Introduction"],
  [3, "demo", "Live Demo"],
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
    { box: "api", at: [200, 100], size: [100, 50], colour: "#34d399", text: "API" }
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
