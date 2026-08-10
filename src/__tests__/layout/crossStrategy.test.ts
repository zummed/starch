import { describe, it, expect } from 'vitest';
import { createNode } from '../../types/node';
import { computeLayoutPlacements } from '../../layout';

describe('cross-strategy slot animation', () => {
  it('mover gets placement from flex container when slot=flexBox', () => {
    const flexBox = createNode({
      id: 'flexBox',
      layout: { type: 'flex', direction: 'row', gap: 10 },
      rect: { w: 300, h: 100 },
      children: [createNode({ id: 'a', rect: { w: 50, h: 30 } })],
    });
    const mover = createNode({
      id: 'mover', rect: { w: 50, h: 30 },
      layout: { slot: 'flexBox' },
    });
    const results = computeLayoutPlacements([flexBox, mover]);
    const moverResult = results.find(r => r.nodeId === 'mover');
    expect(moverResult).toBeDefined();
    expect(moverResult!.isSlotMember).toBe(true);
  });

  it('mover gets placement from grid container when slot=gridBox', () => {
    const gridBox = createNode({
      id: 'gridBox',
      layout: { type: 'grid', columns: 2, gap: 0, padding: 0 },
      rect: { w: 200, h: 100 },
      children: [createNode({ id: 'a', rect: { w: 100, h: 100 } })],
    });
    const mover = createNode({
      id: 'mover', rect: { w: 100, h: 100 },
      layout: { slot: 'gridBox' },
    });
    const results = computeLayoutPlacements([gridBox, mover]);
    const moverResult = results.find(r => r.nodeId === 'mover');
    expect(moverResult).toBeDefined();
    expect(moverResult!.isSlotMember).toBe(true);
    // Mover auto-placed in col 1 (after 'a' in col 0): center at x=50
    expect(moverResult!.targetX).toBeCloseTo(50);
  });

  it('flex and grid containers can coexist in the same scene', () => {
    const flexBox = createNode({
      id: 'flexBox',
      layout: { type: 'flex', direction: 'row', gap: 0 },
      rect: { w: 200, h: 100 },
      children: [
        createNode({ id: 'f1', rect: { w: 100, h: 50 } }),
        createNode({ id: 'f2', rect: { w: 100, h: 50 } }),
      ],
    });
    const gridBox = createNode({
      id: 'gridBox',
      layout: { type: 'grid', columns: 2, gap: 0, padding: 0 },
      rect: { w: 200, h: 200 },
      children: [
        createNode({ id: 'g1', rect: { w: 100, h: 100 } }),
        createNode({ id: 'g2', rect: { w: 100, h: 100 } }),
      ],
    });
    const results = computeLayoutPlacements([flexBox, gridBox]);
    expect(results.filter(r => r.nodeId.startsWith('f'))).toHaveLength(2);
    expect(results.filter(r => r.nodeId.startsWith('g'))).toHaveLength(2);
  });

  it('circular container works with slot members', () => {
    const ring = createNode({
      id: 'ring',
      layout: { type: 'circular', radius: 100 },
      ellipse: { rx: 150, ry: 150 },
      children: [createNode({ id: 'n1', rect: { w: 30, h: 30 } })],
    });
    const mover = createNode({
      id: 'mover', rect: { w: 30, h: 30 },
      layout: { slot: 'ring' },
    });
    const results = computeLayoutPlacements([ring, mover]);
    const moverResult = results.find(r => r.nodeId === 'mover');
    expect(moverResult).toBeDefined();
    expect(moverResult!.isSlotMember).toBe(true);
  });
});
