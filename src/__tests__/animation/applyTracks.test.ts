import { describe, it, expect } from 'vitest';
import { applyTrackValues, resolveTrackPath, getAtPropPath } from '../../animation/applyTracks';
import { createNode } from '../../types/node';
import { runLayout } from '../../layout';

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

  it('ignores a bare nested-id path instead of applying it to the wrong node', () => {
    // "n1" is only addressable through its actual parent ("ring.n1") —
    // a bare-id path must not silently no-op onto some unrelated match.
    const tree = [createNode({
      id: 'ring',
      children: [createNode({ id: 'n1', opacity: 0 })],
    })];
    const values = new Map<string, unknown>([['n1.opacity', 1]]);
    const result = applyTrackValues(tree, values);
    expect(result[0].children[0].opacity).toBe(0);
  });

  it('runLayout on a clone does not leak layout writes into the pristine original tree', () => {
    // cloneNode used to shallow-spread nodes, so a flex layout write on the
    // clone's rect/transform mutated the same object the original tree
    // referenced. Deep-copying rect/ellipse/transform/layout in cloneNode
    // guarantees render-time layout can't corrupt the pristine scene tree.
    const original = [createNode({
      id: 'c',
      layout: { type: 'flex', direction: 'row', gap: 0 },
      rect: { w: 200, h: 100 },
      children: [
        createNode({ id: 'a', rect: { w: 50, h: 30 } }),
        createNode({ id: 'b', rect: { w: 50, h: 30 } }),
      ],
    })];

    const clone = applyTrackValues(original, new Map());
    runLayout(clone);

    // The clone picked up a solved position from layout...
    expect(clone[0].children[0].transform?.x).toBeDefined();
    // ...but the original tree's children remain exactly as authored.
    expect(original[0].children[0].transform).toBeUndefined();
    expect(original[0].children[0].rect).toEqual({ w: 50, h: 30 });
    expect(original[0].children[1].transform).toBeUndefined();
    expect(original[0].children[1].rect).toEqual({ w: 50, h: 30 });
  });
});

describe('resolveTrackPath', () => {
  it('resolves a root-level property path', () => {
    const tree = [createNode({ id: 'box', transform: { x: 0 } })];
    const resolved = resolveTrackPath(tree, 'box.transform.x');
    expect(resolved?.node.id).toBe('box');
    expect(resolved?.propPath).toEqual(['transform', 'x']);
  });

  it('resolves through a chain of matching child ids', () => {
    const tree = [createNode({
      id: 'ring',
      children: [createNode({ id: 'n1', opacity: 0 })],
    })];
    const resolved = resolveTrackPath(tree, 'ring.n1.opacity');
    expect(resolved?.node.id).toBe('n1');
    expect(resolved?.propPath).toEqual(['opacity']);
  });

  it('does not resolve a bare nested id (first segment must be a root)', () => {
    const tree = [createNode({
      id: 'ring',
      children: [createNode({ id: 'n1', opacity: 0 })],
    })];
    expect(resolveTrackPath(tree, 'n1.opacity')).toBeUndefined();
  });

  it('returns undefined for a completely unknown root', () => {
    const tree = [createNode({ id: 'box' })];
    expect(resolveTrackPath(tree, 'missing.x')).toBeUndefined();
  });
});

describe('getAtPropPath', () => {
  it('reads a nested value', () => {
    const node = createNode({ id: 'box', transform: { x: 42 } });
    expect(getAtPropPath(node, ['transform', 'x'])).toBe(42);
  });

  it('returns undefined when a path segment is missing', () => {
    const node = createNode({ id: 'box' });
    expect(getAtPropPath(node, ['transform', 'x'])).toBeUndefined();
  });

  it('returns the node itself for an empty path', () => {
    const node = createNode({ id: 'box' });
    expect(getAtPropPath(node, [])).toBe(node);
  });
});
