import { describe, it, expect } from 'vitest';
import { parseScene } from '../../parser/parser';

describe('parseScene', () => {
  it('parses a minimal scene with a rect node', () => {
    const input = `b1: rect 100x60`;
    const scene = parseScene(input);
    expect(scene.nodes).toHaveLength(1);
    expect(scene.nodes[0].id).toBe('b1');
    expect(scene.nodes[0].rect!.w).toBe(100);
  });

  it('creates style nodes as first-class nodes in the tree', () => {
    const input = `\
style primary
  fill hsl 210 70 45

n1: rect 100x60 @primary`;
    const scene = parseScene(input);
    // Style becomes a real node
    const styleNode = scene.nodes.find(n => n.id === 'primary');
    expect(styleNode).toBeDefined();
    expect(styleNode!._isStyle).toBe(true);
    expect(styleNode!.fill).toEqual({ h: 210, s: 70, l: 45 });
    // Object node references the style but doesn't have fill baked in
    const objNode = scene.nodes.find(n => n.id === 'n1');
    expect(objNode).toBeDefined();
    expect(objNode!.style).toBe('primary');
    // Style generates track paths for animation (fill is now an atomic Color leaf)
    expect(scene.trackPaths).toContain('primary.fill');
  });

  it('generates track paths', () => {
    const input = `n1: rect 100x60 fill hsl 0 100 50 at 50,50`;
    const scene = parseScene(input);
    expect(scene.trackPaths).toContain('n1.fill');
    expect(scene.trackPaths).toContain('n1.transform.x');
    expect(scene.trackPaths).toContain('n1.rect.w');
  });

  it('validates and throws on duplicate IDs', () => {
    const input = `\
a: rect 10x10
a: rect 10x10`;
    expect(() => parseScene(input)).toThrow(/duplicate/i);
  });

  it('parses animate config', () => {
    const input = `\
objects
  n1: rect 100x60

animate 4s
  0 n1.rect.w: 100
  2 n1.rect.w: 200`;
    const scene = parseScene(input);
    expect(scene.animate).toBeDefined();
    expect(scene.animate!.duration).toBe(4);
    expect(scene.animate!.keyframes).toHaveLength(2);
  });

  it('handles nested children', () => {
    const input = `\
objects
  parent: at 100,100
    child: rect 50x30 fill hsl 0 100 50`;
    const scene = parseScene(input);
    const parent = scene.nodes.find(n => n.id === 'parent')!;
    expect(parent.children).toHaveLength(1);
    expect(parent.children[0].id).toBe('child');
    expect(scene.trackPaths).toContain('parent.child.fill');
  });

  it('applies HSL fill directly', () => {
    const input = `n1: rect 50x50 fill hsl 0 100 50`;
    const scene = parseScene(input);
    expect(scene.nodes[0].fill).toEqual({ h: 0, s: 100, l: 50 });
  });

  it('extracts background', () => {
    const input = `background #1a1a2e`;
    const scene = parseScene(input);
    expect(scene.background).toBe('#1a1a2e');
  });

  it('extracts name and description', () => {
    const input = `\
name "My Diagram"
description "A test diagram"

n1: rect 10x10`;
    const scene = parseScene(input);
    expect(scene.name).toBe('My Diagram');
    expect(scene.description).toBe('A test diagram');
  });

  it('returns undefined name and description when absent', () => {
    const input = `n1: rect 10x10`;
    const scene = parseScene(input);
    expect(scene.name).toBeUndefined();
    expect(scene.description).toBeUndefined();
  });

  it('parses use declaration into search path', () => {
    const input = `use [core, state]\nb1: rect 10x10`;
    const scene = parseScene(input);
    expect(scene.use).toEqual(['core', 'state']);
  });

  it('defaults use to [core] when absent', () => {
    const input = `b1: rect 10x10`;
    const scene = parseScene(input);
    expect(scene.use).toEqual(['core']);
  });
});
