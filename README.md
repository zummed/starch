# starch

Animated diagram library for documenting application internals. Define objects and keyframe animations with a concise DSL or programmatic API, and render interactive SVG diagrams in React apps or any webpage.

> **Note:** This entire project — code, architecture, and documentation — was built agentically using [Claude Code](https://claude.com/claude-code). It is under active development as an experiment in agentic software engineering. The library is at version 0.0.1 and the API may change.

## Try It — Interactive Playground

The fastest way to start is the built-in playground with a categorised sample browser, tabbed editor, and live preview.

```bash
git clone https://github.com/zummed/starch.git
cd starch
npm install
npm run dev
```

The playground features:
- **Sample browser** with 28 focused examples across 8 categories
- **Tabbed editor** with syntax highlighting, autocomplete, inline error diagnostics, and save/load
- **Canvas controls** — pan (drag), zoom (scroll wheel), Fit All, Lock View, Debug mode
- **Export** to HTML, React, MkDocs, or raw DSL
- **Persistent tabs** — work survives page reloads via localStorage

## Install

```bash
npm install @bitsnbobs/starch
```

Requires React 18 or 19 as a peer dependency.

## Usage

### React

```tsx
import { Diagram } from '@bitsnbobs/starch';

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

```html
<script src="https://unpkg.com/@bitsnbobs/starch/dist/starch-embed.iife.js"></script>

<starch-diagram autoplay>
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

The web component includes subtle play/pause and restart controls on hover.

## DSL

Diagrams are defined in a JSON5-based format. Both `colour` and `color` spellings are accepted throughout.

### Top-Level Properties

```js
{
  name: "My Diagram",
  description: "Optional description",
  background: "#0e1117",       // or "transparent"
  viewport: "16:9",            // aspect ratio — "4:3", "1:1", "800x450", { width, height }
  styles: { ... },             // reusable style definitions
  images: { ... },             // image URL registry
  objects: [ ... ],
  animate: { ... },
}
```

### Object Types

- **box** — rectangle with text, rounded corners, images (default 140x46)
- **circle** — circle with radius
- **label** — standalone text
- **table** — rows and columns
- **line** — connects two objects with label, bend, dashing
- **path** — arbitrary point sequence with spline curves
- **textblock** — multi-line text with per-line animation
- **code** — syntax-highlighted code block (shorthand for textblock with monospace)
- **camera** — viewport control (zoom, pan, follow, fit)

### Layout Containers

Any box becomes a **flex container** when children group to it. Default direction is column.

```js
{ box: "container", at: [400, 200], colour: "#2a2d35", radius: 12 },
{ box: "child1", colour: "#22d3ee", text: "One", group: "container" },
{ box: "child2", colour: "#34d399", text: "Two", group: "container" },
```

Container properties: `direction` (row/column, default column), `gap` (default 12), `padding` (default 12), `paddingTop`/`Right`/`Bottom`/`Left`, `justify`, `align`, `wrap`.

Child properties: `group`, `order`, `grow`, `shrink`, `alignSelf`.

### Reusable Styles

```js
{
  styles: {
    card: { colour: "#22d3ee", radius: 12 },
    alert: { style: "card", colour: "#ef4444" },  // composes card
  },
  objects: [
    { box: "a", style: "card", text: "Card" },
    { box: "b", style: "alert", text: "Alert" },
    { box: "c", style: "card", colour: "#34d399", text: "Override" },  // object props win
  ],
}
```

### Animation

Keyframes use a time-first block format where simultaneous changes are grouped:

```js
animate: {
  duration: 6, loop: false, easing: "easeInOut",
  keyframes: [
    { time: 1.0, changes: {
      arrow: { progress: 1, easing: "easeInOut" },
      source: { pulse: 0.1 },
      target: { pulse: 0.1 },
    }},
    { plus: 1.0, delay: 0.5, changes: {  // 1s after previous, 0.5s pause before
      arrow2: { progress: 1 },
    }},
  ]
}
```

- **`plus: N`** — time relative to previous keyframe
- **`delay: N`** — pause before this keyframe starts
- **`autoKey: true`** (default) — properties hold at block boundaries

Supported easings: `linear`, `easeIn`, `easeOut`, `easeInOut`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, `easeOutBack`, `easeInBack`, `bounce`, `elastic`, `spring`, `snap`, `step`, `cut`.

Per-object shorthand for simple cases:

```js
keyframes: {
  runner: [[0, "pathProgress", 0], [8, "pathProgress", 1, "linear"]],
}
```

### Effects

Additive, fire-and-forget visual modifiers that decay automatically:

| Effect | What it does | Example |
|--------|-------------|---------|
| `pulse` | Temporary scale bump | `{ pulse: 0.12 }` |
| `flash` | Brief opacity dim | `{ flash: 0.3 }` |
| `shake` | Rapid left-right oscillation | `{ shake: 5 }` |
| `glow` | Temporary strokeWidth increase | `{ glow: 3 }` |

### Text Blocks & Code

```js
// Multi-line text
{ textblock: "para", at: [400, 200], lines: [
    "First line",
    { text: "Highlighted", color: "#22d3ee", bold: true },
    "Third line",
  ],
}

// Syntax-highlighted code
{ code: "snippet", at: [400, 200], syntax: "javascript", lines: [
    "function greet() {",
    "  return 'Hello';",
    "}",
  ],
}
```

Per-line animation via dot notation:
```js
{ time: 2.0, changes: {
  "snippet.line1": { color: "#22d3ee", opacity: 0.5 },
  "snippet.line2": { text: "  return 'World';" },
}}
```

Bundled syntax languages: JavaScript, TypeScript, Python, JSON, YAML, SQL, Bash, CSS, HTML/XML, Go, Rust, Java, C/C++, Markdown.

### Camera

```js
{ camera: "cam", target: [400, 250], zoom: 1 },

// Animate in keyframes
{ time: 2.0, changes: { cam: { target: "boxId", zoom: 2 } } },
{ time: 4.0, changes: { cam: { fit: "all" } } },
{ time: 5.0, changes: { cam: { fit: ["a", "b"], easing: "cut" } } },
```

- **`target`**: `[x,y]` coordinates or object ID (follows the object)
- **`zoom`**: zoom level (2 = 2x closer)
- **`fit`**: `"all"` or `["id1", "id2"]` — auto-zoom to fit objects
- All properties animate smoothly with easing. Use `easing: "cut"` for instant jumps.

### Images

```js
{
  images: { logo: "/icons/logo.svg" },
  objects: [
    { box: "a", image: "logo" },
    { box: "b", image: "https://example.com/icon.svg" },
    { circle: "c", image: "data:image/svg+xml;base64,..." },
  ],
}
```

Properties: `image`, `imageFit` (contain/cover/fill), `imagePadding`.

### Text Alignment in Boxes

```js
{ box: "a", text: "Top Left", textAlign: "start", textVAlign: "top" }
```

- `textAlign`: `"start"`, `"middle"` (default), `"end"`
- `textVAlign`: `"top"`, `"middle"` (default), `"bottom"`

### Chapters

Named time markers that pause playback:

```js
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

### `useDiagram` Hook

```tsx
const diagram = useDiagram({ dsl, autoplay: true });

diagram.time, diagram.duration, diagram.playing, diagram.speed
diagram.chapters, diagram.activeChapter
diagram.name, diagram.background, diagram.viewport, diagram.cameraViewBox
diagram.objects, diagram.animatedProps, diagram.renderOrder

diagram.play(), diagram.pause(), diagram.seek(time)
diagram.nextChapter(), diagram.prevChapter(), diagram.goToChapter(id)
```

### `<starch-diagram>` Custom Element

```html
<starch-diagram autoplay>...DSL here...</starch-diagram>
<starch-diagram src="/diagrams/my-diagram.starch" autoplay></starch-diagram>
```

Includes play/pause and restart controls on hover. JavaScript API:

```js
const el = document.querySelector('starch-diagram');
el.play(); el.pause(); el.seek(2.5); el.goToChapter('step-2');
el.time; el.duration; el.playing; el.chapters;
el.addEventListener('starch:chapterenter', (e) => { ... });
```

## MkDocs Integration

### Option 1: Plugin (recommended)

```bash
pip install mkdocs-starch
```

```yaml
# mkdocs.yml
plugins:
  - starch
```

Then use fenced code blocks:

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

### Option 2: JavaScript snippet

For environments where you can't install Python plugins:

```yaml
# mkdocs.yml
markdown_extensions:
  - pymdownx.superfences:
      custom_fences:
        - name: starch
          class: starch
          format: !!python/name:pymdownx.superfences.fence_div_format

extra_javascript:
  - https://unpkg.com/@bitsnbobs/starch/dist/starch-embed.iife.js
  - js/starch-init.js
```

Copy `docs/mkdocs-snippet.js` to `docs/js/starch-init.js`.

## Development

```bash
npm run dev          # Start dev server with playground
npm run build        # Build React library
npm run build:embed  # Build standalone embed
npm run build:all    # Build both
npx vitest run       # Run tests
```

## License

ISC
