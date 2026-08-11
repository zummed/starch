<div align="center">

# starch

**Write text. Get animated diagrams.**

Keyframe animation, camera direction, and flex/grid layout for SVG diagrams,
in plain text you can version control.

[**Playground**](https://zummed.github.io/starch/) · [npm](https://www.npmjs.com/package/@bitsnbobs/starch) · [MkDocs plugin](mkdocs-plugin/README.md)

<img src="https://raw.githubusercontent.com/zummed/starch/main/docs/readme/hero.gif" alt="Animated starch diagram — a request flows from a client through an API to a database and cache" width="100%">

</div>

<details>
<summary>The ~30 lines behind it — or <a href="https://zummed.github.io/starch/#dsl=b2JqZWN0cwogIGNsaWVudDogYXQgOTAsMTIwCiAgICBjbGllbnRCZzogcmVjdCAxMjB4NTAgcmFkaXVzPTEwIGZpbGwgIzE2MjAyZSBzdHJva2UgIzIyZDNlZSB3aWR0aD0yCiAgICBjbGllbnRMYWJlbDogdGV4dCAiQ2xpZW50IiBzaXplPTEzIGZpbGwgI2UyZThmMAogIGFwaTogb3BhY2l0eSAwIGF0IDMzMCwxMjAKICAgIGFwaUJnOiByZWN0IDEyMHg1MCByYWRpdXM9MTAgZmlsbCAjMTYyMDJlIHN0cm9rZSAjMzRkMzk5IHdpZHRoPTIKICAgIGFwaUxhYmVsOiB0ZXh0ICJBUEkiIHNpemU9MTMgZmlsbCAjZTJlOGYwCiAgZGI6IG9wYWNpdHkgMCBhdCA1NzAsMTIwCiAgICBkYkJnOiByZWN0IDEyMHg1MCByYWRpdXM9MTAgZmlsbCAjMTYyMDJlIHN0cm9rZSAjZmJiZjI0IHdpZHRoPTIKICAgIGRiTGFiZWw6IHRleHQgIkRhdGFiYXNlIiBzaXplPTEzIGZpbGwgI2UyZThmMAogIGNhY2hlOiBvcGFjaXR5IDAgYXQgMzMwLDI3MAogICAgY2FjaGVCZzogcmVjdCAxMjB4NTAgcmFkaXVzPTEwIGZpbGwgIzE2MjAyZSBzdHJva2UgI2Y0NzJiNiB3aWR0aD0yCiAgICBjYWNoZUxhYmVsOiB0ZXh0ICJDYWNoZSIgc2l6ZT0xMyBmaWxsICNlMmU4ZjAKICByZXE6IGFycm93IGZyb209Y2xpZW50IHRvPWFwaSBsYWJlbD0icmVxdWVzdCIgY29sb3I9IzdkODU5MCBvcGFjaXR5IDAKICBxOiBhcnJvdyBmcm9tPWFwaSB0bz1kYiBsYWJlbD0icXVlcnkiIGNvbG9yPSM3ZDg1OTAgb3BhY2l0eSAwCiAgaGl0OiBhcnJvdyBmcm9tPWFwaSB0bz1jYWNoZSBsYWJlbD0iaG90IHBhdGgiIGNvbG9yPSM3ZDg1OTAgb3BhY2l0eSAwCgphbmltYXRlIDcgbG9vcCBlYXNpbmc9ZWFzZUluT3V0CiAgMC45CiAgICBhcGkub3BhY2l0eTogMQogICAgcmVxLm9wYWNpdHk6IDEKICAxLjgKICAgIGRiLm9wYWNpdHk6IDEKICAgIHEub3BhY2l0eTogMQogIDIuNwogICAgY2FjaGUub3BhY2l0eTogMQogICAgaGl0Lm9wYWNpdHk6IDE">open it in the playground</a></summary>

```
objects
  client: at 90,120
    clientBg: rect 120x50 radius=10 fill #16202e stroke #22d3ee width=2
    clientLabel: text "Client" size=13 fill #e2e8f0
  api: opacity 0 at 330,120
    apiBg: rect 120x50 radius=10 fill #16202e stroke #34d399 width=2
    apiLabel: text "API" size=13 fill #e2e8f0
  db: opacity 0 at 570,120
    dbBg: rect 120x50 radius=10 fill #16202e stroke #fbbf24 width=2
    dbLabel: text "Database" size=13 fill #e2e8f0
  cache: opacity 0 at 330,270
    cacheBg: rect 120x50 radius=10 fill #16202e stroke #f472b6 width=2
    cacheLabel: text "Cache" size=13 fill #e2e8f0
  req: arrow from=client to=api label="request" color=#7d8590 opacity 0
  q: arrow from=api to=db label="query" color=#7d8590 opacity 0
  hit: arrow from=api to=cache label="hot path" color=#7d8590 opacity 0

animate 7 loop easing=easeInOut
  0.9
    api.opacity: 1
    req.opacity: 1
  1.8
    db.opacity: 1
    q.opacity: 1
  2.7
    cache.opacity: 1
    hit.opacity: 1
```

</details>

Every example below is a playground sample, rendered from the exact text shown.

## Shapes, templates, and arrows

Declare objects with ids, position them, connect them. Templates like `box`, `circle`,
`pill`, `card`, and `note` bundle a background, label, and auto-sizing in one line.

```
objects
  api: box "API gateway" color=steelblue at 100,70
  worker: circle "Worker" color=mediumseagreen at 340,70
  status: pill "healthy" color=darkorange at 500,70
  doc: note "Plain text in, diagrams out." at 100,210
  info: card "Card" body="With body text" color=mediumpurple at 340,215
  link: arrow from=api to=worker label="jobs" color=steelblue
```

<img src="https://raw.githubusercontent.com/zummed/starch/main/docs/readme/shapes.png" alt="Rendered shapes: boxes, a circle, a pill, a note, a card, and a labelled arrow" width="100%">

[▶ Open in playground](https://zummed.github.io/starch/#dsl=b2JqZWN0cwogIGFwaTogYm94ICJBUEkgZ2F0ZXdheSIgY29sb3I9c3RlZWxibHVlIGF0IDEwMCw3MAogIHdvcmtlcjogY2lyY2xlICJXb3JrZXIiIGNvbG9yPW1lZGl1bXNlYWdyZWVuIGF0IDM0MCw3MAogIHN0YXR1czogcGlsbCAiaGVhbHRoeSIgY29sb3I9ZGFya29yYW5nZSBhdCA1MDAsNzAKICBkb2M6IG5vdGUgIlBsYWluIHRleHQgaW4sIGRpYWdyYW1zIG91dC4iIGF0IDEwMCwyMTAKICBpbmZvOiBjYXJkICJDYXJkIiBib2R5PSJXaXRoIGJvZHkgdGV4dCIgY29sb3I9bWVkaXVtcHVycGxlIGF0IDM0MCwyMTUKICBsaW5rOiBhcnJvdyBmcm9tPWFwaSB0bz13b3JrZXIgbGFiZWw9ImpvYnMiIGNvbG9yPXN0ZWVsYmx1ZQ) · sample: `template-tour`

## Keyframe animation

An `animate` block sets property values at points in time; starch interpolates between
them. Any property animates — position, color, opacity, layout, camera — and each track
can pick its own curve from 17 easings (`spring` here).

```
objects
  ingest: card "Ingest" body="raw events" color=steelblue opacity 0 at 40,120
  parse: card "Parse" body="into records" color=mediumseagreen opacity 0 at 40,120
  store: card "Store" body="time series" color=darkorange opacity 0 at 40,120

animate 5 loop
  1
    ingest.opacity: 1
    ingest.transform.x: { value: 130, easing: "spring" }
  2
    parse.opacity: 1
    parse.transform.x: { value: 330, easing: "spring" }
  3
    store.opacity: 1
    store.transform.x: { value: 530, easing: "spring" }
```

<img src="https://raw.githubusercontent.com/zummed/starch/main/docs/readme/animate.gif" alt="Three cards dealing in one by one with spring easing" width="100%">

[▶ Open in playground](https://zummed.github.io/starch/#dsl=b2JqZWN0cwogIGluZ2VzdDogY2FyZCAiSW5nZXN0IiBib2R5PSJyYXcgZXZlbnRzIiBjb2xvcj1zdGVlbGJsdWUgb3BhY2l0eSAwIGF0IDQwLDEyMAogIHBhcnNlOiBjYXJkICJQYXJzZSIgYm9keT0iaW50byByZWNvcmRzIiBjb2xvcj1tZWRpdW1zZWFncmVlbiBvcGFjaXR5IDAgYXQgNDAsMTIwCiAgc3RvcmU6IGNhcmQgIlN0b3JlIiBib2R5PSJ0aW1lIHNlcmllcyIgY29sb3I9ZGFya29yYW5nZSBvcGFjaXR5IDAgYXQgNDAsMTIwCgphbmltYXRlIDUgbG9vcAogIDEKICAgIGluZ2VzdC5vcGFjaXR5OiAxCiAgICBpbmdlc3QudHJhbnNmb3JtLng6IHsgdmFsdWU6IDEzMCwgZWFzaW5nOiAic3ByaW5nIiB9CiAgMgogICAgcGFyc2Uub3BhY2l0eTogMQogICAgcGFyc2UudHJhbnNmb3JtLng6IHsgdmFsdWU6IDMzMCwgZWFzaW5nOiAic3ByaW5nIiB9CiAgMwogICAgc3RvcmUub3BhY2l0eTogMQogICAgc3RvcmUudHJhbnNmb3JtLng6IHsgdmFsdWU6IDUzMCwgZWFzaW5nOiAic3ByaW5nIiB9) · sample: `staggered-cards`

## Camera direction

A `camera` object frames the scene. Animate `look` to walk the viewer through a diagram:
a target can be an object id, a list `(a,b)` to fit several, coordinates, or `all`, and
the camera zooms to fit whatever it looks at.

```
objects
  cam: camera look=all
  a: rect 60x60 radius=6 fill crimson at 50,100
  b: rect 60x60 radius=6 fill limegreen at 300,50
  c: rect 60x60 radius=6 fill royalblue at 550,300

animate 8 loop easing=easeInOut
  2 cam.camera.look: (a)
  4 cam.camera.look: (a,b)
  6 cam.camera.look: (c)
  8 cam.camera.look: all
```

<img src="https://raw.githubusercontent.com/zummed/starch/main/docs/readme/camera.gif" alt="A camera gliding between nodes, fitting one, two, then all of them" width="100%">

[▶ Open in playground](https://zummed.github.io/starch/#dsl=b2JqZWN0cwogIGNhbTogY2FtZXJhIGxvb2s9YWxsCiAgYTogcmVjdCA2MHg2MCByYWRpdXM9NiBmaWxsIGNyaW1zb24gYXQgNTAsMTAwCiAgYjogcmVjdCA2MHg2MCByYWRpdXM9NiBmaWxsIGxpbWVncmVlbiBhdCAzMDAsNTAKICBjOiByZWN0IDYweDYwIHJhZGl1cz02IGZpbGwgcm95YWxibHVlIGF0IDU1MCwzMDAKCmFuaW1hdGUgOCBsb29wIGVhc2luZz1lYXNlSW5PdXQKICAyIGNhbS5jYW1lcmEubG9vazogKGEpCiAgNCBjYW0uY2FtZXJhLmxvb2s6IChhLGIpCiAgNiBjYW0uY2FtZXJhLmxvb2s6IChjKQogIDggY2FtLmNhbWVyYS5sb29rOiBhbGw) · sample: `camera-look-fit`

## Layout engines

Nest children under a container and give it a `layout` — flex, grid, or circular. The
layout solves positions for you, and layout properties (gap, span, slot, angle) animate
like everything else; here the ring advances one slot per second.

```
objects
  ring: ellipse 220x220 stroke slategray width=1 layout circular radius=110 startAngle=0 at 250,170
    n1: rect 50x30 radius=4 fill steelblue
    n2: rect 50x30 radius=4 fill coral
    n3: rect 50x30 radius=4 fill seagreen
    n4: rect 50x30 radius=4 fill gold
    n5: rect 50x30 radius=4 fill mediumpurple
    n6: rect 50x30 radius=4 fill tomato

animate 6 loop easing=easeInOut
  1 ring.layout.startAngle: 60
  2 ring.layout.startAngle: 120
  3 ring.layout.startAngle: 180
  4 ring.layout.startAngle: 240
  5 ring.layout.startAngle: 300
  6 ring.layout.startAngle: 360
```

<img src="https://raw.githubusercontent.com/zummed/starch/main/docs/readme/layout.gif" alt="Six nodes ringed evenly, rotating one slot per second" width="100%">

[▶ Open in playground](https://zummed.github.io/starch/#dsl=b2JqZWN0cwogIHJpbmc6IGVsbGlwc2UgMjIweDIyMCBzdHJva2Ugc2xhdGVncmF5IHdpZHRoPTEgbGF5b3V0IGNpcmN1bGFyIHJhZGl1cz0xMTAgc3RhcnRBbmdsZT0wIGF0IDI1MCwxNzAKICAgIG4xOiByZWN0IDUweDMwIHJhZGl1cz00IGZpbGwgc3RlZWxibHVlCiAgICBuMjogcmVjdCA1MHgzMCByYWRpdXM9NCBmaWxsIGNvcmFsCiAgICBuMzogcmVjdCA1MHgzMCByYWRpdXM9NCBmaWxsIHNlYWdyZWVuCiAgICBuNDogcmVjdCA1MHgzMCByYWRpdXM9NCBmaWxsIGdvbGQKICAgIG41OiByZWN0IDUweDMwIHJhZGl1cz00IGZpbGwgbWVkaXVtcHVycGxlCiAgICBuNjogcmVjdCA1MHgzMCByYWRpdXM9NCBmaWxsIHRvbWF0bwoKYW5pbWF0ZSA2IGxvb3AgZWFzaW5nPWVhc2VJbk91dAogIDEgcmluZy5sYXlvdXQuc3RhcnRBbmdsZTogNjAKICAyIHJpbmcubGF5b3V0LnN0YXJ0QW5nbGU6IDEyMAogIDMgcmluZy5sYXlvdXQuc3RhcnRBbmdsZTogMTgwCiAgNCByaW5nLmxheW91dC5zdGFydEFuZ2xlOiAyNDAKICA1IHJpbmcubGF5b3V0LnN0YXJ0QW5nbGU6IDMwMAogIDYgcmluZy5sYXlvdXQuc3RhcnRBbmdsZTogMzYw) · sample: `circular-layout`

## Live editor

The [playground](https://zummed.github.io/starch/) is where you write these: type on the
left, the diagram redraws on the right as you go, with playback and chapter controls
underneath. Errors show up as you type without blanking the last good frame.

<img src="https://raw.githubusercontent.com/zummed/starch/main/docs/readme/playground.png" alt="The starch playground: sample browser, DSL editor, and the live diagram with playback controls" width="100%">

Its sample browser is also the syntax reference — one minimal sample per feature,
covering flex and grid layouts, slot animation between containers, splines and routed
connectors, state-machine shapes, style animation, and camera rotation.

Diagrams embedded in your own pages can open it too: add `editable` to a
`<starch-diagram>` and its edit button round-trips the DSL back into the page.

## Quick start

A script tag, the same pattern as mermaid. It registers the `<starch-diagram>` element
and exposes a `Starch` global:

```html
<script src="https://unpkg.com/@bitsnbobs/starch/dist/starch-embed.iife.js"></script>

<starch-diagram autoplay>
  a: box "It works" color=steelblue at 100,100
</starch-diagram>
```

Or install it (ESM-only, no dependencies):

```bash
npm install @bitsnbobs/starch
```

```js
import { StarchDiagram } from '@bitsnbobs/starch';

const diagram = new StarchDiagram(container, { dsl, autoplay: true });
```

## Run the playground locally

No clone needed:

```bash
npx @bitsnbobs/starch          # one-off

npm install -g @bitsnbobs/starch
starch                         # or install the `starch` command
```

Both serve it at `http://localhost:4600` and open a browser (`--port <n>`, `--no-open`).

## Checking a document

`starch check` parses a document and reports anything it had to drop:

```bash
starch check diagram.starch        # a file, or several
cat diagram.starch | starch check -    # or stdin
starch check diagram.starch --json     # machine-readable
```

It exits non-zero when a document fails to parse **or** produces a warning. Warnings
matter as much as errors here: the parser drops what it can't match rather than
failing, so a warning means the diagram that renders is not the one that was written —
a misspelled shape or property name shows up as `Node "api" has no properties`.

The same check is available programmatically as
[`parseScene`](#parsescene--checking-and-inspecting-a-document), which needs no DOM —
use that to validate starch inside your own app, or to expose a checking tool to
whatever is generating the diagrams.

To work on starch itself:

```bash
git clone https://github.com/zummed/starch.git
cd starch && npm install
npm run dev                    # playground dev server on :5174
```

## How the DSL is structured

A scene is plain text with meaningful indentation, in up to four parts — directives,
styles, objects, and one `animate` block:

```
name "My scene"            // directives: name, background, viewport
background #14161c
viewport 800x400

style hot                  // reusable styles, applied with @hot
  fill crimson

objects
  a: rect 120x50 radius=8 @hot at 100,100
    aLabel: text "A" size=13 fill white
  b: box "B" color=steelblue at 300,100
  ab: arrow from=a to=b label="to B" color=gray

animate 4 loop
  2 a.opacity: 0.3
  4 a.opacity: 1
```

**Objects and ids.** Every object is `id: type properties...`. Ids must be globally
unique — including nested children — because they're how arrows, animations, and the
camera refer to things. Indenting an object under another makes it a child: children
move with their parent and inherit `fill` and `opacity`.

**Primitives and templates.** The primitives are `rect`, `ellipse`, `text`, `path`,
and `camera`. On top of them, templates auto-size around their label: `box`, `circle`,
`pill`, `card`, `note`, `group`, `textblock`, `codeblock`, `table` — and a state-machine
set (`state.node`, `state.initial`, `state.final`, `state.choice`, `state.region`,
enabled with `use [core, state]`). Both `color` and `colour` are accepted everywhere.

**Arrows and lines.** `arrow from=a to=b label="..." color=...` connects object edges
(not centers) with an arrowhead; `line` is the same without the head. The `a -> b`
form takes waypoints and curve options: `a -> (250,100) -> b radius=15` routes a
polyline, `a -> b bend=1` bends smoothly, and `smooth` fits a spline through waypoints.

**Animation.** `animate <duration> [loop] [easing=...]` opens the timeline. Each
keyframe is a time — absolute (`2`), or relative to the previous one (`+1`), optionally
with `delay=0.5` — followed by `target.property: value` lines. Values hold between
keyframes, and dot-paths reach anything: `row.layout.gap`, `cam.camera.zoom`, and the
parts inside a shape — a `card` named `c` exposes `c.bg`, `c.header`, `c.divider` and
`c.body`, so `c.header.fill` animates its header. `parseScene(dsl).trackPaths` lists
every path a document offers. A value can also be `{ value: 480, easing: "bounce" }` to
ease one track differently. Easings: `linear`, `easeIn/Out/InOut`,
`easeIn/Out/InOutCubic`, `easeIn/Out/InOutQuart`, `easeIn/OutBack`, `bounce`,
`elastic`, `spring`, `snap`, `step`.

**Camera.** `cam: camera look=(300,170) zoom=1.5 ratio=1.78` — `look` accepts a point,
an object id (the camera follows it), `(id,dx,dy)` for an offset, a list `(a,b)` to fit
several objects, or `all`. Without a camera, the view auto-fits the scene. Multiple
cameras can hand off with `active`, and `cam.transform.rotation` rotates the view.

**Chapters.** Named time markers turn an animation into a step-through presentation
(the element's controls and the API expose next/previous):

```
a: rect 100x50 fill steelblue at 100,100

animate 10
  chapters
    chapter "Start" at 0
    chapter "Handshake" at 3
    chapter "Complete" at 7
```

## Embedding

The package ships four entry points:

| Import | What it gives you |
| --- | --- |
| `@bitsnbobs/starch` | Core: `StarchDiagram`, `renderToSVG`, edit-link helpers, parser/renderer building blocks. Framework-free. |
| `@bitsnbobs/starch/react` | `useV2Diagram` hook. Requires React (optional peer dependency). |
| `@bitsnbobs/starch/element` | Registers the `<starch-diagram>` custom element (for apps with a bundler). |
| `@bitsnbobs/starch/embed` | Self-contained IIFE for `<script>` tags — registers the element and exposes the `Starch` global. |

### The `<starch-diagram>` element

```html
<starch-diagram autoplay speed="1.5">...DSL...</starch-diagram>
<starch-diagram src="/diagrams/arch.starch" autoplay></starch-diagram>
```

Hover shows playback controls; parse and fetch errors render as an overlay. From JS the
element is a full player:

```js
const el = document.querySelector('starch-diagram');
el.dsl = newDsl;                       // live-update
el.play(); el.pause(); el.seek(2.5); el.goToChapter('step-2');
el.addEventListener('starch:chapterenter', (e) => { /* e.detail */ });
el.addEventListener('starch:error', (e) => { /* e.detail.message */ });
```

### Markdown code blocks

`Starch.scan()` turns any `<code class="language-starch">` block (or `div.starch`) in
rendered HTML into a live diagram, the same way mermaid does:

```js
Starch.scan();            // whole document
Starch.scan(container);   // or a subtree
```

For MkDocs there's a ready-made plugin:

```bash
pip install mkdocs-starch
```

```yaml
# mkdocs.yml
plugins:
  - starch
```

See [mkdocs-plugin/README.md](mkdocs-plugin/README.md) for options.

### React

```tsx
import { useV2Diagram } from '@bitsnbobs/starch/react';

function App() {
  const diagram = useV2Diagram({ dsl, autoplay: true });
  return <div ref={diagram.containerRef} style={{ width: '100%', height: 400 }} />;
}
```

### Static SVG

No animation loop, no mounted component — for thumbnails, previews, or export:

```js
import { renderToSVG } from '@bitsnbobs/starch';

const svg = renderToSVG(dsl);              // final frame
const svgAtStart = renderToSVG(dsl, { time: 0 });
```

`renderToSVG` needs a DOM (browser, or happy-dom/jsdom in Node) — the README images
above are generated exactly this way ([docs/readme/build.sh](docs/readme/build.sh)).

It throws on malformed DSL, but it does **not** report warnings: a document with a
misspelled shape name renders successfully, just missing that shape. A clean render is
therefore not proof the diagram is right — check with
[`parseScene`](#parsescene--checking-and-inspecting-a-document) or `starch check` when
the DSL was generated rather than hand-written.

### Errors

`setDSL` returns a result instead of throwing, so a live editor can keep the last good
frame on screen while the user types:

```js
const result = diagram.setDSL(newDsl);
// { ok: true, warnings: string[] } | { ok: false, error: string }

diagram.on('error', (e) => console.log(e.message));
diagram.error;     // last parse error, or null
diagram.warnings;  // warnings from the last successful parse
```

### Editing embedded diagrams

Embedded diagrams are players; editing happens in the playground, wired up three ways:

**1. The `editable` attribute** adds an edit button to the element's controls. It opens
the playground in a popup with the current DSL; when the user saves, the diagram
updates in place and fires `starch:edit` so your app can persist the new text:

```html
<starch-diagram editable autoplay>...DSL...</starch-diagram>
```

```js
el.addEventListener('starch:edit', (e) => save(e.detail.dsl));
```

Point `edit-url="https://your-fork.example/"` at your own playground deployment if
you have one.

**2. Edit links.** For a plain "open in playground" link (like the ones under the
examples above), put the DSL in the URL fragment — it never leaves the browser:

```js
import { buildEditUrl } from '@bitsnbobs/starch';

const url = buildEditUrl(dsl);                               // playground in embed mode
const full = buildEditUrl(dsl, undefined, { embed: false }); // full playground, DSL imported as a tab
```

**3. Host your own editing session.** Open the playground yourself — iframe modal or
popup — and listen for postMessage. The playground posts
`{ source: 'starch-playground', type: 'ready' | 'save' | 'cancel', dsl? }` to its
opener/parent; type guards ship in the package:

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

## API reference

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

Events: `chapterEnter`, `chapterExit`, `ended`, `error`.

### `<starch-diagram>` attributes

`src`, `autoplay`, `speed`, `editable`, `edit-url`.

### `Starch` global (embed script only)

```js
Starch.scan(root?, { autoplay });      // upgrade language-starch code blocks in place
Starch.render(container, dsl, opts);   // → StarchDiagram
Starch.renderToSVG(dsl, { time });     // → SVG string
Starch.buildEditUrl(dsl);              // → playground edit link
Starch.StarchDiagram;                  // the classes themselves
Starch.StarchDiagramElement;
```

### `parseScene` — checking and inspecting a document

`parseScene(dsl)` is the programmatic form of `starch check`. It needs **no DOM**, so it
runs anywhere — a build step, a CI job, a server, or a tool your own app exposes to an
AI agent:

```js
import { parseScene } from '@bitsnbobs/starch';

const scene = parseScene(dsl);

scene.warnings;    // string[] — empty means the diagram matches what was written
scene.trackPaths;  // string[] — every dot-path this document can animate
scene.nodes;       // the resolved node tree
scene.animate;     // the parsed timeline, if the document has one
scene.name;        // and description, background, viewport, images, use
```

Two fields matter most when generating starch programmatically:

**`warnings`** is the correctness signal. The parser drops what it can't match rather
than throwing, so a non-empty `warnings` means the rendered diagram is *not* the one
that was written — a misspelled shape or property shows up as `Node "api" has no
properties`, and a document with nothing recognisable in it reports `zero nodes`. Treat
a warning as a failure. Malformed structure (a duplicate id, two geometry fields on one
node) still throws, so wrap the call:

```js
function check(dsl) {
  try {
    const { warnings } = parseScene(dsl);
    return { ok: warnings.length === 0, errors: [], warnings };
  } catch (err) {
    return { ok: false, errors: [err.message], warnings: [] };
  }
}
```

**`trackPaths`** answers "what can I animate here?" — it lists every path the document
exposes, including the parts inside shapes (`c1.bg.fill`, `c1.label.fill` for a box
named `c1`), so you never have to guess a dot-path.

To go all the way to an image, [`renderToSVG(dsl, { time })`](#static-svg) returns an
SVG string — but unlike `parseScene` it requires a DOM, and it renders a document with
warnings without complaint, so check first.

### Lower-level exports

The core entry also exports the pipeline pieces (`buildTimeline`, `evaluateAllTracks`,
`applyTrackValues`, `emitFrame`, `SvgRenderBackend`, `computeViewBox`,
`computeAutoFitViewBox`, layout and text-measurement utilities) for building custom
renderers or tooling on top.

## Development

```bash
npm run dev          # playground dev server
npm test             # run tests
npm run build        # library entries + types
npm run build:embed  # standalone embed (IIFE)
npm run build:app    # playground (also what `npx @bitsnbobs/starch` serves)
npm run build:all    # everything
docs/readme/build.sh # regenerate the README images (needs inkscape, ImageMagick, chrome)
```

Releases are automated: merging to `main` runs semantic-release, which versions and
publishes from the commit messages.

## License

ISC
