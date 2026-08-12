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
 *
 * Every demo is a playground sample rendered verbatim from src/samples —
 * the README shows the same DSL next to the image it produces, and the
 * sample browser is where readers can try it.
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
  /** output file name (hero.gif, shapes.png, ...) */
  name: string;
  /** sample name in src/samples/index.ts */
  sample: string;
  kind: 'gif' | 'png';
  /** seconds of animation to capture (gif) — normally the loop length */
  capture?: number;
  fps?: number;
}

const demos: Demo[] = [
  { name: 'hero', sample: '22-request-flow', kind: 'gif', capture: 7 },
  { name: 'shapes', sample: 'template-tour', kind: 'png' },
  { name: 'animate', sample: '14-staggered-cards', kind: 'gif', capture: 5 },
  { name: 'camera', sample: '20-camera-look-fit', kind: 'gif', capture: 8 },
  { name: 'layout', sample: '17-layout-circular', kind: 'gif', capture: 6 },
];

const { renderToSVG: renderRaw } = await import('../../src/renderStatic');
const { buildEditUrl } = await import('../../src/editing');
const { v2Samples } = await import('../../src/samples/index');

function dslOf(demo: Demo): string {
  const s = v2Samples.find(s => s.name === demo.sample);
  if (!s) throw new Error(`sample not found: ${demo.sample}`);
  return s.dsl;
}

if (process.argv.includes('--urls')) {
  for (const demo of demos) {
    console.log(`${demo.name}: ${buildEditUrl(dslOf(demo), undefined, { embed: false })}`);
  }
  process.exit(0);
}

/** Inkscape (SVG 1.1) rejects CSS3 rgba() paints — split into rgb() + opacity attrs. */
function rgbaToRgb(svg: string): string {
  return svg.replace(
    /(fill|stroke|stop-color)="rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)"/g,
    (_m, attr, r, g, b, a) =>
      a === '1' ? `${attr}="rgb(${r},${g},${b})"` : `${attr}="rgb(${r},${g},${b})" ${attr}-opacity="${a}"`,
  );
}

/**
 * A label halo is a narrow stroke plus a blurred copy that carries it outward
 * (see applyHalo in the SVG backend). Inkscape ignores CSS filter functions
 * outright — rendering with and without them is pixel-identical — so only the
 * narrow stroke survives and an arrow reads straight through its own label.
 * Nothing here renders the blur, so spend it on the stroke it was widening.
 */
function haloToStroke(svg: string): string {
  return svg.replace(/<text\b[^>]*>/g, tag => {
    const blur = tag.match(/filter="drop-shadow\(0 0 ([\d.]+)px/);
    if (!blur) return tag;
    return tag
      .replace(/ filter="[^"]*"/, '')
      .replace(/stroke-width="([\d.]+)"/, (_m, w) => `stroke-width="${Number(w) + Number(blur[1])}"`);
  });
}

/** Every transform the rasterizer needs, applied to a frame on its way out. */
function inkscapeSafe(svg: string): string {
  return haloToStroke(rgbaToRgb(svg));
}

/**
 * Auto-fit recomputes the viewBox per frame, which jitters as content
 * moves — pin every frame to the union of all frames' boxes. Camera-driven
 * samples keep their own per-frame viewBox (the movement is the point).
 */
function pinViewBoxes(frames: string[]): string[] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of frames) {
    const m = f.match(/viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/);
    if (!m) continue;
    const [x, y, w, h] = m.slice(1).map(Number);
    x0 = Math.min(x0, x); y0 = Math.min(y0, y);
    x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h);
  }
  const union = `viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}"`;
  return frames.map(f => f.replace(/viewBox="[^"]*"/, union));
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

for (const demo of demos) {
  const dsl = dslOf(demo);
  if (demo.kind === 'png') {
    fs.writeFileSync(path.join(OUT, `${demo.name}.svg`), inkscapeSafe(renderRaw(dsl)));
    console.log(`still  ${demo.name} (${demo.sample})`);
  } else {
    const dir = path.join(OUT, demo.name);
    fs.mkdirSync(dir, { recursive: true });
    const fps = demo.fps ?? 10;
    const n = Math.round((demo.capture ?? 5) * fps);
    let frames: string[] = [];
    for (let i = 0; i < n; i++) {
      frames.push(inkscapeSafe(renderRaw(dsl, { time: i / fps })));
    }
    if (!/camera/.test(dsl)) frames = pinViewBoxes(frames);
    frames.forEach((f, i) =>
      fs.writeFileSync(path.join(dir, `f${String(i).padStart(4, '0')}.svg`), f));
    console.log(`frames ${demo.name} (${demo.sample}): ${n}`);
  }
}
console.log(`frames written to ${OUT}`);
