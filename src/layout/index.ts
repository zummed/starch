/**
 * Layout module entry point — re-exports the registry API consumers need.
 *
 * Built-in strategies are registered lazily inside the registry itself
 * (see ensureBuiltins there): registration must not depend on a module's
 * top-level side effects, which bundlers may tree-shake away when only
 * bindings are imported. Strategy names are defined once in
 * types/properties.ts (LAYOUT_STRATEGY_NAMES) — LayoutSchema's `type` enum
 * derives from it, and the registry registers exactly those names.
 */
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
