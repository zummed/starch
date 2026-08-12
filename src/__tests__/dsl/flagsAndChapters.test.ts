import { describe, it, expect } from 'vitest';
import { parseScene } from '../../parser/parser';
import { walkDocument } from '../../dsl/schemaWalker';
import { buildAstFromModel } from '../../dsl/astEmitter';
import { emptyFormatHints } from '../../dsl/formatHints';
import { registerBuiltinTemplates } from '../../templates/index';

/**
 * Regressions found by having a model write starch from the generated guide
 * and running `starch check` on what came back. Each of these parsed into
 * something other than what was written, mostly without failing.
 */

const OBJECTS = 'objects\n  a: box "A" at 10,10\n  b: box "B" at 300,10\n  ';

function connection(line: string) {
  const scene = parseScene(OBJECTS + line);
  const conn = scene.nodes.find(n => n.id === 'c');
  return {
    warnings: scene.warnings,
    nodes: scene.nodes.map(n => n.id),
    dashed: Boolean(conn?.children.find(k => k.id === 'c.route')?.dash),
    label: conn?.children.find(k => k.id === 'c.label')?.children.find(t => t.text)?.text?.content,
  };
}

describe('booleans on shapes', () => {
  it('reads dashed=false as false rather than the string "false"', () => {
    // The template kwarg loop stored the raw token, and every template
    // truthiness-checks its props — so `dashed=false` drew a dashed line.
    expect(connection('c: arrow from=a to=b dashed=false').dashed).toBe(false);
    expect(connection('c: arrow from=a to=b dashed=true').dashed).toBe(true);
  });

  it('accepts a bare flag in any position on the line', () => {
    // Flags used to be parsed in their own loop before kwargs, so a bare
    // flag after a kwarg was unreachable and became a new object id.
    for (const line of ['c: arrow from=a to=b dashed', 'c: arrow dashed from=a to=b']) {
      const result = connection(line);
      expect(result.dashed, line).toBe(true);
      expect(result.nodes, line).toEqual(['a', 'b', 'c']);
      expect(result.warnings, line).toEqual([]);
    }
  });

  it('accepts both spellings of a node-level flag', () => {
    // `bold` parsed, `bold=true` did not — the mirror of the template bug,
    // and between them no single spelling worked at both levels.
    for (const line of ['t: text "hi" bold at 10,10', 't: text "hi" bold=true at 10,10']) {
      const scene = parseScene(`objects\n  ${line}`);
      expect(scene.warnings, line).toEqual([]);
      expect(scene.nodes.find(n => n.id === 't')?.text?.bold, line).toBe(true);
    }
    const off = parseScene('objects\n  t: text "hi" bold=false at 10,10');
    expect(off.nodes.find(n => n.id === 't')?.text?.bold).toBe(false);
  });
});

describe('connections', () => {
  it('takes template properties alongside positional endpoints', () => {
    // `arrow a -> b label="x"` consumed the word `arrow` as the first route
    // waypoint, so the rest re-parsed as a second object and collided with
    // the real one — reported as a baffling `Duplicate ID: "a"`.
    const result = connection('c: arrow a -> b label="calls"');
    expect(result.warnings).toEqual([]);
    expect(result.label).toBe('calls');
  });

  it('still reads a bare route with no shape name', () => {
    const scene = parseScene(OBJECTS + 'c: a -> (150,80) -> b bend=1');
    expect(scene.warnings).toEqual([]);
    expect(scene.nodes.map(n => n.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('chapters', () => {
  const withChaptersFirst = `objects
  a: box "A" at 10,10

animate 8
  chapters
    chapter "Start" at 0
    chapter "End" at 5

  1 a.opacity: 1
  3 a.opacity: { value: 0.2, easing: "bounce" }`;

  it('keeps keyframes written after a chapters block', () => {
    // The block form was never handled — the bare `chapters` token was
    // skipped and its sub-block's dedent closed the whole animate block, so
    // every keyframe below it fell out and became a top-level object.
    const scene = parseScene(withChaptersFirst);
    expect(scene.warnings).toEqual([]);
    expect(scene.nodes.map(n => n.id)).toEqual(['a']);
    expect(scene.animate?.chapters?.map(c => c.name)).toEqual(['Start', 'End']);
    expect(scene.animate?.keyframes).toHaveLength(2);
  });

  it('reads the inline chapter form too', () => {
    const scene = parseScene('objects\n  a: box "A" at 10,10\n\nanimate 8\n  chapter "Start" at 0\n  1 a.opacity: 1');
    expect(scene.warnings).toEqual([]);
    expect(scene.animate?.chapters?.map(c => c.name)).toEqual(['Start']);
    expect(scene.animate?.keyframes).toHaveLength(1);
  });
});

describe('animation targets', () => {
  it('reports a target that resolves to nothing', () => {
    // buildTimeline always detected this; nothing merged its warnings into
    // parseScene, so `starch check` passed a document whose whole animate
    // block was dropped.
    const scene = parseScene('objects\n  a: box "A" at 10,10\n\nanimate 2\n  1 nosuch.fill: crimson');
    expect(scene.warnings).toEqual(['Unknown animation target "nosuch.fill"']);
  });
});

describe('round-trip under real conditions', () => {
  // The shared round-trip harness walks documents with no shape sets
  // registered, so it cannot represent `arrow a -> b` (which needs the
  // registry to be told apart from a bare route). parseScene always
  // registers, so the form is checked here instead.
  it('re-emits a positional connection back to itself', () => {
    registerBuiltinTemplates();
    const dsl = 'objects\n  c: arrow a -> b label="calls"';
    const model = walkDocument(dsl).model;
    const text = buildAstFromModel(model, emptyFormatHints()).text;
    expect(JSON.parse(JSON.stringify(walkDocument(text).model)))
      .toEqual(JSON.parse(JSON.stringify(model)));
  });
});
