import { describe, it, expect } from 'vitest';
import { tryResolveDraft } from '../../editor/schema/draftNode';

describe('draftNode resolution', () => {
  it('resolves a number draft to a valid value', () => {
    const result = tryResolveDraft('0.5', 'opacity');
    expect(result).toEqual({ resolved: true, value: 0.5 });
  });

  it('does not resolve invalid number text', () => {
    const result = tryResolveDraft('abc', 'opacity');
    expect(result.resolved).toBe(false);
    expect(result.hint).toBeDefined();
  });

  it('resolves a color name', () => {
    const result = tryResolveDraft('red', 'fill');
    expect(result).toEqual({ resolved: true, value: 'red' });
  });

  it('resolves boolean text', () => {
    const result = tryResolveDraft('true', 'visible');
    expect(result).toEqual({ resolved: true, value: true });
  });

  it('resolves enum value', () => {
    const result = tryResolveDraft('row', 'layout.direction');
    expect(result).toEqual({ resolved: true, value: 'row' });
  });

  it('rejects invalid enum value', () => {
    const result = tryResolveDraft('diagonal', 'layout.direction');
    expect(result.resolved).toBe(false);
  });

  it('resolves geometry dimension text', () => {
    const result = tryResolveDraft('100x200', 'rect');
    expect(result).toEqual({ resolved: true, value: { w: 100, h: 200 } });
  });

  it('resolves empty text as not resolved', () => {
    const result = tryResolveDraft('', 'opacity');
    expect(result.resolved).toBe(false);
  });
});
