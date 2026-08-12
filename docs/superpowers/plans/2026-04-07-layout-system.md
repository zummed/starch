# Layout System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the direct-computation layout engine with a constraint-based solver that supports multiple layout strategies (flex, grid, circular) with cross-strategy slot animation.

**Architecture:** Layout strategies generate constraints (linear equalities/inequalities with priorities). A custom Cassowary-inspired solver resolves all constraints in one pass and maps the solution back to ChildPlacement[]. The solver runs at timeline-build time, not per frame. The LayoutSchema is extended with new strategy-specific properties while keeping backward compatibility.

**Tech Stack:** TypeScript, Zod (schemas), Vitest (tests), custom constraint solver

**Design doc:** `docs/design-layout-system.md`

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `src/layout/solver.ts` | Constraint solver: Variable, Expression, Constraint, Solver classes |
| `src/layout/strategies/grid.ts` | Grid layout strategy — constraint generation |
| `src/layout/strategies/circular.ts` | Circular layout strategy — constraint generation |
| `src/__tests__/layout/solver.test.ts` | Solver unit tests |
| `src/__tests__/layout/grid.test.ts` | Grid strategy tests |
| `src/__tests__/layout/circular.test.ts` | Circular strategy tests |
| `src/__tests__/layout/constraintFlex.test.ts` | Flex-via-constraints parity tests |

### Modified files
| File | Changes |
|------|---------|
| `src/layout/flex.ts` | Refactor to generate Constraint[] instead of ChildPlacement[] |
| `src/layout/registry.ts` | Add constraint pipeline: collect → solve → extract placements |
| `src/types/properties.ts` | Add grid/circular/dag properties to LayoutSchema |
| `src/types/node.ts` | Update Layout type import (automatic from properties.ts change) |
| `src/dsl/astEmitter.ts` | Handle new layout properties in emission |
| `src/dsl/hintExecutors.ts` | Accept new kwargs for layout parsing |
| `src/animation/timeline.ts` | Register new strategies in ensureStrategies() |
| `src/StarchDiagram.ts` | Register new strategies at startup |
| `src/types/schemaRegistry.ts` | No changes needed (re-exports LayoutSchema, flat schema navigates fine) |

---

## Task 1: Constraint Solver — Core Types

**Files:**
- Create: `src/layout/solver.ts`
- Test: `src/__tests__/layout/solver.test.ts`

- [ ] **Step 1: Write failing tests for Variable and Expression**

```typescript
// src/__tests__/layout/solver.test.ts
import { describe, it, expect } from 'vitest';
import { Variable, Expression } from '../../layout/solver';

describe('Variable', () => {
  it('creates a variable with name and default value 0', () => {
    const v = new Variable('x');
    expect(v.name).toBe('x');
    expect(v.value).toBe(0);
  });
});

describe('Expression', () => {
  it('creates from a constant', () => {
    const e = Expression.fromConstant(5);
    expect(e.constant).toBe(5);
    expect(e.terms.size).toBe(0);
  });

  it('creates from a variable', () => {
    const v = new Variable('x');
    const e = Expression.fromVariable(v);
    expect(e.terms.get(v)).toBe(1);
    expect(e.constant).toBe(0);
  });

  it('creates from a variable with coefficient', () => {
    const v = new Variable('x');
    const e = Expression.fromVariable(v, 3);
    expect(e.terms.get(v)).toBe(3);
  });

  it('adds two expressions', () => {
    const x = new Variable('x');
    const y = new Variable('y');
    const a = Expression.fromVariable(x, 2).plus(Expression.fromConstant(3));
    const b = Expression.fromVariable(y, 4).plus(Expression.fromVariable(x, 1));
    const sum = a.plus(b);
    expect(sum.terms.get(x)).toBe(3);
    expect(sum.terms.get(y)).toBe(4);
    expect(sum.constant).toBe(3);
  });

  it('subtracts two expressions', () => {
    const x = new Variable('x');
    const a = Expression.fromVariable(x, 5).plus(Expression.fromConstant(10));
    const b = Expression.fromVariable(x, 2).plus(Expression.fromConstant(3));
    const diff = a.minus(b);
    expect(diff.terms.get(x)).toBe(3);
    expect(diff.constant).toBe(7);
  });

  it('multiplies by scalar', () => {
    const x = new Variable('x');
    const e = Expression.fromVariable(x, 3).plus(Expression.fromConstant(2));
    const scaled = e.times(4);
    expect(scaled.terms.get(x)).toBe(12);
    expect(scaled.constant).toBe(8);
  });

  it('negates', () => {
    const x = new Variable('x');
    const e = Expression.fromVariable(x, 3).plus(Expression.fromConstant(2));
    const neg = e.negate();
    expect(neg.terms.get(x)).toBe(-3);
    expect(neg.constant).toBe(-2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/layout/solver.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement Variable and Expression**

```typescript
// src/layout/solver.ts

export class Variable {
  value: number;
  constructor(public name: string, value: number = 0) {
    this.value = value;
  }
}

export class Expression {
  constructor(
    public terms: Map<Variable, number> = new Map(),
    public constant: number = 0,
  ) {}

  static fromConstant(c: number): Expression {
    return new Expression(new Map(), c);
  }

  static fromVariable(v: Variable, coeff: number = 1): Expression {
    const terms = new Map<Variable, number>();
    terms.set(v, coeff);
    return new Expression(terms, 0);
  }

  plus(other: Expression): Expression {
    const terms = new Map(this.terms);
    for (const [v, c] of other.terms) {
      terms.set(v, (terms.get(v) ?? 0) + c);
    }
    return new Expression(terms, this.constant + other.constant);
  }

  minus(other: Expression): Expression {
    return this.plus(other.negate());
  }

  times(scalar: number): Expression {
    const terms = new Map<Variable, number>();
    for (const [v, c] of this.terms) {
      terms.set(v, c * scalar);
    }
    return new Expression(terms, this.constant * scalar);
  }

  negate(): Expression {
    return this.times(-1);
  }
}

export type Strength = 'required' | 'strong' | 'weak';
export type Operator = '=' | '<=' | '>=';

export class Constraint {
  constructor(
    public expression: Expression, // normalized: expression = 0
    public op: Operator,
    public strength: Strength,
  ) {}

  /** Create: lhs op rhs → (lhs - rhs) op 0 */
  static create(lhs: Expression, op: Operator, rhs: Expression, strength: Strength = 'required'): Constraint {
    return new Constraint(lhs.minus(rhs), op, strength);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/layout/solver.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/layout/solver.ts src/__tests__/layout/solver.test.ts
git commit -m "feat(layout): add constraint solver core types — Variable, Expression, Constraint"
```

---

## Task 2: Constraint Solver — Solving Equalities

**Files:**
- Modify: `src/layout/solver.ts`
- Modify: `src/__tests__/layout/solver.test.ts`

- [ ] **Step 1: Write failing tests for Solver with equalities**

Append to `src/__tests__/layout/solver.test.ts`:

```typescript
import { Variable, Expression, Constraint, Solver } from '../../layout/solver';

describe('Solver — equalities', () => {
  it('solves a single equality: x = 10', () => {
    const x = new Variable('x');
    const solver = new Solver();
    // x = 10 → x - 10 = 0
    solver.addConstraint(Constraint.create(
      Expression.fromVariable(x),
      '=',
      Expression.fromConstant(10),
    ));
    solver.solve();
    expect(x.value).toBeCloseTo(10);
  });

  it('solves two linked equalities: x = 10, y = x + 5', () => {
    const x = new Variable('x');
    const y = new Variable('y');
    const solver = new Solver();
    solver.addConstraint(Constraint.create(
      Expression.fromVariable(x),
      '=',
      Expression.fromConstant(10),
    ));
    // y = x + 5
    solver.addConstraint(Constraint.create(
      Expression.fromVariable(y),
      '=',
      Expression.fromVariable(x).plus(Expression.fromConstant(5)),
    ));
    solver.solve();
    expect(x.value).toBeCloseTo(10);
    expect(y.value).toBeCloseTo(15);
  });

  it('solves a chain: a = 0, b = a + 50 + 10, c = b + 50 + 10', () => {
    const a = new Variable('a');
    const b = new Variable('b');
    const c = new Variable('c');
    const solver = new Solver();
    solver.addConstraint(Constraint.create(
      Expression.fromVariable(a), '=', Expression.fromConstant(0),
    ));
    solver.addConstraint(Constraint.create(
      Expression.fromVariable(b), '=',
      Expression.fromVariable(a).plus(Expression.fromConstant(60)),
    ));
    solver.addConstraint(Constraint.create(
      Expression.fromVariable(c), '=',
      Expression.fromVariable(b).plus(Expression.fromConstant(60)),
    ));
    solver.solve();
    expect(a.value).toBeCloseTo(0);
    expect(b.value).toBeCloseTo(60);
    expect(c.value).toBeCloseTo(120);
  });

  it('solves derived relationships: width = right - left, center = left + width/2', () => {
    const left = new Variable('left');
    const width = new Variable('width');
    const right = new Variable('right');
    const center = new Variable('center');
    const solver = new Solver();

    // left = -150
    solver.addConstraint(Constraint.create(
      Expression.fromVariable(left), '=', Expression.fromConstant(-150),
    ));
    // width = 300
    solver.addConstraint(Constraint.create(
      Expression.fromVariable(width), '=', Expression.fromConstant(300),
    ));
    // right = left + width
    solver.addConstraint(Constraint.create(
      Expression.fromVariable(right), '=',
      Expression.fromVariable(left).plus(Expression.fromVariable(width)),
    ));
    // center = left + width / 2
    solver.addConstraint(Constraint.create(
      Expression.fromVariable(center), '=',
      Expression.fromVariable(left).plus(Expression.fromVariable(width, 0.5)),
    ));
    solver.solve();
    expect(left.value).toBeCloseTo(-150);
    expect(width.value).toBeCloseTo(300);
    expect(right.value).toBeCloseTo(150);
    expect(center.value).toBeCloseTo(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/layout/solver.test.ts`
Expected: FAIL — Solver not exported / solve() not implemented

- [ ] **Step 3: Implement Solver with Gaussian elimination for equalities**

Add to `src/layout/solver.ts`:

```typescript
export class Solver {
  private constraints: Constraint[] = [];

  addConstraint(c: Constraint): void {
    this.constraints.push(c);
  }

  solve(): void {
    // Collect all variables
    const varSet = new Set<Variable>();
    for (const c of this.constraints) {
      for (const v of c.expression.terms.keys()) {
        varSet.add(v);
      }
    }
    const vars = [...varSet];
    const varIndex = new Map<Variable, number>();
    vars.forEach((v, i) => varIndex.set(v, i));

    // Separate by strength and type
    const required = this.constraints.filter(c => c.strength === 'required');
    const strong = this.constraints.filter(c => c.strength === 'strong');
    const weak = this.constraints.filter(c => c.strength === 'weak');

    // Phase 1: solve required equalities via substitution
    // Build augmented matrix [A | b] from required equalities: expression = 0
    const n = vars.length;
    const rows: { coeffs: Float64Array; rhs: number; op: Operator }[] = [];

    for (const c of required) {
      const coeffs = new Float64Array(n);
      for (const [v, coeff] of c.expression.terms) {
        const idx = varIndex.get(v)!;
        coeffs[idx] = coeff;
      }
      rows.push({ coeffs, rhs: -c.expression.constant, op: c.op });
    }

    // Gaussian elimination with partial pivoting for equalities
    const eqRows = rows.filter(r => r.op === '=');
    const pivotCol = new Array<number>(eqRows.length).fill(-1);
    const usedCols = new Set<number>();

    for (let i = 0; i < eqRows.length; i++) {
      // Find best pivot column
      let bestCol = -1;
      let bestVal = 1e-12;
      for (let j = 0; j < n; j++) {
        if (usedCols.has(j)) continue;
        const absVal = Math.abs(eqRows[i].coeffs[j]);
        if (absVal > bestVal) {
          bestVal = absVal;
          bestCol = j;
        }
      }
      if (bestCol === -1) continue; // degenerate row

      pivotCol[i] = bestCol;
      usedCols.add(bestCol);

      // Normalize pivot row
      const pivotVal = eqRows[i].coeffs[bestCol];
      for (let j = 0; j < n; j++) eqRows[i].coeffs[j] /= pivotVal;
      eqRows[i].rhs /= pivotVal;

      // Eliminate from other rows
      for (let k = 0; k < eqRows.length; k++) {
        if (k === i) continue;
        const factor = eqRows[k].coeffs[bestCol];
        if (Math.abs(factor) < 1e-12) continue;
        for (let j = 0; j < n; j++) {
          eqRows[k].coeffs[j] -= factor * eqRows[i].coeffs[j];
        }
        eqRows[k].rhs -= factor * eqRows[i].rhs;
      }
    }

    // Extract solution from pivot rows
    for (let i = 0; i < eqRows.length; i++) {
      if (pivotCol[i] >= 0) {
        vars[pivotCol[i]].value = eqRows[i].rhs;
      }
    }

    // Phase 2: handle required inequalities
    // For inequalities, check satisfaction after equalities are solved.
    // If a variable involved in an inequality wasn't determined by equalities,
    // set it to satisfy the inequality.
    for (const row of rows.filter(r => r.op !== '=')) {
      this.satisfyInequality(row, vars, varIndex, usedCols);
    }

    // Phase 3: strong constraints — try to satisfy without violating required
    this.optimizeNonRequired(strong, vars, varIndex, usedCols);

    // Phase 4: weak constraints — try to satisfy without violating required or strong
    this.optimizeNonRequired(weak, vars, varIndex, usedCols);
  }

  private satisfyInequality(
    row: { coeffs: Float64Array; rhs: number; op: Operator },
    vars: Variable[],
    varIndex: Map<Variable, number>,
    determined: Set<number>,
  ): void {
    // Evaluate the current LHS value
    let lhsValue = 0;
    let freeIdx = -1;
    let freeCoeff = 0;
    for (let j = 0; j < vars.length; j++) {
      if (!determined.has(j) && Math.abs(row.coeffs[j]) > 1e-12) {
        if (freeIdx === -1) {
          freeIdx = j;
          freeCoeff = row.coeffs[j];
        }
      }
      lhsValue += row.coeffs[j] * vars[j].value;
    }

    const satisfied = row.op === '<='
      ? lhsValue <= row.rhs + 1e-9
      : lhsValue >= row.rhs - 1e-9;

    if (satisfied) return;
    if (freeIdx === -1) return; // all determined, can't fix

    // Adjust the free variable to satisfy
    const needed = row.rhs - (lhsValue - freeCoeff * vars[freeIdx].value);
    vars[freeIdx].value = needed / freeCoeff;
    determined.add(freeIdx);
  }

  private optimizeNonRequired(
    constraints: Constraint[],
    vars: Variable[],
    varIndex: Map<Variable, number>,
    determined: Set<number>,
  ): void {
    for (const c of constraints) {
      const n = vars.length;
      const coeffs = new Float64Array(n);
      for (const [v, coeff] of c.expression.terms) {
        coeffs[varIndex.get(v)!] = coeff;
      }
      const rhs = -c.expression.constant;

      // Evaluate current
      let current = 0;
      let freeIdx = -1;
      let freeCoeff = 0;
      for (let j = 0; j < n; j++) {
        if (Math.abs(coeffs[j]) < 1e-12) continue;
        if (!determined.has(j) && freeIdx === -1) {
          freeIdx = j;
          freeCoeff = coeffs[j];
        }
        current += coeffs[j] * vars[j].value;
      }

      if (c.op === '=' && Math.abs(current - rhs) < 1e-9) continue;
      if (c.op === '<=' && current <= rhs + 1e-9) continue;
      if (c.op === '>=' && current >= rhs - 1e-9) continue;

      if (freeIdx === -1) continue; // all vars determined, can't adjust

      const needed = rhs - (current - freeCoeff * vars[freeIdx].value);
      vars[freeIdx].value = needed / freeCoeff;
      determined.add(freeIdx);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/layout/solver.test.ts`
Expected: PASS

- [ ] **Step 5: Run all tests to verify no regressions**

Run: `npx vitest run`
Expected: All 934+ tests pass

- [ ] **Step 6: Commit**

```bash
git add src/layout/solver.ts src/__tests__/layout/solver.test.ts
git commit -m "feat(layout): implement constraint solver with Gaussian elimination"
```

---

## Task 3: Constraint Solver — Inequalities and Priorities

**Files:**
- Modify: `src/__tests__/layout/solver.test.ts`

- [ ] **Step 1: Write failing tests for inequalities and priorities**

Append to `src/__tests__/layout/solver.test.ts`:

```typescript
describe('Solver — inequalities', () => {
  it('satisfies a <= inequality by adjusting a free variable', () => {
    const x = new Variable('x');
    const y = new Variable('y');
    const solver = new Solver();
    // x = 100
    solver.addConstraint(Constraint.create(
      Expression.fromVariable(x), '=', Expression.fromConstant(100),
    ));
    // y >= x + 20  (i.e. y >= 120)
    solver.addConstraint(Constraint.create(
      Expression.fromVariable(y), '>=',
      Expression.fromVariable(x).plus(Expression.fromConstant(20)),
    ));
    solver.solve();
    expect(x.value).toBeCloseTo(100);
    expect(y.value).toBeGreaterThanOrEqual(120 - 0.01);
  });

  it('satisfies ordering inequalities: a + sep <= b, b + sep <= c', () => {
    const a = new Variable('a');
    const b = new Variable('b');
    const c = new Variable('c');
    const solver = new Solver();
    solver.addConstraint(Constraint.create(
      Expression.fromVariable(a), '=', Expression.fromConstant(0),
    ));
    // a + 30 <= b → b >= a + 30
    solver.addConstraint(Constraint.create(
      Expression.fromVariable(b), '>=',
      Expression.fromVariable(a).plus(Expression.fromConstant(30)),
    ));
    // b + 30 <= c → c >= b + 30
    solver.addConstraint(Constraint.create(
      Expression.fromVariable(c), '>=',
      Expression.fromVariable(b).plus(Expression.fromConstant(30)),
    ));
    solver.solve();
    expect(a.value).toBeCloseTo(0);
    expect(b.value).toBeGreaterThanOrEqual(29.99);
    expect(c.value).toBeGreaterThanOrEqual(59.99);
  });
});

describe('Solver — priorities', () => {
  it('strong constraint is satisfied when no conflict with required', () => {
    const x = new Variable('x');
    const y = new Variable('y');
    const solver = new Solver();
    // x = 100 (required)
    solver.addConstraint(Constraint.create(
      Expression.fromVariable(x), '=', Expression.fromConstant(100),
    ));
    // y = x (strong) — uniform size
    solver.addConstraint(Constraint.create(
      Expression.fromVariable(y), '=', Expression.fromVariable(x), 'strong',
    ));
    solver.solve();
    expect(x.value).toBeCloseTo(100);
    expect(y.value).toBeCloseTo(100);
  });

  it('weak constraint yields to required', () => {
    const x = new Variable('x');
    const solver = new Solver();
    // x = 50 (required)
    solver.addConstraint(Constraint.create(
      Expression.fromVariable(x), '=', Expression.fromConstant(50),
    ));
    // x = 100 (weak) — should be ignored
    solver.addConstraint(Constraint.create(
      Expression.fromVariable(x), '=', Expression.fromConstant(100), 'weak',
    ));
    solver.solve();
    expect(x.value).toBeCloseTo(50);
  });

  it('strong beats weak', () => {
    const x = new Variable('x');
    const solver = new Solver();
    // x = 50 (strong)
    solver.addConstraint(Constraint.create(
      Expression.fromVariable(x), '=', Expression.fromConstant(50), 'strong',
    ));
    // x = 100 (weak)
    solver.addConstraint(Constraint.create(
      Expression.fromVariable(x), '=', Expression.fromConstant(100), 'weak',
    ));
    solver.solve();
    expect(x.value).toBeCloseTo(50);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass (these should already work with the Phase 2/3/4 logic)**

Run: `npx vitest run src/__tests__/layout/solver.test.ts`
Expected: PASS — the solver already handles inequalities and priorities

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/layout/solver.test.ts
git commit -m "test(layout): add solver tests for inequalities and priority ordering"
```

---

## Task 4: Flex Strategy — Refactor to Constraint Generation

This is the critical refactor. The flex strategy must generate constraints that the solver resolves, producing identical output to the current direct-computation approach. All existing flex tests must continue to pass.

**Files:**
- Modify: `src/layout/flex.ts`
- Modify: `src/layout/registry.ts`
- Create: `src/__tests__/layout/constraintFlex.test.ts`

- [ ] **Step 1: Write parity tests that verify constraint-based flex matches direct computation**

```typescript
// src/__tests__/layout/constraintFlex.test.ts
import { describe, it, expect } from 'vitest';
import { createNode } from '../../types/node';
import type { Node } from '../../types/node';
import { Solver, Variable, Expression, Constraint } from '../../layout/solver';
import { flexConstraintStrategy } from '../../layout/flex';
import type { ChildPlacement } from '../../layout/registry';

/**
 * Helper: run flex constraint strategy through solver, return placements.
 */
function solveFlexPlacements(container: Node, children: Node[]): ChildPlacement[] {
  const { constraints, variables } = flexConstraintStrategy(container, children);
  const solver = new Solver();
  for (const c of constraints) solver.addConstraint(c);
  solver.solve();

  // Extract placements from variables
  const placements: ChildPlacement[] = [];
  for (const child of children) {
    if ((child.depth ?? 0) < 0) continue;
    const cx = variables.get(`${child.id}.centerX`);
    const cy = variables.get(`${child.id}.centerY`);
    if (!cx || !cy) continue;
    const placement: ChildPlacement = { id: child.id, x: cx.value, y: cy.value };
    const w = variables.get(`${child.id}.width`);
    const h = variables.get(`${child.id}.height`);
    const origSize = getNodeSize(child, (container.layout?.direction ?? 'column') === 'row');
    if (w && Math.abs(w.value - origSize.w) > 0.01) placement.w = w.value;
    if (h && Math.abs(h.value - origSize.h) > 0.01) placement.h = h.value;
    placements.push(placement);
  }
  return placements;
}

function getNodeSize(node: Node, isRow: boolean): { w: number; h: number } {
  let w = 0, h = 0;
  if (node.rect) { w = node.rect.w; h = node.rect.h; }
  else if (node.ellipse) { w = node.ellipse.rx * 2; h = node.ellipse.ry * 2; }
  else { w = 100; h = 50; }
  return { w, h };
}

describe('flex constraint strategy — parity with direct computation', () => {
  it('row layout with gap matches expected positions', () => {
    const container = createNode({
      id: 'c', layout: { type: 'flex', direction: 'row', gap: 10 },
      rect: { w: 300, h: 100 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 50, h: 30 } }),
      createNode({ id: 'b', rect: { w: 50, h: 30 } }),
    ];
    const p = solveFlexPlacements(container, children);
    expect(p).toHaveLength(2);
    expect(p[0].x).toBeCloseTo(-125);
    expect(p[1].x).toBeCloseTo(-65);
  });

  it('column layout with gap', () => {
    const container = createNode({
      id: 'c', layout: { type: 'flex', direction: 'column', gap: 5 },
      rect: { w: 200, h: 200 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 80, h: 40 } }),
      createNode({ id: 'b', rect: { w: 80, h: 40 } }),
    ];
    const p = solveFlexPlacements(container, children);
    expect(p[0].y).toBeCloseTo(-80);
    expect(p[1].y).toBeCloseTo(-35);
  });

  it('justify center', () => {
    const container = createNode({
      id: 'c', layout: { type: 'flex', direction: 'row', gap: 0, justify: 'center' },
      rect: { w: 200, h: 100 },
    });
    const children = [createNode({ id: 'a', rect: { w: 50, h: 30 } })];
    const p = solveFlexPlacements(container, children);
    expect(p[0].x).toBeCloseTo(0);
  });

  it('grow distributes extra space', () => {
    const container = createNode({
      id: 'c', layout: { type: 'flex', direction: 'row', gap: 0 },
      rect: { w: 200, h: 100 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 50, h: 30 }, layout: { grow: 1 } }),
      createNode({ id: 'b', rect: { w: 50, h: 30 }, layout: { grow: 1 } }),
    ];
    const p = solveFlexPlacements(container, children);
    expect(p[0].w).toBeCloseTo(100);
    expect(p[1].w).toBeCloseTo(100);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/layout/constraintFlex.test.ts`
Expected: FAIL — `flexConstraintStrategy` not exported

- [ ] **Step 3: Implement flexConstraintStrategy**

This function mirrors the existing `flexStrategy` logic but outputs constraints instead of positions. It pre-computes grow distribution and justify offsets (these are discrete decisions, not constraint-solvable), then expresses the resulting positions as equality constraints.

Add to `src/layout/flex.ts`:

```typescript
import { Variable, Expression, Constraint } from './solver';

export interface ConstraintResult {
  constraints: Constraint[];
  variables: Map<string, Variable>;
}

function getNodeSize(node: Node, isRow: boolean): { main: number; cross: number } {
  // ... (extract existing getNodeSize from flexStrategy — already exists at top of file)
}

export function flexConstraintStrategy(container: Node, children: Node[]): ConstraintResult {
  const variables = new Map<string, Variable>();
  const constraints: Constraint[] = [];

  const layoutChildren = children.filter(c => (c.depth ?? 0) >= 0);
  if (layoutChildren.length === 0) return { constraints, variables };

  const layout = container.layout!;
  const isRow = (layout.direction ?? 'column') === 'row';
  const gap = layout.gap ?? 0;
  const justify = layout.justify ?? 'start';
  const align = layout.align ?? 'start';
  const padding = layout.padding ?? 0;

  // Sort by order hint
  const sorted = [...layoutChildren].sort((a, b) => {
    const oa = getHint(a, 'order', 0);
    const ob = getHint(b, 'order', 0);
    return oa - ob;
  });

  const sizes = sorted.map(c => getNodeSize(c, isRow));
  const totalChildMain = sizes.reduce((sum, s) => sum + s.main, 0);
  const totalGaps = gap * Math.max(0, sizes.length - 1);
  const contentMain = totalChildMain + totalGaps;

  let containerMain = 0;
  if (container.rect) {
    containerMain = (isRow ? container.rect.w : container.rect.h) || 0;
  }
  const availableMain = containerMain > 0 ? containerMain - padding * 2 : contentMain;
  const extraSpace = availableMain - contentMain;

  // Compute final main sizes (with grow)
  const finalMainSizes = sizes.map(s => s.main);
  if (extraSpace > 0) {
    const totalGrow = sorted.reduce((sum, c) => sum + getHint(c, 'grow', 0), 0);
    if (totalGrow > 0) {
      sorted.forEach((c, i) => {
        const g = getHint(c, 'grow', 0);
        if (g > 0) finalMainSizes[i] += (g / totalGrow) * extraSpace;
      });
    }
  }

  // Compute main-axis starting positions (same logic as current flexStrategy)
  const finalContentMain = finalMainSizes.reduce((s, v) => s + v, 0) + totalGaps;
  const mainPositions: number[] = [];

  let cursor = 0;
  if (justify === 'center') {
    cursor = (availableMain - finalContentMain) / 2;
  } else if (justify === 'end') {
    cursor = availableMain - finalContentMain;
  } else if (justify === 'spaceBetween' && sorted.length > 1) {
    const totalItem = finalMainSizes.reduce((s, v) => s + v, 0);
    const spacer = (availableMain - totalItem) / (sorted.length - 1);
    let pos = padding;
    for (let i = 0; i < sorted.length; i++) {
      mainPositions.push(pos);
      pos += finalMainSizes[i] + spacer;
    }
  } else if (justify === 'spaceAround' && sorted.length > 0) {
    const totalItem = finalMainSizes.reduce((s, v) => s + v, 0);
    const spacer = (availableMain - totalItem) / sorted.length;
    let pos = padding + spacer / 2;
    for (let i = 0; i < sorted.length; i++) {
      mainPositions.push(pos);
      pos += finalMainSizes[i] + spacer;
    }
  }

  if (mainPositions.length === 0) {
    let pos = cursor + padding;
    for (let i = 0; i < sorted.length; i++) {
      mainPositions.push(pos);
      pos += finalMainSizes[i] + gap;
    }
  }

  // Cross-axis
  let containerCross = 0;
  if (container.rect) {
    containerCross = (isRow ? container.rect.h : container.rect.w) || 0;
  }
  const maxCross = containerCross > 0 ? containerCross - padding * 2 : Math.max(...sizes.map(s => s.cross));

  const containerW = containerMain > 0 ? containerMain : finalContentMain + padding * 2;
  const containerH = containerCross > 0 ? containerCross : maxCross + padding * 2;
  const offsetMain = -containerW / 2;
  const offsetCross = -containerH / 2;

  // Auto-size container (mutate, same as current)
  const actualW = isRow ? containerW : containerH;
  const actualH = isRow ? containerH : containerW;
  if (!container.rect) {
    (container as any).rect = { w: actualW, h: actualH };
  } else {
    if (!container.rect.w) container.rect.w = actualW;
    if (!container.rect.h) container.rect.h = actualH;
  }

  // Generate constraints for each child position
  for (let i = 0; i < sorted.length; i++) {
    const child = sorted[i];
    const childAlign = getHintStr(child, 'alignSelf', align);
    const childCross = sizes[i].cross;

    let crossPos = padding;
    if (childAlign === 'center') {
      crossPos = padding + (maxCross - childCross) / 2;
    } else if (childAlign === 'end') {
      crossPos = padding + maxCross - childCross;
    }

    const childMainSize = finalMainSizes[i];
    const childCrossSize = childAlign === 'stretch' ? maxCross : sizes[i].cross;
    const mainCenter = mainPositions[i] + childMainSize / 2 + offsetMain;
    const crossCenter = crossPos + sizes[i].cross / 2 + offsetCross;

    // Create variables
    const cx = new Variable(`${child.id}.centerX`, isRow ? mainCenter : crossCenter);
    const cy = new Variable(`${child.id}.centerY`, isRow ? crossCenter : mainCenter);
    const w = new Variable(`${child.id}.width`, isRow ? childMainSize : childCrossSize);
    const h = new Variable(`${child.id}.height`, isRow ? childCrossSize : childMainSize);

    variables.set(`${child.id}.centerX`, cx);
    variables.set(`${child.id}.centerY`, cy);
    variables.set(`${child.id}.width`, w);
    variables.set(`${child.id}.height`, h);

    // Emit equality constraints for positions
    constraints.push(Constraint.create(
      Expression.fromVariable(cx), '=',
      Expression.fromConstant(isRow ? mainCenter : crossCenter),
    ));
    constraints.push(Constraint.create(
      Expression.fromVariable(cy), '=',
      Expression.fromConstant(isRow ? crossCenter : mainCenter),
    ));
    constraints.push(Constraint.create(
      Expression.fromVariable(w), '=',
      Expression.fromConstant(isRow ? childMainSize : childCrossSize),
    ));
    constraints.push(Constraint.create(
      Expression.fromVariable(h), '=',
      Expression.fromConstant(isRow ? childCrossSize : childMainSize),
    ));
  }

  return { constraints, variables };
}
```

- [ ] **Step 4: Run parity tests**

Run: `npx vitest run src/__tests__/layout/constraintFlex.test.ts`
Expected: PASS

- [ ] **Step 5: Run all existing tests to verify no regressions**

Run: `npx vitest run`
Expected: All tests pass (we haven't changed the LayoutStrategy signature yet)

- [ ] **Step 6: Commit**

```bash
git add src/layout/flex.ts src/__tests__/layout/constraintFlex.test.ts
git commit -m "feat(layout): add flexConstraintStrategy that generates constraints"
```

---

## Task 5: Registry — Constraint Pipeline

Update the registry to support constraint-based strategies alongside the existing direct-computation strategies. The new `ConstraintStrategy` type returns constraints + variables. The registry collects constraints from all containers, solves in one pass, and maps back to ChildPlacement[].

**Files:**
- Modify: `src/layout/registry.ts`

- [ ] **Step 1: Add ConstraintStrategy type and solver integration to registry**

```typescript
// Add these imports at the top of src/layout/registry.ts
import { Solver, Constraint, Variable } from './solver';
import type { ConstraintResult } from './flex';

// Add new strategy type
export type ConstraintStrategy = (node: Node, children: Node[]) => ConstraintResult;

// Add a second registry for constraint strategies
const constraintStrategies = new Map<string, ConstraintStrategy>();

export function registerConstraintStrategy(name: string, strategy: ConstraintStrategy): void {
  constraintStrategies.set(name, strategy);
}

export function getConstraintStrategy(name: string): ConstraintStrategy | undefined {
  return constraintStrategies.get(name);
}
```

- [ ] **Step 2: Update computeLayoutPlacements to use constraint strategies**

Modify `computeLayoutPlacements` in `src/layout/registry.ts` so it checks for a constraint strategy first. If found, it collects constraints, solves, and extracts placements. If not found, falls back to the existing direct strategy.

```typescript
export function computeLayoutPlacements(roots: Node[]): LayoutResult[] {
  const results: LayoutResult[] = [];

  // Collect all constraint results first
  const allConstraints: Constraint[] = [];
  const allVariables = new Map<string, Variable>();
  const constraintContainers: Array<{
    node: Node;
    slotMembers: Node[];
    children: Node[];
  }> = [];

  function collectConstraints(node: Node, allRoots: Node[]): void {
    if (node.layout && node.layout.type) {
      const cStrategy = getConstraintStrategy(node.layout.type);
      if (cStrategy) {
        const slotMembers = collectSlotMembers(allRoots, node.id);
        const allMembers = [...node.children, ...slotMembers];
        const { constraints, variables } = cStrategy(node, allMembers);
        allConstraints.push(...constraints);
        for (const [k, v] of variables) allVariables.set(k, v);
        constraintContainers.push({ node, slotMembers, children: allMembers });
      }
    }
    for (const child of node.children) {
      collectConstraints(child, allRoots);
    }
  }

  // Collect constraint-based layouts
  for (const root of roots) {
    collectConstraints(root, roots);
  }

  // Solve all constraints in one pass
  if (allConstraints.length > 0) {
    const solver = new Solver();
    for (const c of allConstraints) solver.addConstraint(c);
    solver.solve();

    // Extract placements from solved variables
    for (const { node, slotMembers, children } of constraintContainers) {
      for (const child of children) {
        if ((child.depth ?? 0) < 0) continue;
        const cx = allVariables.get(`${child.id}.centerX`);
        const cy = allVariables.get(`${child.id}.centerY`);
        if (!cx || !cy) continue;

        const isSlot = slotMembers.some(m => m.id === child.id);
        let targetX = cx.value;
        let targetY = cy.value;
        if (isSlot) {
          targetX += node.transform?.x ?? 0;
          targetY += node.transform?.y ?? 0;
        }

        const result: LayoutResult = {
          nodeId: child.id,
          targetX,
          targetY,
          isSlotMember: isSlot,
        };

        // Check for size changes
        const w = allVariables.get(`${child.id}.width`);
        const h = allVariables.get(`${child.id}.height`);
        if (w) result.targetW = w.value;
        if (h) result.targetH = h.value;

        results.push(result);
      }
    }
  }

  // Fall back to direct strategies for any remaining containers
  function processDirectNode(node: Node, allRoots: Node[]): void {
    if (node.layout && node.layout.type) {
      // Skip if already handled by constraint strategy
      if (getConstraintStrategy(node.layout.type)) {
        for (const child of node.children) processDirectNode(child, allRoots);
        return;
      }

      const strategy = getStrategy(node.layout.type);
      if (strategy) {
        const slotMembers = collectSlotMembers(allRoots, node.id);
        const allMembers = [...node.children, ...slotMembers];
        const placements = strategy(node, allMembers);
        for (const placement of placements) {
          const isSlot = slotMembers.some(m => m.id === placement.id);
          let targetX = placement.x;
          let targetY = placement.y;
          if (isSlot) {
            targetX += node.transform?.x ?? 0;
            targetY += node.transform?.y ?? 0;
          }
          results.push({
            nodeId: placement.id,
            targetX,
            targetY,
            targetW: placement.w,
            targetH: placement.h,
            isSlotMember: isSlot,
          });
        }
      }
    }
    for (const child of node.children) {
      processDirectNode(child, allRoots);
    }
  }

  for (const root of roots) {
    processDirectNode(root, roots);
  }

  return results;
}
```

- [ ] **Step 3: Run all existing tests**

Run: `npx vitest run`
Expected: All tests pass — no constraint strategies registered yet, so everything falls through to direct strategies

- [ ] **Step 4: Register flex as constraint strategy and verify parity**

In `src/StarchDiagram.ts` and `src/animation/timeline.ts`, add:
```typescript
import { registerConstraintStrategy } from './layout/registry';
import { flexConstraintStrategy } from './layout/flex';

registerConstraintStrategy('flex', flexConstraintStrategy);
```

Update `ensureStrategies()` in `timeline.ts`:
```typescript
function ensureStrategies(): void {
  if (!getStrategy('flex')) registerStrategy('flex', flexStrategy);
  if (!getStrategy('absolute')) registerStrategy('absolute', absoluteStrategy);
  if (!getConstraintStrategy('flex')) registerConstraintStrategy('flex', flexConstraintStrategy);
}
```

- [ ] **Step 5: Run ALL tests — this is the critical parity check**

Run: `npx vitest run`
Expected: All 934+ tests pass. The constraint pipeline produces identical results to the direct computation for flex layout.

If any tests fail, the issue is in `flexConstraintStrategy` or the placement extraction. Debug by comparing outputs.

- [ ] **Step 6: Commit**

```bash
git add src/layout/registry.ts src/StarchDiagram.ts src/animation/timeline.ts
git commit -m "feat(layout): add constraint pipeline to registry, wire flex constraint strategy"
```

---

## Task 6: Schema — Add New Layout Properties

Extend `LayoutSchema` with properties for grid, circular, and dag strategies. Keep the flat schema approach for backward compatibility — the `type` field determines which properties are meaningful.

**Files:**
- Modify: `src/types/properties.ts`
- Modify: `src/__tests__/types/schemaRegistry.test.ts` (if needed)

- [ ] **Step 1: Add new properties to LayoutSchema**

Edit `src/types/properties.ts`, replacing the `LayoutSchema` definition:

```typescript
export const LayoutSchema = dsl(z.object({
  // Strategy type
  type: z.string().describe('Layout strategy — "flex", "absolute", "grid", "circular", or "dag" (string)').optional(),

  // Flex properties
  direction: z.enum(['row', 'column']).describe('Flex flow direction — "row" or "column"').optional(),
  gap: z.number().min(0).max(200).describe('Spacing between children in pixels (number)').optional(),
  justify: z.enum(['start', 'center', 'end', 'spaceBetween', 'spaceAround']).describe('Main-axis alignment').optional(),
  align: z.enum(['start', 'center', 'end', 'stretch']).describe('Cross-axis alignment').optional(),
  wrap: z.boolean().describe('Whether children wrap to next line (boolean)').optional(),
  padding: z.number().min(0).max(200).describe('Inner padding in pixels (number)').optional(),

  // Flex child hints
  grow: z.number().min(0).describe('Flex grow factor (number)').optional(),
  order: z.number().describe('Layout order hint (number)').optional(),
  alignSelf: z.enum(['start', 'center', 'end', 'stretch']).describe('Per-child cross-axis alignment override').optional(),

  // Universal child hint
  slot: z.string().describe('Container ID for layout slot membership (string)').optional(),

  // Grid container properties
  columns: z.number().int().min(1).describe('Number of grid columns (integer, >= 1)').optional(),
  rows: z.number().int().min(1).describe('Number of grid rows (integer, >= 1)').optional(),
  colGap: z.number().min(0).describe('Column gap override (number)').optional(),
  rowGap: z.number().min(0).describe('Row gap override (number)').optional(),

  // Grid child hints
  gridCol: z.number().int().min(1).describe('Grid column placement (1-based)').optional(),
  gridRow: z.number().int().min(1).describe('Grid row placement (1-based)').optional(),
  colSpan: z.number().int().min(1).describe('Number of columns to span').optional(),
  rowSpan: z.number().int().min(1).describe('Number of rows to span').optional(),

  // Circular container properties
  radius: z.number().min(0).describe('Circle radius in pixels (number)').optional(),
  startAngle: z.number().describe('Starting angle in degrees (number)').optional(),
  sweep: z.number().describe('Angular sweep in degrees (number, default 360)').optional(),

  // DAG container properties
  dagDirection: z.enum(['TB', 'BT', 'LR', 'RL']).describe('DAG layout direction').optional(),
  rankSep: z.number().min(0).describe('Separation between ranks in pixels (number)').optional(),
  nodeSep: z.number().min(0).describe('Separation between nodes in same rank (number)').optional(),
}), {
  keyword: 'layout',
  positional: [{ keys: ['type'] }, { keys: ['direction'] }],
  kwargs: [
    'gap', 'justify', 'align', 'wrap', 'padding',
    'grow', 'order', 'alignSelf', 'slot',
    'columns', 'rows', 'colGap', 'rowGap',
    'gridCol', 'gridRow', 'colSpan', 'rowSpan',
    'radius', 'startAngle', 'sweep',
    'dagDirection', 'rankSep', 'nodeSep',
  ],
});
```

- [ ] **Step 2: Update `isBlockLayout` in astEmitter.ts**

Edit `src/dsl/astEmitter.ts` — update the `isBlockLayout` function to recognize new container properties:

```typescript
function isBlockLayout(layout: any): boolean {
  return !!(layout.type || layout.direction || layout.gap !== undefined ||
    layout.justify || layout.align || layout.wrap !== undefined ||
    layout.padding !== undefined ||
    layout.columns !== undefined || layout.rows !== undefined ||
    layout.colGap !== undefined || layout.rowGap !== undefined ||
    layout.radius !== undefined || layout.startAngle !== undefined ||
    layout.sweep !== undefined ||
    layout.dagDirection !== undefined || layout.rankSep !== undefined ||
    layout.nodeSep !== undefined);
}
```

- [ ] **Step 3: Update LAYOUT_HINT_KEYS in astEmitter.ts**

```typescript
const LAYOUT_HINT_KEYS = ['grow', 'order', 'alignSelf', 'slot', 'gridCol', 'gridRow', 'colSpan', 'rowSpan'] as const;
```

- [ ] **Step 4: Update inlineLayoutHints in NodeSchema**

Edit `src/types/node.ts`, update the `inlineLayoutHints` array in the `NodeSchema` DSL hints:

```typescript
inlineLayoutHints: ['grow', 'order', 'alignSelf', 'slot', 'gridCol', 'gridRow', 'colSpan', 'rowSpan'],
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/types/properties.ts src/types/node.ts src/dsl/astEmitter.ts
git commit -m "feat(layout): extend LayoutSchema with grid, circular, and dag properties"
```

---

## Task 7: Parser — Accept New Layout Kwargs

The parser already handles kwargs generically via the `executeSchema` path for `LayoutSchema`. Since we added new kwargs to the DSL hints, the parser will accept them automatically. We just need to verify with a test.

**Files:**
- Modify: `src/__tests__/dsl/hintExecutors.test.ts` (add test)

- [ ] **Step 1: Write parser test for new layout kwargs**

Add to `src/__tests__/dsl/hintExecutors.test.ts` (or create a new focused test file):

```typescript
// Add to existing test file or create src/__tests__/layout/dslRoundtrip.test.ts
import { describe, it, expect } from 'vitest';
import { parseScene } from '../../parser/parser';

describe('layout DSL parsing — new strategies', () => {
  it('parses grid layout', () => {
    const { model } = parseScene(`objects\n  g: rect 600x400\n    layout grid columns=3 gap=10 padding=15`);
    const g = model.objects![0];
    expect(g.layout?.type).toBe('grid');
    expect(g.layout?.columns).toBe(3);
    expect(g.layout?.gap).toBe(10);
    expect(g.layout?.padding).toBe(15);
  });

  it('parses circular layout', () => {
    const { model } = parseScene(`objects\n  r: ellipse 150x150\n    layout circular radius=120 startAngle=0 sweep=360`);
    const r = model.objects![0];
    expect(r.layout?.type).toBe('circular');
    expect(r.layout?.radius).toBe(120);
    expect(r.layout?.startAngle).toBe(0);
    expect(r.layout?.sweep).toBe(360);
  });

  it('parses grid child hints', () => {
    const { model } = parseScene(`objects\n  g: rect 600x400\n    layout grid columns=3\n    c: rect 100x100\n      layout gridCol=2 colSpan=2`);
    const c = model.objects![0].children![0];
    expect(c.layout?.gridCol).toBe(2);
    expect(c.layout?.colSpan).toBe(2);
  });
});
```

- [ ] **Step 2: Run the new parser tests**

Run: `npx vitest run src/__tests__/layout/dslRoundtrip.test.ts`
Expected: PASS (the kwargs are already registered in LayoutSchema hints)

If not, debug: the `direction` positional only accepts `row`|`column` — for circular/grid/dag, the second positional won't match, and all properties go through kwargs. This should be fine.

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/layout/dslRoundtrip.test.ts
git commit -m "test(layout): add parser tests for grid and circular layout DSL"
```

---

## Task 8: Emitter — Round-Trip New Layout Properties

Verify that the emitter correctly outputs new layout properties. The existing `emitLayout` function iterates all keys, so new properties should emit automatically. We need to verify round-trip fidelity.

**Files:**
- Modify: `src/__tests__/layout/dslRoundtrip.test.ts`

- [ ] **Step 1: Add round-trip tests**

Append to `src/__tests__/layout/dslRoundtrip.test.ts`:

```typescript
import { emitDocument } from '../../dsl/astEmitter';

describe('layout DSL round-trip', () => {
  it('grid layout round-trips through parse → emit → parse', () => {
    const input = `objects\n  g: rect 600x400\n    layout grid columns=3 gap=10 padding=15`;
    const { model } = parseScene(input);
    const { text } = emitDocument(model);
    const { model: reparsed } = parseScene(text);
    expect(reparsed.objects![0].layout?.type).toBe('grid');
    expect(reparsed.objects![0].layout?.columns).toBe(3);
    expect(reparsed.objects![0].layout?.gap).toBe(10);
  });

  it('circular layout round-trips', () => {
    const input = `objects\n  r: ellipse 150x150\n    layout circular radius=120 startAngle=45 sweep=270`;
    const { model } = parseScene(input);
    const { text } = emitDocument(model);
    const { model: reparsed } = parseScene(text);
    expect(reparsed.objects![0].layout?.type).toBe('circular');
    expect(reparsed.objects![0].layout?.radius).toBe(120);
    expect(reparsed.objects![0].layout?.startAngle).toBe(45);
    expect(reparsed.objects![0].layout?.sweep).toBe(270);
  });

  it('grid child hints round-trip as inline layout', () => {
    const input = `objects\n  g: rect 600x400\n    layout grid columns=2\n    c: rect 100x100\n      layout gridCol=1 colSpan=2`;
    const { model } = parseScene(input);
    const { text } = emitDocument(model);
    const { model: reparsed } = parseScene(text);
    const c = reparsed.objects![0].children![0];
    expect(c.layout?.gridCol).toBe(1);
    expect(c.layout?.colSpan).toBe(2);
  });
});
```

- [ ] **Step 2: Run round-trip tests**

Run: `npx vitest run src/__tests__/layout/dslRoundtrip.test.ts`
Expected: PASS

If the emitter doesn't handle `direction` properly for non-flex types (e.g., emitting `direction` as positional when it's undefined for grid), check the `emitLayout` function. It already skips undefined values since it iterates `Object.entries(layout)` and only non-undefined entries are present.

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/layout/dslRoundtrip.test.ts
git commit -m "test(layout): add round-trip tests for grid and circular layout DSL"
```

---

## Task 9: Grid Strategy

**Files:**
- Create: `src/layout/strategies/grid.ts`
- Create: `src/__tests__/layout/grid.test.ts`
- Modify: `src/StarchDiagram.ts`
- Modify: `src/animation/timeline.ts`

- [ ] **Step 1: Write failing tests for grid strategy**

```typescript
// src/__tests__/layout/grid.test.ts
import { describe, it, expect } from 'vitest';
import { createNode } from '../../types/node';
import type { Node } from '../../types/node';
import { Solver, Constraint } from '../../layout/solver';
import { gridConstraintStrategy } from '../../layout/strategies/grid';
import type { ChildPlacement } from '../../layout/registry';

function solveGrid(container: Node, children: Node[]): ChildPlacement[] {
  const { constraints, variables } = gridConstraintStrategy(container, children);
  const solver = new Solver();
  for (const c of constraints) solver.addConstraint(c);
  solver.solve();

  const placements: ChildPlacement[] = [];
  for (const child of children) {
    if ((child.depth ?? 0) < 0) continue;
    const cx = variables.get(`${child.id}.centerX`);
    const cy = variables.get(`${child.id}.centerY`);
    if (!cx || !cy) continue;
    const placement: ChildPlacement = { id: child.id, x: cx.value, y: cy.value };
    const w = variables.get(`${child.id}.width`);
    const h = variables.get(`${child.id}.height`);
    if (w) placement.w = w.value;
    if (h) placement.h = h.value;
    placements.push(placement);
  }
  return placements;
}

describe('gridConstraintStrategy', () => {
  it('places 3 children in a 3-column grid', () => {
    const container = createNode({
      id: 'g', layout: { type: 'grid', columns: 3, gap: 0, padding: 0 },
      rect: { w: 300, h: 100 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 100, h: 100 } }),
      createNode({ id: 'b', rect: { w: 100, h: 100 } }),
      createNode({ id: 'c', rect: { w: 100, h: 100 } }),
    ];
    const p = solveGrid(container, children);
    expect(p).toHaveLength(3);
    // 3 columns of 100px each in 300px container, center-origin
    // col 0 center: -150 + 50 = -100
    // col 1 center: -150 + 150 = 0
    // col 2 center: -150 + 250 = 100
    expect(p[0].x).toBeCloseTo(-100);
    expect(p[1].x).toBeCloseTo(0);
    expect(p[2].x).toBeCloseTo(100);
    // All in row 0, center y = -50 + 50 = 0
    expect(p[0].y).toBeCloseTo(0);
  });

  it('auto-wraps to multiple rows', () => {
    const container = createNode({
      id: 'g', layout: { type: 'grid', columns: 2, gap: 0, padding: 0 },
      rect: { w: 200, h: 200 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 100, h: 100 } }),
      createNode({ id: 'b', rect: { w: 100, h: 100 } }),
      createNode({ id: 'c', rect: { w: 100, h: 100 } }),
      createNode({ id: 'd', rect: { w: 100, h: 100 } }),
    ];
    const p = solveGrid(container, children);
    // Row 0: a(-50, -50), b(50, -50)
    // Row 1: c(-50, 50), d(50, 50)
    expect(p[0].x).toBeCloseTo(-50);
    expect(p[0].y).toBeCloseTo(-50);
    expect(p[1].x).toBeCloseTo(50);
    expect(p[1].y).toBeCloseTo(-50);
    expect(p[2].x).toBeCloseTo(-50);
    expect(p[2].y).toBeCloseTo(50);
    expect(p[3].x).toBeCloseTo(50);
    expect(p[3].y).toBeCloseTo(50);
  });

  it('respects gap', () => {
    const container = createNode({
      id: 'g', layout: { type: 'grid', columns: 2, gap: 10, padding: 0 },
      rect: { w: 210, h: 110 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 100, h: 50 } }),
      createNode({ id: 'b', rect: { w: 100, h: 50 } }),
    ];
    const p = solveGrid(container, children);
    // Container 210 wide, 2 cols with 10 gap: col width = (210 - 10) / 2 = 100
    // col 0 center: -105 + 50 = -55
    // col 1 center: -105 + 100 + 10 + 50 = 55
    expect(p[0].x).toBeCloseTo(-55);
    expect(p[1].x).toBeCloseTo(55);
  });

  it('respects padding', () => {
    const container = createNode({
      id: 'g', layout: { type: 'grid', columns: 1, gap: 0, padding: 20 },
      rect: { w: 200, h: 200 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 160, h: 160 } }),
    ];
    const p = solveGrid(container, children);
    // Container 200 with 20 padding each side → 160 usable
    // Single cell: center at 0, 0
    expect(p[0].x).toBeCloseTo(0);
    expect(p[0].y).toBeCloseTo(0);
  });

  it('respects gridCol/gridRow child hints', () => {
    const container = createNode({
      id: 'g', layout: { type: 'grid', columns: 3, gap: 0, padding: 0 },
      rect: { w: 300, h: 200 },
    });
    const children = [
      createNode({ id: 'a', rect: { w: 100, h: 100 } }),
      createNode({ id: 'b', rect: { w: 100, h: 100 }, layout: { gridCol: 3 } }),
    ];
    const p = solveGrid(container, children);
    // a auto-placed at col 0, b explicitly at col 3 (index 2)
    expect(p[0].x).toBeCloseTo(-100); // col 0
    expect(p[1].x).toBeCloseTo(100);  // col 2
  });

  it('handles colSpan', () => {
    const container = createNode({
      id: 'g', layout: { type: 'grid', columns: 3, gap: 0, padding: 0 },
      rect: { w: 300, h: 100 },
    });
    const children = [
      createNode({ id: 'wide', rect: { w: 200, h: 100 }, layout: { colSpan: 2 } }),
      createNode({ id: 'narrow', rect: { w: 100, h: 100 } }),
    ];
    const p = solveGrid(container, children);
    // wide spans cols 0-1 (200px), center at -50
    // narrow at col 2 (100px), center at 100
    expect(p[0].x).toBeCloseTo(-50);
    expect(p[0].w).toBeCloseTo(200);
    expect(p[1].x).toBeCloseTo(100);
  });

  it('handles empty children', () => {
    const container = createNode({
      id: 'g', layout: { type: 'grid', columns: 2, gap: 0, padding: 0 },
      rect: { w: 200, h: 200 },
    });
    const { constraints } = gridConstraintStrategy(container, []);
    expect(constraints).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/layout/grid.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create the strategies directory**

Run: `mkdir -p src/layout/strategies`

- [ ] **Step 4: Implement grid strategy**

```typescript
// src/layout/strategies/grid.ts
import type { Node } from '../../types/node';
import { Variable, Expression, Constraint } from '../solver';
import type { ConstraintResult } from '../flex';

export function gridConstraintStrategy(container: Node, children: Node[]): ConstraintResult {
  const variables = new Map<string, Variable>();
  const constraints: Constraint[] = [];

  const layoutChildren = children.filter(c => (c.depth ?? 0) >= 0);
  if (layoutChildren.length === 0) return { constraints, variables };

  const layout = container.layout!;
  const columns = layout.columns ?? 1;
  const gap = layout.gap ?? 0;
  const colGap = layout.colGap ?? gap;
  const rowGap = layout.rowGap ?? gap;
  const padding = layout.padding ?? 0;

  // Container dimensions
  let containerW = container.rect?.w ?? 0;
  let containerH = container.rect?.h ?? 0;

  // Compute cell sizes
  const usableW = containerW - padding * 2;
  const colWidth = (usableW - colGap * (columns - 1)) / columns;

  // Auto-place children into grid cells
  const placements: Array<{ child: Node; col: number; row: number; cSpan: number; rSpan: number }> = [];
  const occupied = new Set<string>(); // "col,row" keys

  let autoCol = 0;
  let autoRow = 0;

  for (const child of layoutChildren) {
    const cSpan = (child.layout?.colSpan as number) ?? 1;
    const rSpan = (child.layout?.rowSpan as number) ?? 1;

    let col: number;
    let row: number;

    if (child.layout?.gridCol !== undefined) {
      col = (child.layout.gridCol as number) - 1; // 1-based to 0-based
      row = child.layout?.gridRow !== undefined ? (child.layout.gridRow as number) - 1 : autoRow;
    } else {
      // Auto-place: find next available cell
      while (occupied.has(`${autoCol},${autoRow}`)) {
        autoCol++;
        if (autoCol >= columns) { autoCol = 0; autoRow++; }
      }
      col = autoCol;
      row = autoRow;
      autoCol += cSpan;
      if (autoCol >= columns) { autoCol = 0; autoRow++; }
    }

    // Mark cells as occupied
    for (let c = col; c < col + cSpan; c++) {
      for (let r = row; r < row + rSpan; r++) {
        occupied.add(`${c},${r}`);
      }
    }

    placements.push({ child, col, row, cSpan, rSpan });
  }

  // Determine number of rows
  const numRows = Math.max(...placements.map(p => p.row + p.rSpan), 1);
  const usableH = containerH > 0 ? containerH - padding * 2 : 0;
  const rowHeight = usableH > 0
    ? (usableH - rowGap * (numRows - 1)) / numRows
    : Math.max(...layoutChildren.map(c => {
        if (c.rect) return c.rect.h;
        if (c.ellipse) return c.ellipse.ry * 2;
        return 50;
      }));

  // Auto-size container if needed
  if (!containerH || containerH === 0) {
    containerH = numRows * rowHeight + (numRows - 1) * rowGap + padding * 2;
    if (!container.rect) {
      (container as any).rect = { w: containerW, h: containerH };
    } else {
      if (!container.rect.h) container.rect.h = containerH;
    }
  }

  const offsetX = -containerW / 2;
  const offsetY = -containerH / 2;

  // Generate constraints for each child
  for (const { child, col, row, cSpan, rSpan } of placements) {
    const cellX = padding + col * (colWidth + colGap);
    const cellW = cSpan * colWidth + (cSpan - 1) * colGap;
    const cellY = padding + row * (rowHeight + rowGap);
    const cellH = rSpan * rowHeight + (rSpan - 1) * rowGap;

    const centerX = cellX + cellW / 2 + offsetX;
    const centerY = cellY + cellH / 2 + offsetY;

    const cx = new Variable(`${child.id}.centerX`);
    const cy = new Variable(`${child.id}.centerY`);
    const w = new Variable(`${child.id}.width`);
    const h = new Variable(`${child.id}.height`);

    variables.set(`${child.id}.centerX`, cx);
    variables.set(`${child.id}.centerY`, cy);
    variables.set(`${child.id}.width`, w);
    variables.set(`${child.id}.height`, h);

    constraints.push(Constraint.create(
      Expression.fromVariable(cx), '=', Expression.fromConstant(centerX),
    ));
    constraints.push(Constraint.create(
      Expression.fromVariable(cy), '=', Expression.fromConstant(centerY),
    ));
    constraints.push(Constraint.create(
      Expression.fromVariable(w), '=', Expression.fromConstant(cellW),
    ));
    constraints.push(Constraint.create(
      Expression.fromVariable(h), '=', Expression.fromConstant(cellH),
    ));
  }

  return { constraints, variables };
}
```

- [ ] **Step 5: Run grid tests**

Run: `npx vitest run src/__tests__/layout/grid.test.ts`
Expected: PASS

- [ ] **Step 6: Register grid strategy**

In `src/StarchDiagram.ts`:
```typescript
import { gridConstraintStrategy } from './layout/strategies/grid';
registerConstraintStrategy('grid', gridConstraintStrategy);
```

In `src/animation/timeline.ts`, add to `ensureStrategies()`:
```typescript
import { gridConstraintStrategy } from '../layout/strategies/grid';
// Inside ensureStrategies():
if (!getConstraintStrategy('grid')) registerConstraintStrategy('grid', gridConstraintStrategy);
```

- [ ] **Step 7: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add src/layout/strategies/grid.ts src/__tests__/layout/grid.test.ts src/StarchDiagram.ts src/animation/timeline.ts
git commit -m "feat(layout): add grid layout strategy with auto-placement and spanning"
```

---

## Task 10: Circular Strategy

**Files:**
- Create: `src/layout/strategies/circular.ts`
- Create: `src/__tests__/layout/circular.test.ts`
- Modify: `src/StarchDiagram.ts`
- Modify: `src/animation/timeline.ts`

- [ ] **Step 1: Write failing tests for circular strategy**

```typescript
// src/__tests__/layout/circular.test.ts
import { describe, it, expect } from 'vitest';
import { createNode } from '../../types/node';
import type { Node } from '../../types/node';
import { Solver } from '../../layout/solver';
import { circularConstraintStrategy } from '../../layout/strategies/circular';
import type { ChildPlacement } from '../../layout/registry';

function solveCircular(container: Node, children: Node[]): ChildPlacement[] {
  const { constraints, variables } = circularConstraintStrategy(container, children);
  const solver = new Solver();
  for (const c of constraints) solver.addConstraint(c);
  solver.solve();

  const placements: ChildPlacement[] = [];
  for (const child of children) {
    if ((child.depth ?? 0) < 0) continue;
    const cx = variables.get(`${child.id}.centerX`);
    const cy = variables.get(`${child.id}.centerY`);
    if (!cx || !cy) continue;
    placements.push({ id: child.id, x: cx.value, y: cy.value });
  }
  return placements;
}

describe('circularConstraintStrategy', () => {
  it('places 4 nodes evenly around a circle', () => {
    const container = createNode({
      id: 'ring', layout: { type: 'circular', radius: 100 },
      ellipse: { rx: 150, ry: 150 },
    });
    const children = [
      createNode({ id: 'n0', rect: { w: 30, h: 30 } }),
      createNode({ id: 'n1', rect: { w: 30, h: 30 } }),
      createNode({ id: 'n2', rect: { w: 30, h: 30 } }),
      createNode({ id: 'n3', rect: { w: 30, h: 30 } }),
    ];
    const p = solveCircular(container, children);
    expect(p).toHaveLength(4);
    // startAngle=0, sweep=360: angles at 0°, 90°, 180°, 270°
    // At 0°: x=100, y=0
    expect(p[0].x).toBeCloseTo(100);
    expect(p[0].y).toBeCloseTo(0);
    // At 90°: x=0, y=100
    expect(p[1].x).toBeCloseTo(0, 0);
    expect(p[1].y).toBeCloseTo(100);
    // At 180°: x=-100, y=0
    expect(p[2].x).toBeCloseTo(-100);
    expect(p[2].y).toBeCloseTo(0, 0);
    // At 270°: x=0, y=-100
    expect(p[3].x).toBeCloseTo(0, 0);
    expect(p[3].y).toBeCloseTo(-100);
  });

  it('respects startAngle', () => {
    const container = createNode({
      id: 'ring', layout: { type: 'circular', radius: 100, startAngle: 90 },
      ellipse: { rx: 150, ry: 150 },
    });
    const children = [
      createNode({ id: 'n0', rect: { w: 30, h: 30 } }),
      createNode({ id: 'n1', rect: { w: 30, h: 30 } }),
    ];
    const p = solveCircular(container, children);
    // startAngle=90, 2 nodes: angles at 90°, 270°
    expect(p[0].x).toBeCloseTo(0, 0);
    expect(p[0].y).toBeCloseTo(100);
    expect(p[1].x).toBeCloseTo(0, 0);
    expect(p[1].y).toBeCloseTo(-100);
  });

  it('respects sweep < 360 (arc)', () => {
    const container = createNode({
      id: 'ring', layout: { type: 'circular', radius: 100, startAngle: 0, sweep: 180 },
      ellipse: { rx: 150, ry: 150 },
    });
    const children = [
      createNode({ id: 'n0', rect: { w: 30, h: 30 } }),
      createNode({ id: 'n1', rect: { w: 30, h: 30 } }),
      createNode({ id: 'n2', rect: { w: 30, h: 30 } }),
    ];
    const p = solveCircular(container, children);
    // sweep=180, 3 nodes: angles at 0°, 90°, 180°
    expect(p[0].x).toBeCloseTo(100);
    expect(p[0].y).toBeCloseTo(0);
    expect(p[1].x).toBeCloseTo(0, 0);
    expect(p[1].y).toBeCloseTo(100);
    expect(p[2].x).toBeCloseTo(-100);
    expect(p[2].y).toBeCloseTo(0, 0);
  });

  it('handles single child', () => {
    const container = createNode({
      id: 'ring', layout: { type: 'circular', radius: 50 },
      ellipse: { rx: 100, ry: 100 },
    });
    const children = [createNode({ id: 'n0', rect: { w: 20, h: 20 } })];
    const p = solveCircular(container, children);
    expect(p).toHaveLength(1);
    // Single child at startAngle=0: x=50, y=0
    expect(p[0].x).toBeCloseTo(50);
    expect(p[0].y).toBeCloseTo(0);
  });

  it('handles empty children', () => {
    const container = createNode({
      id: 'ring', layout: { type: 'circular', radius: 100 },
      ellipse: { rx: 150, ry: 150 },
    });
    const { constraints } = circularConstraintStrategy(container, []);
    expect(constraints).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/layout/circular.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement circular strategy**

```typescript
// src/layout/strategies/circular.ts
import type { Node } from '../../types/node';
import { Variable, Expression, Constraint } from '../solver';
import type { ConstraintResult } from '../flex';

export function circularConstraintStrategy(container: Node, children: Node[]): ConstraintResult {
  const variables = new Map<string, Variable>();
  const constraints: Constraint[] = [];

  const layoutChildren = children.filter(c => (c.depth ?? 0) >= 0);
  if (layoutChildren.length === 0) return { constraints, variables };

  const layout = container.layout!;
  const radius = layout.radius ?? 100;
  const startAngle = (layout.startAngle ?? 0) * Math.PI / 180; // degrees to radians
  const sweep = (layout.sweep ?? 360) * Math.PI / 180;

  // Sort by order hint
  const sorted = [...layoutChildren].sort((a, b) => {
    const oa = (a.layout?.order as number) ?? 0;
    const ob = (b.layout?.order as number) ?? 0;
    return oa - ob;
  });

  const n = sorted.length;
  // For full circle (sweep=360°), divide evenly; for arc, use n-1 gaps
  const isFull = Math.abs(Math.abs(sweep) - 2 * Math.PI) < 0.001;
  const divisor = isFull ? n : Math.max(n - 1, 1);

  for (let i = 0; i < n; i++) {
    const child = sorted[i];
    const angle = startAngle + (sweep / divisor) * i;
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);

    const cx = new Variable(`${child.id}.centerX`);
    const cy = new Variable(`${child.id}.centerY`);

    variables.set(`${child.id}.centerX`, cx);
    variables.set(`${child.id}.centerY`, cy);

    constraints.push(Constraint.create(
      Expression.fromVariable(cx), '=', Expression.fromConstant(x),
    ));
    constraints.push(Constraint.create(
      Expression.fromVariable(cy), '=', Expression.fromConstant(y),
    ));
  }

  return { constraints, variables };
}
```

- [ ] **Step 4: Run circular tests**

Run: `npx vitest run src/__tests__/layout/circular.test.ts`
Expected: PASS

- [ ] **Step 5: Register circular strategy**

In `src/StarchDiagram.ts`:
```typescript
import { circularConstraintStrategy } from './layout/strategies/circular';
registerConstraintStrategy('circular', circularConstraintStrategy);
```

In `src/animation/timeline.ts`, add to `ensureStrategies()`:
```typescript
import { circularConstraintStrategy } from '../layout/strategies/circular';
if (!getConstraintStrategy('circular')) registerConstraintStrategy('circular', circularConstraintStrategy);
```

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/layout/strategies/circular.ts src/__tests__/layout/circular.test.ts src/StarchDiagram.ts src/animation/timeline.ts
git commit -m "feat(layout): add circular layout strategy with configurable radius, angle, and sweep"
```

---

## Task 11: Integration Tests — Cross-Strategy Slot Animation

Verify that slot animation works across different layout strategies (flex → grid, grid → circular, etc.).

**Files:**
- Create: `src/__tests__/layout/crossStrategy.test.ts`

- [ ] **Step 1: Write integration tests**

```typescript
// src/__tests__/layout/crossStrategy.test.ts
import { describe, it, expect } from 'vitest';
import { createNode } from '../../types/node';
import { computeLayoutPlacements, registerStrategy, registerConstraintStrategy } from '../../layout/registry';
import { flexStrategy } from '../../layout/flex';
import { flexConstraintStrategy } from '../../layout/flex';
import { gridConstraintStrategy } from '../../layout/strategies/grid';
import { circularConstraintStrategy } from '../../layout/strategies/circular';
import { absoluteStrategy } from '../../layout/absolute';

// Ensure strategies are registered
registerStrategy('flex', flexStrategy);
registerStrategy('absolute', absoluteStrategy);
registerConstraintStrategy('flex', flexConstraintStrategy);
registerConstraintStrategy('grid', gridConstraintStrategy);
registerConstraintStrategy('circular', circularConstraintStrategy);

describe('cross-strategy slot animation', () => {
  it('mover gets placement from flex container when slot=flex', () => {
    const flexBox = createNode({
      id: 'flexBox',
      layout: { type: 'flex', direction: 'row', gap: 10 },
      rect: { w: 300, h: 100 },
      children: [
        createNode({ id: 'a', rect: { w: 50, h: 30 } }),
      ],
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

  it('mover gets placement from grid container when slot=grid', () => {
    const gridBox = createNode({
      id: 'gridBox',
      layout: { type: 'grid', columns: 2, gap: 0, padding: 0 },
      rect: { w: 200, h: 100 },
      children: [
        createNode({ id: 'a', rect: { w: 100, h: 100 } }),
      ],
    });
    const mover = createNode({
      id: 'mover', rect: { w: 100, h: 100 },
      layout: { slot: 'gridBox' },
    });

    const results = computeLayoutPlacements([gridBox, mover]);
    const moverResult = results.find(r => r.nodeId === 'mover');
    expect(moverResult).toBeDefined();
    expect(moverResult!.isSlotMember).toBe(true);
    // Mover should be placed in col 1 (auto-placed after child a in col 0)
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
});
```

- [ ] **Step 2: Run integration tests**

Run: `npx vitest run src/__tests__/layout/crossStrategy.test.ts`
Expected: PASS

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/layout/crossStrategy.test.ts
git commit -m "test(layout): add cross-strategy integration tests for slot animation"
```

---

## Task 12: End-to-End DSL Tests

Test the full pipeline: DSL text → parse → layout → render for new strategies.

**Files:**
- Modify: `src/__tests__/layout/dslRoundtrip.test.ts`

- [ ] **Step 1: Add E2E tests**

Append to `src/__tests__/layout/dslRoundtrip.test.ts`:

```typescript
import { registerStrategy, registerConstraintStrategy, computeLayoutPlacements, runLayout } from '../../layout/registry';
import { flexStrategy, flexConstraintStrategy } from '../../layout/flex';
import { absoluteStrategy } from '../../layout/absolute';
import { gridConstraintStrategy } from '../../layout/strategies/grid';
import { circularConstraintStrategy } from '../../layout/strategies/circular';

// Ensure registered
registerStrategy('flex', flexStrategy);
registerStrategy('absolute', absoluteStrategy);
registerConstraintStrategy('flex', flexConstraintStrategy);
registerConstraintStrategy('grid', gridConstraintStrategy);
registerConstraintStrategy('circular', circularConstraintStrategy);

describe('end-to-end: DSL → parse → layout', () => {
  it('grid layout from DSL produces placements', () => {
    const { model } = parseScene(`objects
  dashboard: rect 600x400
    layout grid columns=3 gap=10 padding=15
    m1: rect 0x80
    m2: rect 0x80
    m3: rect 0x80`);
    const nodes = model.objects!.map(o => createNode(o));
    const results = computeLayoutPlacements(nodes);
    expect(results.length).toBeGreaterThanOrEqual(3);
  });

  it('circular layout from DSL produces placements', () => {
    const { model } = parseScene(`objects
  ring: ellipse 150x150
    layout circular radius=120
    n1: rect 60x30
    n2: rect 60x30
    n3: rect 60x30`);
    const nodes = model.objects!.map(o => createNode(o));
    const results = computeLayoutPlacements(nodes);
    expect(results.length).toBe(3);
  });

  it('slot animation DSL across strategies parses correctly', () => {
    const { model } = parseScene(`objects
  inbox: rect 200x200
    layout flex column gap=8 padding=10
    task1: rect 160x30
      layout slot=inbox

  board: rect 300x200
    layout grid columns=2 gap=8 padding=10

animate 4s
  2 task1.layout.slot: board`);
    expect(model.objects).toHaveLength(2);
    expect(model.objects![0].layout?.type).toBe('flex');
    expect(model.objects![1].layout?.type).toBe('grid');
    expect(model.objects![0].children![0].layout?.slot).toBe('inbox');
    expect(model.animate?.blocks?.[0]?.changes?.['task1.layout.slot']).toBe('board');
  });
});
```

- [ ] **Step 2: Run E2E tests**

Run: `npx vitest run src/__tests__/layout/dslRoundtrip.test.ts`
Expected: PASS

- [ ] **Step 3: Run full test suite one final time**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/layout/dslRoundtrip.test.ts
git commit -m "test(layout): add end-to-end DSL tests for grid and circular layout"
```

---

## Future Work (not in this plan)

- **DAG strategy** — requires edge inference from path/connection nodes, topological layering, and crossing minimization. Separate plan.
- **Tree strategy** — Reingold-Tilford algorithm. Separate plan.
- **Cross-container relative positioning** — `below`, `rightOf`, `alignX`, `alignY` DSL. Separate plan.
- **Advanced solver** — if the Gaussian elimination approach proves insufficient for complex constraint interactions, upgrade to a full Cassowary simplex implementation. The current approach handles the strategies implemented so far.
