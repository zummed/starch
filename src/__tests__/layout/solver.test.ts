import { describe, it, expect } from 'vitest';
import {
  Variable,
  Expression,
  Constraint,
  Solver,
} from '../../layout/solver';

describe('Variable', () => {
  it('creates with name and default value 0', () => {
    const v = new Variable('x');
    expect(v.name).toBe('x');
    expect(v.value).toBe(0);
  });

  it('creates with name and custom value', () => {
    const v = new Variable('y', 42);
    expect(v.name).toBe('y');
    expect(v.value).toBe(42);
  });
});

describe('Expression', () => {
  it('creates from constant', () => {
    const e = Expression.fromConstant(5);
    expect(e.constant).toBe(5);
    expect(e.terms.size).toBe(0);
  });

  it('creates from variable with default coeff 1', () => {
    const v = new Variable('x');
    const e = Expression.fromVariable(v);
    expect(e.terms.get(v)).toBe(1);
    expect(e.constant).toBe(0);
  });

  it('creates from variable with custom coeff', () => {
    const v = new Variable('x');
    const e = Expression.fromVariable(v, 3);
    expect(e.terms.get(v)).toBe(3);
    expect(e.constant).toBe(0);
  });

  it('adds two expressions (merges terms, adds constants)', () => {
    const x = new Variable('x');
    const y = new Variable('y');
    const e1 = Expression.fromVariable(x, 2).plus(Expression.fromConstant(3));
    const e2 = Expression.fromVariable(y, 4)
      .plus(Expression.fromVariable(x, 1))
      .plus(Expression.fromConstant(7));
    const sum = e1.plus(e2);
    expect(sum.terms.get(x)).toBe(3);
    expect(sum.terms.get(y)).toBe(4);
    expect(sum.constant).toBe(10);
  });

  it('subtracts two expressions', () => {
    const x = new Variable('x');
    const e1 = Expression.fromVariable(x, 5).plus(Expression.fromConstant(10));
    const e2 = Expression.fromVariable(x, 2).plus(Expression.fromConstant(3));
    const diff = e1.minus(e2);
    expect(diff.terms.get(x)).toBe(3);
    expect(diff.constant).toBe(7);
  });

  it('multiplies by scalar', () => {
    const x = new Variable('x');
    const e = Expression.fromVariable(x, 3)
      .plus(Expression.fromConstant(4))
      .times(2);
    expect(e.terms.get(x)).toBe(6);
    expect(e.constant).toBe(8);
  });

  it('negates', () => {
    const x = new Variable('x');
    const e = Expression.fromVariable(x, 3)
      .plus(Expression.fromConstant(4))
      .negate();
    expect(e.terms.get(x)).toBe(-3);
    expect(e.constant).toBe(-4);
  });
});

describe('Solver — basic equalities', () => {
  it('solves single equality: x = 10', () => {
    const x = new Variable('x');
    const solver = new Solver();
    solver.addConstraint(
      Constraint.create(Expression.fromVariable(x), Expression.fromConstant(10)),
    );
    const result = solver.solve();
    expect(x.value).toBeCloseTo(10);
    expect(result.status).toBe('solved');
    expect(result.conflicts).toBe(0);
    expect(result.freeVariables).toEqual([]);
  });

  it('solves two linked equalities: x = 10, y = x + 5', () => {
    const x = new Variable('x');
    const y = new Variable('y');
    const solver = new Solver();

    solver.addConstraint(
      Constraint.create(Expression.fromVariable(x), Expression.fromConstant(10)),
    );
    solver.addConstraint(
      Constraint.create(
        Expression.fromVariable(y),
        Expression.fromVariable(x).plus(Expression.fromConstant(5)),
      ),
    );
    solver.solve();
    expect(x.value).toBeCloseTo(10);
    expect(y.value).toBeCloseTo(15);
  });

  it('solves derived relationships: width = right - left, center = left + width/2', () => {
    const left = new Variable('left');
    const right = new Variable('right');
    const width = new Variable('width');
    const center = new Variable('center');
    const solver = new Solver();

    solver.addConstraint(
      Constraint.create(Expression.fromVariable(left), Expression.fromConstant(10)),
    );
    solver.addConstraint(
      Constraint.create(Expression.fromVariable(right), Expression.fromConstant(110)),
    );
    solver.addConstraint(
      Constraint.create(
        Expression.fromVariable(width),
        Expression.fromVariable(right).minus(Expression.fromVariable(left)),
      ),
    );
    solver.addConstraint(
      Constraint.create(
        Expression.fromVariable(center),
        Expression.fromVariable(left).plus(Expression.fromVariable(width).times(0.5)),
      ),
    );
    solver.solve();
    expect(left.value).toBeCloseTo(10);
    expect(right.value).toBeCloseTo(110);
    expect(width.value).toBeCloseTo(100);
    expect(center.value).toBeCloseTo(60);
  });
});

describe('Solver — chains in forward and reverse constraint order', () => {
  it('solves chain a=0, b=a+60, c=b+60 added forward', () => {
    const a = new Variable('a');
    const b = new Variable('b');
    const c = new Variable('c');
    const solver = new Solver();

    solver.addConstraint(
      Constraint.create(Expression.fromVariable(a), Expression.fromConstant(0)),
    );
    solver.addConstraint(
      Constraint.create(
        Expression.fromVariable(b),
        Expression.fromVariable(a).plus(Expression.fromConstant(60)),
      ),
    );
    solver.addConstraint(
      Constraint.create(
        Expression.fromVariable(c),
        Expression.fromVariable(b).plus(Expression.fromConstant(60)),
      ),
    );
    solver.solve();
    expect(a.value).toBeCloseTo(0);
    expect(b.value).toBeCloseTo(60);
    expect(c.value).toBeCloseTo(120);
  });

  it('solves the same chain added in reverse constraint order', () => {
    const a = new Variable('a');
    const b = new Variable('b');
    const c = new Variable('c');
    const solver = new Solver();

    // c = b + 60 added first, then b = a + 60, then a = 0 last.
    solver.addConstraint(
      Constraint.create(
        Expression.fromVariable(c),
        Expression.fromVariable(b).plus(Expression.fromConstant(60)),
      ),
    );
    solver.addConstraint(
      Constraint.create(
        Expression.fromVariable(b),
        Expression.fromVariable(a).plus(Expression.fromConstant(60)),
      ),
    );
    solver.addConstraint(
      Constraint.create(Expression.fromVariable(a), Expression.fromConstant(0)),
    );
    solver.solve();
    expect(a.value).toBeCloseTo(0);
    expect(b.value).toBeCloseTo(60);
    expect(c.value).toBeCloseTo(120);
  });

  it('solves a longer 8-link chain added in reverse order', () => {
    const links = Array.from({ length: 9 }, (_, i) => new Variable(`p${i}`));
    const solver = new Solver();

    solver.addConstraint(
      Constraint.create(Expression.fromVariable(links[0]), Expression.fromConstant(0)),
    );
    for (let i = links.length - 1; i > 0; i--) {
      solver.addConstraint(
        Constraint.create(
          Expression.fromVariable(links[i]),
          Expression.fromVariable(links[i - 1]).plus(Expression.fromConstant(10)),
        ),
      );
    }
    solver.solve();
    links.forEach((v, i) => expect(v.value).toBeCloseTo(i * 10));
  });
});

describe('Solver — interleaved pivot / variable orders', () => {
  it('solves a 3-variable system where pivot rows are discovered out of variable order', () => {
    // Variable discovery order (first appearance across constraints): b, c, a.
    // 2b + c = 10
    // a + b = 5
    // a - c = 1
    const a = new Variable('a');
    const b = new Variable('b');
    const c = new Variable('c');
    const solver = new Solver();

    solver.addConstraint(
      Constraint.create(
        Expression.fromVariable(b, 2).plus(Expression.fromVariable(c)),
        Expression.fromConstant(10),
      ),
    );
    solver.addConstraint(
      Constraint.create(
        Expression.fromVariable(a).plus(Expression.fromVariable(b)),
        Expression.fromConstant(5),
      ),
    );
    solver.addConstraint(
      Constraint.create(
        Expression.fromVariable(a).minus(Expression.fromVariable(c)),
        Expression.fromConstant(1),
      ),
    );

    const result = solver.solve();
    expect(a.value).toBeCloseTo(-1);
    expect(b.value).toBeCloseTo(6);
    expect(c.value).toBeCloseTo(-2);
    expect(result.status).toBe('solved');
  });

  it('solves a shared-variable system with no chain structure: x+y=100, x-y=20', () => {
    const x = new Variable('x');
    const y = new Variable('y');
    const solver = new Solver();

    solver.addConstraint(
      Constraint.create(
        Expression.fromVariable(x).plus(Expression.fromVariable(y)),
        Expression.fromConstant(100),
      ),
    );
    solver.addConstraint(
      Constraint.create(
        Expression.fromVariable(x).minus(Expression.fromVariable(y)),
        Expression.fromConstant(20),
      ),
    );
    solver.solve();
    expect(x.value).toBeCloseTo(60);
    expect(y.value).toBeCloseTo(40);
  });
});

describe('Solver — conflict detection', () => {
  it('reports a conflict for directly contradictory equalities', () => {
    const x = new Variable('x');
    const solver = new Solver();

    solver.addConstraint(
      Constraint.create(Expression.fromVariable(x), Expression.fromConstant(10)),
    );
    solver.addConstraint(
      Constraint.create(Expression.fromVariable(x), Expression.fromConstant(20)),
    );
    const result = solver.solve();
    expect(result.status).toBe('conflict');
    expect(result.conflicts).toBe(1);
    // The first-seen constraint wins the pivot; value reflects it, not the conflicting one.
    expect(x.value).toBeCloseTo(10);
  });

  it('reports a conflict transitively (x=10, y=x+5, y=20)', () => {
    const x = new Variable('x');
    const y = new Variable('y');
    const solver = new Solver();

    solver.addConstraint(
      Constraint.create(Expression.fromVariable(x), Expression.fromConstant(10)),
    );
    solver.addConstraint(
      Constraint.create(
        Expression.fromVariable(y),
        Expression.fromVariable(x).plus(Expression.fromConstant(5)),
      ),
    );
    solver.addConstraint(
      Constraint.create(Expression.fromVariable(y), Expression.fromConstant(20)),
    );
    const result = solver.solve();
    expect(result.status).toBe('conflict');
    expect(result.conflicts).toBe(1);
  });
});

describe('Solver — underdetermined systems and suggested-value semantics', () => {
  it('leaves a free variable at its pre-solve (suggested) value', () => {
    const x = new Variable('x', 0);
    const y = new Variable('y', 7);
    const solver = new Solver();

    // Single constraint over two variables: x + y = 100.
    solver.addConstraint(
      Constraint.create(
        Expression.fromVariable(x).plus(Expression.fromVariable(y)),
        Expression.fromConstant(100),
      ),
    );
    const result = solver.solve();

    // x is discovered first (appears first in the expression) so it becomes
    // the pivot; y is free and keeps its suggested initial value of 7.
    expect(result.status).toBe('solved');
    expect(result.freeVariables).toEqual(['y']);
    expect(y.value).toBeCloseTo(7);
    expect(x.value).toBeCloseTo(93);
  });

  it('pivots on whichever variable is written first in the expression', () => {
    const x = new Variable('x', 0);
    const y = new Variable('y', 7);
    const solver = new Solver();

    // Same equation, but y is written first this time.
    solver.addConstraint(
      Constraint.create(
        Expression.fromVariable(y).plus(Expression.fromVariable(x)),
        Expression.fromConstant(100),
      ),
    );
    const result = solver.solve();

    expect(result.freeVariables).toEqual(['x']);
    expect(x.value).toBeCloseTo(0); // free: keeps its suggested value
    expect(y.value).toBeCloseTo(100);
  });

  it('reports every variable as free when there are no constraints on them', () => {
    const x = new Variable('x', 5);
    const y = new Variable('y', 6);
    const z = new Variable('z', 7);
    const solver = new Solver();

    solver.addConstraint(
      Constraint.create(
        Expression.fromVariable(x)
          .plus(Expression.fromVariable(y))
          .plus(Expression.fromVariable(z)),
        Expression.fromConstant(30),
      ),
    );
    const result = solver.solve();

    expect(result.freeVariables).toEqual(['y', 'z']);
    expect(y.value).toBeCloseTo(6);
    expect(z.value).toBeCloseTo(7);
    expect(x.value).toBeCloseTo(30 - 6 - 7);
  });

  it('reports all variables free and stays solved when there are no constraints at all', () => {
    const solver = new Solver();
    const result = solver.solve();
    expect(result.status).toBe('solved');
    expect(result.freeVariables).toEqual([]);
    expect(result.conflicts).toBe(0);
  });
});
