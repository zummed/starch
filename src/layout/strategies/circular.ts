import type { Node } from '../../types/node';
import type { ConstraintResult } from '../solver';
import { Variable, Expression, Constraint } from '../solver';
import { resolveCircularContainer } from '../../types/properties';

/**
 * Circular layout constraint strategy.
 *
 * Places children evenly around a circle (or arc) centered at the container
 * origin (0, 0). Reads `radius`, `startAngle` (degrees), and `sweep`
 * (degrees) from the container's layout config.
 */
export function circularConstraintStrategy(
  container: Node,
  children: Node[],
): ConstraintResult {
  const constraints: Constraint[] = [];
  const variables = new Map<string, Variable>();

  if (children.length === 0) return { constraints, variables };

  const { radius, startAngle, sweep } = resolveCircularContainer(container.layout);

  // Sort by order hint
  const sorted = [...children].sort((a, b) => {
    const oa = a.layout?.order ?? 0;
    const ob = b.layout?.order ?? 0;
    return oa - ob;
  });

  const n = sorted.length;
  const startAngleRad = (startAngle * Math.PI) / 180;
  const sweepRad = (sweep * Math.PI) / 180;
  const isFull = Math.abs(Math.abs(sweepRad) - 2 * Math.PI) < 1e-9;
  // Full circles divide by n (the seam at start === start+360 must not get
  // a doubled-up child); partial sweeps divide by n-1 so the arc is
  // endpoint-inclusive — the last child lands exactly on startAngle+sweep.
  const divisor = isFull ? n : Math.max(n - 1, 1);

  for (let i = 0; i < n; i++) {
    const child = sorted[i];
    const angle = startAngleRad + (sweepRad / divisor) * i;
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);

    const varCX = new Variable(`${child.id}.centerX`, x);
    const varCY = new Variable(`${child.id}.centerY`, y);
    variables.set(varCX.name, varCX);
    variables.set(varCY.name, varCY);

    constraints.push(
      Constraint.create(
        Expression.fromVariable(varCX),
        Expression.fromConstant(x),
      ),
    );
    constraints.push(
      Constraint.create(
        Expression.fromVariable(varCY),
        Expression.fromConstant(y),
      ),
    );
  }

  return { constraints, variables };
}
