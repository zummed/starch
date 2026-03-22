import { describe, it, expect } from 'vitest';
import { resolveStyles, topoSortStyles } from '../../tree/resolve';
import { createNode } from '../../types/node';
import type { HslColor } from '../../types/properties';

describe('topoSortStyles', () => {
  it('sorts independent styles in any order', () => {
    const styles = {
      a: { fill: { h: 0, s: 100, l: 50 } },
      b: { opacity: 0.5 },
    };
    const sorted = topoSortStyles(styles);
    expect(sorted).toHaveLength(2);
  });

  it('sorts dependent styles with base first', () => {
    const styles = {
      derived: { style: 'base', opacity: 0.5 },
      base: { fill: { h: 0, s: 100, l: 50 } },
    };
    const sorted = topoSortStyles(styles);
    const baseIdx = sorted.indexOf('base');
    const derivedIdx = sorted.indexOf('derived');
    expect(baseIdx).toBeLessThan(derivedIdx);
  });

  it('throws on circular style references', () => {
    const styles = {
      a: { style: 'b' },
      b: { style: 'a' },
    };
    expect(() => topoSortStyles(styles)).toThrow(/circular/i);
  });
});

describe('resolveStyles', () => {
  it('merges style properties as defaults onto node', () => {
    const styles = {
      primary: { fill: { h: 210, s: 70, l: 45 } as HslColor },
    };
    const node = createNode({ id: 'n1', style: 'primary' });
    const resolved = resolveStyles([node], styles);
    expect(resolved[0].fill).toEqual({ h: 210, s: 70, l: 45 });
  });

  it('node own properties override style defaults', () => {
    const styles = {
      primary: { fill: { h: 210, s: 70, l: 45 } as HslColor, opacity: 0.5 },
    };
    const node = createNode({ id: 'n1', style: 'primary', fill: { h: 0, s: 100, l: 50 } });
    const resolved = resolveStyles([node], styles);
    expect(resolved[0].fill).toEqual({ h: 0, s: 100, l: 50 }); // own value wins
    expect(resolved[0].opacity).toBe(0.5); // style fills in
  });

  it('resolves composed styles', () => {
    const styles = {
      base: { fill: { h: 210, s: 70, l: 45 } as HslColor },
      derived: { style: 'base', opacity: 0.4 },
    };
    const node = createNode({ id: 'n1', style: 'derived' });
    const resolved = resolveStyles([node], styles);
    expect(resolved[0].fill).toEqual({ h: 210, s: 70, l: 45 }); // from base
    expect(resolved[0].opacity).toBe(0.4); // from derived
  });

  it('resolves styles on nested children', () => {
    const styles = {
      red: { fill: { h: 0, s: 100, l: 50 } as HslColor },
    };
    const tree = [createNode({
      id: 'parent',
      children: [createNode({ id: 'child', style: 'red' })],
    })];
    const resolved = resolveStyles(tree, styles);
    expect(resolved[0].children[0].fill).toEqual({ h: 0, s: 100, l: 50 });
  });

  it('tracks _styleKeys for style-applied properties', () => {
    const styles = {
      primary: { fill: { h: 210, s: 70, l: 45 } as HslColor, opacity: 0.5 },
    };
    const node = createNode({ id: 'n1', style: 'primary' });
    const resolved = resolveStyles([node], styles);
    expect(resolved[0]._styleKeys!.has('fill')).toBe(true);
    expect(resolved[0]._styleKeys!.has('opacity')).toBe(true);
  });
});
