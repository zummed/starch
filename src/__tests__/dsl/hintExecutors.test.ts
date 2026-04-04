import { describe, it, expect } from 'vitest';
import { WalkContext } from '../../dsl/walkContext';
import { tokenize } from '../../dsl/tokenizer';
import { executePositional } from '../../dsl/hintExecutors';
import type { PositionalHint } from '../../dsl/dslMeta';

function ctx(text: string): WalkContext {
  return new WalkContext(tokenize(text), text);
}

describe('executePositional - basic formats', () => {
  it('format dimension parses WxH', () => {
    const c = ctx('100x200');
    const hint: PositionalHint = { keys: ['w', 'h'], format: 'dimension' };
    const result = executePositional(c, hint, '');
    expect(result).toEqual({ w: 100, h: 200 });
  });

  it('format quoted parses a string', () => {
    const c = ctx('"hello world"');
    const hint: PositionalHint = { keys: ['content'], format: 'quoted' };
    const result = executePositional(c, hint, '');
    expect(result).toEqual({ content: 'hello world' });
  });

  it('format joined with separator parses X,Y', () => {
    const c = ctx('50,100');
    const hint: PositionalHint = { keys: ['x', 'y'], format: 'joined', separator: ',' };
    const result = executePositional(c, hint, '');
    expect(result).toEqual({ x: 50, y: 100 });
  });

  it('format spaced parses H S L', () => {
    const c = ctx('200 80 50');
    const hint: PositionalHint = { keys: ['h', 's', 'l'], format: 'spaced' };
    const result = executePositional(c, hint, '');
    expect(result).toEqual({ h: 200, s: 80, l: 50 });
  });

  it('single key no format parses one identifier value', () => {
    const c = ctx('dashed');
    const hint: PositionalHint = { keys: ['pattern'] };
    const result = executePositional(c, hint, '');
    expect(result).toEqual({ pattern: 'dashed' });
  });

  it('single key no format parses a number', () => {
    const c = ctx('42');
    const hint: PositionalHint = { keys: ['value'] };
    const result = executePositional(c, hint, '');
    expect(result).toEqual({ value: 42 });
  });

  it('transform double halves dimensions (ellipse)', () => {
    const c = ctx('100x60');
    const hint: PositionalHint = {
      keys: ['rx', 'ry'], format: 'dimension', transform: 'double',
    };
    const result = executePositional(c, hint, '');
    expect(result).toEqual({ rx: 50, ry: 30 });
  });

  it('emits AST leaves with schemaPath', () => {
    const c = ctx('100x60');
    const hint: PositionalHint = { keys: ['w', 'h'], format: 'dimension' };
    executePositional(c, hint, 'rect');
    const leaves = c.astLeaves();
    expect(leaves.length).toBeGreaterThan(0);
    const wLeaf = leaves.find(l => l.schemaPath === 'rect.w');
    expect(wLeaf?.value).toBe(100);
    expect(wLeaf?.dslRole).toBe('value');
  });
});
