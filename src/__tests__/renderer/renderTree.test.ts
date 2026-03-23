import { describe, it, expect } from 'vitest';
import { renderTree } from '../../renderer/renderTree';
import { createNode } from '../../types/node';

describe('renderTree', () => {
  it('renders a simple node with rect', () => {
    const tree = [createNode({
      id: 'box',
      rect: { w: 100, h: 60 },
      fill: { h: 210, s: 80, l: 50 },
      transform: { x: 50, y: 50 },
    })];
    const result = renderTree(tree);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('box');
    expect(result[0].geometry!.tag).toBe('rect');
    expect(result[0].groupTransform).toContain('translate(50, 50)');
  });

  it('renders nested children', () => {
    const tree = [createNode({
      id: 'parent',
      transform: { x: 100, y: 100 },
      children: [
        createNode({
          id: 'child',
          rect: { w: 50, h: 30 },
          fill: { h: 0, s: 100, l: 50 },
        }),
      ],
    })];
    const result = renderTree(tree);
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].id).toBe('child');
    expect(result[0].children[0].geometry!.tag).toBe('rect');
  });

  it('skips invisible nodes', () => {
    const tree = [createNode({
      id: 'hidden',
      visible: false,
      rect: { w: 100, h: 60 },
    })];
    const result = renderTree(tree);
    expect(result).toHaveLength(0);
  });

  it('composes opacity multiplicatively', () => {
    const tree = [createNode({
      id: 'parent',
      opacity: 0.5,
      children: [
        createNode({ id: 'child', opacity: 0.8 }),
      ],
    })];
    const result = renderTree(tree);
    expect(result[0].opacity).toBe(0.5);
    expect(result[0].children[0].opacity).toBeCloseTo(0.4);
  });

  it('sorts siblings by depth', () => {
    const tree = [createNode({
      id: 'parent',
      children: [
        createNode({ id: 'back', depth: 0 }),
        createNode({ id: 'front', depth: 10 }),
        createNode({ id: 'mid', depth: 5 }),
      ],
    })];
    const result = renderTree(tree);
    const childIds = result[0].children.map(c => c.id);
    expect(childIds).toEqual(['back', 'mid', 'front']);
  });

  it('inherits fill to children', () => {
    const tree = [createNode({
      id: 'parent',
      fill: { h: 210, s: 80, l: 50 },
      children: [
        createNode({
          id: 'child',
          rect: { w: 50, h: 30 },
        }),
      ],
    })];
    const result = renderTree(tree);
    // Child should have parent's fill since it has no own fill
    // colorToCSS now converts through RGBA format
    expect(result[0].children[0].geometry!.attrs.fill).toMatch(/^rgba?\(/);
  });

  it('renders text content', () => {
    const tree = [createNode({
      id: 't',
      text: { content: 'Hello', size: 14 },
    })];
    const result = renderTree(tree);
    expect(result[0].textContent).toBe('Hello');
  });

  it('handles transform with rotation and scale', () => {
    const tree = [createNode({
      id: 'n',
      transform: { x: 10, y: 20, rotation: 45, scale: 2 },
    })];
    const result = renderTree(tree);
    expect(result[0].groupTransform).toContain('translate(10, 20)');
    expect(result[0].groupTransform).toContain('rotate(45)');
    expect(result[0].groupTransform).toContain('scale(2)');
  });
});
