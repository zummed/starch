import { describe, it, expect } from 'vitest';
import { validateTree } from '../../tree/validate';
import { createNode } from '../../types/node';

describe('validateTree', () => {
  it('accepts a valid tree', () => {
    const tree = [createNode({
      id: 'a',
      rect: { w: 100, h: 60 },
      children: [createNode({ id: 'b', text: { content: 'hi', size: 14 } })],
    })];
    expect(() => validateTree(tree)).not.toThrow();
  });

  it('rejects duplicate IDs', () => {
    const tree = [
      createNode({ id: 'a' }),
      createNode({ id: 'a' }),
    ];
    expect(() => validateTree(tree)).toThrow(/duplicate.*id/i);
  });

  it('rejects duplicate IDs across nesting levels', () => {
    const tree = [createNode({
      id: 'a',
      children: [createNode({ id: 'a' })],
    })];
    expect(() => validateTree(tree)).toThrow(/duplicate.*id/i);
  });

  it('rejects node with multiple geometry fields', () => {
    const tree = [createNode({
      id: 'bad',
      rect: { w: 10, h: 10 },
      ellipse: { rx: 5, ry: 5 },
    } as any)];
    expect(() => validateTree(tree)).toThrow(/geometry/i);
  });

  it('rejects style/node ID collision', () => {
    const styles = { primary: { fill: { h: 0, s: 100, l: 50 } } };
    const tree = [createNode({ id: 'primary' })];
    expect(() => validateTree(tree, styles)).toThrow(/collision/i);
  });
});
