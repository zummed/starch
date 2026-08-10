<div align="center">

# starch

**Write text. Get animated diagrams.**

Keyframe animation, camera direction, and flex/grid layout for SVG diagrams —
all driven by a small plain-text DSL you can diff, review, and version-control.

[**Playground**](https://zummed.github.io/starch/) · [npm](https://www.npmjs.com/package/@bitsnbobs/starch) · [MkDocs plugin](mkdocs-plugin/README.md)

![Animated starch diagram — a request pulses from a client through an API to a database and cache](https://raw.githubusercontent.com/zummed/starch/main/docs/readme/hero.gif)

</div>

<details>
<summary>This diagram is ~40 lines of text — expand them, or <a href="https://zummed.github.io/starch/#dsl=YmFja2dyb3VuZCAjMTQxNjFjCgpvYmplY3RzCiAgY2xpZW50OiBhdCA5MCwxMjAKICAgIGNsaWVudEJnOiByZWN0IDEyMHg1MCByYWRpdXM9MTAgZmlsbCAjMTYyMDJlIHN0cm9rZSAjMjJkM2VlIHdpZHRoPTIKICAgIGNsaWVudExhYmVsOiB0ZXh0ICJDbGllbnQiIHNpemU9MTMgZmlsbCAjZTJlOGYwCiAgYXBpOiBvcGFjaXR5IDAgYXQgMzMwLDEyMAogICAgYXBpQmc6IHJlY3QgMTIweDUwIHJhZGl1cz0xMCBmaWxsICMxNjIwMmUgc3Ryb2tlICMzNGQzOTkgd2lkdGg9MgogICAgYXBpTGFiZWw6IHRleHQgIkFQSSIgc2l6ZT0xMyBmaWxsICNlMmU4ZjAKICBkYjogb3BhY2l0eSAwIGF0IDU3MCwxMjAKICAgIGRiQmc6IHJlY3QgMTIweDUwIHJhZGl1cz0xMCBmaWxsICMxNjIwMmUgc3Ryb2tlICNmYmJmMjQgd2lkdGg9MgogICAgZGJMYWJlbDogdGV4dCAiRGF0YWJhc2UiIHNpemU9MTMgZmlsbCAjZTJlOGYwCiAgY2FjaGU6IG9wYWNpdHkgMCBhdCAzMzAsMjcwCiAgICBjYWNoZUJnOiByZWN0IDEyMHg1MCByYWRpdXM9MTAgZmlsbCAjMTYyMDJlIHN0cm9rZSAjZjQ3MmI2IHdpZHRoPTIKICAgIGNhY2hlTGFiZWw6IHRleHQgIkNhY2hlIiBzaXplPTEzIGZpbGwgI2UyZThmMAogIHJlcTogYXJyb3cgZnJvbT1jbGllbnQgdG89YXBpIGxhYmVsPSJyZXF1ZXN0IiBjb2xvcj0jN2Q4NTkwIG9wYWNpdHkgMAogIHE6IGFycm93IGZyb209YXBpIHRvPWRiIGxhYmVsPSJxdWVyeSIgY29sb3I9IzdkODU5MCBvcGFjaXR5IDAKICBoaXQ6IGFycm93IGZyb209YXBpIHRvPWNhY2hlIGxhYmVsPSJob3QgcGF0aCIgY29sb3I9IzdkODU5MCBvcGFjaXR5IDAKICBwdWxzZTogZWxsaXBzZSA4eDggZmlsbCAjMjJkM2VlIG9wYWNpdHkgMCBhdCAxNjAsMTIwCgphbmltYXRlIDcgbG9vcCBlYXNpbmc9ZWFzZUluT3V0CiAgMC45CiAgICBhcGkub3BhY2l0eTogMQogICAgcmVxLm9wYWNpdHk6IDEKICAxLjgKICAgIGRiLm9wYWNpdHk6IDEKICAgIHEub3BhY2l0eTogMQogIDIuNwogICAgY2FjaGUub3BhY2l0eTogMQogICAgaGl0Lm9wYWNpdHk6IDEKICAzLjYgcHVsc2Uub3BhY2l0eTogMQogIDMuNjEgcHVsc2UudHJhbnNmb3JtLng6IDE2MAogIDQuNQogICAgcHVsc2UudHJhbnNmb3JtLng6IDMzMAogICAgcHVsc2UuZmlsbDogIzM0ZDM5OQogIDUuNAogICAgcHVsc2UudHJhbnNmb3JtLng6IDU0MAogICAgcHVsc2UuZmlsbDogI2ZiYmYyNAogIDUuNyBwdWxzZS5vcGFjaXR5OiAwCg">open this diagram in the playground</a>.</summary>

```
background #14161c

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
  pulse: ellipse 8x8 fill #22d3ee opacity 0 at 160,120

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
  3.6 pulse.opacity: 1
  3.61 pulse.transform.x: 160
  4.5
    pulse.transform.x: 330
    pulse.fill: #34d399
  5.4
    pulse.transform.x: 540
    pulse.fill: #fbbf24
  5.7 pulse.opacity: 0
```

</details>

Every example below is a complete, real program — the image next to it was rendered from
that exact text, and the *open in playground* link loads it live in your browser.

## Shapes, templates, and arrows

Declare objects with ids, position them, connect them. Templates like `box`, `circle`,
`pill`, `card`, and `note` bundle a background, label, and auto-sizing in one line.

<table>
<tr>
<td width="52%" valign="top">

```
background #14161c

objects
  api: box "API gateway" color=steelblue at 100,70
  worker: circle "Worker" color=mediumseagreen at 340,70
  status: pill "healthy" color=darkorange at 500,70
  doc: note "Plain text in, diagrams out." at 100,210
  info: card "Card" body="With body text" color=mediumpurple at 340,215
  link: arrow from=api to=worker label="jobs" color=steelblue
```

[▶ Open in playground](https://zummed.github.io/starch/#dsl=YmFja2dyb3VuZCAjMTQxNjFjCgpvYmplY3RzCiAgYXBpOiBib3ggIkFQSSBnYXRld2F5IiBjb2xvcj1zdGVlbGJsdWUgYXQgMTAwLDcwCiAgd29ya2VyOiBjaXJjbGUgIldvcmtlciIgY29sb3I9bWVkaXVtc2VhZ3JlZW4gYXQgMzQwLDcwCiAgc3RhdHVzOiBwaWxsICJoZWFsdGh5IiBjb2xvcj1kYXJrb3JhbmdlIGF0IDUwMCw3MAogIGRvYzogbm90ZSAiUGxhaW4gdGV4dCBpbiwgZGlhZ3JhbXMgb3V0LiIgYXQgMTAwLDIxMAogIGluZm86IGNhcmQgIkNhcmQiIGJvZHk9IldpdGggYm9keSB0ZXh0IiBjb2xvcj1tZWRpdW1wdXJwbGUgYXQgMzQwLDIxNQogIGxpbms6IGFycm93IGZyb209YXBpIHRvPXdvcmtlciBsYWJlbD0iam9icyIgY29sb3I9c3RlZWxibHVlCg)

</td>
<td valign="top">

<img src="https://raw.githubusercontent.com/zummed/starch/main/docs/readme/shapes.png" alt="Rendered shapes: boxes, a circle, a pill, a note, a card, and a labelled arrow" width="100%">

</td>
</tr>
</table>

## Keyframe animation

An `animate` block sets property values at points in time; starch interpolates between
them. Any property is animatable — position, color, opacity, layout, camera — with 18
easing curves.

<table>
<tr>
<td width="52%" valign="top">

```
background #14161c

objects
  linear: ellipse 18x18 fill #22d3ee at 150,50
  l1: text "linear" size=11 align=end fill #7d8590 at 130,50
  easeInOut: ellipse 18x18 fill #34d399 at 150,95
  l2: text "easeInOut" size=11 align=end fill #7d8590 at 130,95
  easeOutBack: ellipse 18x18 fill #fbbf24 at 150,140
  l3: text "easeOutBack" size=11 align=end fill #7d8590 at 130,140
  bounce: ellipse 18x18 fill #f472b6 at 150,185
  l4: text "bounce" size=11 align=end fill #7d8590 at 130,185

animate 4 loop
  1.8
    linear.transform.x: { value: 480, easing: "linear" }
    easeInOut.transform.x: { value: 480, easing: "easeInOut" }
    easeOutBack.transform.x: { value: 480, easing: "easeOutBack" }
    bounce.transform.x: { value: 480, easing: "bounce" }
  3.8
    linear.transform.x: { value: 150, easing: "easeInOut" }
    easeInOut.transform.x: { value: 150, easing: "easeInOut" }
    easeOutBack.transform.x: { value: 150, easing: "easeInOut" }
    bounce.transform.x: { value: 150, easing: "easeInOut" }
```

[▶ Open in playground](https://zummed.github.io/starch/#dsl=YmFja2dyb3VuZCAjMTQxNjFjCgpvYmplY3RzCiAgbGluZWFyOiBlbGxpcHNlIDE4eDE4IGZpbGwgIzIyZDNlZSBhdCAxNTAsNTAKICBsMTogdGV4dCAibGluZWFyIiBzaXplPTExIGFsaWduPWVuZCBmaWxsICM3ZDg1OTAgYXQgMTMwLDUwCiAgZWFzZUluT3V0OiBlbGxpcHNlIDE4eDE4IGZpbGwgIzM0ZDM5OSBhdCAxNTAsOTUKICBsMjogdGV4dCAiZWFzZUluT3V0IiBzaXplPTExIGFsaWduPWVuZCBmaWxsICM3ZDg1OTAgYXQgMTMwLDk1CiAgZWFzZU91dEJhY2s6IGVsbGlwc2UgMTh4MTggZmlsbCAjZmJiZjI0IGF0IDE1MCwxNDAKICBsMzogdGV4dCAiZWFzZU91dEJhY2siIHNpemU9MTEgYWxpZ249ZW5kIGZpbGwgIzdkODU5MCBhdCAxMzAsMTQwCiAgYm91bmNlOiBlbGxpcHNlIDE4eDE4IGZpbGwgI2Y0NzJiNiBhdCAxNTAsMTg1CiAgbDQ6IHRleHQgImJvdW5jZSIgc2l6ZT0xMSBhbGlnbj1lbmQgZmlsbCAjN2Q4NTkwIGF0IDEzMCwxODUKCmFuaW1hdGUgNCBsb29wCiAgMS44CiAgICBsaW5lYXIudHJhbnNmb3JtLng6IHsgdmFsdWU6IDQ4MCwgZWFzaW5nOiAibGluZWFyIiB9CiAgICBlYXNlSW5PdXQudHJhbnNmb3JtLng6IHsgdmFsdWU6IDQ4MCwgZWFzaW5nOiAiZWFzZUluT3V0IiB9CiAgICBlYXNlT3V0QmFjay50cmFuc2Zvcm0ueDogeyB2YWx1ZTogNDgwLCBlYXNpbmc6ICJlYXNlT3V0QmFjayIgfQogICAgYm91bmNlLnRyYW5zZm9ybS54OiB7IHZhbHVlOiA0ODAsIGVhc2luZzogImJvdW5jZSIgfQogIDMuOAogICAgbGluZWFyLnRyYW5zZm9ybS54OiB7IHZhbHVlOiAxNTAsIGVhc2luZzogImVhc2VJbk91dCIgfQogICAgZWFzZUluT3V0LnRyYW5zZm9ybS54OiB7IHZhbHVlOiAxNTAsIGVhc2luZzogImVhc2VJbk91dCIgfQogICAgZWFzZU91dEJhY2sudHJhbnNmb3JtLng6IHsgdmFsdWU6IDE1MCwgZWFzaW5nOiAiZWFzZUluT3V0IiB9CiAgICBib3VuY2UudHJhbnNmb3JtLng6IHsgdmFsdWU6IDE1MCwgZWFzaW5nOiAiZWFzZUluT3V0IiB9Cg)

</td>
<td valign="top">

<img src="https://raw.githubusercontent.com/zummed/starch/main/docs/readme/animate.gif" alt="Four dots racing with different easing curves" width="100%">

</td>
</tr>
</table>

## Camera direction

A `camera` object frames the scene. Animate `look` and `zoom` to guide the viewer
through a diagram step by step — targets can be coordinates, object ids, or `all`.

<table>
<tr>
<td width="52%" valign="top">

```
background #14161c

objects
  cam: camera look=(300,170) zoom=1.1
  a: box "Service A" color=steelblue at 140,90
  b: box "Service B" color=mediumseagreen at 460,90
  q: box "Queue" color=darkorange at 300,260
  ab: arrow from=a to=b color=slategray
  aq: arrow from=a to=q color=slategray
  qb: arrow from=q to=b color=slategray

animate 8 loop easing=easeInOutCubic
  1.6
    cam.camera.look: a
    cam.camera.zoom: 2.2
  3.2
    cam.camera.look: q
  4.8
    cam.camera.look: b
  6.4
    cam.camera.look: (300,170)
    cam.camera.zoom: 1.1
```

[▶ Open in playground](https://zummed.github.io/starch/#dsl=YmFja2dyb3VuZCAjMTQxNjFjCgpvYmplY3RzCiAgY2FtOiBjYW1lcmEgbG9vaz0oMzAwLDE3MCkgem9vbT0xLjEKICBhOiBib3ggIlNlcnZpY2UgQSIgY29sb3I9c3RlZWxibHVlIGF0IDE0MCw5MAogIGI6IGJveCAiU2VydmljZSBCIiBjb2xvcj1tZWRpdW1zZWFncmVlbiBhdCA0NjAsOTAKICBxOiBib3ggIlF1ZXVlIiBjb2xvcj1kYXJrb3JhbmdlIGF0IDMwMCwyNjAKICBhYjogYXJyb3cgZnJvbT1hIHRvPWIgY29sb3I9c2xhdGVncmF5CiAgYXE6IGFycm93IGZyb209YSB0bz1xIGNvbG9yPXNsYXRlZ3JheQogIHFiOiBhcnJvdyBmcm9tPXEgdG89YiBjb2xvcj1zbGF0ZWdyYXkKCmFuaW1hdGUgOCBsb29wIGVhc2luZz1lYXNlSW5PdXRDdWJpYwogIDEuNgogICAgY2FtLmNhbWVyYS5sb29rOiBhCiAgICBjYW0uY2FtZXJhLnpvb206IDIuMgogIDMuMgogICAgY2FtLmNhbWVyYS5sb29rOiBxCiAgNC44CiAgICBjYW0uY2FtZXJhLmxvb2s6IGIKICA2LjQKICAgIGNhbS5jYW1lcmEubG9vazogKDMwMCwxNzApCiAgICBjYW0uY2FtZXJhLnpvb206IDEuMQo)

</td>
<td valign="top">

<img src="https://raw.githubusercontent.com/zummed/starch/main/docs/readme/camera.gif" alt="A camera panning and zooming between three services" width="100%">

</td>
</tr>
</table>

## Layout engines

Nest children under a container and give it a `layout` — flex, grid, or circular. The
layout solves positions for you, and layout properties (gap, span, slot) animate like
everything else.

<table>
<tr>
<td width="52%" valign="top">

```
background #14161c

objects
  row: rect 400x74 radius=10 fill #16202e stroke #2b3444 width=1 layout flex row gap=12 justify=center align=center at 250,60
    fa: rect 90x42 radius=6 fill #22d3ee
    fb: rect 90x42 radius=6 fill #34d399
    fc: rect 90x42 radius=6 fill #f472b6
  dash: rect 400x170 radius=10 fill #16202e stroke #2b3444 width=1 layout grid columns=3 gap=10 padding=12 align=start at 250,215
    m1: rect 0x40 radius=6 fill #22d3ee
    m2: rect 0x40 radius=6 fill #34d399
    m3: rect 0x40 radius=6 fill #f472b6
    chart: rect 0x84 radius=6 fill #3b4658 layout gridCol=1 colSpan=2
    sidebar: rect 0x84 radius=6 fill #a78bfa

animate 6 loop easing=easeInOut
  3
    row.layout.gap: 48
    dash.chart.layout.colSpan: 1
  6
    row.layout.gap: 12
    dash.chart.layout.colSpan: 2
```

[▶ Open in playground](https://zummed.github.io/starch/#dsl=YmFja2dyb3VuZCAjMTQxNjFjCgpvYmplY3RzCiAgcm93OiByZWN0IDQwMHg3NCByYWRpdXM9MTAgZmlsbCAjMTYyMDJlIHN0cm9rZSAjMmIzNDQ0IHdpZHRoPTEgbGF5b3V0IGZsZXggcm93IGdhcD0xMiBqdXN0aWZ5PWNlbnRlciBhbGlnbj1jZW50ZXIgYXQgMjUwLDYwCiAgICBmYTogcmVjdCA5MHg0MiByYWRpdXM9NiBmaWxsICMyMmQzZWUKICAgIGZiOiByZWN0IDkweDQyIHJhZGl1cz02IGZpbGwgIzM0ZDM5OQogICAgZmM6IHJlY3QgOTB4NDIgcmFkaXVzPTYgZmlsbCAjZjQ3MmI2CiAgZGFzaDogcmVjdCA0MDB4MTcwIHJhZGl1cz0xMCBmaWxsICMxNjIwMmUgc3Ryb2tlICMyYjM0NDQgd2lkdGg9MSBsYXlvdXQgZ3JpZCBjb2x1bW5zPTMgZ2FwPTEwIHBhZGRpbmc9MTIgYWxpZ249c3RhcnQgYXQgMjUwLDIxNQogICAgbTE6IHJlY3QgMHg0MCByYWRpdXM9NiBmaWxsICMyMmQzZWUKICAgIG0yOiByZWN0IDB4NDAgcmFkaXVzPTYgZmlsbCAjMzRkMzk5CiAgICBtMzogcmVjdCAweDQwIHJhZGl1cz02IGZpbGwgI2Y0NzJiNgogICAgY2hhcnQ6IHJlY3QgMHg4NCByYWRpdXM9NiBmaWxsICMzYjQ2NTggbGF5b3V0IGdyaWRDb2w9MSBjb2xTcGFuPTIKICAgIHNpZGViYXI6IHJlY3QgMHg4NCByYWRpdXM9NiBmaWxsICNhNzhiZmEKCmFuaW1hdGUgNiBsb29wIGVhc2luZz1lYXNlSW5PdXQKICAzCiAgICByb3cubGF5b3V0LmdhcDogNDgKICAgIGRhc2guY2hhcnQubGF5b3V0LmNvbFNwYW46IDEKICA2CiAgICByb3cubGF5b3V0LmdhcDogMTIKICAgIGRhc2guY2hhcnQubGF5b3V0LmNvbFNwYW46IDIK)

</td>
<td valign="top">

<img src="https://raw.githubusercontent.com/zummed/starch/main/docs/readme/layout.gif" alt="A flex row breathing its gap apart while a grid reflows around a resizing cell" width="100%">

</td>
</tr>
</table>

There's more in the [playground](https://zummed.github.io/starch/)'s sample browser:
smooth splines and routed connectors, state-machine shapes, style animation, camera
rotation, circular layout, and slot animation between containers.

## Quick start

The fastest way in is a script tag — the same pattern as mermaid. It registers the
`<starch-diagram>` element and exposes a `Starch` global:

```html
<script src="https://unpkg.com/@bitsnbobs/starch/dist/starch-embed.iife.js"></script>

<starch-diagram autoplay>
  a: box "It works" color=steelblue at 100,100
</starch-diagram>
```

Or install the package (ESM-only, no dependencies required):

```bash
npm install @bitsnbobs/starch
```

```js
import { StarchDiagram } from '@bitsnbobs/starch';

const diagram = new StarchDiagram(container, { dsl, autoplay: true });
```

## Run the playground locally

The [playground](https://zummed.github.io/starch/) — live editor, sample browser,
playback controls — also runs on your machine, no clone needed:

```bash
npx @bitsnbobs/starch          # one-off

npm install -g @bitsnbobs/starch
starch                         # or install the `starch` command
```

Either serves the playground at `http://localhost:4600` and opens your browser
(`--port <n>` and `--no-open` to taste). To hack on starch itself:

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
keyframes, and dot-paths reach anything: `card.badge.fill`, `row.layout.gap`,
`cam.camera.zoom`. A value can also be `{ value: 480, easing: "bounce" }` to ease one
track differently. Easings: `linear`, `easeIn/Out/InOut`, `easeIn/Out/InOutCubic`,
`easeIn/Out/InOutQuart`, `easeIn/OutBack`, `bounce`, `elastic`, `spring`, `snap`,
`step`, `cut`.

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

The playground's sample browser doubles as the syntax reference — every feature has a
minimal sample you can edit live.

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

Hover shows playback controls; parse and fetch errors appear as an overlay instead of
failing silently. From JS the element is a full player:

```js
const el = document.querySelector('starch-diagram');
el.dsl = newDsl;                       // live-update
el.play(); el.pause(); el.seek(2.5); el.goToChapter('step-2');
el.addEventListener('starch:chapterenter', (e) => { /* e.detail */ });
el.addEventListener('starch:error', (e) => { /* e.detail.message */ });
```

### Markdown code blocks

`Starch.scan()` upgrades fenced code blocks in rendered HTML the same way mermaid
does — any `<code class="language-starch">` block (or `div.starch`) becomes a live
diagram:

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

For thumbnails, previews, or export — no animation loop, no mounted component:

```js
import { renderToSVG } from '@bitsnbobs/starch';

const svg = renderToSVG(dsl);              // final frame
const svgAtStart = renderToSVG(dsl, { time: 0 });
```

`renderToSVG` throws on invalid DSL. It needs a DOM (browser, or happy-dom/jsdom in
Node) — the README images above are generated exactly this way
([docs/readme/build.sh](docs/readme/build.sh)).

### Errors are never silent

`setDSL` returns a result instead of throwing, so live editors can keep the last good
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

For lightweight in-place editing without the playground, a `<textarea>` plus `setDSL`
is enough — errors surface in the result while the last good frame stays rendered.

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

### Lower-level exports

The core entry also exports the pipeline pieces (`parseScene`, `buildTimeline`,
`evaluateAllTracks`, `applyTrackValues`, `emitFrame`, `SvgRenderBackend`,
`computeViewBox`, `computeAutoFitViewBox`, layout and text-measurement utilities) for
building custom renderers or tooling on top.

## Development

```bash
npm run dev          # playground dev server
npm test             # run tests
npm run build        # library entries + types
npm run build:embed  # standalone embed (IIFE)
npm run build:app    # playground (also what `npx @bitsnbobs/starch` serves)
npm run build:all    # everything
docs/readme/build.sh # regenerate the README images (needs inkscape + ImageMagick)
```

Releases are automated: merging to `main` runs semantic-release, which versions and
publishes from the commit messages.

## License

ISC
