import { describe, it, expect } from 'vitest';
import { Scene } from '../core/Scene';
import { buildTimeline } from '../engine/timeline';
import { createEvaluator } from '../engine/evaluator';
import { computeRenderOrder } from '../engine/renderOrder';

describe('integration: flexbox layout with animation', () => {
  it('complete scenario: objects in containers with keyframe animation', () => {
    const scene = new Scene();

    scene.box('sidebar', {
      x: 100, y: 200, fill: '#eee', radius: 8,
      direction: 'column', gap: 10, padding: 16,
    });
    scene.box('item1', { w: 80, h: 40, group: 'sidebar' });
    scene.box('item2', { w: 80, h: 40, group: 'sidebar' });

    scene.box('main', {
      x: 400, y: 200, fill: '#ddd',
      direction: 'row', gap: 10, padding: 16,
    });

    scene.animate({ duration: 5 })
      .keyframe(2, {
        item1: { group: 'main' },
      });

    const objects = scene.getObjects();
    const animConfig = scene.getAnimConfig();
    const tracks = buildTimeline(animConfig, objects);
    const evaluate = createEvaluator();

    // At t=0: item1 and item2 are in sidebar
    const t0 = evaluate(objects, tracks, 0);
    expect(t0.item1.group).toBe('sidebar');
    expect(t0.item2.group).toBe('sidebar');
    const sidebarX = t0.sidebar.x as number;
    expect(Math.abs((t0.item1.x as number) - sidebarX)).toBeLessThan(200);

    // At t=2+: item1 should be in main (use a fresh evaluator to avoid blend state)
    const evaluate3 = createEvaluator();
    const t3 = evaluate3(objects, tracks, 3);
    expect(t3.item1.group).toBe('main');
    const mainX = t3.main.x as number;
    expect(Math.abs((t3.item1.x as number) - mainX)).toBeLessThan(200);

    // Render order should include all objects
    const order = computeRenderOrder(objects, t0);
    expect(order).toHaveLength(4);
  });

  it('grow distributes space correctly', () => {
    const scene = new Scene();

    scene.box('row', {
      x: 0, y: 0, w: 300, h: 50,
      direction: 'row', gap: 0, padding: 0,
    });
    scene.box('a', { w: 50, h: 40, group: 'row', grow: 1 });
    scene.box('b', { w: 50, h: 40, group: 'row', grow: 1 });

    const objects = scene.getObjects();
    const tracks = buildTimeline(scene.getAnimConfig(), objects);
    const evaluate = createEvaluator();
    const result = evaluate(objects, tracks, 0);

    const aW = (result.a._layoutW as number) || (result.a.w as number);
    const bW = (result.b._layoutW as number) || (result.b.w as number);
    expect(aW).toBeCloseTo(150, 0);
    expect(bW).toBeCloseTo(150, 0);
  });

  it('nested containers work correctly', () => {
    const scene = new Scene();

    scene.box('outer', {
      x: 200, y: 200, direction: 'column', gap: 20,
    });
    scene.box('inner', {
      direction: 'row', gap: 5, group: 'outer',
    });
    scene.box('a', { w: 40, h: 30, group: 'inner' });
    scene.box('b', { w: 40, h: 30, group: 'inner' });
    scene.box('c', { w: 80, h: 40, group: 'outer' });

    const objects = scene.getObjects();
    const tracks = buildTimeline(scene.getAnimConfig(), objects);
    const evaluate = createEvaluator();
    const result = evaluate(objects, tracks, 0);

    expect(result.a.x).not.toBe(result.b.x);
    expect(result.a.y).toBe(result.b.y);
    expect(result.c.y).toBeGreaterThan(result.a.y as number);
  });

  it('opacity cascades from parent to child', () => {
    const scene = new Scene();

    scene.box('container', {
      x: 0, y: 0, direction: 'row', opacity: 0.5,
    });
    scene.box('child', { group: 'container', opacity: 0.6 });

    const objects = scene.getObjects();
    const tracks = buildTimeline(scene.getAnimConfig(), objects);
    const evaluate = createEvaluator();
    const result = evaluate(objects, tracks, 0);

    expect(result.child.opacity).toBeCloseTo(0.3);
  });

  it('at-ref tracking: dependent follows target during animation', () => {
    const scene = new Scene();

    scene.box('target', { x: 100, y: 100 });
    scene.box('follower', { at: 'target', x: 20, y: 10 } as never);

    scene.animate({ duration: 2 })
      .keyframe(0, { target: { x: 100 } })
      .keyframe(2, { target: { x: 300 } });

    const objects = scene.getObjects();
    const tracks = buildTimeline(scene.getAnimConfig(), objects);
    const evaluate = createEvaluator();

    // At t=0: follower at target(100,100) + offset(20,10)
    const t0 = evaluate(objects, tracks, 0);
    expect(t0.follower.x).toBe(120);
    expect(t0.follower.y).toBe(110);

    // At t=2: follower at target(300,100) + offset(20,10)
    const t2 = evaluate(objects, tracks, 2);
    expect(t2.follower.x).toBe(320);
    expect(t2.follower.y).toBe(110);
  });

  it('animated styles propagate to all objects using them', () => {
    const scene = new Scene();

    scene.defineStyle('theme', { fill: '#22d3ee', stroke: '#1a9cb0' });
    scene.box('a', { x: 100, y: 100, style: 'theme' } as never);
    scene.box('b', { x: 300, y: 100, style: 'theme' } as never);

    scene.animate({ duration: 2 })
      .keyframe(0, { theme: { fill: '#22d3ee' } })
      .keyframe(2, { theme: { fill: '#ff0000' } });

    const objects = scene.getObjects();
    const styles = scene.getStyles();
    const tracks = buildTimeline(scene.getAnimConfig(), objects, styles);
    const evaluate = createEvaluator([], styles);

    const t0 = evaluate(objects, tracks, 0);
    expect(t0.a.fill).toBe('#22d3ee');
    expect(t0.b.fill).toBe('#22d3ee');

    const t2 = evaluate(objects, tracks, 2);
    expect(t2.a.fill).toBe('#ff0000');
    expect(t2.b.fill).toBe('#ff0000');
  });
});
