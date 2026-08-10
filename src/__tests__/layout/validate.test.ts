import { describe, it, expect } from 'vitest';
import { createNode } from '../../types/node';
import { validateLayoutUsage } from '../../layout';
import { parseScene } from '../../parser/parser';
import { v2Samples } from '../../samples';

describe('validateLayoutUsage', () => {
  it('warns when a child hint of a different strategy is authored under a mismatched parent', () => {
    const tree = [createNode({
      id: 'row1',
      layout: { type: 'flex' },
      children: [createNode({ id: 'a', layout: { gridCol: 1 } })],
    })];

    expect(validateLayoutUsage(tree)).toEqual([
      'layout.gridCol on "a" has no effect — parent "row1" is a flex container',
    ]);
  });

  it('warns when a container key belongs to a different strategy than the node\'s own type', () => {
    const tree = [createNode({ id: 'b', layout: { type: 'flex', radius: 50 } })];

    expect(validateLayoutUsage(tree)).toEqual([
      'layout.radius on "b" has no effect — "b" is not a circular container (type is flex)',
    ]);
  });

  it('warns when a container key is authored on a node with no layout type', () => {
    const tree = [createNode({ id: 'c', layout: { gap: 10 } })];

    expect(validateLayoutUsage(tree)).toEqual([
      'layout.gap on "c" has no effect — "c" has no layout type',
    ]);
  });

  it('warns when a child hint is authored under a parent that has no layout type', () => {
    const tree = [createNode({
      id: 'root',
      children: [createNode({ id: 'd', layout: { grow: 1 } })],
    })];

    expect(validateLayoutUsage(tree)).toEqual([
      'layout.grow on "d" has no effect — parent "root" is not a layout container',
    ]);
  });

  it('accepts a child hint matching the slot target container\'s strategy, even without a matching structural parent', () => {
    const tree = [
      createNode({ id: 'board', layout: { type: 'grid', columns: 2 } }),
      createNode({ id: 'mover', layout: { slot: 'board', gridCol: 2 } }),
    ];

    expect(validateLayoutUsage(tree)).toEqual([]);
  });

  it('still warns on a slot member whose hint matches neither its structural parent nor the slot target', () => {
    const tree = [
      createNode({ id: 'ring', layout: { type: 'circular' } }),
      createNode({
        id: 'flexParent',
        layout: { type: 'flex' },
        children: [createNode({ id: 'mover', layout: { slot: 'ring', gridCol: 1 } })],
      }),
    ];

    expect(validateLayoutUsage(tree)).toEqual([
      'layout.gridCol on "mover" has no effect — parent "flexParent" is a flex container',
    ]);
  });

  it('produces zero warnings for a clean, existing sample scene', () => {
    const sample = v2Samples.find(s => s.name === 'cross-strategy-slot');
    expect(sample).toBeDefined();
    const scene = parseScene(sample!.dsl);
    expect(validateLayoutUsage(scene.nodes)).toEqual([]);
    // parseScene already runs validateLayoutUsage internally.
    expect(scene.warnings).toEqual([]);
  });
});
