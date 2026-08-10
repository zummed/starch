/**
 * Renders the README demo diagrams to per-frame SVGs using renderToSVG,
 * headless via happy-dom. Run through ./build.sh, which rasterizes the
 * frames (inkscape) and assembles the GIFs (ImageMagick) into this
 * directory. Standalone:
 *
 *   npx vite-node docs/readme/generate.ts           # render frames
 *   npx vite-node docs/readme/generate.ts --urls    # print playground links only
 *
 * Frames go to $FRAMES_DIR (default: <os tmpdir>/starch-readme-frames).
 * Each demo is a complete, real program — the README shows this exact DSL
 * next to the image it produces, so keep them in sync.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Window } from 'happy-dom';

const win = new Window();
(globalThis as any).window = win;
(globalThis as any).document = win.document;

const OUT = process.env.FRAMES_DIR ?? path.join(os.tmpdir(), 'starch-readme-frames');

interface Demo {
  name: string;
  kind: 'gif' | 'png';
  /** seconds of animation to capture (gif) */
  capture?: number;
  fps?: number;
  /** pin the frame — auto-fit recomputes per frame and would jitter as things move */
  viewBox?: string;
  dsl: string;
}

const BG = '#14161c';

const demos: Demo[] = [
  {
    name: 'hero',
    kind: 'gif',
    capture: 7,
    fps: 10,
    viewBox: '10 75 640 240',
    dsl: `background ${BG}

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
`,
  },
  {
    name: 'shapes',
    kind: 'png',
    dsl: `background ${BG}

objects
  api: box "API gateway" color=steelblue at 100,70
  worker: circle "Worker" color=mediumseagreen at 340,70
  status: pill "healthy" color=darkorange at 500,70
  doc: note "Plain text in, diagrams out." at 100,210
  info: card "Card" body="With body text" color=mediumpurple at 340,215
  link: arrow from=api to=worker label="jobs" color=steelblue
`,
  },
  {
    name: 'animate',
    kind: 'gif',
    capture: 4,
    fps: 10,
    viewBox: '40 25 510 200',
    dsl: `background ${BG}

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
`,
  },
  {
    name: 'camera',
    kind: 'gif',
    capture: 8,
    fps: 10,
    dsl: `background ${BG}

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
`,
  },
  {
    name: 'layout',
    kind: 'gif',
    capture: 6,
    fps: 10,
    dsl: `background ${BG}

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
`,
  },
];

const { renderToSVG: renderRaw } = await import('../../src/renderStatic');
const { buildEditUrl } = await import('../../src/editing');

if (process.argv.includes('--urls')) {
  for (const demo of demos) {
    console.log(`${demo.name}: ${buildEditUrl(demo.dsl, undefined, { embed: false })}`);
  }
  process.exit(0);
}

/** Inkscape (SVG 1.1) rejects CSS3 rgba() paints — split into rgb() + opacity attrs. */
function inkscapeSafe(svg: string): string {
  return svg.replace(
    /(fill|stroke|stop-color)="rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)"/g,
    (_m, attr, r, g, b, a) =>
      a === '1' ? `${attr}="rgb(${r},${g},${b})"` : `${attr}="rgb(${r},${g},${b})" ${attr}-opacity="${a}"`,
  );
}

function frame(demo: Demo, time?: number): string {
  let svg = inkscapeSafe(renderRaw(demo.dsl, time === undefined ? undefined : { time }));
  if (demo.viewBox) svg = svg.replace(/viewBox="[^"]*"/, `viewBox="${demo.viewBox}"`);
  return svg;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

for (const demo of demos) {
  if (demo.kind === 'png') {
    fs.writeFileSync(path.join(OUT, `${demo.name}.svg`), frame(demo));
    console.log(`still  ${demo.name}`);
  } else {
    const dir = path.join(OUT, demo.name);
    fs.mkdirSync(dir, { recursive: true });
    const fps = demo.fps ?? 10;
    const n = Math.round((demo.capture ?? 5) * fps);
    for (let i = 0; i < n; i++) {
      fs.writeFileSync(path.join(dir, `f${String(i).padStart(4, '0')}.svg`), frame(demo, i / fps));
    }
    console.log(`frames ${demo.name}: ${n}`);
  }
}
console.log(`frames written to ${OUT}`);
