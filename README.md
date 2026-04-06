# starch

Write text. Get animated diagrams.

Starch is a text-driven diagram and animation tool. Describe shapes, connections, and keyframe animations in a concise DSL — starch renders them as interactive SVGs with playback controls, camera moves, and chapter navigation.

**[Try the Playground](https://zummed.github.io/starch/)** — edit DSL live in your browser, no install required.

## Features

- **Text-first** — diagrams are plain text, version-controllable, diffable, copy-pasteable
- **Animated** — keyframe timeline with 17 easing functions, loops, chapters, and effects
- **Shapes** — rects, circles, arrows, paths, tables, text blocks, code blocks with syntax highlighting
- **Layout** — flex containers with gap, padding, alignment; absolute positioning; slot-based animation
- **Camera** — zoom, pan, follow objects, fit-to-selection, smooth transitions
- **Composable** — shape templates, reusable styles, nested children, inheritance
- **Embeddable** — drop a single `<script>` tag into any page, or `npm install` for React/JS

## Quick Start

### Any Webpage

```html
<script src="https://unpkg.com/@bitsnbobs/starch/dist/starch-embed.iife.js"></script>

<starch-diagram autoplay>
server: rect 140x46 radius=8 fill #34d399 at 200,100
  text "Server" size=14
client: rect 140x46 radius=8 fill #22d3ee at 200,250
  text "Client" size=14
req: arrow client server stroke #fbbf24 label "request"
  draw 0

animate 3s loop
  1.5
    req.draw: { value: 1, easing: "easeInOut" }
</starch-diagram>
```

### npm

```bash
npm install @bitsnbobs/starch
```

```js
import { StarchDiagram } from '@bitsnbobs/starch';

const diagram = new StarchDiagram(document.getElementById('my-diagram'), {
  dsl: `
    server: rect 140x46 fill steelblue at 200,100
      text "Server"
    client: rect 140x46 fill dodgerblue at 200,250
      text "Client"
  `,
  autoplay: true,
});
```

### React

```tsx
import { useV2Diagram } from '@bitsnbobs/starch';

function App() {
  const diagram = useV2Diagram({ dsl: '...', autoplay: true });
  return <div ref={diagram.containerRef} style={{ width: '100%', height: 400 }} />;
}
```

---

## DSL Reference

Diagrams are plain text using an indentation-based syntax. Both `colour` and `color` are accepted throughout.

### Shapes

```
server: rect 140x46 radius=8 fill steelblue at 200,100
  text "Server" size=14 bold
db: ellipse 50x50 fill darkorange at 400,200
req: arrow server db stroke gold label "query"
  draw 0
```

**Built-in types:** `rect`, `ellipse`, `text`, `arrow`, `line`, `path`, `pill`, `card`, `group`, `note`, `table`, `textblock`, `codeblock`

**Shape sets:** `state.node`, `state.initial`, `state.final`, `state.choice`, `state.region`

### Layout

Any rect becomes a flex container when children nest under it:

```
container: rect 300x200 fill #2a2d35 radius=12 at 300,200
  layout direction=row gap=12 padding=16
  child1: rect 80x40 fill #22d3ee
  child2: rect 80x40 fill #34d399
```

Properties: `direction`, `gap`, `padding`, `justify`, `align`, `wrap`

### Animation

```
animate 6s loop easing=easeInOut
  1
    req.draw: 1
    server.opacity: 1
  +1 delay=0.5
    resp.draw: 1
  3
    cam.camera.zoom: 2
```

- **Absolute time** (`1`, `3`) or **relative** (`+1` = 1s after previous)
- **`delay`** — pause before the keyframe
- **`autoKey`** (default: true) — properties hold between keyframes

**Easings:** `linear`, `easeIn`, `easeOut`, `easeInOut`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, `easeOutBack`, `easeInBack`, `bounce`, `elastic`, `spring`, `snap`, `step`, `cut`

### Effects

Fire-and-forget visual modifiers that decay automatically:

| Effect | What it does | Example |
|--------|-------------|---------|
| `pulse` | Scale bump | `pulse: 0.12` |
| `flash` | Opacity dim | `flash: 0.3` |
| `shake` | Horizontal oscillation | `shake: 5` |
| `glow` | Stroke width increase | `glow: 3` |

### Camera

```
cam: camera target=server zoom=1 ratio=16:9

animate 4s
  2 cam.camera.target: db
     cam.camera.zoom: 2
  4 cam.camera.fit: all
```

- **`target`** — `[x,y]` or object ID (follows it)
- **`zoom`** — magnification level
- **`fit`** — `all` or list of IDs to auto-frame
- **`ratio`** — aspect ratio constraint

### Styles

```
styles
  card: fill #22d3ee radius=12
  alert: style card fill #ef4444

objects
  a: card "OK"
  b: alert "Error"
```

Styles compose via `style` references. Object properties override style properties.

### Chapters

Named time markers that pause playback for step-through presentations:

```
animate 10s
  chapters
    chapter "Start" at 0
    chapter "Handshake" at 3
    chapter "Complete" at 7
```

---

## API

### `StarchDiagram` (vanilla JS)

```js
const diagram = new StarchDiagram(container, { dsl, autoplay: true, speed: 1 });

diagram.play(); diagram.pause(); diagram.seek(2.5);
diagram.setSpeed(2); diagram.setDSL(newDsl);
diagram.nextChapter(); diagram.prevChapter(); diagram.goToChapter('name');
diagram.on('chapterEnter', handler);
diagram.destroy();

diagram.time; diagram.duration; diagram.playing;
diagram.chapters; diagram.activeChapter;
```

### `useV2Diagram` (React hook)

```tsx
const d = useV2Diagram({ dsl, autoplay: true, speed: 1 });
// Returns: containerRef, time, duration, playing, speed,
//   chapters, keyframeTimes, name, background, viewport, cameraRatio,
//   play(), pause(), seek(), setPlaying(), setSpeed(), computeFitAll()
```

### `<starch-diagram>` (web component)

```html
<starch-diagram autoplay speed="1.5">...DSL...</starch-diagram>
<starch-diagram src="/diagrams/arch.starch" autoplay></starch-diagram>
```

```js
const el = document.querySelector('starch-diagram');
el.play(); el.pause(); el.seek(2.5); el.goToChapter('step-2');
el.addEventListener('starch:chapterenter', (e) => { ... });
```

### MkDocs Integration

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

---

## Development

```bash
npm run dev          # Playground dev server
npm run build        # ES module library + types
npm run build:embed  # Standalone embed (IIFE)
npm run build:app    # Playground for GitHub Pages
npm run build:all    # All three
npm test             # Run tests
```

## License

ISC
