import { describe, it, expect } from 'vitest';
import { flexConstraintStrategy } from '../../layout/flex';
import { Solver } from '../../layout/solver';
import { createNode } from '../../types/node';

function solveFlex(container: Parameters<typeof flexConstraintStrategy>[0], children: Parameters<typeof flexConstraintStrategy>[1]) {
  const { constraints, variables, containerSize } = flexConstraintStrategy(container, children);
  const solver = new Solver();
  for (const c of constraints) solver.addConstraint(c);
  const solveResult = solver.solve();
  return { variables, containerSize, solveResult };
}

describe('flexConstraintStrategy', () => {
  it('lays out a row with gap via chained main-axis constraints', () => {
    const container = createNode({
      id: 'c',
      layout: { type: 'flex', direction: 'row', gap: 10 },
      rect: { w: 300, h: 100 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 50, h: 30 } }),
      createNode({ id: 'b', rect: { w: 50, h: 30 } }),
    ];

    const { variables } = solveFlex(container, children);

    expect(variables.get('a.centerX')!.value).toBe(-125);
    expect(variables.get('b.centerX')!.value).toBe(-65);
  });

  it('lays out a column with gap', () => {
    const container = createNode({
      id: 'c',
      layout: { type: 'flex', direction: 'column', gap: 5 },
      rect: { w: 200, h: 200 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 80, h: 40 } }),
      createNode({ id: 'b', rect: { w: 80, h: 40 } }),
    ];

    const { variables } = solveFlex(container, children);

    expect(variables.get('a.centerY')!.value).toBe(-80);
    expect(variables.get('b.centerY')!.value).toBe(-35);
  });

  it('respects order hint', () => {
    const container = createNode({
      id: 'c',
      layout: { type: 'flex', direction: 'row', gap: 0 },
      rect: { w: 300, h: 100 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 50, h: 30 }, layout: { order: 2 } }),
      createNode({ id: 'b', rect: { w: 50, h: 30 }, layout: { order: 1 } }),
    ];

    const { variables } = solveFlex(container, children);

    // b (order 1) comes first: center at -150+25=-125; a follows at -150+50+25=-75
    expect(variables.get('b.centerX')!.value).toBe(-125);
    expect(variables.get('a.centerX')!.value).toBe(-75);
  });

  it('justify=center centers the single child', () => {
    const container = createNode({
      id: 'c',
      layout: { type: 'flex', direction: 'row', gap: 0, justify: 'center' },
      rect: { w: 200, h: 100 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 50, h: 30 } }),
    ];

    const { variables } = solveFlex(container, children);

    expect(variables.get('a.centerX')!.value).toBe(0);
  });

  it('justify=spaceBetween distributes gaps between items', () => {
    const container = createNode({
      id: 'c',
      layout: { type: 'flex', direction: 'row', gap: 0, justify: 'spaceBetween' },
      rect: { w: 300, h: 100 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 50, h: 30 } }),
      createNode({ id: 'b', rect: { w: 50, h: 30 } }),
      createNode({ id: 'c1', rect: { w: 50, h: 30 } }),
    ];

    const { variables } = solveFlex(container, children);

    expect(variables.get('a.centerX')!.value).toBe(-125);
    expect(variables.get('b.centerX')!.value).toBe(0);
    expect(variables.get('c1.centerX')!.value).toBe(125);
  });

  it('justify=spaceAround distributes half-gaps at the edges', () => {
    const container = createNode({
      id: 'c',
      layout: { type: 'flex', direction: 'row', gap: 0, justify: 'spaceAround' },
      rect: { w: 300, h: 100 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 50, h: 30 } }),
      createNode({ id: 'b', rect: { w: 50, h: 30 } }),
    ];

    const { variables } = solveFlex(container, children);

    expect(variables.get('a.centerX')!.value).toBe(-75);
    expect(variables.get('b.centerX')!.value).toBe(75);
  });

  it('grow distributes extra space proportionally and resizes width', () => {
    const container = createNode({
      id: 'c',
      layout: { type: 'flex', direction: 'row', gap: 0 },
      rect: { w: 200, h: 100 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 50, h: 30 }, layout: { grow: 1 } }),
      createNode({ id: 'b', rect: { w: 50, h: 30 }, layout: { grow: 1 } }),
    ];

    const { variables } = solveFlex(container, children);

    expect(variables.get('a.width')!.value).toBe(100);
    expect(variables.get('b.width')!.value).toBe(100);
  });

  it('align=stretch resizes the child to fill the cross axis', () => {
    const container = createNode({
      id: 'c',
      layout: { type: 'flex', direction: 'row', gap: 0, align: 'stretch' },
      rect: { w: 200, h: 100 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 50, h: 30 } }),
    ];

    const { variables } = solveFlex(container, children);

    expect(variables.get('a.height')!.value).toBe(100);
    expect(variables.get('a.centerY')!.value).toBe(0);
  });

  it('places a slot member (a node passed in that is not a structural child) using the same math', () => {
    // flexConstraintStrategy is composition-agnostic — it lays out whatever
    // children array it's given, regardless of where those nodes actually
    // live in the tree. Slot-member world/local conversion is the
    // registry's job (see registry.test.ts), not the strategy's.
    const container = createNode({
      id: 'c',
      layout: { type: 'flex', direction: 'row', gap: 0 },
      rect: { w: 200, h: 100 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 100, h: 50 } }),
      createNode({ id: 'mover', rect: { w: 100, h: 50 } }),
    ];

    const { variables } = solveFlex(container, children);

    expect(variables.get('a.centerX')!.value).toBe(-50);
    expect(variables.get('mover.centerX')!.value).toBe(50);
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

    const { variables } = solveFlex(container, children);

    expect(variables.get('a.centerX')!.value).toBe(-125);
    expect(variables.get('b.centerX')!.value).toBe(-65);
  });

  it('handles empty children', () => {
    const container = createNode({
      id: 'c',
      layout: { type: 'flex', direction: 'row' },
    });

    const { constraints, variables } = flexConstraintStrategy(container, []);

    expect(constraints).toEqual([]);
    expect(variables.size).toBe(0);
  });

  it('measures a template-wrapper child (no own geometry) by its children\'s union bounds, not a phantom default', () => {
    // Shaped like the `box` template: a bare id node with a bg rect and a
    // label as children, no geometry of its own.
    const wrapper = createNode({
      id: 'w',
      children: [
        createNode({ id: 'w.bg', rect: { w: 160, h: 70 } }),
        createNode({ id: 'w.label', text: { content: 'hi', size: 14 } }),
      ],
    });
    const container = createNode({
      id: 'c',
      layout: { type: 'flex', direction: 'row', gap: 0 },
    });
    const children = [wrapper, createNode({ id: 'b', rect: { w: 40, h: 20 } })];

    const { variables } = solveFlex(container, children);

    expect(variables.get('w.width')!.value).toBe(160);
    // b is spaced past the wrapper's real 160-wide bounds, not a 100-wide phantom.
    expect(variables.get('b.centerX')!.value).toBe(80);
  });
});
