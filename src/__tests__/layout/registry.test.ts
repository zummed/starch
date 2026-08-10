import { describe, it, expect, vi } from 'vitest';
import {
  computeLayoutPlacements,
  applyLayoutPlacements,
  runLayout,
  registerLayoutStrategy,
  getLayoutStrategy,
} from '../../layout';
import { Variable, Expression, Constraint } from '../../layout/solver';
import { createNode } from '../../types/node';
import type { Layout } from '../../types/properties';
import { groupTemplate } from '../../templates/sets/core/group';
import { stateRegionTemplate } from '../../templates/sets/state/region';

describe('layout registry — registration', () => {
  it('registers and retrieves a strategy', () => {
    registerLayoutStrategy('test', () => ({ constraints: [], variables: new Map() }));
    expect(getLayoutStrategy('test')).toBeDefined();
  });

  it('returns undefined for unknown strategy', () => {
    expect(getLayoutStrategy('nonexistent')).toBeUndefined();
  });
});

describe('runLayout / computeLayoutPlacements', () => {
  it('applies solved placements to children transforms', () => {
    registerLayoutStrategy('mock', (_node, children) => {
      const constraints: Constraint[] = [];
      const variables = new Map<string, Variable>();
      children.forEach((c, i) => {
        const vx = new Variable(`${c.id}.centerX`, i * 100);
        const vy = new Variable(`${c.id}.centerY`, i * 50);
        variables.set(vx.name, vx);
        variables.set(vy.name, vy);
        constraints.push(Constraint.create(Expression.fromVariable(vx), Expression.fromConstant(i * 100)));
        constraints.push(Constraint.create(Expression.fromVariable(vy), Expression.fromConstant(i * 50)));
      });
      return { constraints, variables };
    });

    const tree = [createNode({
      id: 'container',
      // 'mock' is a registry-only test strategy, not part of the DSL-authorable
      // LAYOUT_STRATEGY_NAMES enum — registerLayoutStrategy's runtime API still
      // accepts any string, only the Layout type is scoped to real strategies.
      layout: { type: 'mock' as Layout['type'] },
      children: [
        createNode({ id: 'a', rect: { w: 50, h: 30 } }),
        createNode({ id: 'b', rect: { w: 50, h: 30 } }),
      ],
    })];

    runLayout(tree);
    // toBeCloseTo, not toBe: a lone `var - constant` pin on an exact-zero
    // constant can solve to IEEE754 -0, which is numerically 0 but fails
    // Object.is-based equality.
    expect(tree[0].children[0].transform?.x).toBeCloseTo(0);
    expect(tree[0].children[0].transform?.y).toBeCloseTo(0);
    expect(tree[0].children[1].transform?.x).toBe(100);
    expect(tree[0].children[1].transform?.y).toBe(50);
  });

  it('applies targetW/targetH to ellipse children too, not just rects', () => {
    const container = createNode({
      id: 'g',
      layout: { type: 'grid', columns: 1 },
      rect: { w: 200, h: 100 },
      children: [createNode({ id: 'e', ellipse: { rx: 20, ry: 10 } })],
    });

    const placements = computeLayoutPlacements([container]);
    applyLayoutPlacements([container], placements);

    const e = container.children[0];
    expect(e.ellipse?.rx).toBe(100);
    expect(e.ellipse?.ry).toBe(50);
  });

  it('warns via console.warn with the container id when constraints conflict', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registerLayoutStrategy('conflicting', (_node, children) => {
      const v = new Variable(`${children[0].id}.centerX`, 0);
      const vy = new Variable(`${children[0].id}.centerY`, 0);
      return {
        constraints: [
          Constraint.create(Expression.fromVariable(v), Expression.fromConstant(10)),
          Constraint.create(Expression.fromVariable(v), Expression.fromConstant(20)),
          Constraint.create(Expression.fromVariable(vy), Expression.fromConstant(0)),
        ],
        variables: new Map([[v.name, v], [vy.name, vy]]),
      };
    });

    const tree = [createNode({
      id: 'bad',
      layout: { type: 'conflicting' as Layout['type'] },
      children: [createNode({ id: 'x', rect: { w: 1, h: 1 } })],
    })];

    computeLayoutPlacements(tree);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('bad'));
    warn.mockRestore();
  });
});

describe('layout child collection (2c)', () => {
  it('excludes children with layout.skip from the layout flow', () => {
    const tree = [createNode({
      id: 'c',
      layout: { type: 'flex', direction: 'row', gap: 0 },
      rect: { w: 200, h: 100 },
      children: [
        createNode({ id: 'bg', rect: { w: 10, h: 10 }, layout: { skip: true }, transform: { x: 999, y: 999 } }),
        createNode({ id: 'a', rect: { w: 50, h: 30 } }),
      ],
    })];

    runLayout(tree);

    const bg = tree[0].children[0];
    const a = tree[0].children[1];
    expect(bg.transform?.x).toBe(999);
    expect(bg.transform?.y).toBe(999);
    // "a" is laid out as the sole flex item (not sharing the row with bg).
    expect(a.transform?.x).toBe(-75);
  });

  it('a group template used as a flex container does not lay out its own title', () => {
    const group = groupTemplate('g1', { label: 'Group A', w: 300, h: 200, direction: 'row', gap: 0 });
    const authoredTitleTransform = { ...group.children.find(c => c.id === 'g1.title')!.transform };

    runLayout([group]);

    const title = group.children.find(c => c.id === 'g1.title')!;
    // Title keeps its authored corner-anchored position — it's never
    // pulled into the flex row as the sole child (which would center it
    // in the padded content box instead, a very different position).
    expect(title.transform).toEqual(authoredTitleTransform);
  });

  it('a state.region template used as a flex container does not lay out its own title', () => {
    const region = stateRegionTemplate('r1', { label: 'Region A', w: 300, h: 200, direction: 'row', gap: 0 });
    const authoredTitleTransform = { ...region.children.find(c => c.id === 'r1.title')!.transform };

    runLayout([region]);

    const title = region.children.find(c => c.id === 'r1.title')!;
    // Title keeps its authored corner-anchored position — it's never
    // pulled into the flex row as the sole child (which would center it
    // in the padded content box instead, a very different position).
    expect(title.transform).toEqual(authoredTitleTransform);
  });

  it('excludes a child from its own parent\'s flow when its slot names a different container', () => {
    const other = createNode({ id: 'other', layout: { type: 'flex', direction: 'row', gap: 0 } });
    const container = createNode({
      id: 'c',
      layout: { type: 'flex', direction: 'row', gap: 0 },
      rect: { w: 200, h: 100 },
      children: [
        createNode({ id: 'a', rect: { w: 50, h: 30 } }),
        createNode({ id: 'roamer', rect: { w: 50, h: 30 }, layout: { slot: 'other' } }),
      ],
    });

    const placements = computeLayoutPlacements([container, other]);

    const roamer = placements.find(p => p.nodeId === 'roamer')!;
    const a = placements.find(p => p.nodeId === 'a')!;
    expect(roamer.isSlotMember).toBe(true);
    // "a" is c's only real flex child — its position reflects a single-item row.
    expect(a.targetX).toBe(-75);
  });
});

describe('world/local coordinates for slot members (2b)', () => {
  it('resolves a slot member across a nested container correctly (regression)', () => {
    const outer = createNode({
      id: 'outer',
      transform: { x: 300, y: 100 },
      children: [
        createNode({
          id: 'inner',
          transform: { x: 50, y: 20 },
          layout: { type: 'flex', direction: 'row', gap: 0 },
          children: [
            createNode({ id: 'leaf', rect: { w: 40, h: 20 } }),
          ],
        }),
        createNode({ id: 'mover', rect: { w: 10, h: 10 }, layout: { slot: 'inner' } }),
      ],
    });

    const placements = computeLayoutPlacements([outer]);
    applyLayoutPlacements([outer], placements);

    const inner = outer.children[0];
    const mover = outer.children[1];

    // inner isn't itself laid out by anything (outer isn't a layout
    // container) — its authored transform is untouched.
    expect(inner.transform).toEqual({ x: 50, y: 20 });
    // inner auto-sized to its single 40x20 leaf.
    expect(inner.rect).toEqual({ w: 50, h: 20 });

    // mover's world position = outer.transform + inner.transform + inner's
    // local placement for mover (20,-5) = (370,115); converted into
    // mover's actual parent (outer)'s local frame: (70, 15).
    expect(mover.transform?.x).toBe(70);
    expect(mover.transform?.y).toBe(15);
  });
});

describe('applyLayoutPlacements skip set (3d)', () => {
  it('skips a placement whose id is in the animated set even when it is not a slot member', () => {
    // Before 3d, only slot members were ever skipped — an ordinary flex
    // sibling reflowing because a mover joined/left couldn't be handed off
    // to animation tracks, so render-time layout fought them every frame.
    const tree = [createNode({
      id: 'row',
      layout: { type: 'flex', direction: 'row', gap: 0 },
      rect: { w: 200, h: 50 },
      children: [createNode({ id: 'sibling', rect: { w: 50, h: 50 }, transform: { x: 999, y: 999 } })],
    })];

    const placements = computeLayoutPlacements(tree);
    applyLayoutPlacements(tree, placements, new Set(['sibling']));

    const sibling = tree[0].children[0];
    expect(sibling.transform?.x).toBe(999);
    expect(sibling.transform?.y).toBe(999);
  });

  it('still applies a placement whose id is not in the animated set', () => {
    const tree = [createNode({
      id: 'row',
      layout: { type: 'flex', direction: 'row', gap: 0 },
      rect: { w: 200, h: 50 },
      children: [createNode({ id: 'sibling', rect: { w: 50, h: 50 }, transform: { x: 999, y: 999 } })],
    })];

    const placements = computeLayoutPlacements(tree);
    applyLayoutPlacements(tree, placements, new Set(['other']));

    const sibling = tree[0].children[0];
    expect(sibling.transform?.x).not.toBe(999);
  });
});
