/**
 * Layout module entry point. Importing this module registers every
 * built-in strategy once — the one place that wires strategy name to
 * implementation — then re-exports the registry API consumers need.
 *
 * Strategy names themselves are defined once in types/properties.ts
 * (LAYOUT_STRATEGY_NAMES) — LayoutSchema's `type` enum derives from it, and
 * this module registers exactly those names. The constant lives in types/
 * rather than here so the schema layer never needs to import layout/.
 */
import { registerLayoutStrategy, type ConstraintStrategy } from './registry';
import { flexConstraintStrategy } from './flex';
import { absoluteStrategy } from './absolute';
import { gridConstraintStrategy } from './strategies/grid';
import { circularConstraintStrategy } from './strategies/circular';
import { LAYOUT_STRATEGY_NAMES, type LayoutStrategyName } from '../types/properties';
import { validateLayoutUsage } from './validate';

const BUILTIN_STRATEGIES: Record<LayoutStrategyName, ConstraintStrategy> = {
  flex: flexConstraintStrategy,
  absolute: absoluteStrategy,
  grid: gridConstraintStrategy,
  circular: circularConstraintStrategy,
};

export function registerBuiltinStrategies(): void {
  for (const name of LAYOUT_STRATEGY_NAMES) {
    registerLayoutStrategy(name, BUILTIN_STRATEGIES[name]);
  }
}

registerBuiltinStrategies();

export {
  runLayout,
  computeLayoutPlacements,
  applyLayoutPlacements,
  registerLayoutStrategy,
  getLayoutStrategy,
  findNode,
  worldToParentLocal,
  collectLayoutChildren,
} from './registry';
export type { LayoutResult, ChildPlacement, ConstraintStrategy } from './registry';
export { LAYOUT_STRATEGY_NAMES } from '../types/properties';
export type { LayoutStrategyName } from '../types/properties';
export { validateLayoutUsage } from './validate';
