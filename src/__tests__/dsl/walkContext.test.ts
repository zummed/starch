import { describe, it, expect } from 'vitest';
import { WalkContext } from '../../dsl/walkContext';
import { tokenize } from '../../dsl/tokenizer';

describe('WalkContext', () => {
  it('wraps tokens with a cursor', () => {
    const tokens = tokenize('rect 100x200');
    const ctx = new WalkContext(tokens, 'rect 100x200');

    expect(ctx.peek()?.type).toBe('identifier');
    expect(ctx.peek()?.value).toBe('rect');
  });

  it('advances through tokens', () => {
    const tokens = tokenize('rect 100x200');
    const ctx = new WalkContext(tokens, 'rect 100x200');
    const t1 = ctx.next();
    const t2 = ctx.next();
    expect(t1?.value).toBe('rect');
    expect(t2?.value).toBe('100x200');
  });

  it('peek with offset looks ahead', () => {
    const tokens = tokenize('a b c');
    const ctx = new WalkContext(tokens, 'a b c');
    expect(ctx.peek(0)?.value).toBe('a');
    expect(ctx.peek(1)?.value).toBe('b');
    expect(ctx.peek(2)?.value).toBe('c');
  });

  it('is() checks current token type and value', () => {
    const tokens = tokenize('rect 100x200');
    const ctx = new WalkContext(tokens, 'rect 100x200');
    expect(ctx.is('identifier')).toBe(true);
    expect(ctx.is('identifier', 'rect')).toBe(true);
    expect(ctx.is('identifier', 'other')).toBe(false);
    expect(ctx.is('number')).toBe(false);
  });

  it('atEnd detects end of tokens', () => {
    const tokens = tokenize('rect');
    const ctx = new WalkContext(tokens, 'rect');
    expect(ctx.atEnd()).toBe(false);
    ctx.next(); // consume rect
    expect(ctx.atEnd()).toBe(true);
  });

  it('tracks model path stack', () => {
    const tokens = tokenize('x');
    const ctx = new WalkContext(tokens, 'x');
    expect(ctx.modelPath()).toBe('');
    ctx.pushPath('objects.0.rect');
    expect(ctx.modelPath()).toBe('objects.0.rect');
    ctx.pushPath('w');
    expect(ctx.modelPath()).toBe('objects.0.rect.w');
    ctx.popPath();
    expect(ctx.modelPath()).toBe('objects.0.rect');
  });

  it('skipNewlines skips only newline tokens', () => {
    const tokens = tokenize('\n\nrect');
    const ctx = new WalkContext(tokens, '\n\nrect');
    ctx.skipNewlines();
    expect(ctx.peek()?.type).toBe('identifier');
  });

  it('emits AST leaves with modelPath from stack', () => {
    const ctx = new WalkContext([], '');
    ctx.pushPath('objects.0');
    ctx.emitLeaf({
      schemaPath: 'rect',
      from: 0,
      to: 4,
      value: 'rect',
      dslRole: 'keyword',
    });
    const leaves = ctx.astLeaves();
    expect(leaves).toHaveLength(1);
    expect(leaves[0].value).toBe('rect');
    expect(leaves[0].modelPath).toBe('objects.0');
    expect(leaves[0].schemaPath).toBe('rect');
  });

  it('emits AST leaves with explicit modelPath override', () => {
    const ctx = new WalkContext([], '');
    ctx.emitLeaf({
      schemaPath: 'rect',
      modelPath: 'custom.path',
      from: 0,
      to: 4,
      value: 'rect',
      dslRole: 'keyword',
    });
    expect(ctx.astLeaves()[0].modelPath).toBe('custom.path');
  });
});
