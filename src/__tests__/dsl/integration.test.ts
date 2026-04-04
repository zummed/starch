import { describe, it, expect } from 'vitest';
import { parseScene } from '../../parser/parser';

describe('parseScene DSL integration', () => {
  it('parses DSL input', () => {
    const dslInput = `box1: rect 100x60`;
    const scene = parseScene(dslInput);
    expect(scene.nodes).toHaveLength(1);
    expect(scene.nodes[0].id).toBe('box1');
  });

  it('DSL input with styles, connections, and animation produces valid ParsedScene', () => {
    const dslInput = `
name "Integration Test"

style primary
  fill 210 70 45

box1: rect 200x120 @primary at 100,100

box2: rect 200x120 at 400,100

conn: box1 -> box2

animate 4s
  0 box1.transform.x: 100
  2 box1.transform.x: 300
`;
    const scene = parseScene(dslInput);

    expect(scene.name).toBe('Integration Test');

    // Style node present
    const styleNode = scene.nodes.find(n => n.id === 'primary');
    expect(styleNode).toBeDefined();
    expect(styleNode!._isStyle).toBe(true);

    // Object nodes present
    const box1 = scene.nodes.find(n => n.id === 'box1');
    const box2 = scene.nodes.find(n => n.id === 'box2');
    const conn = scene.nodes.find(n => n.id === 'conn');
    expect(box1).toBeDefined();
    expect(box2).toBeDefined();
    expect(conn).toBeDefined();

    // Connection has a path with route
    expect(conn!.path).toBeDefined();
    expect(conn!.path!.route).toBeDefined();

    // Animate config present
    expect(scene.animate).toBeDefined();
    expect(scene.animate!.duration).toBe(4);
    expect(scene.animate!.keyframes).toHaveLength(2);

    // Track paths generated
    expect(scene.trackPaths).toContain('box1.rect.w');
    // fill is now an atomic Color leaf (not recursed into sub-fields)
    expect(scene.trackPaths).toContain('primary.fill');
  });

  it('empty DSL input does not crash', () => {
    expect(() => parseScene('')).not.toThrow();
    const scene = parseScene('');
    expect(scene.nodes).toHaveLength(0);
    expect(scene.trackPaths).toHaveLength(0);
  });

  it('whitespace-only DSL input does not crash', () => {
    expect(() => parseScene('   \n  \t  ')).not.toThrow();
    const scene = parseScene('   \n  \t  ');
    expect(scene.nodes).toHaveLength(0);
  });
});
