const EPSILON = 1e-10;

export class Variable {
  value: number;
  constructor(
    public name: string,
    value: number = 0,
  ) {
    this.value = value;
  }
}

export class Expression {
  constructor(
    public terms: Map<Variable, number>,
    public constant: number,
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
    const terms = new Map<Variable, number>(this.terms);
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

export interface ConstraintResult {
  constraints: Constraint[];
  variables: Map<string, Variable>;
  /**
   * Auto-computed container size, when the strategy determines one (e.g.
   * flex/grid content-based sizing). Strategies report this instead of
   * mutating `container.rect` themselves — the registry applies it.
   */
  containerSize?: { w: number; h: number };
}

/** A required linear equality: expression == 0. */
export class Constraint {
  constructor(public expression: Expression) {}

  static create(lhs: Expression, rhs: Expression): Constraint {
    return new Constraint(lhs.minus(rhs));
  }
}

/** Diagnostics returned by `Solver.solve()`. Callers may ignore the result. */
export interface SolveResult {
  status: 'solved' | 'conflict';
  /**
   * Variables that appear in the system but are not pinned by any constraint
   * (non-pivot columns). Per the underdetermined-system semantic, these keep
   * whatever value they held before `solve()` ran (their "suggested value").
   */
  freeVariables: string[];
  /** Number of rows left with a nonzero residual (0 = nonzero) after elimination. */
  conflicts: number;
}

/**
 * Solves systems of linear equality constraints via Gaussian elimination.
 *
 * Underdetermined semantic: a variable with no pivot row keeps its initial
 * (pre-solve) value — that value is treated as the "suggested value" for a
 * free variable, exactly like a constraint solver's optional/default value.
 */
export class Solver {
  private constraints: Constraint[] = [];

  addConstraint(c: Constraint): void {
    this.constraints.push(c);
  }

  solve(): SolveResult {
    // Collect all variables referenced by any constraint.
    const varSet = new Set<Variable>();
    for (const c of this.constraints) {
      for (const v of c.expression.terms.keys()) {
        varSet.add(v);
      }
    }
    const vars = [...varSet];

    return this.solveEqualities(this.constraints, vars);
  }

  private solveEqualities(
    constraints: Constraint[],
    vars: Variable[],
  ): SolveResult {
    if (constraints.length === 0 || vars.length === 0) {
      return { status: 'solved', freeVariables: vars.map((v) => v.name), conflicts: 0 };
    }

    const n = constraints.length;
    const m = vars.length;

    // Build augmented matrix [coefficients | -constant]
    const matrix: number[][] = [];
    for (const c of constraints) {
      const row: number[] = [];
      for (const v of vars) {
        row.push(c.expression.terms.get(v) ?? 0);
      }
      row.push(-c.expression.constant);
      matrix.push(row);
    }

    // Gaussian elimination with partial pivoting. `pivotCol[row]` records the
    // variable column that row was pivoted on — since columns are scanned in
    // order and a pivot row is consumed at most once, `vars[pivotCol[row]]`
    // is always the variable that row's back-substitution solves for, even
    // when row swaps reorder which constraint ends up in that row.
    const pivotCol: number[] = [];
    let pivotRow = 0;
    for (let col = 0; col < m && pivotRow < n; col++) {
      // Find best pivot
      let maxVal = Math.abs(matrix[pivotRow][col]);
      let maxRow = pivotRow;
      for (let row = pivotRow + 1; row < n; row++) {
        const val = Math.abs(matrix[row][col]);
        if (val > maxVal) {
          maxVal = val;
          maxRow = row;
        }
      }

      if (maxVal < EPSILON) continue; // Skip this column

      // Swap rows
      if (maxRow !== pivotRow) {
        [matrix[pivotRow], matrix[maxRow]] = [matrix[maxRow], matrix[pivotRow]];
      }

      // Eliminate below
      for (let row = pivotRow + 1; row < n; row++) {
        const factor = matrix[row][col] / matrix[pivotRow][col];
        for (let j = col; j <= m; j++) {
          matrix[row][j] -= factor * matrix[pivotRow][j];
        }
      }

      pivotCol.push(col);
      pivotRow++;
    }

    const pinnedCols = new Set(pivotCol);
    const freeVariables = vars
      .filter((_, idx) => !pinnedCols.has(idx))
      .map((v) => v.name);

    // Detect conflicts: any row beyond the pivoted rows with a nonzero
    // residual constant is an unsatisfiable equation (0 = nonzero).
    let conflicts = 0;
    for (let row = pivotCol.length; row < n; row++) {
      if (Math.abs(matrix[row][m]) > EPSILON) conflicts++;
    }

    // Back substitution — only touches pinned variables; free variables keep
    // their pre-solve (suggested) value untouched.
    for (let i = pivotCol.length - 1; i >= 0; i--) {
      const col = pivotCol[i];
      let val = matrix[i][m];
      for (let j = col + 1; j < m; j++) {
        val -= matrix[i][j] * vars[j].value;
      }
      vars[col].value = val / matrix[i][col];
    }

    return {
      status: conflicts > 0 ? 'conflict' : 'solved',
      freeVariables,
      conflicts,
    };
  }
}
