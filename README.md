# starch

Write text. Get animated diagrams.

Starch turns a small, indentation-based DSL into interactive animated SVG — keyframe timelines, camera moves, and chapter-based step-through, all from plain text you can diff and version-control.

**[Try the playground](https://zummed.github.io/starch/)** — live editing in your browser, nothing to install.

```
server: rect 140x46 radius=8 fill #34d399 at 200,100
  serverLabel: text "Server" size=14
client: rect 140x46 radius=8 fill #22d3ee at 200,250
  clientLabel: text "Client" size=14
req: arrow client server stroke #fbbf24 label "request"
  draw 0

animate 3 loop
  1.5
    req.draw: { value: 1, easing: "easeInOut" }
```

That's a complete diagram: two boxes and an arrow that draws itself, on a 3-second loop.

## Install

```bash
npm install @bitsnbobs/starch
```

Or skip npm entirely and use the CDN build (see below).

The package is ESM-only and ships four entry points:

| Import | What it gives you |
| --- | --- |
| `@bitsnbobs/starch` | Core library: `StarchDiagram`, `renderToSVG`, parser and renderer building blocks. No framework dependencies. |
| `@bitsnbobs/starch/react` | `useV2Diagram` hook. Requires React (optional peer dependency). |
| `@bitsnbobs/starch/element` | Registers the `<starch-diagram>` custom element (for apps with a bundler). |
| `@bitsnbobs/starch/embed` | Self-contained IIFE for `<script>` tags. Registers `<starch-diagram>` and exposes a global `Starch`. |

## Usage

### Any webpage — script tag

```html
<script src="https://unpkg.com/@bitsnbobs/starch/dist/starch-embed.iife.js"></script>

<starch-diagram autoplay>
  ...DSL...
</starch-diagram>

<!-- or load the DSL from a file -->
<starch-diagram src="/diagrams/arch.starch" autoplay></starch-diagram>
```

The element shows hover playback controls, and an inline error message if the DSL fails to parse.

### JavaScript

```js
import { StarchDiagram } from '@bitsnbobs/starch';

const diagram = new StarchDiagram(container, { dsl, autoplay: true });
```

### React

```tsx
import { useV2Diagram } from '@bitsnbobs/starch/react';

function App() {
  const diagram = useV2Diagram({ dsl, autoplay: true });
  return <div ref={diagram.containerRef} style={{ width: '100%', height: 400 }} />;
}
```

### Markdown / documentation sites

The embed script can upgrade fenced code blocks in rendered HTML, the same way mermaid does. Any block rendered as `<code class="language-starch">` (or a `div.starch`) becomes a live diagram:

```js
Starch.scan();            // whole document
Starch.scan(container);   // or a subtree
```

For MkDocs there is a ready-made plugin — see [MkDocs integration](#mkdocs-integration).

### Static SVG

For thumbnails, previews, or export, render a DSL string straight to an SVG string — no animation loop, no mounted component:

```js
import { renderToSVG } from '@bitsnbobs/starch';

const svg = renderToSVG(dsl);              // final frame of the animation
const svgAtStart = renderToSVG(dsl, { time: 0 });
```

`renderToSVG` throws on invalid DSL. It needs a DOM (browser, or happy-dom/jsdom in Node).

## DSL guide

Diagrams are indentation-based plain text. Both `colour` and `color` are accepted throughout.

### Shapes

```
server: rect 140x46 radius=8 fill steelblue at 200,100
  serverLabel: text "Server" size=14 bold
db: ellipse 50x50 fill darkorange at 400,200
req: arrow server db stroke gold label "query"
  draw 0
```

Every object gets an id (`server:`, `db:`) — ids are how arrows, animations, and the camera refer to things, and nested children need ids too.

Built-in types: `rect`, `ellipse`, `text`, `arrow`, `line`, `path`, `pill`, `card`, `group`, `note`, `table`, `textblock`, `codeblock`, plus state-machine shapes (`state.node`, `state.initial`, `state.final`, `state.choice`, `state.region`).

### Layout

Any rect becomes a flex container when children nest under it:

```
container: rect 300x200 fill #2a2d35 radius=12 at 300,200
  layout direction=row gap=12 padding=16
  child1: rect 80x40 fill #22d3ee
  child2: rect 80x40 fill #34d399
```

Layout properties: `direction`, `gap`, `padding`, `justify`, `align`, `wrap`.

### Animation

```
animate 6 loop easing=easeInOut
  1
    req.draw: 1
    server.opacity: 1
  +1 delay=0.5
    resp.draw: 1
  3
    cam.camera.zoom: 2
```

Keyframe times are absolute (`1`, `3`) or relative (`+1` — one second after the previous). `delay` pauses before a keyframe; properties hold between keyframes by default.

Easings: `linear`, `easeIn`, `easeOut`, `easeInOut`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, `easeOutBack`, `easeInBack`, `bounce`, `elastic`, `spring`, `snap`, `step`, `cut`.

### Camera

```
cam: camera target=server zoom=1 ratio=16:9

animate 4
  2 cam.camera.target: db
     cam.camera.zoom: 2
  4 cam.camera.fit: all
```

`target` is a point or an object id (the camera follows it), `zoom` magnifies, `fit` frames `all` or a list of ids, `ratio` constrains aspect.

### Styles

```
styles
  card: fill #22d3ee radius=12
  alert: style card fill #ef4444

objects
  a: card "OK"
  b: alert "Error"
```

Styles compose via `style` references; object properties win over style properties.

### Chapters

Named time markers for step-through presentations:

```
animate 10
  chapters
    chapter "Start" at 0
    chapter "Handshake" at 3
    chapter "Complete" at 7
```

## API

### `StarchDiagram`

```js
const diagram = new StarchDiagram(container, { dsl, autoplay: true, speed: 1, onEvent });

diagram.play();  diagram.pause();  diagram.seek(2.5);  diagram.setSpeed(2);
diagram.nextChapter();  diagram.prevChapter();  diagram.goToChapter('name');
diagram.on('chapterEnter', handler);  diagram.off('chapterEnter', handler);
diagram.destroy();

diagram.time;  diagram.duration;  diagram.playing;  diagram.speed;
diagram.chapters;  diagram.activeChapter;
```

**Errors are never silent.** `setDSL` returns a result instead of throwing, so live editors can keep the last good frame on screen:

```js
const result = diagram.setDSL(newDsl);
// { ok: true, warnings: string[] } | { ok: false, error: string }

diagram.on('error', (e) => console.log(e.message));  // also fired for a bad initial dsl
diagram.error;     // last parse error, or null
diagram.warnings;  // warnings from the last successful parse
```

Events: `chapterEnter`, `chapterExit`, `ended`, `error`.

### `<starch-diagram>`

```html
<starch-diagram autoplay speed="1.5">...DSL...</starch-diagram>
<starch-diagram src="/diagrams/arch.starch" autoplay></starch-diagram>
```

```js
const el = document.querySelector('starch-diagram');
el.dsl = newDsl;                       // live-update the diagram
el.play(); el.pause(); el.seek(2.5); el.goToChapter('step-2');
el.addEventListener('starch:chapterenter', (e) => { /* e.detail */ });
el.addEventListener('starch:error', (e) => { /* e.detail.message */ });
```

Attributes: `src`, `autoplay`, `speed`. Parse and fetch errors appear as an overlay on the element.

### `Starch` global (embed script only)

```js
Starch.scan(root?, { autoplay });      // upgrade language-starch code blocks in place
Starch.render(container, dsl, opts);   // → StarchDiagram
Starch.renderToSVG(dsl, { time });     // → SVG string
Starch.StarchDiagram;                  // the classes themselves
Starch.StarchDiagramElement;
```

### Lower-level exports

The core entry also exports the pipeline pieces (`parseScene`, `buildTimeline`, `evaluateAllTracks`, `applyTrackValues`, `emitFrame`, `SvgRenderBackend`, `computeViewBox`, `computeAutoFitViewBox`, layout and text-measurement utilities) for building custom renderers or tooling on top.

## Editing embedded diagrams

Embedded diagrams are players; editing happens in the [playground](https://zummed.github.io/starch/), and there are three ways to wire that up.

**1. The `editable` attribute.** Adds an edit button to the element's hover controls. It opens the playground in a popup with the current DSL loaded; when the user hits Save there, the diagram updates in place and fires `starch:edit` so your app can persist the new DSL:

```html
<starch-diagram editable autoplay>...DSL...</starch-diagram>
```

```js
el.addEventListener('starch:edit', (e) => save(e.detail.dsl));
```

Use `edit-url="https://your-fork.example/"` to point at a different playground deployment.

**2. Edit links.** For a plain "open in playground" link (no round trip — users copy the result back), build a URL with the DSL in the fragment. The fragment never leaves the browser:

```js
import { buildEditUrl } from '@bitsnbobs/starch';

const url = buildEditUrl(dsl);                    // playground in embed mode
const url2 = buildEditUrl(dsl, undefined, { embed: false }); // full playground, DSL imported as a tab
```

**3. Host your own editing session.** Apps can open the playground themselves — iframe modal or popup — with `?embed=1#dsl=...` and listen for postMessage. The playground posts `{ source: 'starch-playground', type: 'ready' | 'save' | 'cancel', dsl? }` to its opener/parent; `save` carries the edited DSL. Type guards ship in the package:

```js
import { buildEditUrl, isPlaygroundMessage } from '@bitsnbobs/starch';

const frame = document.createElement('iframe');
frame.src = buildEditUrl(currentDsl);
window.addEventListener('message', (e) => {
  if (e.source !== frame.contentWindow || !isPlaygroundMessage(e.data)) return;
  if (e.data.type === 'save') persist(e.data.dsl);
  if (e.data.type === 'save' || e.data.type === 'cancel') closeModal();
});
```

For lightweight in-place editing without the playground, a textarea is enough — `setDSL` returns `{ ok, error | warnings }` and keeps the last good frame rendered while the user types:

```js
textarea.addEventListener('input', () => {
  const result = diagram.setDSL(textarea.value);
  errorBox.textContent = result.ok ? '' : result.error;
});
```

## MkDocs integration

```bash
pip install mkdocs-starch
```

```yaml
# mkdocs.yml
plugins:
  - starch
```

Fenced ` ```starch ` blocks in your docs become live diagrams. See [mkdocs-plugin/README.md](mkdocs-plugin/README.md) for options.

## Development

```bash
npm run dev          # playground dev server
npm test             # run tests
npm run build        # library entries + types
npm run build:embed  # standalone embed (IIFE)
npm run build:app    # playground
npm run build:all    # everything
```

## License

ISC
