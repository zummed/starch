import { describe, it, expect } from 'vitest';
import type { SceneObject, Tracks } from '../../core/types';
import { createEvaluator } from '../evaluator';

function makeObj(id: string, props: Record<string, unknown> = {}): SceneObject {
  return {
    type: 'box',
    id,
    props: { x: 0, y: 0, w: 100, h: 50, ...props } as never,
    _definitionOrder: 0,
  };
}

describe('createEvaluator', () => {
  it('evaluates basic property interpolation', () => {
    const objects: Record<string, SceneObject> = {
      box1: makeObj('box1', { x: 0, y: 0 }),
    };
    const tracks: Tracks = {
      'box1.x': [
        { time: 0, value: 0, easing: 'linear' },
        { time: 1, value: 100, easing: 'linear' },
      ],
    };
    const evaluate = createEvaluator();
    const result = evaluate(objects, tracks, 0.5);
    expect(result.box1.x).toBe(50);
  });

  it('runs layout for grouped items', () => {
    const objects: Record<string, SceneObject> = {
      container: makeObj('container', { x: 100, y: 100, direction: 'row', gap: 10, justify: 'start', align: 'start' }),
      item1: makeObj('item1', { group: 'container', w: 80, h: 40 }),
    };
    const tracks: Tracks = {};
    const evaluate = createEvaluator();
    const result = evaluate(objects, tracks, 0);
    expect(result.item1.x).toBeDefined();
    expect(typeof result.item1.x).toBe('number');
  });

  it('cascades parent opacity to children by default', () => {
    const objects: Record<string, SceneObject> = {
      container: makeObj('container', { x: 0, y: 0, direction: 'row', opacity: 0.5, justify: 'start', align: 'start' }),
      item1: makeObj('item1', { group: 'container', opacity: 0.8 }),
    };
    const tracks: Tracks = {};
    const evaluate = createEvaluator();
    const result = evaluate(objects, tracks, 0);
    expect(result.item1.opacity).toBeCloseTo(0.4);
  });

  it('respects cascadeOpacity: false', () => {
    const objects: Record<string, SceneObject> = {
      container: makeObj('container', { x: 0, y: 0, direction: 'row', opacity: 0.5, cascadeOpacity: false, justify: 'start', align: 'start' }),
      item1: makeObj('item1', { group: 'container', opacity: 0.8 }),
    };
    const tracks: Tracks = {};
    const evaluate = createEvaluator();
    const result = evaluate(objects, tracks, 0);
    expect(result.item1.opacity).toBeCloseTo(0.8);
  });

  it('computes correct world-space positions for grouped items', () => {
    const objects: Record<string, SceneObject> = {
      container: makeObj('container', { x: 200, y: 100, direction: 'row', gap: 0, justify: 'start', align: 'start', w: 200, h: 50 }),
      item1: makeObj('item1', { group: 'container', w: 80, h: 40 }),
    };
    const tracks: Tracks = {};
    const evaluate = createEvaluator();
    const result = evaluate(objects, tracks, 0);
    expect(typeof result.item1.x).toBe('number');
    expect(Math.abs((result.item1.x as number) - 200)).toBeLessThan(150);
  });

  it('blends position smoothly during group transition', () => {
    const objects: Record<string, SceneObject> = {
      groupA: makeObj('groupA', { x: 0, y: 0, direction: 'row', justify: 'start', align: 'start' }),
      groupB: makeObj('groupB', { x: 400, y: 0, direction: 'row', justify: 'start', align: 'start' }),
      item: makeObj('item', { group: 'groupA', w: 80, h: 40 }),
    };
    const tracks: Tracks = {
      'item.group': [
        { time: 0, value: 'groupA', easing: 'linear' },
        { time: 2, value: 'groupB', easing: 'linear' },
      ],
    };
    const evaluate = createEvaluator();
    const t0 = evaluate(objects, tracks, 0);
    const nearA = t0.item.x as number;

    const tMid = evaluate(objects, tracks, 1);
    const midX = tMid.item.x as number;
    expect(midX).toBeGreaterThan(nearA);
    expect(midX).toBeLessThan(400);

    const tEnd = evaluate(objects, tracks, 2);
    const endX = tEnd.item.x as number;
    expect(Math.abs(endX - 400)).toBeLessThan(100);
  });

  it('resets blend state on seek', () => {
    const objects: Record<string, SceneObject> = {
      container: makeObj('container', { x: 100, y: 0, direction: 'row', justify: 'start', align: 'start' }),
      item: makeObj('item', { group: 'container', w: 80, h: 40 }),
    };
    const tracks: Tracks = {};
    const evaluate = createEvaluator();
    evaluate(objects, tracks, 0);
    evaluate(objects, tracks, 0.5);
    evaluate.reset();
    const result = evaluate(objects, tracks, 0);
    expect(typeof result.item.x).toBe('number');
  });
});
