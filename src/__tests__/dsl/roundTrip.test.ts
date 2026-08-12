import { describe, it, expect } from 'vitest';
import { walkDocument } from '../../dsl/schemaWalker';
import { buildAstFromModel } from '../../dsl/astEmitter';
import { emptyFormatHints } from '../../dsl/formatHints';
import { flattenLeaves } from '../../dsl/astTypes';
import { v2Samples } from '../../samples';
import { registerBuiltinTemplates } from '../../templates/index';

// Under the conditions parseScene creates. Without this the registry is empty,
// so `card "Ingest" body="..."` parses to a bare `{id}` with the whole line
// dropped — and round-trips perfectly, because both parses drop it equally.
// The harness was proving the contract only for the grammar that doesn't
// involve shapes, which is most of what the editor actually edits.
registerBuiltinTemplates();

/**
 * The round-trip harness — the reliability contract for "object definitions
 * drive everything right through to the idea".
 *
 * The editor is text-first: it continuously parses DSL → model (the "idea")
 * and applies popup edits back. So the model ⇄ text relationship MUST be a
 * faithful inverse. Both directions are driven by the same DslHints on the
 * Zod object definitions, and these tests prove they stay in lock-step:
 *
 *   parse-first:  text → M1 → emit → text2 → parse → M2     (M1 deep-equals M2)
 *   idempotent:   emit(M1) === emit(parse(emit(M1)))        (text is stable)
 *   ast-integrity every emitted leaf maps to its own text, no leaf spans \n
 */

const hints = emptyFormatHints();
const norm = (m: unknown) => JSON.parse(JSON.stringify(m));

/** Human-readable recursive diff (dotted paths) for failure messages. */
function diff(a: any, b: any, path = '', out: string[] = []): string[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      diff(a[k], b[k], path ? `${path}.${k}` : k, out);
    }
    return out;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) diff(a?.[i], b?.[i], `${path}[${i}]`, out);
    return out;
  }
  out.push(`${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
  return out;
}

/** Assert text → model is a faithful inverse of model → text, both ways. */
function assertParseFirstRoundTrip(dsl: string): { m1: any; text2: string } {
  const m1 = norm(walkDocument(dsl).model);
  const text2 = buildAstFromModel(m1, hints).text;
  const m2 = norm(walkDocument(text2).model);
  const d = diff(m1, m2);
  if (d.length) {
    throw new Error(`round-trip drift:\n${d.join('\n')}\n--- emitted text ---\n${text2}`);
  }
  // Idempotency: re-emitting the re-parsed model yields identical text.
  const text3 = buildAstFromModel(m2, hints).text;
  expect(text3).toBe(text2);
  // AST integrity: every leaf maps to its own slice and never spans a newline.
  const { ast } = buildAstFromModel(m1, hints);
  for (const leaf of flattenLeaves(ast)) {
    const slice = text2.slice(leaf.from, leaf.to);
    expect(slice).not.toContain('\n');
  }
  return { m1, text2 };
}

// ─── Sample corpus ───────────────────────────────────────────────

describe('round-trip: all showcase samples', () => {
  for (const sample of v2Samples) {
    it(`${sample.category}/${sample.name}`, () => {
      assertParseFirstRoundTrip(sample.dsl);
    });
  }
});

// ─── Curated feature corpus (every DSL surface) ──────────────────

const FEATURE_CORPUS: Array<{ name: string; dsl: string }> = [
  // Geometry
  { name: 'rect + radius', dsl: 'b: rect 140x80 radius=8' },
  { name: 'ellipse', dsl: 'e: ellipse 50x40' },
  { name: 'text full', dsl: 't: text "Hi there" size=14 lineHeight=1.5 align=end bold mono' },
  { name: 'image full', dsl: 'i: image "photo.png" 200x150 fit=cover padding=4' },
  { name: 'camera all', dsl: 'c: camera look=all zoom=2 ratio=1.78 active' },
  { name: 'camera target id', dsl: 'c: camera look=box zoom=1.5' },
  { name: 'camera xy', dsl: 'c: camera look=(300,200) zoom=1' },
  { name: 'camera offset', dsl: 'c: camera look=(box,10,20)' },
  // Fill color forms
  { name: 'fill named', dsl: 'b: rect 10x10 fill steelblue' },
  { name: 'fill hsl', dsl: 'b: rect 10x10 fill hsl 210 70 45' },
  { name: 'fill hsl alpha', dsl: 'b: rect 10x10 fill hsl 210 70 45 a=0.5' },
  { name: 'fill bare hsl', dsl: 'b: rect 10x10 fill 210 70 45' },
  { name: 'fill rgb', dsl: 'b: rect 10x10 fill rgb 12 34 56' },
  { name: 'fill hex', dsl: 'b: rect 10x10 fill #3a7bd5' },
  { name: 'fill named alpha', dsl: 'b: rect 10x10 fill black a=0.7' },
  // Stroke
  { name: 'stroke + width', dsl: 'b: rect 10x10 stroke red width=2' },
  { name: 'stroke hsl alpha', dsl: 'b: rect 10x10 stroke hsl 0 0 60 a=0.5 width=3' },
  // Transform
  { name: 'transform xy', dsl: 'b: rect 10x10 at 200,150' },
  { name: 'transform x only', dsl: 'b: rect 10x10 at x=50' },
  { name: 'transform y only', dsl: 'b: rect 10x10 at y=-20' },
  { name: 'transform full', dsl: 'b: rect 10x10 at 10,20 rotation=45 scale=2 anchor=N pathFollow=p pathProgress=0.5' },
  // Node-level kwargs/flags
  { name: 'opacity/visible/depth', dsl: 'b: rect 10x10 opacity=0.5 visible=false depth=3' },
  { name: 'style sigil', dsl: 'b: rect 10x10 @primary' },
  // Block-only props
  { name: 'dash full', dsl: 'b: rect 10x10\n  dash dashed length=10 gap=5' },
  { name: 'layout block', dsl: 'r: rect 400x60\n  layout flex row gap=5 justify=center align=stretch padding=10' },
  { name: 'layout inline hints', dsl: 'r: rect 60x40 layout grow=1 order=2 alignSelf=end slot=left' },
  { name: 'layout grid full', dsl: 'g: rect 300x200\n  layout grid columns=3 rows=2 colGap=6 rowGap=4\n  c1: rect 40x40 layout gridCol=1 gridRow=2 rowSpan=2 colSpan=1' },
  { name: 'layout circular arc', dsl: 'ring: ellipse 200x200\n  layout circular radius=80 startAngle=45 sweep=270' },
  { name: 'layout skip', dsl: 'row: rect 200x40\n  layout flex row gap=4\n  a: rect 20x20\n  b: rect 20x20 layout skip=true' },
  // Connections
  { name: 'connection simple', dsl: 'l: a -> b' },
  { name: 'connection waypoints', dsl: 'l: a -> (250,100) -> b smooth radius=15' },
  { name: 'connection modifiers', dsl: 'l: a -> b smooth closed bend=0.5 radius=10 gap=2 fromGap=1 toGap=3 drawProgress=0.5' },
  { name: 'connection anchors', dsl: 'l: a -> b fromAnchor=N toAnchor=S' },
  { name: 'connection styled', dsl: 'l: a -> b stroke gray width=2' },
  // Explicit path
  { name: 'explicit path', dsl: 'tri: path (0,-40) (40,30) (-40,30) closed smooth fill purple' },
  // Templates
  { name: 'template explicit', dsl: 'conn: template arrow from=a to=b label="sends data" colour=darkgray' },
  { name: 'template with transform', dsl: 'n: template state.node name="Idle" color=steelblue at 0,100' },
  // Nesting
  { name: 'nested children', dsl: 'card: rect 160x100 at 200,150\n  title: text "Hello" size=14\n  badge: ellipse 8x8' },
  { name: 'dotted child ids', dsl: 'g: at 100,100\n  g.bg: rect 100x50 fill blue\n  g.label: text "hi" fill white' },
  // Styles section
  { name: 'style block', dsl: 'style primary\n  fill hsl 210 70 45\n  stroke darkblue width=2' },
  { name: 'style dash + layout', dsl: 'style boxy\n  dash dashed length=6\n  layout flex column gap=8' },
  { name: 'style full props', dsl: 'style rich\n  fill red\n  stroke blue width=2\n  dash dashed length=6\n  layout flex column gap=8\n  opacity=0.5\n  depth=3' },
  // Images section
  { name: 'images', dsl: 'images\n  logo: "logo.png"\n  hero: "hero.jpg"' },
  // Metadata
  { name: 'metadata', dsl: 'name "Test"\ndescription "A scene"\nbackground white\nviewport 800x600\nuse [core, state]' },
  // Animation
  { name: 'animate basic', dsl: 'animate 3 loop autoKey easing=easeInOut' },
  { name: 'animate keyframes', dsl: 'animate 3\n  0 box.opacity: 1\n  2 box.opacity: 0' },
  { name: 'animate block easing', dsl: 'animate 4\n  1.5 easing=easeInCubic  cam.camera.look: e\n    cam.camera.zoom: 2' },
  { name: 'animate change easing', dsl: 'animate 3\n  1.5 box.x: { value: 500, easing: "linear" }' },
  { name: 'animate boolean/tuple/color', dsl: 'animate 4\n  0 box.visible: true\n  1 box.fill: blue\n  2 cam.look: (a,b)' },
  { name: 'animate relative + chapters', dsl: 'animate 6\n  chapter "Start" at 0\n  chapter "End" at 5\n  0 box.opacity: 0\n  +1 box.opacity: 1' },
  { name: 'animate keyframe delay', dsl: 'animate 4\n  1 delay=0.5  box.opacity: 1' },
  { name: 'animate multi-change', dsl: 'animate 4\n  2  cam.camera.look: all\n    cam.camera.zoom: 1.5' },
  // Template booleans. These used to store the STRING "true"/"false", so a
  // model carrying a real boolean emitted text that parsed back to a string
  // and drifted on the first cycle — and `dashed=false` drew a dashed line.
  { name: 'template flag explicit true', dsl: 'objects\n  c: arrow from=a to=b dashed=true' },
  { name: 'template flag explicit false', dsl: 'objects\n  c: arrow from=a to=b dashed=false' },
  { name: 'template flag bare', dsl: 'objects\n  c: arrow from=a to=b dashed' },
  { name: 'template flag before kwargs', dsl: 'objects\n  c: arrow dashed from=a to=b' },
  { name: 'template flags mixed with kwargs', dsl: 'objects\n  c: arrow from=a to=b label="x" smooth arrowStart=true' },
  // Shapes that only just gained hints.
  { name: 'state marker kwargs', dsl: 'use [core, state]\n\nobjects\n  s: initial color=whitesmoke r=9\n  f: final r=11\n  ch: choice size=24' },
  { name: 'node flag explicit', dsl: 'objects\n  t: text "hi" bold=true' },
  { name: 'chapters block before keyframes', dsl: 'animate 8\n  chapters\n    chapter "Start" at 0\n    chapter "End" at 5\n  1 box.opacity: 1' },
  // Shape props on either side of `at`. Everything after `at` used to be
  // dropped, so these drifted the moment the emitter put a prop back in its
  // canonical position ahead of the transform.
  { name: 'props after at', dsl: 'objects\n  b: box "X" at 150,40 color=red' },
  { name: 'props before and after at', dsl: 'objects\n  b: box "X" color=red at 150,40 radius=6' },
  { name: 'positional connection with label', dsl: 'objects\n  c: arrow a -> b label="calls"' },
  { name: 'state marker after at', dsl: 'objects\n  s: initial at 10,10 r=9' },
  { name: 'dotted shape with props after at', dsl: 'objects\n  n: state.node name="Idle" at 0,100 color=steelblue' },
  // Node kwargs keep their meaning on a shape: `opacity` belongs to the node
  // even though the emitter writes it in among the props.
  { name: 'node kwarg shorthand on a shape', dsl: 'objects\n  b: box "B" color=red opacity 0 at 10,10' },
  { name: 'node kwarg and prop together', dsl: 'objects\n  b: box "X" color=red opacity=0.5' },
  { name: 'floating transform kwarg on a shape', dsl: 'objects\n  b: box "X" rotation=45' },
  // Block content. These props had no spelling at all, so they could only be
  // set from JSON — and one emit/parse cycle destroyed them.
  { name: 'textblock lines', dsl: 'objects\n  n: textblock size=13 at 40,60\n    "First line"\n    "Second, with \\"quotes\\" and = signs"' },
  { name: 'codeblock lines keep punctuation', dsl: 'objects\n  c: codeblock\n    "def f(x): // comment"\n    "    return [x, {y: 1}]"' },
  { name: 'table rows and bracket-list cols', dsl: 'objects\n  t: table cols=["Name", "Age"] colWidth=90\n    "Ada" "36"\n    "Lin" "29"' },
  { name: 'block content beside a child node', dsl: 'objects\n  n: textblock size=12\n    "one"\n    "two"\n    n.tag: rect 4x4' },
];

describe('round-trip: feature corpus', () => {
  for (const entry of FEATURE_CORPUS) {
    it(entry.name, () => {
      assertParseFirstRoundTrip(entry.dsl);
    });
  }
});

// ─── Model-first corpus (popup-style edits) ──────────────────────
// Popups mutate the model directly, so emission must handle model shapes the
// parser may not produce verbatim from one canonical DSL form.

const MODEL_CORPUS: Array<{ name: string; model: any }> = [
  { name: 'rgb fill (non-named)', model: { objects: [{ id: 'b', rect: { w: 10, h: 10 }, fill: { r: 12, g: 34, b: 56 } }] } },
  { name: 'rgb fill + alpha', model: { objects: [{ id: 'b', rect: { w: 10, h: 10 }, fill: { r: 12, g: 34, b: 56, a: 0.4 } }] } },
  { name: 'hex + alpha fill', model: { objects: [{ id: 'b', rect: { w: 10, h: 10 }, fill: { hex: '#3a7bd5', a: 0.7 } }] } },
  { name: 'named + alpha fill', model: { objects: [{ id: 'b', rect: { w: 10, h: 10 }, fill: { name: 'black', a: 0.7 } }] } },
  { name: 'hsl (non-named) fill', model: { objects: [{ id: 'b', rect: { w: 10, h: 10 }, fill: { h: 123, s: 45, l: 67 } }] } },
  { name: 'transform anchor tuple', model: { objects: [{ id: 'b', rect: { w: 10, h: 10 }, transform: { x: 1, y: 2, anchor: [0.5, -0.5] } }] } },
  { name: 'connection anchor tuple', model: { objects: [{ id: 'l', path: { route: ['a', 'b'], fromAnchor: [0, 1] } }] } },
  // The shapes a JSON-authored document could set but the DSL could not write
  // back: formatScalar flattened the rows into one comma-joined tuple and
  // coerced "36" to a number on the way back in.
  { name: 'table rows stay a grid of strings', model: { objects: [{ id: 't', template: 'table', props: { cols: ['Name', 'Age'], rows: [['Ada', '36'], ['Lin', '29']] } }] } },
  { name: 'codeblock lines survive punctuation', model: { objects: [{ id: 'c', template: 'codeblock', props: { lines: ['def f():', '    return "x"  // done'] } }] } },
  // A bare `2024` in a bracket list re-parses as the number 2024, so a column
  // headed by a year changed type on every emit.
  { name: 'numeric-looking list members stay strings', model: { objects: [{ id: 't', template: 'table', props: { cols: ['2024', '2025'], rows: [['revenue', '10']] } }] } },
];

describe('round-trip: model-first (popup edits)', () => {
  for (const entry of MODEL_CORPUS) {
    it(entry.name, () => {
      const m1 = norm(entry.model);
      const text = buildAstFromModel(m1, hints).text;
      const m2 = norm(walkDocument(text).model);
      const d = diff(m1.objects, m2.objects);
      if (d.length) throw new Error(`drift:\n${d.join('\n')}\n--- text ---\n${text}`);
    });
  }
});

export { FEATURE_CORPUS, MODEL_CORPUS };
