import { describe, it, expect } from 'vitest';
import { parseScene } from '../../parser/parser';

describe('parseScene', () => {
  it('parses a minimal scene with a rect node', () => {
    const input = `{
      objects: [
        { id: "b1", rect: { w: 100, h: 60 } }
      ]
    }`;
    const scene = parseScene(input);
    expect(scene.nodes).toHaveLength(1);
    expect(scene.nodes[0].id).toBe('b1');
    expect(scene.nodes[0].rect!.w).toBe(100);
  });

  it('creates style nodes as first-class nodes in the tree', () => {
    const input = `{
      styles: {
        primary: { fill: { h: 210, s: 70, l: 45 } }
      },
      objects: [
        { id: "n1", style: "primary", rect: { w: 100, h: 60 } }
      ]
    }`;
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
    const input = `{
      objects: [
        { id: "n1", rect: { w: 100, h: 60 }, fill: { h: 0, s: 100, l: 50 }, transform: { x: 50, y: 50 } }
      ]
    }`;
    const scene = parseScene(input);
    expect(scene.trackPaths).toContain('n1.fill');
    expect(scene.trackPaths).toContain('n1.transform.x');
    expect(scene.trackPaths).toContain('n1.rect.w');
  });

  it('validates and throws on duplicate IDs', () => {
    const input = `{
      objects: [
        { id: "a", rect: { w: 10, h: 10 } },
        { id: "a", rect: { w: 10, h: 10 } }
      ]
    }`;
    expect(() => parseScene(input)).toThrow(/duplicate/i);
  });

  it('parses animate config', () => {
    const input = `{
      objects: [{ id: "n1", rect: { w: 100, h: 60 } }],
      animate: {
        duration: 4,
        keyframes: [
          { time: 0, changes: { "n1.rect.w": 100 } },
          { time: 2, changes: { "n1.rect.w": 200 } }
        ]
      }
    }`;
    const scene = parseScene(input);
    expect(scene.animate).toBeDefined();
    expect(scene.animate!.duration).toBe(4);
    expect(scene.animate!.keyframes).toHaveLength(2);
  });

  it('handles nested children', () => {
    const input = `{
      objects: [
        {
          id: "parent",
          transform: { x: 100, y: 100 },
          children: [
            { id: "child", rect: { w: 50, h: 30 }, fill: { h: 0, s: 100, l: 50 } }
          ]
        }
      ]
    }`;
    const scene = parseScene(input);
    const parent = scene.nodes.find(n => n.id === 'parent')!;
    expect(parent.children).toHaveLength(1);
    expect(parent.children[0].id).toBe('child');
    expect(scene.trackPaths).toContain('parent.child.fill');
  });

  it('applies HSL fill directly', () => {
    const input = `{
      objects: [
        { id: "n1", rect: { w: 50, h: 50 }, fill: { h: 0, s: 100, l: 50 } }
      ]
    }`;
    const scene = parseScene(input);
    expect(scene.nodes[0].fill).toEqual({ h: 0, s: 100, l: 50 });
  });

  it('extracts background', () => {
    const input = `{ background: "#1a1a2e", objects: [] }`;
    const scene = parseScene(input);
    expect(scene.background).toBe('#1a1a2e');
  });

  it('extracts name and description', () => {
    const input = `{
      name: "My Diagram",
      description: "A test diagram",
      objects: [{ id: "n1", rect: { w: 10, h: 10 } }]
    }`;
    const scene = parseScene(input);
    expect(scene.name).toBe('My Diagram');
    expect(scene.description).toBe('A test diagram');
  });

  it('returns undefined name and description when absent', () => {
    const input = `{ objects: [{ id: "n1", rect: { w: 10, h: 10 } }] }`;
    const scene = parseScene(input);
    expect(scene.name).toBeUndefined();
    expect(scene.description).toBeUndefined();
  });
});
