import { describe, it, expect } from 'vitest';
import { flexStrategy } from '../../layout/flex';
import { createNode } from '../../types/node';

describe('flexStrategy', () => {
  it('lays out children in a row with gap', () => {
    const container = createNode({
      id: 'c',
      layout: { type: 'flex', direction: 'row', gap: 10 },
      rect: { w: 300, h: 100 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 50, h: 30 } }),
      createNode({ id: 'b', rect: { w: 50, h: 30 } }),
    ];
    const placements = flexStrategy(container, children);
    expect(placements).toHaveLength(2);
    // Center-origin: container is 300 wide, children start at -150 + child_center
    // First child center: -150 + 25 = -125
    // Second child center: -150 + 50 + 10 + 25 = -65
    expect(placements[0].x).toBe(-125);
    expect(placements[1].x).toBe(-65);
  });

  it('lays out children in a column', () => {
    const container = createNode({
      id: 'c',
      layout: { type: 'flex', direction: 'column', gap: 5 },
      rect: { w: 200, h: 200 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 80, h: 40 } }),
      createNode({ id: 'b', rect: { w: 80, h: 40 } }),
    ];
    const placements = flexStrategy(container, children);
    // First child center y: -100 + 20 = -80
    // Second child center y: -100 + 40 + 5 + 20 = -35
    expect(placements[0].y).toBe(-80);
    expect(placements[1].y).toBe(-35);
  });

  it('respects order hint', () => {
    const container = createNode({
      id: 'c',
      layout: { type: 'flex', direction: 'row', gap: 0 },
      rect: { w: 300, h: 100 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 50, h: 30 }, layoutHint: { order: 2 } }),
      createNode({ id: 'b', rect: { w: 50, h: 30 }, layoutHint: { order: 1 } }),
    ];
    const placements = flexStrategy(container, children);
    expect(placements[0].id).toBe('b');
    expect(placements[1].id).toBe('a');
  });

  it('distributes grow proportionally', () => {
    const container = createNode({
      id: 'c',
      layout: { type: 'flex', direction: 'row', gap: 0 },
      rect: { w: 200, h: 100 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 50, h: 30 }, layoutHint: { grow: 1 } }),
      createNode({ id: 'b', rect: { w: 50, h: 30 }, layoutHint: { grow: 1 } }),
    ];
    const placements = flexStrategy(container, children);
    // 200 - 100 base = 100 extra, split 50/50 → each 100 wide
    expect(placements[0].w).toBe(100);
    expect(placements[1].w).toBe(100);
  });

  it('centers children with justify center', () => {
    const container = createNode({
      id: 'c',
      layout: { type: 'flex', direction: 'row', gap: 0, justify: 'center' },
      rect: { w: 200, h: 100 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 50, h: 30 } }),
    ];
    const placements = flexStrategy(container, children);
    // Centered: child center at x=0
    expect(placements[0].x).toBe(0);
  });

  it('handles empty children', () => {
    const container = createNode({
      id: 'c',
      layout: { type: 'flex', direction: 'row' },
    });
    const placements = flexStrategy(container, []);
    expect(placements).toEqual([]);
  });

  it('uses ellipse size for layout', () => {
    const container = createNode({
      id: 'c',
      layout: { type: 'flex', direction: 'row', gap: 10 },
      rect: { w: 300, h: 100 },
    });
    const children = [
      createNode({ id: 'a', ellipse: { rx: 25, ry: 25 } }),
      createNode({ id: 'b', ellipse: { rx: 25, ry: 25 } }),
    ];
    const placements = flexStrategy(container, children);
    // First ellipse center: -150 + 25 = -125
    // Second ellipse center: -150 + 50 + 10 + 25 = -65
    expect(placements[1].x).toBe(-65);
  });
});
