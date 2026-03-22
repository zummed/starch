import { describe, it, expect } from 'vitest';
import { getCursorContext } from '../../editor/cursorPath';

describe('getCursorContext', () => {
  it('returns empty path at root level', () => {
    const text = '{ | }';
    const ctx = getCursorContext(text, 2);
    expect(ctx.path).toBe('');
  });

  it('detects property name position in object', () => {
    const text = '{ objects: [], an| }';
    const offset = text.indexOf('|');
    const ctx = getCursorContext(text.replace('|', ''), offset);
    expect(ctx.isPropertyName).toBe(true);
    expect(ctx.prefix).toBe('an');
  });

  it('detects value position after colon', () => {
    const text = '{ duration: | }';
    const offset = text.indexOf('|');
    const ctx = getCursorContext(text.replace('|', ''), offset);
    expect(ctx.isPropertyName).toBe(false);
    expect(ctx.currentKey).toBe('duration');
  });

  it('tracks path into nested object', () => {
    const text = '{ objects: [{ id: "a", rect: { w: | } }] }';
    const offset = text.indexOf('|');
    const ctx = getCursorContext(text.replace('|', ''), offset);
    expect(ctx.path).toContain('objects');
    expect(ctx.path).toContain('rect');
    expect(ctx.currentKey).toBe('w');
  });

  it('tracks array index', () => {
    const text = '{ objects: [{ id: "a" }, { id: "b", | }] }';
    const offset = text.indexOf('|');
    const ctx = getCursorContext(text.replace('|', ''), offset);
    expect(ctx.path).toContain('objects');
    expect(ctx.path).toContain('1'); // second element
  });

  it('handles quoted property names', () => {
    const text = '{ "fill": { "h": | } }';
    const offset = text.indexOf('|');
    const ctx = getCursorContext(text.replace('|', ''), offset);
    expect(ctx.path).toContain('fill');
    expect(ctx.currentKey).toBe('h');
  });

  it('returns property name context for unquoted keys', () => {
    const text = '{ rect: { ra| } }';
    const offset = text.indexOf('|');
    const ctx = getCursorContext(text.replace('|', ''), offset);
    expect(ctx.isPropertyName).toBe(true);
    expect(ctx.prefix).toBe('ra');
    expect(ctx.path).toContain('rect');
  });

  it('handles empty text', () => {
    const ctx = getCursorContext('', 0);
    expect(ctx.path).toBe('');
    expect(ctx.isPropertyName).toBe(false);
  });

  it('handles cursor at start of object', () => {
    const text = '{|}';
    const offset = 1;
    const ctx = getCursorContext(text.replace('|', ''), offset);
    expect(ctx.isPropertyName).toBe(true);
  });
});
