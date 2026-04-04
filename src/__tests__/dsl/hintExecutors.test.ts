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

describe('executePositional - arrow and tuples', () => {
  it('format tuples parses multiple (x,y) points', () => {
    const c = ctx('(0,0) (10,20) (30,40)');
    const hint: PositionalHint = { keys: ['points'], format: 'tuples' };
    const result = executePositional(c, hint, '');
    expect(result?.points).toEqual([[0, 0], [10, 20], [30, 40]]);
  });

  it('format tuples handles empty list', () => {
    const c = ctx('');
    const hint: PositionalHint = { keys: ['points'], format: 'tuples' };
    const result = executePositional(c, hint, '');
    expect(result?.points).toEqual([]);
  });

  it('format arrow parses id -> id chain', () => {
    const c = ctx('a -> b -> c');
    const hint: PositionalHint = { keys: ['route'], format: 'arrow' };
    const result = executePositional(c, hint, '');
    expect(result?.route).toEqual(['a', 'b', 'c']);
  });

  it('format arrow handles (x,y) waypoints', () => {
    const c = ctx('a -> (10,20) -> b');
    const hint: PositionalHint = { keys: ['route'], format: 'arrow' };
    const result = executePositional(c, hint, '');
    expect(result?.route).toEqual(['a', [10, 20], 'b']);
  });

  it('format arrow handles (id,dx,dy) waypoints', () => {
    const c = ctx('a -> (b,10,5) -> c');
    const hint: PositionalHint = { keys: ['route'], format: 'arrow' };
    const result = executePositional(c, hint, '');
    expect(result?.route).toEqual(['a', ['b', 10, 5], 'c']);
  });

  it('format arrow returns null if first waypoint missing', () => {
    const c = ctx('-> a');
    const hint: PositionalHint = { keys: ['route'], format: 'arrow' };
    const result = executePositional(c, hint, '');
    expect(result).toBeNull();
  });
});

import { executeKwargs, executeFlags } from '../../dsl/hintExecutors';

describe('executeKwargs', () => {
  it('consumes key=value pairs', () => {
    const c = ctx('width=2 radius=8');
    const allowed = ['width', 'radius', 'color'];
    const result = executeKwargs(c, allowed, '');
    expect(result).toEqual({ width: 2, radius: 8 });
  });

  it('stops at unknown keys', () => {
    const c = ctx('width=2 unknown=5');
    const allowed = ['width'];
    const result = executeKwargs(c, allowed, '');
    expect(result).toEqual({ width: 2 });
  });

  it('handles identifier values (enums)', () => {
    const c = ctx('align=middle fit=cover');
    const allowed = ['align', 'fit'];
    const result = executeKwargs(c, allowed, '');
    expect(result).toEqual({ align: 'middle', fit: 'cover' });
  });

  it('handles string values', () => {
    const c = ctx('src="url.png"');
    const allowed = ['src'];
    const result = executeKwargs(c, allowed, '');
    expect(result).toEqual({ src: 'url.png' });
  });

  it('handles hex color values', () => {
    const c = ctx('color=#ff0000');
    const allowed = ['color'];
    const result = executeKwargs(c, allowed, '');
    expect(result).toEqual({ color: '#ff0000' });
  });

  it('emits kwarg-key and kwarg-value AST leaves', () => {
    const c = ctx('width=2');
    executeKwargs(c, ['width'], 'stroke');
    const leaves = c.astLeaves();
    expect(leaves).toHaveLength(2);
    expect(leaves[0].dslRole).toBe('kwarg-key');
    expect(leaves[1].dslRole).toBe('kwarg-value');
    expect(leaves[0].schemaPath).toBe('stroke.width');
  });

  it('returns empty object when no kwargs present', () => {
    const c = ctx('not-a-kwarg');
    const result = executeKwargs(c, ['width'], '');
    expect(result).toEqual({});
  });
});

describe('executeFlags', () => {
  it('consumes declared flags', () => {
    const c = ctx('bold mono');
    const allowed = ['bold', 'mono', 'visible'];
    const result = executeFlags(c, allowed, '');
    expect(result).toEqual({ bold: true, mono: true });
  });

  it('stops at non-flag identifiers', () => {
    const c = ctx('bold someOtherIdentifier');
    const allowed = ['bold'];
    const result = executeFlags(c, allowed, '');
    expect(result).toEqual({ bold: true });
  });

  it('does not consume kwarg (key=val)', () => {
    const c = ctx('bold width=2');
    const allowed = ['bold', 'width'];
    const result = executeFlags(c, allowed, '');
    expect(result).toEqual({ bold: true });
  });

  it('emits flag AST leaves', () => {
    const c = ctx('bold');
    executeFlags(c, ['bold'], 'text');
    const leaves = c.astLeaves();
    expect(leaves).toHaveLength(1);
    expect(leaves[0].dslRole).toBe('flag');
    expect(leaves[0].value).toBe(true);
    expect(leaves[0].schemaPath).toBe('text.bold');
  });

  it('returns empty object when no flags match', () => {
    const c = ctx('something-else');
    const result = executeFlags(c, ['bold'], '');
    expect(result).toEqual({});
  });
});

import { executeSchema } from '../../dsl/hintExecutors';
import { RectGeomSchema, EllipseGeomSchema } from '../../types/node';
import { StrokeSchema, TransformSchema } from '../../types/properties';
import { executeColor } from '../../dsl/hintExecutors';

describe('executeSchema - schema dispatch', () => {
  it('parses rect geometry', () => {
    const c = ctx('rect 100x200');
    const result = executeSchema(c, RectGeomSchema, 'rect');
    expect(result).toEqual({ w: 100, h: 200 });
  });

  it('parses rect with radius kwarg', () => {
    const c = ctx('rect 100x200 radius=8');
    const result = executeSchema(c, RectGeomSchema, 'rect');
    expect(result).toEqual({ w: 100, h: 200, radius: 8 });
  });

  it('parses transform with positional + kwargs', () => {
    const c = ctx('at 200,150 rotation=45');
    const result = executeSchema(c, TransformSchema, 'transform');
    expect(result).toEqual({ x: 200, y: 150, rotation: 45 });
  });

  it('parses stroke with color + width kwarg', () => {
    const c = ctx('stroke red width=2');
    const result = executeSchema(c, StrokeSchema, 'stroke');
    expect(result).toEqual({ color: 'red', width: 2 });
  });

  it('parses ellipse with dimension transform (double)', () => {
    const c = ctx('ellipse 100x60');
    const result = executeSchema(c, EllipseGeomSchema, 'ellipse');
    expect(result).toEqual({ rx: 50, ry: 30 });
  });

  it('returns null when keyword does not match', () => {
    const c = ctx('notrect 100x200');
    const result = executeSchema(c, RectGeomSchema, 'rect');
    expect(result).toBeNull();
  });

  it('emits keyword AST leaf', () => {
    const c = ctx('rect 100x200');
    executeSchema(c, RectGeomSchema, 'rect');
    const leaves = c.astLeaves();
    const keywordLeaf = leaves.find(l => l.dslRole === 'keyword');
    expect(keywordLeaf?.value).toBe('rect');
    expect(keywordLeaf?.schemaPath).toBe('rect');
  });
});

describe('executeColor', () => {
  it('parses named color', () => {
    const c = ctx('red');
    expect(executeColor(c, 'fill')).toBe('red');
  });

  it('parses hex color', () => {
    const c = ctx('#ff0000');
    expect(executeColor(c, 'fill')).toBe('#ff0000');
  });

  it('parses hsl color', () => {
    const c = ctx('hsl 200 80 50');
    expect(executeColor(c, 'fill')).toEqual({ h: 200, s: 80, l: 50 });
  });

  it('parses rgb color', () => {
    const c = ctx('rgb 255 0 0');
    expect(executeColor(c, 'fill')).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('returns null for non-color tokens', () => {
    const c = ctx('123');
    expect(executeColor(c, 'fill')).toBeNull();
  });

  it('emits AST leaf for named color', () => {
    const c = ctx('red');
    executeColor(c, 'fill');
    const leaves = c.astLeaves();
    const colorLeaf = leaves.find(l => l.value === 'red');
    expect(colorLeaf).toBeDefined();
    expect(colorLeaf?.schemaPath).toBe('fill');
  });
});
