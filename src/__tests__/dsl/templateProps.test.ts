import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { parseScene } from '../../parser/parser';
import { walkDocument } from '../../dsl/schemaWalker';
import { registerBuiltinTemplates } from '../../templates/index';
import { registerSet } from '../../templates/registry';
import { createNode } from '../../types/node';
import { dsl } from '../../dsl/dslMeta';

/**
 * Shape props are read by the same loop as the node's own properties.
 *
 * They used to be read by a second loop that ran before it and stopped at the
 * first token it didn't recognise. `at` was always such a token, so every
 * property written after it was dropped — and worse, left on the token stream
 * to be re-read as the id of a new object. These tests pin the single loop:
 * order no longer matters, node-level names still win, and nothing on the
 * line goes unread without a warning.
 */

registerBuiltinTemplates();

const nodeIds = (dslText: string) => (walkDocument(dslText).model.objects ?? []).map((n: any) => n.id);

describe('shape props in any position', () => {
  it('keeps props written after at', () => {
    const scene = parseScene('objects\n  b: box "X" at 150,40 color=red');
    const b = scene.nodes.find(n => n.id === 'b')!;
    expect(b.transform).toMatchObject({ x: 150, y: 40 });
    expect(walkDocument('objects\n  b: box "X" at 150,40 color=red').model.objects[0].props)
      .toEqual({ text: 'X', color: 'red' });
    expect(scene.warnings).toEqual([]);
  });

  it('produces no phantom objects for props after at', () => {
    // `color=red` used to become two nodes: one called `color`, one `red`.
    expect(nodeIds('objects\n  b: box "X" at 150,40 color=red')).toEqual(['b']);
  });

  it('reads props on both sides of at', () => {
    const model = walkDocument('objects\n  b: box "X" color=red at 150,40 radius=6').model;
    expect(model.objects[0].props).toEqual({ text: 'X', color: 'red', radius: 6 });
    expect(model.objects[0].transform).toMatchObject({ x: 150, y: 40 });
  });

  it('reads a bare flag after at', () => {
    const model = walkDocument('objects\n  c: arrow from=a to=b at 10,10 dashed').model;
    expect(model.objects[0].props).toMatchObject({ dashed: true });
  });

  it('coerces a boolean prop written false', () => {
    const model = walkDocument('objects\n  c: arrow from=a to=b dashed=false').model;
    expect(model.objects[0].props.dashed).toBe(false);
  });
});

describe('node level wins the names it declares', () => {
  it('routes opacity to the node, not the shape', () => {
    const model = walkDocument('objects\n  b: box "X" opacity=0.5 color=red').model;
    expect(model.objects[0].opacity).toBe(0.5);
    expect(model.objects[0].props).toEqual({ text: 'X', color: 'red' });
  });

  it('routes a floating transform kwarg to the transform', () => {
    const model = walkDocument('objects\n  b: box "X" rotation=45').model;
    expect(model.objects[0].transform).toEqual({ rotation: 45 });
    expect(model.objects[0].props).toEqual({ text: 'X' });
  });

  it('reads a prop whose name matches a geometry keyword', () => {
    // `text=` is what the emitter writes for every box. Read as geometry it
    // produced an empty text node and lost the label.
    const model = walkDocument('objects\n  b: template box text="API"').model;
    expect(model.objects[0].props).toEqual({ text: 'API' });
    expect(model.objects[0].text).toBeUndefined();
  });

  it('refuses to register a shape whose prop name the node claims', () => {
    expect(() => registerSet({
      name: 'collide',
      description: 'test',
      shapes: new Map([['thing', {
        template: (id: string) => createNode({ id }),
        props: dsl(z.object({ opacity: z.number().optional() }), { kwargs: ['opacity'] }),
      }]]),
    })).toThrow(/declares a prop named "opacity"/);
  });
});

describe('a shape name written as a string', () => {
  // The click-to-edit popup serialises every string leaf with quotes, so
  // editing a shape name writes `c: "arrow" ...` back into the document.
  it('reads a quoted name', () => {
    const model = walkDocument('objects\n  c: "arrow" from=a to=b').model;
    expect(model.objects[0]).toMatchObject({ template: 'arrow', props: { from: 'a', to: 'b' } });
  });

  it('does not treat the dot in a quoted name as a path', () => {
    // The dotted-name branch consumed two more tokens, so `label` and `=`
    // vanished and the next string silently rebound to the positional.
    const model = walkDocument('objects\n  n: "state.node" entry="go" at 0,100').model;
    expect(model.objects[0]).toMatchObject({
      template: 'state.node',
      props: { entry: 'go' },
      transform: { x: 0, y: 100 },
    });
    expect(walkDocument('objects\n  n: "state.node" entry="go" at 0,100').ast.warnings).toEqual([]);
  });
});

describe('the object owns style, however it is written', () => {
  it('reads style=name onto the object like the @name sigil', () => {
    const sigil = walkDocument('objects\n  b: box "X" @primary').model.objects[0];
    const kwarg = walkDocument('objects\n  b: box "X" style=primary').model.objects[0];
    expect(kwarg.style).toBe('primary');
    expect(kwarg.style).toEqual(sigil.style);
    expect(kwarg.props).toEqual({ text: 'X' });
  });
});

describe('nothing on the line goes unread', () => {
  it('warns about a property that belongs to no shape', () => {
    const scene = parseScene('objects\n  b: box "X" colr=red');
    expect(scene.warnings.join('\n')).toMatch(/Unknown property "colr" for shape "box"/);
  });

  it('warns about a tail it cannot read at all', () => {
    const scene = parseScene('objects\n  b: box "X" ??? junk');
    expect(scene.warnings.join('\n')).toMatch(/could not read/);
    expect(nodeIds('objects\n  b: box "X" ??? junk')).toEqual(['b']);
  });

  it('warns about an unreadable line inside an indented block', () => {
    // The node's own line was covered; its block was still skipped a token at
    // a time in silence.
    const scene = parseScene('objects\n  g: group "G"\n    stray junk here');
    expect(scene.warnings.join('\n')).toMatch(/could not read "stray junk here"/);
  });

  it('keeps reading the line when style= is given something that is not a name', () => {
    const scene = parseScene('objects\n  b: box "X" style=3 color=red');
    expect(scene.warnings.join('\n')).toMatch(/needs the name of a style/);
    // The properties after the bad value are still the author's — dropping
    // the rest of the line lost them.
    expect(walkDocument('objects\n  b: box "X" style=3 color=red').model.objects[0].props)
      .toEqual({ text: 'X', color: 'red' });
  });

  it('warns when a block property line has no readable value', () => {
    const scene = parseScene('objects\n  g: rect 4x4\n    stroke');
    expect(scene.warnings.join('\n')).toMatch(/could not read "stroke"/);
  });

  it('keeps the sign on a negative coordinate', () => {
    // The lexer only treated `-` as a sign after punctuation, so the minus
    // after the `at` keyword was dropped as an unknown character and the
    // object landed at +5.
    expect(walkDocument('objects\n  b: rect 10x10 at -5,-6').model.objects[0].transform)
      .toEqual({ x: -5, y: -6 });
  });

  it('reports a value-less property once, not twice', () => {
    const scene = parseScene('objects\n  b: box "X" color= : red');
    expect(scene.warnings).toHaveLength(1);
  });

  it('says nothing about a document that reads cleanly', () => {
    expect(parseScene('objects\n  b: box "X" color=red at 10,10 opacity=0.5').warnings).toEqual([]);
    // Props the templates read but never declared used to be reported as
    // unknown — the warning was wrong, not the document.
    expect(parseScene('objects\n  b: box "X" colour=red strokeWidth=2 fill=azure style=s').warnings).toEqual([]);
    expect(parseScene('objects\n  c: arrow a -> (250,100) -> b fromAnchor=N drawProgress=0.5').warnings).toEqual([]);
  });
});

describe('leaf spans cover what an editor would replace', () => {
  // The popup replaces a leaf's [from, to) with the new value, so a span that
  // stops short leaves the tail behind and corrupts the line.
  const spanOf = (dslText: string, needle: string) => {
    const leaf = walkDocument(dslText).ast.astLeaves()
      .find(l => dslText.slice(l.from, l.to) === needle);
    return leaf ? dslText.slice(leaf.from, leaf.to) : null;
  };

  it('spans a whole parenthesised tuple, not just the bracket', () => {
    const dslText = 'objects\n  c: arrow from=a to=b fromAnchor=(0,1)';
    expect(spanOf(dslText, '(0,1)')).toBe('(0,1)');
  });

  it('spans a quoted value including its quotes and escapes', () => {
    const dslText = 'objects\n  c: arrow from=a to=b label="say \\"hi\\""';
    expect(spanOf(dslText, '"say \\"hi\\""')).toBe('"say \\"hi\\""');
  });

  it('gives each half of a WxH its own span', () => {
    const dslText = 'objects\n  b: box "X" 2.5x10';
    expect(spanOf(dslText, '2.5')).toBe('2.5');
    expect(spanOf(dslText, '10')).toBe('10');
  });
});
