import { describe, it, expect } from 'vitest';
import { EditorSession } from '../../editor/editorSession';
import { walkDocument } from '../../dsl/schemaWalker';
import { resolveEditTarget } from '../../editor/popupEdit';
import { v2Samples } from '../../samples';

/**
 * Click-coverage harness — the click-to-edit analogue of completionCoverage.
 * It drives the SAME resolver the live popup uses (resolveEditTarget) and the
 * headless EditorSession to prove that clicking a value anywhere — top-level,
 * nested children, style blocks, and inside `animate` — opens the right widget
 * and commits an edit that round-trips into the model (the "idea").
 */

/** schemaType the popup would open for the value containing `needle` (first occurrence). */
function typeAt(dsl: string, needle: string): string | undefined {
  const at = dsl.indexOf(needle);
  if (at < 0) throw new Error(`needle not found: ${needle}`);
  return new EditorSession(dsl).editTargetAt(at)?.schemaType;
}

// ─── Part A: regression gate ─────────────────────────────────────
// Over every complete sample, any value the popup CANNOT open must be a type
// that genuinely has no widget (pointref unions, booleans, lists, template
// refs). A new unresolvable value of a widget-backed type fails here.

const ALLOWED_UNRESOLVABLE = (sp: string): boolean =>
  /^use(\.|$)/.test(sp) ||                 // shape-set list
  /^viewport(\.|$)/.test(sp) ||            // dimension union
  sp.startsWith('objects.tplprops:') ||    // template props (typed via tplprops; from/to are pointref)
  /(^|\.)look$/.test(sp) ||                // camera look (pointref union)
  /(^|\.)active$/.test(sp) ||              // boolean flag (no boolean widget)
  /(^|\.)visible$/.test(sp) ||             // boolean flag
  /^track:/.test(sp);                      // animation tracks to styles/booleans/unions

describe('click coverage: no widget-backed value is unclickable (samples)', () => {
  for (const sample of v2Samples) {
    it(`${sample.category}/${sample.name}`, () => {
      const offenders: string[] = [];
      for (const lf of walkDocument(sample.dsl).ast.astLeaves()) {
        if (lf.dslRole !== 'value' && lf.dslRole !== 'kwarg-value') continue;
        if (resolveEditTarget(sample.dsl, lf.from)) continue;
        if (!ALLOWED_UNRESOLVABLE(String(lf.schemaPath))) {
          offenders.push(`${lf.schemaPath} "${sample.dsl.slice(lf.from, lf.to)}"`);
        }
      }
      expect(offenders, `unclickable widget-backed values: ${offenders.join(', ')}`).toEqual([]);
    });
  }
});

// ─── Part B: positional widget types ─────────────────────────────

describe('click coverage: widget per context', () => {
  it('top-level node values', () => {
    const dsl = 'box: rect (140,88) fill red opacity=0.5 depth=7';
    expect(typeAt(dsl, 'red')).toBe('color');
    expect(typeAt(dsl, '0.5')).toBe('number');     // opacity value
    expect(typeAt(dsl, '7')).toBe('number');       // depth value
    expect(typeAt(dsl, '(140,88)')).toBe('object');  // joined dimension → rect compound
  });

  it('nested child values (previously unclickable)', () => {
    const dsl = 'card: rect (200,90) at (11,22)\n  title: text "Hello" size=13\n  dot: ellipse (6,6) fill teal';
    expect(typeAt(dsl, '"Hello"')).toBe('string'); // child text.content
    expect(typeAt(dsl, '13')).toBe('number');       // child text.size
    expect(typeAt(dsl, 'teal')).toBe('color');      // child fill
  });

  it('style-block values (previously unclickable)', () => {
    const dsl = 'style foo\n  fill crimson\n  stroke navy width=4\n  dash dashed length=8';
    expect(typeAt(dsl, 'crimson')).toBe('color');
    expect(typeAt(dsl, 'navy')).toBe('color');     // stroke color
    expect(typeAt(dsl, '4')).toBe('number');        // stroke.width value
    expect(typeAt(dsl, '8')).toBe('number');        // dash.length value
  });

  it('animate values (previously unclickable)', () => {
    const dsl = [
      'box: rect (10,10) fill red',
      'animate 4',
      '  chapter "Intro" at 7',
      '  1.5 easing=easeIn  box.opacity: 0.25',
      '  3 box.fill: blue',
    ].join('\n');
    expect(typeAt(dsl, '"Intro"')).toBe('string');  // chapter name
    expect(typeAt(dsl, '7')).toBe('number');        // chapter time
    expect(typeAt(dsl, '1.5')).toBe('number');      // keyframe time
    expect(typeAt(dsl, 'easeIn')).toBe('enum');     // keyframe easing
    expect(typeAt(dsl, '0.25')).toBe('number');     // keyframe value (track: box.opacity)
    expect(typeAt(dsl, 'blue')).toBe('color');      // keyframe value (track: box.fill)
  });
});

// ─── Part C: edits round-trip into the model ─────────────────────

describe('click coverage: edits round-trip', () => {
  it('edits a nested child value', () => {
    const s = new EditorSession('card: rect (200,90)\n  title: text "Hi" size=13');
    s.clickEdit(s.text.indexOf('13'), 20);
    expect(s.model().objects[0].children[0].text.size).toBe(20);
  });

  it('edits a style-block value', () => {
    const s = new EditorSession('style foo\n  dash dashed length=8');
    s.clickEdit(s.text.indexOf('8'), 14);
    expect(s.model().styles.foo.dash.length).toBe(14);
  });

  it('edits a keyframe number value', () => {
    const s = new EditorSession('box: rect (10,10)\nanimate 4\n  1.5 box.opacity: 0.25');
    s.clickEdit(s.text.indexOf('0.25'), 0.8);
    expect(s.model().animate.keyframes[0].changes['box.opacity']).toBe(0.8);
  });

  it('edits a keyframe color value', () => {
    const s = new EditorSession('box: rect (10,10)\nanimate 4\n  2 box.fill: blue');
    s.clickEdit(s.text.indexOf('blue'), 'crimson');
    expect(s.model().animate.keyframes[0].changes['box.fill']).toBe('crimson');
  });

  it('edits a keyframe time', () => {
    const s = new EditorSession('box: rect (10,10)\nanimate 4\n  1.5 box.opacity: 1');
    s.clickEdit(s.text.indexOf('1.5'), 2.5);
    expect(s.model().animate.keyframes[0].time).toBe(2.5);
  });

  it('edits a chapter name', () => {
    const s = new EditorSession('animate 4\n  chapter "Intro" at 0\n  1 box.opacity: 1');
    s.clickEdit(s.text.indexOf('Intro'), 'Start');
    expect(s.model().animate.chapters[0].name).toBe('Start');
  });
});
