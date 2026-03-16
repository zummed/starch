import { describe, it, expect } from 'vitest';
import type { SceneObject } from '../../core/types';
import { computeLayout } from '../layout';

function makeObj(
  id: string,
  type: 'box' | 'circle' = 'box',
  props: Record<string, unknown> = {},
  definitionOrder = 0,
): SceneObject {
  return {
    type,
    id,
    props: { x: 0, y: 0, w: 100, h: 50, ...props } as never,
    _definitionOrder: definitionOrder,
  };
}

describe('computeLayout', () => {
  it('returns unmodified props for ungrouped objects', () => {
    const objects: Record<string, SceneObject> = {
      a: makeObj('a', 'box', { x: 10, y: 20 }),
    };
    const props: Record<string, Record<string, unknown>> = {
      a: { x: 10, y: 20, w: 100, h: 50 },
    };
    computeLayout(objects, props);
    expect(props.a.x).toBe(10);
    expect(props.a.y).toBe(20);
  });

  it('lays out children in a row', () => {
    const objects: Record<string, SceneObject> = {
      container: makeObj('container', 'box', { x: 200, y: 100, direction: 'row', gap: 10, justify: 'start', align: 'start' }),
      a: makeObj('a', 'box', { group: 'container', w: 80, h: 40 }, 0),
      b: makeObj('b', 'box', { group: 'container', w: 80, h: 40 }, 1),
    };
    const props: Record<string, Record<string, unknown>> = {
      container: { ...objects.container.props as Record<string, unknown> },
      a: { ...objects.a.props as Record<string, unknown> },
      b: { ...objects.b.props as Record<string, unknown> },
    };
    computeLayout(objects, props);
    expect(props.a.x).toBeLessThan(props.b.x as number);
  });

  it('lays out children in a column', () => {
    const objects: Record<string, SceneObject> = {
      container: makeObj('container', 'box', { x: 100, y: 100, direction: 'column', gap: 10, justify: 'start', align: 'start' }),
      a: makeObj('a', 'box', { group: 'container', w: 80, h: 40 }, 0),
      b: makeObj('b', 'box', { group: 'container', w: 80, h: 40 }, 1),
    };
    const props: Record<string, Record<string, unknown>> = {
      container: { ...objects.container.props as Record<string, unknown> },
      a: { ...objects.a.props as Record<string, unknown> },
      b: { ...objects.b.props as Record<string, unknown> },
    };
    computeLayout(objects, props);
    expect(props.a.y).toBeLessThan(props.b.y as number);
    expect(props.a.x).toBe(props.b.x);
  });

  it('respects order property', () => {
    const objects: Record<string, SceneObject> = {
      container: makeObj('container', 'box', { x: 100, y: 100, direction: 'row', justify: 'start', align: 'start' }),
      a: makeObj('a', 'box', { group: 'container', w: 80, h: 40, order: 2 }, 0),
      b: makeObj('b', 'box', { group: 'container', w: 80, h: 40, order: 1 }, 1),
    };
    const props: Record<string, Record<string, unknown>> = {
      container: { ...objects.container.props as Record<string, unknown> },
      a: { ...objects.a.props as Record<string, unknown> },
      b: { ...objects.b.props as Record<string, unknown> },
    };
    computeLayout(objects, props);
    expect(props.b.x).toBeLessThan(props.a.x as number);
  });

  it('distributes grow space proportionally', () => {
    const objects: Record<string, SceneObject> = {
      container: makeObj('container', 'box', { x: 0, y: 0, w: 300, h: 50, direction: 'row', justify: 'start', align: 'start' }),
      a: makeObj('a', 'box', { group: 'container', w: 50, h: 40, grow: 1 }, 0),
      b: makeObj('b', 'box', { group: 'container', w: 50, h: 40, grow: 2 }, 1),
    };
    const props: Record<string, Record<string, unknown>> = {
      container: { ...objects.container.props as Record<string, unknown> },
      a: { ...objects.a.props as Record<string, unknown> },
      b: { ...objects.b.props as Record<string, unknown> },
    };
    computeLayout(objects, props);
    const aWidth = (props.a._layoutW as number) || (props.a.w as number);
    const bWidth = (props.b._layoutW as number) || (props.b.w as number);
    expect(bWidth).toBeGreaterThan(aWidth);
    expect(aWidth).toBeCloseTo(50 + 200 / 3, 0);
    expect(bWidth).toBeCloseTo(50 + 400 / 3, 0);
  });

  it('auto-sizes container when w/h not set', () => {
    const objects: Record<string, SceneObject> = {
      container: makeObj('container', 'box', { x: 100, y: 100, direction: 'row', gap: 10, padding: 20, justify: 'start', align: 'start' }),
      a: makeObj('a', 'box', { group: 'container', w: 80, h: 40 }, 0),
      b: makeObj('b', 'box', { group: 'container', w: 60, h: 30 }, 1),
    };
    const props: Record<string, Record<string, unknown>> = {
      container: { x: 100, y: 100, direction: 'row', gap: 10, padding: 20, justify: 'start', align: 'start' },
      a: { x: 0, y: 0, w: 80, h: 40, group: 'container' },
      b: { x: 0, y: 0, w: 60, h: 30, group: 'container' },
    };
    computeLayout(objects, props);
    expect(props.container._layoutW).toBe(190);
    expect(props.container._layoutH).toBe(80);
  });

  it('handles spaceBetween justify', () => {
    const objects: Record<string, SceneObject> = {
      container: makeObj('container', 'box', { x: 0, y: 0, w: 300, h: 50, direction: 'row', justify: 'spaceBetween', align: 'start' }),
      a: makeObj('a', 'box', { group: 'container', w: 50, h: 40 }, 0),
      b: makeObj('b', 'box', { group: 'container', w: 50, h: 40 }, 1),
      c: makeObj('c', 'box', { group: 'container', w: 50, h: 40 }, 2),
    };
    const props: Record<string, Record<string, unknown>> = {
      container: { ...objects.container.props as Record<string, unknown> },
      a: { ...objects.a.props as Record<string, unknown> },
      b: { ...objects.b.props as Record<string, unknown> },
      c: { ...objects.c.props as Record<string, unknown> },
    };
    computeLayout(objects, props);
    const aX = props.a.x as number;
    const bX = props.b.x as number;
    const cX = props.c.x as number;
    expect(bX - aX).toBeCloseTo(cX - bX, 0);
  });

  it('handles nested containers', () => {
    const objects: Record<string, SceneObject> = {
      outer: makeObj('outer', 'box', { x: 100, y: 100, direction: 'column', gap: 10, justify: 'start', align: 'start' }),
      inner: makeObj('inner', 'box', { group: 'outer', direction: 'row', gap: 5, justify: 'start', align: 'start' }, 0),
      a: makeObj('a', 'box', { group: 'inner', w: 40, h: 30 }, 0),
      b: makeObj('b', 'box', { group: 'inner', w: 40, h: 30 }, 1),
      c: makeObj('c', 'box', { group: 'outer', w: 80, h: 40 }, 1),
    };
    const props: Record<string, Record<string, unknown>> = {
      outer: { x: 100, y: 100, direction: 'column', gap: 10, justify: 'start', align: 'start' },
      inner: { x: 0, y: 0, direction: 'row', gap: 5, group: 'outer', justify: 'start', align: 'start' },
      a: { x: 0, y: 0, w: 40, h: 30, group: 'inner' },
      b: { x: 0, y: 0, w: 40, h: 30, group: 'inner' },
      c: { x: 0, y: 0, w: 80, h: 40, group: 'outer' },
    };
    computeLayout(objects, props);
    expect(props.a.x).toBeLessThan(props.b.x as number);
    expect(props.c.y).toBeGreaterThan(props.a.y as number);
  });

  it('handles cross-axis stretch', () => {
    const objects: Record<string, SceneObject> = {
      container: makeObj('container', 'box', { x: 0, y: 0, w: 200, h: 100, direction: 'row', align: 'stretch', justify: 'start' }),
      a: makeObj('a', 'box', { group: 'container', w: 50, h: 30 }, 0),
    };
    const props: Record<string, Record<string, unknown>> = {
      container: { ...objects.container.props as Record<string, unknown> },
      a: { ...objects.a.props as Record<string, unknown> },
    };
    computeLayout(objects, props);
    expect(props.a._layoutH).toBe(100);
  });

  it('ignores items with group pointing to nonexistent container', () => {
    const objects: Record<string, SceneObject> = {
      a: makeObj('a', 'box', { x: 50, y: 50, group: 'doesNotExist' }),
    };
    const props: Record<string, Record<string, unknown>> = {
      a: { x: 50, y: 50, w: 100, h: 50, group: 'doesNotExist' },
    };
    computeLayout(objects, props);
    expect(props.a.x).toBe(50);
    expect(props.a.y).toBe(50);
  });
});
