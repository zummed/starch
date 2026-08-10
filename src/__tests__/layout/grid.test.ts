import { describe, it, expect, vi } from 'vitest';
import { gridConstraintStrategy } from '../../layout/strategies/grid';
import { Solver } from '../../layout/solver';
import { createNode } from '../../types/node';

function solveGrid(
  container: Parameters<typeof gridConstraintStrategy>[0],
  children: Parameters<typeof gridConstraintStrategy>[1],
) {
  const { constraints, variables, containerSize } = gridConstraintStrategy(container, children);
  const solver = new Solver();
  for (const c of constraints) solver.addConstraint(c);
  solver.solve();
  return { variables, constraints, containerSize };
}

describe('gridConstraintStrategy', () => {
  it('places 3 children in a 3-column grid', () => {
    const container = createNode({
      id: 'g',
      layout: { type: 'grid', columns: 3 },
      rect: { w: 300, h: 100 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 50, h: 30 } }),
      createNode({ id: 'b', rect: { w: 50, h: 30 } }),
      createNode({ id: 'c', rect: { w: 50, h: 30 } }),
    ];

    const { variables } = solveGrid(container, children);

    expect(variables.get('a.centerX')!.value).toBe(-100);
    expect(variables.get('b.centerX')!.value).toBe(0);
    expect(variables.get('c.centerX')!.value).toBe(100);
    expect(variables.get('a.centerY')!.value).toBe(0);
    expect(variables.get('b.centerY')!.value).toBe(0);
    expect(variables.get('c.centerY')!.value).toBe(0);
  });

  it('auto-wraps to multiple rows (2x2 grid)', () => {
    const container = createNode({
      id: 'g',
      layout: { type: 'grid', columns: 2 },
      rect: { w: 200, h: 200 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 40, h: 40 } }),
      createNode({ id: 'b', rect: { w: 40, h: 40 } }),
      createNode({ id: 'c', rect: { w: 40, h: 40 } }),
      createNode({ id: 'd', rect: { w: 40, h: 40 } }),
    ];

    const { variables } = solveGrid(container, children);

    expect(variables.get('a.centerX')!.value).toBe(-50);
    expect(variables.get('b.centerX')!.value).toBe(50);
    expect(variables.get('c.centerX')!.value).toBe(-50);
    expect(variables.get('d.centerX')!.value).toBe(50);
    expect(variables.get('a.centerY')!.value).toBe(-50);
    expect(variables.get('b.centerY')!.value).toBe(-50);
    expect(variables.get('c.centerY')!.value).toBe(50);
    expect(variables.get('d.centerY')!.value).toBe(50);
  });

  it('supports gap between columns and rows', () => {
    const container = createNode({
      id: 'g',
      layout: { type: 'grid', columns: 2, gap: 10 },
      rect: { w: 210, h: 100 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 40, h: 40 } }),
      createNode({ id: 'b', rect: { w: 40, h: 40 } }),
    ];

    const { variables } = solveGrid(container, children);

    expect(variables.get('a.centerX')!.value).toBe(-55);
    expect(variables.get('b.centerX')!.value).toBe(55);
  });

  it('supports padding', () => {
    const container = createNode({
      id: 'g',
      layout: { type: 'grid', columns: 1, padding: 20 },
      rect: { w: 200, h: 200 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 40, h: 40 } }),
    ];

    const { variables } = solveGrid(container, children);

    expect(variables.get('a.centerX')!.value).toBeCloseTo(0);
    expect(variables.get('a.centerY')!.value).toBeCloseTo(0);
  });

  it('respects gridCol/gridRow child hints (both explicit)', () => {
    const container = createNode({
      id: 'g',
      layout: { type: 'grid', columns: 3 },
      rect: { w: 300, h: 200 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 40, h: 40 }, layout: { gridCol: 3, gridRow: 2 } }),
    ];

    const { variables } = solveGrid(container, children);

    expect(variables.get('a.centerX')!.value).toBe(100);
    expect(variables.get('a.centerY')!.value).toBe(50);
  });

  it('supports colSpan across 2 columns', () => {
    const container = createNode({
      id: 'g',
      layout: { type: 'grid', columns: 3 },
      rect: { w: 300, h: 100 },
    });
    const children = [
      createNode({ id: 'wide', rect: { w: 40, h: 40 }, layout: { colSpan: 2 } }),
      createNode({ id: 'normal', rect: { w: 40, h: 40 } }),
    ];

    const { variables } = solveGrid(container, children);

    expect(variables.get('wide.centerX')!.value).toBe(-50);
    expect(variables.get('wide.width')!.value).toBe(200);
    expect(variables.get('normal.centerX')!.value).toBe(100);
    expect(variables.get('normal.width')!.value).toBe(100);
  });

  it('returns no constraints for empty children', () => {
    const container = createNode({
      id: 'g',
      layout: { type: 'grid', columns: 2 },
      rect: { w: 200, h: 200 },
    });

    const { constraints, variables } = solveGrid(container, []);

    expect(constraints.length).toBe(0);
    expect(variables.size).toBe(0);
  });

  it('gridCol-only hint reserves its column; auto children flow around it (partial-hint regression)', () => {
    // The shape used by the shipped grid sample and the design doc:
    // gridCol given without gridRow.
    const container = createNode({
      id: 'g',
      layout: { type: 'grid', columns: 3 },
      rect: { w: 300, h: 100 },
    });
    const children = [
      createNode({ id: 'm1', rect: { w: 40, h: 40 }, layout: { gridCol: 1, colSpan: 2 } }),
      createNode({ id: 'm2', rect: { w: 40, h: 40 } }),
    ];

    const { variables } = solveGrid(container, children);

    // m1 occupies columns 0-1 (spanW = 200), m2 auto-flows to column 2
    // instead of overlapping m1 (the pre-fix bug dumped gridCol-only hints
    // into the auto bucket, ignoring the column entirely).
    expect(variables.get('m1.centerX')!.value).toBe(-50);
    expect(variables.get('m1.width')!.value).toBe(200);
    expect(variables.get('m2.centerX')!.value).toBe(100);
  });

  it('gridRow-only hint reserves its row; column is auto-placed', () => {
    const container = createNode({
      id: 'g',
      layout: { type: 'grid', columns: 2 },
      rect: { w: 200, h: 200 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 40, h: 40 }, layout: { gridRow: 2 } }),
    ];

    const { variables } = solveGrid(container, children);

    // Row 2 (1-based) => 0-based row 1: cellH=100, cy=150, centerY=150-100=50
    expect(variables.get('a.centerY')!.value).toBe(50);
    // Auto column 0: cellW=100, cx=50, centerX=50-100=-50
    expect(variables.get('a.centerX')!.value).toBe(-50);
  });

  it('clamps colSpan to the column count instead of looping forever', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const container = createNode({
      id: 'g',
      layout: { type: 'grid', columns: 3 },
      rect: { w: 300, h: 100 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 40, h: 40 }, layout: { colSpan: 5 } }),
    ];

    const { variables } = solveGrid(container, children);

    // colSpan clamped from 5 to 3: spans the full 300-wide row.
    expect(variables.get('a.width')!.value).toBe(300);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('`rows` fixes the row count used for cellH, even when content uses fewer rows', () => {
    const container = createNode({
      id: 'g',
      layout: { type: 'grid', columns: 2, rows: 3 },
      rect: { w: 200, h: 300 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 40, h: 40 } }),
      createNode({ id: 'b', rect: { w: 40, h: 40 } }),
    ];

    const { variables } = solveGrid(container, children);

    // cellH = 300/3 = 100 (not 300/1 = 300, which content alone would give)
    expect(variables.get('a.centerY')!.value).toBe(-100);
  });

  it('`rows` reserves empty rows when auto-sizing height', () => {
    const container = createNode({
      id: 'g',
      layout: { type: 'grid', columns: 2, rows: 3 },
      rect: { w: 200, h: 0 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 40, h: 40 } }),
      createNode({ id: 'b', rect: { w: 40, h: 40 } }),
    ];

    const { containerSize } = solveGrid(container, children);

    // cellH defaults to cellW (100); 3 reserved rows => auto height 300, not 100.
    expect(containerSize).toEqual({ w: 200, h: 300 });
  });

  it('align=start keeps the child at its intrinsic size instead of stretching to the cell', () => {
    const container = createNode({
      id: 'g',
      layout: { type: 'grid', columns: 3, align: 'start' },
      rect: { w: 300, h: 100 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 40, h: 20 } }),
    ];

    const { variables } = solveGrid(container, children);

    expect(variables.get('a.width')!.value).toBe(40);
    expect(variables.get('a.height')!.value).toBe(20);
    // Anchored to the cell's top-left: cx = 0+20=20, centerX = 20-150=-130
    expect(variables.get('a.centerX')!.value).toBe(-130);
    expect(variables.get('a.centerY')!.value).toBe(-40);
  });

  it('guards against a non-positive container width: derives cellW from the widest child, no negative widths', () => {
    const container = createNode({
      id: 'g',
      layout: { type: 'grid', columns: 2 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 80, h: 40 } }),
      createNode({ id: 'b', rect: { w: 80, h: 40 } }),
    ];

    const { variables, containerSize } = solveGrid(container, children);

    expect(containerSize!.w).toBeGreaterThan(0);
    expect(variables.get('a.width')!.value).toBeGreaterThan(0);
    expect(variables.get('a.centerX')!.value).toBe(-40);
    expect(variables.get('b.centerX')!.value).toBe(40);
  });
});
