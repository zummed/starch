import { describe, it, expect } from 'vitest';
import { walkDocument } from '../../dsl/schemaWalker';
import { leavesToAst } from '../../dsl/astAdapter';
import { completionsAt } from '../../dsl/astCompletions';

describe('completions between nodes', () => {
  it('after geometry on first line when second node follows', () => {
    const text = 'foo: rect 10x10 \nbar: rect 20x20';
    const cursorLine = 'foo: rect 10x10 ';
    const textPos = cursorLine.length;
    const { model, ast: ctx } = walkDocument(text);
    const ast = leavesToAst(ctx.astLeaves(), text.length);
    const items = completionsAt(ast, textPos, cursorLine, model, text);
    const labels = items.map(i => i.label);
    expect(labels).toContain('fill');
    expect(labels).toContain('stroke');
    expect(labels).not.toContain('rect');
  });

  it('after geometry mid-document with multiple following nodes', () => {
    const text = 'a: rect 10x10\nb: rect 20x20 fill red \nc: ellipse 30x30';
    const cursorLine = 'b: rect 20x20 fill red ';
    const textPos = 'a: rect 10x10\n'.length + cursorLine.length;
    const { model, ast: ctx } = walkDocument(text);
    const ast = leavesToAst(ctx.astLeaves(), text.length);
    const items = completionsAt(ast, textPos, cursorLine, model, text);
    const labels = items.map(i => i.label);
    expect(labels).toContain('stroke');
    expect(labels).not.toContain('rect');
    expect(labels).not.toContain('fill'); // already used
  });
});
