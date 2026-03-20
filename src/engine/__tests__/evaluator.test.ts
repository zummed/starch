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

    // At t=0, item is fully in groupA
    const t0 = evaluate(objects, tracks, 0);
    const nearA = t0.item.x as number;

    // At t=1 (midpoint), item should be between groups (time-based blend)
    const tMid = evaluate(objects, tracks, 1);
    const midX = tMid.item.x as number;
    expect(midX).toBeGreaterThan(nearA);
    expect(midX).toBeLessThan(400);

    // At t=2, item should be fully in groupB
    const tEnd = evaluate(objects, tracks, 2);
    const endX = tEnd.item.x as number;
    expect(Math.abs(endX - 400)).toBeLessThan(100);
  });

  it('group transition works after seek (stateless)', () => {
    const objects: Record<string, SceneObject> = {
      groupA: makeObj('groupA', { x: 0, y: 0, direction: 'row', justify: 'start', align: 'start' }),
      groupB: makeObj('groupB', { x: 400, y: 0, direction: 'row', justify: 'start', align: 'start' }),
      item: makeObj('item', { group: 'groupA', w: 80, h: 40 }),
    };
    const tracks: Tracks = {
      'item.group': [
        { time: 0, value: 'groupA', easing: 'linear' },
        { time: 2, value: 'groupB', easing: 'easeInOut' },
      ],
    };
    const evaluate = createEvaluator();

    // Seek directly to midpoint — no prior frames needed
    evaluate.reset();
    const result = evaluate(objects, tracks, 1);
    const midX = result.item.x as number;
    expect(midX).toBeGreaterThan(0);
    expect(midX).toBeLessThan(400);
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

describe('at-reference tracking', () => {
  it('object follows its at-ref target', () => {
    const objects: Record<string, SceneObject> = {
      A: makeObj('A', { x: 100, y: 200 }),
      B: makeObj('B', { x: 0, y: 0, at: 'A' }),
    };
    const tracks: Tracks = {
      'A.x': [
        { time: 0, value: 100, easing: 'linear' },
        { time: 2, value: 300, easing: 'linear' },
      ],
    };
    const evaluate = createEvaluator();

    const t0 = evaluate(objects, tracks, 0);
    expect(t0.B.x).toBe(100);
    expect(t0.B.y).toBe(200);

    const t1 = evaluate(objects, tracks, 1);
    expect(t1.B.x).toBe(200);
    expect(t1.B.y).toBe(200);

    const t2 = evaluate(objects, tracks, 2);
    expect(t2.B.x).toBe(300);
    expect(t2.B.y).toBe(200);
  });

  it('applies offset from x/y when following at-ref', () => {
    const objects: Record<string, SceneObject> = {
      A: makeObj('A', { x: 100, y: 100 }),
      B: makeObj('B', { x: 50, y: 30, at: 'A' }),
    };
    const tracks: Tracks = {
      'A.x': [
        { time: 0, value: 100, easing: 'linear' },
        { time: 1, value: 200, easing: 'linear' },
      ],
    };
    const evaluate = createEvaluator();

    const t0 = evaluate(objects, tracks, 0);
    expect(t0.B.x).toBe(150);
    expect(t0.B.y).toBe(130);

    const t1 = evaluate(objects, tracks, 1);
    expect(t1.B.x).toBe(250);
    expect(t1.B.y).toBe(130);
  });

  it('handles chained at-refs (C→B→A)', () => {
    const objects: Record<string, SceneObject> = {
      A: makeObj('A', { x: 100, y: 100 }),
      B: makeObj('B', { x: 10, y: 0, at: 'A' }),
      C: makeObj('C', { x: 5, y: 0, at: 'B' }),
    };
    const tracks: Tracks = {
      'A.x': [
        { time: 0, value: 100, easing: 'linear' },
        { time: 1, value: 200, easing: 'linear' },
      ],
    };
    const evaluate = createEvaluator();

    const t0 = evaluate(objects, tracks, 0);
    expect(t0.B.x).toBe(110); // A.x + 10
    expect(t0.C.x).toBe(115); // A.x + 10 + 5

    const t1 = evaluate(objects, tracks, 1);
    expect(t1.B.x).toBe(210);
    expect(t1.C.x).toBe(215);
  });

  it('does not crash on circular at-refs', () => {
    const objects: Record<string, SceneObject> = {
      A: makeObj('A', { x: 100, y: 100, at: 'B' }),
      B: makeObj('B', { x: 50, y: 50, at: 'A' }),
    };
    const tracks: Tracks = {};
    const evaluate = createEvaluator();
    // Should not throw or infinite-loop
    const result = evaluate(objects, tracks, 0);
    expect(typeof result.A.x).toBe('number');
    expect(typeof result.B.x).toBe('number');
  });

  it('own x/y keyframes animate the offset relative to at-ref', () => {
    const objects: Record<string, SceneObject> = {
      A: makeObj('A', { x: 100, y: 100 }),
      B: makeObj('B', { x: 0, y: 0, at: 'A' }),
    };
    const tracks: Tracks = {
      'A.x': [
        { time: 0, value: 100, easing: 'linear' },
        { time: 1, value: 200, easing: 'linear' },
      ],
      // B's x track animates its offset from A
      'B.x': [
        { time: 0, value: 0, easing: 'linear' },
        { time: 1, value: 50, easing: 'linear' },
      ],
    };
    const evaluate = createEvaluator();

    // t=0: B offset 0 + A at 100 = 100
    const t0 = evaluate(objects, tracks, 0);
    expect(t0.B.x).toBe(100);

    // t=0.5: B offset 25 + A at 150 = 175
    const tMid = evaluate(objects, tracks, 0.5);
    expect(tMid.B.x).toBe(175);

    // t=1: B offset 50 + A at 200 = 250
    const t1 = evaluate(objects, tracks, 1);
    expect(t1.B.x).toBe(250);
  });

  it('works with no animation (static diagram)', () => {
    const objects: Record<string, SceneObject> = {
      A: makeObj('A', { x: 200, y: 300 }),
      B: makeObj('B', { x: 10, y: 20, at: 'A' }),
    };
    const tracks: Tracks = {};
    const evaluate = createEvaluator();
    const result = evaluate(objects, tracks, 0);
    expect(result.B.x).toBe(210);
    expect(result.B.y).toBe(320);
  });
});
