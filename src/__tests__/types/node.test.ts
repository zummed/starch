import { describe, it, expect } from 'vitest';
import { createNode } from '../../types/node';

describe('Node', () => {
  it('creates a minimal node with just an id', () => {
    const node = createNode({ id: 'n1' });
    expect(node.id).toBe('n1');
    expect(node.children).toEqual([]);
    expect(node.visible).toBe(true);
  });

  it('creates a node with rect geometry', () => {
    const node = createNode({
      id: 'r1',
      rect: { w: 100, h: 60, radius: 4 },
    });
    expect(node.rect).toEqual({ w: 100, h: 60, radius: 4 });
    expect(node.ellipse).toBeUndefined();
  });

  it('creates a node with children', () => {
    const node = createNode({
      id: 'parent',
      children: [
        createNode({ id: 'child1' }),
        createNode({ id: 'child2' }),
      ],
    });
    expect(node.children).toHaveLength(2);
    expect(node.children[0].id).toBe('child1');
  });

  it('creates a node with all geometry types', () => {
    expect(createNode({ id: 'a', rect: { w: 10, h: 10 } }).rect).toBeDefined();
    expect(createNode({ id: 'b', ellipse: { rx: 5, ry: 5 } }).ellipse).toBeDefined();
    expect(createNode({ id: 'c', text: { content: 'hi', size: 14 } }).text).toBeDefined();
    expect(createNode({ id: 'd', path: { points: [[0,0],[1,1]], closed: false } }).path).toBeDefined();
    expect(createNode({ id: 'e', image: { src: 'test.png', w: 50, h: 50 } }).image).toBeDefined();
  });

  it('tracks _ownKeys for explicitly set properties', () => {
    const node = createNode({ id: 'n', opacity: 0.5, fill: { h: 0, s: 100, l: 50 } });
    expect(node._ownKeys!.has('opacity')).toBe(true);
    expect(node._ownKeys!.has('fill')).toBe(true);
    expect(node._ownKeys!.has('visible')).toBe(false); // not explicitly set
  });
});
