import { describe, it, expect } from 'vitest';
import { applyTrackValues } from '../../animation/applyTracks';
import { createNode } from '../../types/node';

describe('applyTrackValues', () => {
  it('applies scalar value to nested property', () => {
    const node = createNode({
      id: 'box',
      transform: { x: 0, y: 0 },
    });
    const values = new Map<string, unknown>([
      ['box.transform.x', 150],
    ]);
    const result = applyTrackValues([node], values);
    expect(result[0].transform!.x).toBe(150);
  });

  it('applies fill as an atomic Color value', () => {
    const node = createNode({
      id: 'box',
      fill: { h: 0, s: 0, l: 0 },
    });
    const values = new Map<string, unknown>([
      ['box.fill', { h: 210, s: 80, l: 50 }],
    ]);
    const result = applyTrackValues([node], values);
    expect(result[0].fill).toEqual({ h: 210, s: 80, l: 50 });
  });

  it('applies fill as a string Color value', () => {
    const node = createNode({
      id: 'box',
      fill: 'red',
    });
    const values = new Map<string, unknown>([
      ['box.fill', 'steelblue'],
    ]);
    const result = applyTrackValues([node], values);
    expect(result[0].fill).toBe('steelblue');
  });

  it('applies values to nested children', () => {
    const tree = [createNode({
      id: 'parent',
      children: [
        createNode({ id: 'child', opacity: 1 }),
      ],
    })];
    const values = new Map<string, unknown>([
      ['parent.child.opacity', 0.5],
    ]);
    const result = applyTrackValues(tree, values);
    expect(result[0].children[0].opacity).toBe(0.5);
  });

  it('applies geometry field values', () => {
    const node = createNode({
      id: 'r1',
      rect: { w: 100, h: 60, radius: 4 },
    });
    const values = new Map<string, unknown>([
      ['r1.rect.w', 200],
      ['r1.rect.radius', 8],
    ]);
    const result = applyTrackValues([node], values);
    expect(result[0].rect!.w).toBe(200);
    expect(result[0].rect!.radius).toBe(8);
    expect(result[0].rect!.h).toBe(60);
  });

  it('does not mutate original nodes', () => {
    const node = createNode({ id: 'n', opacity: 1 });
    const values = new Map<string, unknown>([['n.opacity', 0.5]]);
    applyTrackValues([node], values);
    expect(node.opacity).toBe(1);
  });
});
