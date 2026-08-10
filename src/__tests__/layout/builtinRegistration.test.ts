import { describe, it, expect } from 'vitest';
// Import the registry module directly — NOT layout/index. Builtins must be
// available without relying on any module's top-level side effects, which
// bundlers may tree-shake away (this removed layout from the production
// playground bundle before registration became lazy inside the registry).
import { getLayoutStrategy, computeLayoutPlacements } from '../../layout/registry';
import { LAYOUT_STRATEGY_NAMES } from '../../types/properties';
import { createNode } from '../../types/node';

describe('builtin strategy registration', () => {
  it('every declared strategy name resolves via the registry alone', () => {
    for (const name of LAYOUT_STRATEGY_NAMES) {
      expect(getLayoutStrategy(name), name).toBeDefined();
    }
  });

  it('an unregistered layout type on a node throws instead of silently skipping', () => {
    const child = createNode({ id: 'c', rect: { w: 10, h: 10 } });
    const container = createNode({
      id: 'p',
      rect: { w: 100, h: 100 },
      layout: { type: 'bogus' } as never,
      children: [child],
    });
    expect(() => computeLayoutPlacements([container])).toThrow(/no strategy registered/);
  });
});
