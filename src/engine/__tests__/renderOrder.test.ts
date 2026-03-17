import { describe, it, expect } from 'vitest';
import type { SceneObject } from '../../core/types';
import { computeRenderOrder } from '../renderOrder';

function makeObj(id: string, type: string, props: Record<string, unknown> = {}): SceneObject {
  return { type: type as 'box', id, props: { x: 0, y: 0, ...props } as never };
}

describe('computeRenderOrder', () => {
  it('renders all top-level objects (no groupId filtering)', () => {
    const objects: Record<string, SceneObject> = {
      a: makeObj('a', 'box'),
      b: makeObj('b', 'box', { group: 'a' }),
    };
    const allProps: Record<string, Record<string, unknown>> = {
      a: { x: 0, y: 0, direction: 'row' },
      b: { x: 0, y: 0, group: 'a' },
    };
    const order = computeRenderOrder(objects, allProps);
    expect(order.map(([id]) => id)).toContain('a');
    expect(order.map(([id]) => id)).toContain('b');
  });

  it('renders containers below their children', () => {
    const objects: Record<string, SceneObject> = {
      container: makeObj('container', 'box', { direction: 'row' }),
      child: makeObj('child', 'box', { group: 'container' }),
    };
    const allProps: Record<string, Record<string, unknown>> = {
      container: { x: 0, y: 0, direction: 'row' },
      child: { x: 0, y: 0, group: 'container' },
    };
    const order = computeRenderOrder(objects, allProps);
    const containerIdx = order.findIndex(([id]) => id === 'container');
    const childIdx = order.findIndex(([id]) => id === 'child');
    expect(containerIdx).toBeLessThan(childIdx);
  });
});
