import { describe, it, expect } from 'vitest';
import { resolveEndpoint, resolveConnectionPath } from '../../renderer/connections';
import { createNode } from '../../types/node';

describe('resolveEndpoint', () => {
  const roots = [
    createNode({ id: 'a', transform: { x: 100, y: 50 } }),
    createNode({ id: 'b', transform: { x: 300, y: 150 } }),
  ];

  it('resolves string ID to node center', () => {
    const ep = resolveEndpoint('a', roots);
    expect(ep).toEqual({ x: 100, y: 50 });
  });

  it('resolves coordinate array', () => {
    const ep = resolveEndpoint([200, 300], roots);
    expect(ep).toEqual({ x: 200, y: 300 });
  });

  it('resolves ID + offset array', () => {
    const ep = resolveEndpoint(['a', 10, -5], roots);
    expect(ep).toEqual({ x: 110, y: 45 });
  });

  it('returns null for unknown ID', () => {
    const ep = resolveEndpoint('nonexistent', roots);
    expect(ep).toBeNull();
  });
});

describe('resolveConnectionPath', () => {
  const roots = [
    createNode({ id: 'a', transform: { x: 0, y: 0 } }),
    createNode({ id: 'b', transform: { x: 100, y: 0 } }),
  ];

  it('resolves a simple from/to connection', () => {
    const points = resolveConnectionPath({ from: 'a', to: 'b' }, roots);
    expect(points).toEqual([[0, 0], [100, 0]]);
  });

  it('resolves connection with bend', () => {
    const points = resolveConnectionPath({ from: 'a', to: 'b', bend: 1 }, roots);
    expect(points).toHaveLength(3); // from, control, to
    expect(points![1][1]).not.toBe(0); // control point is offset
  });

  it('resolves connection with route waypoints', () => {
    const points = resolveConnectionPath({
      from: 'a', to: 'b', route: [[50, 50]],
    }, roots);
    expect(points).toEqual([[0, 0], [50, 50], [100, 0]]);
  });

  it('returns null without from/to', () => {
    const points = resolveConnectionPath({ points: [[0,0],[1,1]] }, roots);
    expect(points).toBeNull();
  });
});
