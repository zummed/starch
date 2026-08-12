import { describe, it, expect } from 'vitest';
import { parseScene } from '../../parser/parser';
import { walkDocument } from '../../dsl/schemaWalker';
import { registerBuiltinTemplates } from '../../templates/index';

/**
 * Shapes whose content is a list — textblock and codeblock `lines`, table
 * `rows` — take it from the indented block beneath their line.
 *
 * There was no way to write these at all before: the props existed, and the
 * templates read them, but no hint said "this field comes from the block", so
 * they could only be set by hand-authoring JSON. Emitting one then destroyed
 * it, since every prop went out through formatScalar, which flattens.
 *
 * Entries are quoted strings, not raw text. That costs an escape for an
 * embedded quote and buys exactness: the lexer reads a string literal
 * verbatim, so `//`, `=`, brackets and leading indentation all survive
 * without a second way of lexing a line.
 */

registerBuiltinTemplates();

const props = (dsl: string, id = 'n') =>
  (walkDocument(dsl).model.objects ?? []).find((o: any) => o.id === id)?.props;

describe('block content', () => {
  it('reads one line per indented string', () => {
    expect(props('objects\n  n: textblock size=13\n    "First"\n    "Second"'))
      .toEqual({ size: 13, lines: ['First', 'Second'] });
  });

  it('keeps punctuation, comments and indentation inside a line', () => {
    const p = props('objects\n  n: codeblock\n    "def f(x): // not a comment"\n    "    return [x, {y: 1}]"');
    expect(p.lines).toEqual(['def f(x): // not a comment', '    return [x, {y: 1}]']);
  });

  it('reads a table row per line and keeps numeric-looking cells as strings', () => {
    const p = props('objects\n  n: table cols=["Name", "Age"]\n    "Ada" "36"\n    "Lin" "29"');
    expect(p.cols).toEqual(['Name', 'Age']);
    expect(p.rows).toEqual([['Ada', '36'], ['Lin', '29']]);
  });

  it('takes a bracket list with quoted members', () => {
    expect(props('objects\n  n: table cols=["First name", "Age"]').cols).toEqual(['First name', 'Age']);
  });

  it('reaches the rendered node', () => {
    const scene = parseScene('objects\n  n: textblock size=12\n    "one"\n    "two"');
    const node = scene.nodes.find(x => x.id === 'n')!;
    const texts: string[] = [];
    const walk = (x: any) => { if (x.text?.content) texts.push(x.text.content); x.children?.forEach(walk); };
    walk(node);
    expect(texts).toEqual(['one', 'two']);
    expect(scene.warnings).toEqual([]);
  });

  it('keeps block content and child nodes apart', () => {
    const model = walkDocument('objects\n  n: textblock size=12\n    "one"\n    n.tag: rect 4x4').model;
    expect(model.objects[0].props.lines).toEqual(['one']);
    expect(model.objects[0].children.map((c: any) => c.id)).toEqual(['n.tag']);
  });
});

describe('block content says when it cannot read a line', () => {
  it('warns when the shape takes no block content', () => {
    const scene = parseScene('objects\n  b: box "X"\n    "stray line"');
    expect(scene.warnings.join('\n')).toMatch(/box takes no block content/);
  });

  it('warns when a cell is left unquoted', () => {
    const scene = parseScene('objects\n  n: table cols=["Name", "Age"]\n    "Ada" 36');
    expect(scene.warnings.join('\n')).toMatch(/must be quoted/);
  });

  it('does not blame the shape when the shape itself is unknown', () => {
    const scene = parseScene('objects\n  b: bax "API"\n    "line"');
    expect(scene.warnings.join('\n')).toMatch(/Unknown template "bax"/);
    expect(scene.warnings.join('\n')).not.toMatch(/takes no block content/);
  });

  it('warns when a lines-shaped entry holds more than one string', () => {
    const scene = parseScene('objects\n  n: textblock\n    "one" "two"');
    expect(scene.warnings.join('\n')).toMatch(/one line per line/);
    // Recovered rather than dropped — both strings are still there.
    expect(props('objects\n  n: textblock\n    "one" "two"').lines).toEqual(['one', 'two']);
  });
});
