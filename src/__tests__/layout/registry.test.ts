import { describe, it, expect } from 'vitest';
import { registerStrategy, getStrategy, runLayout } from '../../layout/registry';
import { createNode } from '../../types/node';

describe('layout registry', () => {
  it('registers and retrieves a strategy', () => {
    registerStrategy('test', () => []);
    expect(getStrategy('test')).toBeDefined();
  });

  it('returns undefined for unknown strategy', () => {
    expect(getStrategy('nonexistent')).toBeUndefined();
  });

  it('runLayout applies placements to children transforms', () => {
    registerStrategy('mock', (_node, children) => {
      return children.map((c, i) => ({ id: c.id, x: i * 100, y: i * 50 }));
    });

    const tree = [createNode({
      id: 'container',
      layout: { type: 'mock' },
      children: [
        createNode({ id: 'a', rect: { w: 50, h: 30 } }),
        createNode({ id: 'b', rect: { w: 50, h: 30 } }),
      ],
    })];

    runLayout(tree);
    expect(tree[0].children[0].transform?.x).toBe(0);
    expect(tree[0].children[0].transform?.y).toBe(0);
    expect(tree[0].children[1].transform?.x).toBe(100);
    expect(tree[0].children[1].transform?.y).toBe(50);
  });
});
