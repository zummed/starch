import { describe, it, expect } from 'vitest';
import { resolvePath } from '../../dsl/modelPathWalker';

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
