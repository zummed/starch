import { describe, it, expect } from 'vitest';
import { createNode } from '../../types/node';
import type { Node } from '../../types/node';
import { normalizeRoutes } from '../../parser/parser';

describe('normalizeRoutes', () => {
  it('converts from/to into route=[from, to]', () => {
    const nodes: Node[] = [
      createNode({
        id: 'conn',
        path: { from: 'a', to: 'b' },
      }),
    ];
    const result = normalizeRoutes(nodes);
    expect(result[0].path!.route).toEqual(['a', 'b']);
    expect(result[0].path!.from).toBeUndefined();
    expect(result[0].path!.to).toBeUndefined();
  });

  it('merges from/to with existing route waypoints', () => {
    const nodes: Node[] = [
      createNode({
        id: 'conn',
        path: { from: 'a', to: 'b', route: [[50, 50]] },
      }),
    ];
    const result = normalizeRoutes(nodes);
    expect(result[0].path!.route).toEqual(['a', [50, 50], 'b']);
    expect(result[0].path!.from).toBeUndefined();
    expect(result[0].path!.to).toBeUndefined();
  });

  it('preserves route when no from/to', () => {
    const nodes: Node[] = [
      createNode({
        id: 'conn',
        path: { route: ['a', [50, 50], 'b'] },
      }),
    ];
    const result = normalizeRoutes(nodes);
    expect(result[0].path!.route).toEqual(['a', [50, 50], 'b']);
  });

  it('handles from only (no to)', () => {
    const nodes: Node[] = [
      createNode({
        id: 'conn',
        path: { from: 'a' },
      }),
    ];
    const result = normalizeRoutes(nodes);
    // With only from, route = [from]
    expect(result[0].path!.route).toEqual(['a']);
    expect(result[0].path!.from).toBeUndefined();
  });

  it('handles to only (no from)', () => {
    const nodes: Node[] = [
      createNode({
        id: 'conn',
        path: { to: 'b' },
      }),
    ];
    const result = normalizeRoutes(nodes);
    expect(result[0].path!.route).toEqual(['b']);
    expect(result[0].path!.to).toBeUndefined();
  });

  it('normalizes children recursively', () => {
    const nodes: Node[] = [
      createNode({
        id: 'parent',
        children: [
          createNode({
            id: 'child-conn',
            path: { from: 'x', to: 'y' },
          }),
        ],
      }),
    ];
    const result = normalizeRoutes(nodes);
    expect(result[0].children[0].path!.route).toEqual(['x', 'y']);
    expect(result[0].children[0].path!.from).toBeUndefined();
    expect(result[0].children[0].path!.to).toBeUndefined();
  });

  it('leaves nodes without path unchanged', () => {
    const nodes: Node[] = [
      createNode({ id: 'box', rect: { w: 100, h: 60 } }),
    ];
    const result = normalizeRoutes(nodes);
    expect(result[0].rect).toEqual({ w: 100, h: 60 });
    expect(result[0].path).toBeUndefined();
  });

  it('handles from/to with ID+offset tuples', () => {
    const nodes: Node[] = [
      createNode({
        id: 'conn',
        path: { from: ['a', 10, 20], to: ['b', -5, 0] },
      }),
    ];
    const result = normalizeRoutes(nodes);
    expect(result[0].path!.route).toEqual([['a', 10, 20], ['b', -5, 0]]);
  });

  it('handles from/to with coordinate tuples', () => {
    const nodes: Node[] = [
      createNode({
        id: 'conn',
        path: { from: [0, 0], to: [100, 200] },
      }),
    ];
    const result = normalizeRoutes(nodes);
    expect(result[0].path!.route).toEqual([[0, 0], [100, 200]]);
  });
});
