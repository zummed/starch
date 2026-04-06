import { describe, it, expect } from 'vitest';
import { resolvePath, enumerateNextSegments, currentValueAt, pathExists } from '../../dsl/modelPathWalker';

const scene = {
  objects: [
    {
      id: 'card',
      transform: { x: 200, y: 150 },
      children: [
        {
          id: 'bg',
          rect: { w: 160, h: 100, radius: 6 },
          fill: 'midnightblue',
          stroke: { color: 'steelblue', width: 2 },
        },
        { id: 'badge', ellipse: { rx: 8, ry: 8 }, fill: 'limegreen' },
      ],
    },
    { id: 'solo', rect: { w: 50, h: 50 }, opacity: 0.8 },
  ],
};

describe('resolvePath', () => {
  it('resolves root node by id', () => {
    const loc = resolvePath(scene, ['card']);
    expect(loc).not.toBeNull();
    expect(loc!.kind).toBe('node');
    expect((loc!.modelValue as any).id).toBe('card');
  });

  it('resolves root node with no children', () => {
    const loc = resolvePath(scene, ['solo']);
    expect(loc).not.toBeNull();
    expect(loc!.kind).toBe('node');
    expect((loc!.modelValue as any).id).toBe('solo');
  });

  it('resolves a child node through children array', () => {
    const loc = resolvePath(scene, ['card', 'bg']);
    expect(loc).not.toBeNull();
    expect(loc!.kind).toBe('node');
    expect((loc!.modelValue as any).id).toBe('bg');
  });

  it('resolves a direct leaf property', () => {
    const loc = resolvePath(scene, ['card', 'bg', 'fill']);
    expect(loc).not.toBeNull();
    expect(loc!.kind).toBe('leaf');
    expect(loc!.modelValue).toBe('midnightblue');
  });

  it('resolves a sub-object', () => {
    const loc = resolvePath(scene, ['card', 'bg', 'stroke']);
    expect(loc).not.toBeNull();
    expect(loc!.kind).toBe('subobject');
    expect((loc!.modelValue as any).color).toBe('steelblue');
  });

  it('resolves into a sub-object field', () => {
    const loc = resolvePath(scene, ['card', 'bg', 'stroke', 'width']);
    expect(loc).not.toBeNull();
    expect(loc!.kind).toBe('leaf');
    expect(loc!.modelValue).toBe(2);
  });

  it('returns null for unknown root node', () => {
    expect(resolvePath(scene, ['nope'])).toBeNull();
  });

  it('returns null for unknown child id', () => {
    expect(resolvePath(scene, ['card', 'nope'])).toBeNull();
  });

  it('returns null for unknown leaf key', () => {
    expect(resolvePath(scene, ['card', 'bg', 'nope'])).toBeNull();
  });

  it('returns null for empty segments', () => {
    expect(resolvePath(scene, [])).toBeNull();
  });

  it('returns null when model is empty', () => {
    expect(resolvePath({ objects: [] }, ['card'])).toBeNull();
  });

  it('returns null when model has no objects array', () => {
    expect(resolvePath({} as any, ['card'])).toBeNull();
  });
});

describe('enumerateNextSegments', () => {
  it('at a node returns child ids and its animatable properties', () => {
    const loc = resolvePath(scene, ['card']);
    const segs = enumerateNextSegments(loc!);
    const names = segs.map(s => s.name);
    expect(names).toContain('bg');      // child
    expect(names).toContain('badge');   // child
    expect(names).toContain('fill');    // leaf property
    expect(names).toContain('opacity'); // leaf property
    expect(names).toContain('stroke');  // drill target (sub-object)
    expect(names).toContain('transform'); // drill target (sub-object)
  });

  it('classifies child ids as drill targets', () => {
    const loc = resolvePath(scene, ['card']);
    const segs = enumerateNextSegments(loc!);
    const bg = segs.find(s => s.name === 'bg');
    expect(bg!.kind).toBe('drill');
    expect(bg!.source).toBe('child');
  });

  it('classifies colors and numbers as leaves', () => {
    const loc = resolvePath(scene, ['card']);
    const segs = enumerateNextSegments(loc!);
    expect(segs.find(s => s.name === 'fill')!.kind).toBe('leaf');
    expect(segs.find(s => s.name === 'opacity')!.kind).toBe('leaf');
  });

  it('classifies multi-field sub-objects as drill targets', () => {
    const loc = resolvePath(scene, ['card']);
    const segs = enumerateNextSegments(loc!);
    expect(segs.find(s => s.name === 'stroke')!.kind).toBe('drill');
    expect(segs.find(s => s.name === 'transform')!.kind).toBe('drill');
  });

  it('at a sub-object returns its declared fields as leaves', () => {
    const loc = resolvePath(scene, ['card', 'bg', 'stroke']);
    const segs = enumerateNextSegments(loc!);
    const names = segs.map(s => s.name);
    expect(names).toContain('color');
    expect(names).toContain('width');
    expect(segs.find(s => s.name === 'width')!.kind).toBe('leaf');
  });

  it('at a leaf returns empty list', () => {
    const loc = resolvePath(scene, ['card', 'bg', 'fill']);
    const segs = enumerateNextSegments(loc!);
    expect(segs).toEqual([]);
  });

  it('does not include id/children/_internal keys', () => {
    const loc = resolvePath(scene, ['card']);
    const segs = enumerateNextSegments(loc!);
    const names = segs.map(s => s.name);
    expect(names).not.toContain('id');
    expect(names).not.toContain('children');
  });
});

describe('currentValueAt', () => {
  it('returns the scalar at a leaf path', () => {
    expect(currentValueAt(scene, 'card.bg.fill')).toBe('midnightblue');
    expect(currentValueAt(scene, 'card.bg.stroke.width')).toBe(2);
    expect(currentValueAt(scene, 'solo.opacity')).toBe(0.8);
  });

  it('returns the sub-object at a drill path', () => {
    const v = currentValueAt(scene, 'card.bg.stroke');
    expect(v).toEqual({ color: 'steelblue', width: 2 });
  });

  it('returns undefined for unknown paths', () => {
    expect(currentValueAt(scene, 'card.bg.nope')).toBeUndefined();
    expect(currentValueAt(scene, 'nope.bg.fill')).toBeUndefined();
  });

  it('returns undefined for property that is not set on the object', () => {
    // solo has no fill explicitly set
    expect(currentValueAt(scene, 'solo.fill')).toBeUndefined();
  });
});

describe('pathExists', () => {
  it('returns true for valid schema paths', () => {
    expect(pathExists(scene, 'card.bg.fill')).toBe(true);
    expect(pathExists(scene, 'card.bg.stroke.width')).toBe(true);
    // Paths that are schema-reachable but not set on this model still "exist"
    // in the schema sense (the walker resolves them).
    expect(pathExists(scene, 'solo.opacity')).toBe(true);
  });

  it('returns false for unresolvable paths', () => {
    expect(pathExists(scene, 'nope')).toBe(false);
    expect(pathExists(scene, 'card.nope')).toBe(false);
    expect(pathExists(scene, 'card.bg.nope.further')).toBe(false);
  });
});
