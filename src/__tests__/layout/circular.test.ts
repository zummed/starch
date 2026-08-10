import { describe, it, expect } from 'vitest';
import { circularConstraintStrategy } from '../../layout/strategies/circular';
import { Solver } from '../../layout/solver';
import { createNode } from '../../types/node';

function solveCircular(
  container: Parameters<typeof circularConstraintStrategy>[0],
  children: Parameters<typeof circularConstraintStrategy>[1],
) {
  const { constraints, variables } = circularConstraintStrategy(container, children);
  const solver = new Solver();
  for (const c of constraints) solver.addConstraint(c);
  solver.solve();
  return { variables };
}

describe('circularConstraintStrategy', () => {
  it('places 4 nodes evenly around a full circle', () => {
    const container = createNode({
      id: 'c',
      layout: { type: 'circular', radius: 100 },
    });
    const children = [
      createNode({ id: 'a' }),
      createNode({ id: 'b' }),
      createNode({ id: 'c1' }),
      createNode({ id: 'd' }),
    ];

    const { variables } = solveCircular(container, children);

    // 0°: (100, 0)
    expect(variables.get('a.centerX')!.value).toBeCloseTo(100, 5);
    expect(variables.get('a.centerY')!.value).toBeCloseTo(0, 5);

    // 90°: (0, 100)
    expect(variables.get('b.centerX')!.value).toBeCloseTo(0, 5);
    expect(variables.get('b.centerY')!.value).toBeCloseTo(100, 5);

    // 180°: (-100, 0)
    expect(variables.get('c1.centerX')!.value).toBeCloseTo(-100, 5);
    expect(variables.get('c1.centerY')!.value).toBeCloseTo(0, 5);

    // 270°: (0, -100)
    expect(variables.get('d.centerX')!.value).toBeCloseTo(0, 5);
    expect(variables.get('d.centerY')!.value).toBeCloseTo(-100, 5);
  });

  it('respects startAngle=90 (first node at 0,100)', () => {
    const container = createNode({
      id: 'c',
      layout: { type: 'circular', radius: 100, startAngle: 90 },
    });
    const children = [createNode({ id: 'a' })];

    const { variables } = solveCircular(container, children);

    expect(variables.get('a.centerX')!.value).toBeCloseTo(0, 5);
    expect(variables.get('a.centerY')!.value).toBeCloseTo(100, 5);
  });

  it('places 3 nodes on a 180° arc, endpoint-inclusive', () => {
    const container = createNode({
      id: 'c',
      layout: { type: 'circular', radius: 100, sweep: 180 },
    });
    const children = [
      createNode({ id: 'a' }),
      createNode({ id: 'b' }),
      createNode({ id: 'c1' }),
    ];

    const { variables } = solveCircular(container, children);

    // Arc: sweep=180, 3 nodes, divisor = 2 (n-1) — endpoint-inclusive
    // 0°: (100, 0)
    expect(variables.get('a.centerX')!.value).toBeCloseTo(100, 5);
    expect(variables.get('a.centerY')!.value).toBeCloseTo(0, 5);

    // 90°: (0, 100)
    expect(variables.get('b.centerX')!.value).toBeCloseTo(0, 5);
    expect(variables.get('b.centerY')!.value).toBeCloseTo(100, 5);

    // 180°: (-100, 0) — lands exactly on the arc end
    expect(variables.get('c1.centerX')!.value).toBeCloseTo(-100, 5);
    expect(variables.get('c1.centerY')!.value).toBeCloseTo(0, 5);
  });

  it('places a single child at (radius, 0) for startAngle=0 (divisor guard)', () => {
    const container = createNode({
      id: 'c',
      layout: { type: 'circular', radius: 50 },
    });
    const children = [createNode({ id: 'a' })];

    const { variables } = solveCircular(container, children);

    expect(variables.get('a.centerX')!.value).toBeCloseTo(50, 5);
    expect(variables.get('a.centerY')!.value).toBeCloseTo(0, 5);
  });

  it('returns no constraints for empty children', () => {
    const container = createNode({
      id: 'c',
      layout: { type: 'circular', radius: 100 },
    });

    const { variables } = solveCircular(container, []);

    expect(variables.size).toBe(0);
  });
});
