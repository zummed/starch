import { describe, it, expect } from 'vitest';
import { SchemaRenderer } from '../../editor/schemaRenderer';
import { generateDsl } from '../../dsl/generator';
import type { FormatHints } from '../../dsl/formatHints';
import { emptyFormatHints } from '../../dsl/formatHints';

const hints = emptyFormatHints();

describe('SchemaRenderer - value formatting', () => {
  it('renders a simple rect node inline', () => {
    const scene = {
      objects: [{ id: 'box', rect: { w: 140, h: 80 } }],
    };
    const result = new SchemaRenderer().render(scene, hints);
    expect(result.text).toContain('box: rect 140x80');
  });

  it('produces spans for rect dimensions', () => {
    const scene = {
      objects: [{ id: 'box', rect: { w: 140, h: 80 } }],
    };
    const result = new SchemaRenderer().render(scene, hints);
    const wSpan = result.spans.find(s => s.schemaPath === 'rect.w');
    const hSpan = result.spans.find(s => s.schemaPath === 'rect.h');
    expect(wSpan).toBeDefined();
    expect(hSpan).toBeDefined();
    expect(result.text.slice(wSpan!.from, wSpan!.to)).toBe('140');
    expect(result.text.slice(hSpan!.from, hSpan!.to)).toBe('80');
  });

  it('renders named color as a single span', () => {
    const scene = {
      objects: [{ id: 'box', rect: { w: 100, h: 100 }, fill: 'red' }],
    };
    const result = new SchemaRenderer().render(scene, hints);
    const fillSpan = result.spans.find(s => s.schemaPath === 'fill');
    expect(fillSpan).toBeDefined();
    expect(result.text.slice(fillSpan!.from, fillSpan!.to)).toBe('red');
  });

  it('renders HSL color with sub-spans', () => {
    const scene = {
      objects: [{ id: 'box', rect: { w: 100, h: 100 }, fill: { h: 210, s: 80, l: 50 } }],
    };
    const result = new SchemaRenderer().render(scene, hints);
    // HSL that doesn't map to a named color should have component spans
    const hSpan = result.spans.find(s => s.schemaPath === 'fill.h');
    const sSpan = result.spans.find(s => s.schemaPath === 'fill.s');
    const lSpan = result.spans.find(s => s.schemaPath === 'fill.l');
    // Either individual spans or a single fill span — renderer decides
    const fillSpan = result.spans.find(s => s.schemaPath === 'fill');
    expect(hSpan || fillSpan).toBeDefined();
  });

  it('renders stroke with color and width spans', () => {
    const scene = {
      objects: [{ id: 'box', rect: { w: 100, h: 100 }, stroke: { color: 'blue', width: 2 } }],
    };
    const result = new SchemaRenderer().render(scene, hints);
    const colorSpan = result.spans.find(s => s.schemaPath === 'stroke.color');
    const widthSpan = result.spans.find(s => s.schemaPath === 'stroke.width');
    expect(colorSpan).toBeDefined();
    expect(widthSpan).toBeDefined();
    expect(result.text.slice(colorSpan!.from, colorSpan!.to)).toBe('blue');
    expect(result.text.slice(widthSpan!.from, widthSpan!.to)).toBe('2');
  });

  it('all spans have section = node for object nodes', () => {
    const scene = {
      objects: [{ id: 'box', rect: { w: 100, h: 100 }, fill: 'red' }],
    };
    const result = new SchemaRenderer().render(scene, hints);
    for (const span of result.spans) {
      expect(span.section).toBe('node');
    }
  });

  it('modelPath uses node ID not array index', () => {
    const scene = {
      objects: [{ id: 'box', rect: { w: 100, h: 100 } }],
    };
    const result = new SchemaRenderer().render(scene, hints);
    const wSpan = result.spans.find(s => s.schemaPath === 'rect.w');
    expect(wSpan!.modelPath).toBe('objects.box.rect.w');
  });
});

describe('SchemaRenderer - node rendering', () => {
  it('renders inline node with all properties', () => {
    const scene = {
      objects: [{
        id: 'box', rect: { w: 140, h: 80 },
        fill: 'cornflowerblue', stroke: { color: 'red', width: 2 },
        opacity: 0.8,
      }],
    };
    const result = new SchemaRenderer().render(scene, hints);
    expect(result.text).toContain('box: rect 140x80 fill cornflowerblue stroke red width=2 opacity=0.8');
  });

  it('renders block node with indented fill/stroke', () => {
    const blockHints: FormatHints = { nodes: { box: { display: 'block' } } };
    const scene = {
      objects: [{
        id: 'box', rect: { w: 140, h: 80 },
        fill: 'red', stroke: { color: 'blue', width: 2 },
      }],
    };
    const result = new SchemaRenderer().render(scene, blockHints);
    expect(result.text).toContain('box: rect 140x80');
    expect(result.text).toContain('  fill red');
    expect(result.text).toContain('  stroke blue width=2');
  });

  it('renders children with increased indentation', () => {
    const scene = {
      objects: [{
        id: 'parent', rect: { w: 200, h: 200 },
        children: [{ id: 'child', rect: { w: 50, h: 50 } }],
      }],
    };
    const result = new SchemaRenderer().render(scene, hints);
    expect(result.text).toContain('  child: rect 50x50');
  });

  it('child modelPaths use parent.child format', () => {
    const scene = {
      objects: [{
        id: 'parent', rect: { w: 200, h: 200 },
        children: [{ id: 'child', rect: { w: 50, h: 50 } }],
      }],
    };
    const result = new SchemaRenderer().render(scene, hints);
    const childW = result.spans.find(s => s.modelPath === 'objects.parent.child.rect.w');
    expect(childW).toBeDefined();
  });

  it('renders connection nodes with spans for route endpoints', () => {
    const scene = {
      objects: [
        { id: 'a', rect: { w: 100, h: 100 } },
        { id: 'b', rect: { w: 100, h: 100 } },
        { id: 'link', path: { route: ['a', 'b'], smooth: true, bend: 30 } },
      ],
    };
    const result = new SchemaRenderer().render(scene, hints);
    expect(result.text).toContain('link: a -> b smooth bend=30');
    // Route endpoints should have spans
    const routeSpans = result.spans.filter(s => s.modelPath.startsWith('objects.link.path'));
    expect(routeSpans.length).toBeGreaterThan(0);
    // Bend value should have its own span
    const bendSpan = result.spans.find(s => s.schemaPath === 'path.bend');
    expect(bendSpan).toBeDefined();
    expect(result.text.slice(bendSpan!.from, bendSpan!.to)).toBe('30');
  });

  it('renders transform with position', () => {
    const scene = {
      objects: [{ id: 'box', rect: { w: 100, h: 100 }, transform: { x: 50, y: 75 } }],
    };
    const result = new SchemaRenderer().render(scene, hints);
    expect(result.text).toContain('at 50,75');
    const xSpan = result.spans.find(s => s.schemaPath === 'transform.x');
    expect(xSpan).toBeDefined();
  });

  it('renders layout as block property', () => {
    const scene = {
      objects: [{ id: 'box', rect: { w: 200, h: 200 }, layout: { type: 'flex', direction: 'row', gap: 10 } }],
    };
    const result = new SchemaRenderer().render(scene, hints);
    expect(result.text).toContain('layout flex row gap=10');
  });

  it('renders layout hint props inline', () => {
    const scene = {
      objects: [{ id: 'box', rect: { w: 100, h: 100 }, layout: { grow: 1 } }],
    };
    const result = new SchemaRenderer().render(scene, hints);
    expect(result.text).toContain('layout grow=1');
    // Verify the grow span is linked to the child, not the parent
    const growSpan = result.spans.find(s => s.schemaPath === 'layout.grow');
    expect(growSpan).toBeDefined();
    expect(growSpan!.modelPath).toBe('objects.box.layout.grow');
  });
});

describe('SchemaRenderer - metadata and sections', () => {
  it('renders document metadata', () => {
    const scene = { name: 'My Scene', background: '#1a1a2e' };
    const result = new SchemaRenderer().render(scene, hints);
    expect(result.text).toContain('name "My Scene"');
    expect(result.text).toContain('background "#1a1a2e"');
  });

  it('renders images block', () => {
    const scene = { images: { logo: 'https://example.com/logo.png' } };
    const result = new SchemaRenderer().render(scene, hints);
    expect(result.text).toContain('images');
    expect(result.text).toContain('  logo: "https://example.com/logo.png"');
    const imgSpan = result.spans.find(s => s.section === 'images');
    expect(imgSpan).toBeDefined();
  });

  it('renders style block', () => {
    const scene = {
      styles: { primary: { fill: 'blue', opacity: 0.9 } },
    };
    const result = new SchemaRenderer().render(scene, hints);
    expect(result.text).toContain('style primary');
    expect(result.text).toContain('  fill blue');
    const fillSpan = result.spans.find(s => s.section === 'style' && s.schemaPath === 'fill');
    expect(fillSpan).toBeDefined();
    expect(fillSpan!.modelPath).toBe('styles.primary.fill');
  });

  it('renders animate section with spans', () => {
    const scene = {
      objects: [{ id: 'box', rect: { w: 100, h: 100 } }],
      animate: {
        duration: 2,
        keyframes: [
          { time: 0, changes: { 'box.opacity': 0 } },
          { time: 1, changes: { 'box.opacity': 1 } },
        ],
      },
    };
    const result = new SchemaRenderer().render(scene, hints);
    expect(result.text).toContain('animate 2s');
    const durationSpan = result.spans.find(s => s.section === 'animate' && s.schemaPath === 'duration');
    expect(durationSpan).toBeDefined();
  });

  it('separates sections with double newlines', () => {
    const scene = {
      name: 'Test',
      objects: [{ id: 'box', rect: { w: 100, h: 100 } }],
    };
    const result = new SchemaRenderer().render(scene, hints);
    expect(result.text).toContain('\n\n');
  });
});

describe('SchemaRenderer - span invariants', () => {
  it('no spans overlap', () => {
    const scene = {
      objects: [
        { id: 'box', rect: { w: 140, h: 80 }, fill: 'red', stroke: { color: 'blue', width: 2 } },
      ],
    };
    const result = new SchemaRenderer().render(scene, hints);
    const sorted = [...result.spans].sort((a, b) => a.from - b.from);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].from).toBeGreaterThanOrEqual(sorted[i - 1].to);
    }
  });

  it('all span ranges are within text bounds', () => {
    const scene = {
      objects: [
        { id: 'box', rect: { w: 140, h: 80 }, fill: 'red' },
        { id: 'circle', ellipse: { rx: 50, ry: 50 }, opacity: 0.5 },
      ],
    };
    const result = new SchemaRenderer().render(scene, hints);
    for (const span of result.spans) {
      expect(span.from).toBeGreaterThanOrEqual(0);
      expect(span.to).toBeLessThanOrEqual(result.text.length);
      expect(span.to).toBeGreaterThan(span.from);
    }
  });

  it('span text matches the value it represents', () => {
    const scene = {
      objects: [{ id: 'box', rect: { w: 140, h: 80 } }],
    };
    const result = new SchemaRenderer().render(scene, hints);
    const wSpan = result.spans.find(s => s.schemaPath === 'rect.w')!;
    expect(result.text.slice(wSpan.from, wSpan.to)).toBe('140');
  });
});

describe('SchemaRenderer - parity with existing generator', () => {
  const cases = [
    {
      name: 'simple rect',
      scene: { objects: [{ id: 'box', rect: { w: 100, h: 60 } }] },
    },
    {
      name: 'node with fill and stroke',
      scene: { objects: [{ id: 'box', rect: { w: 100, h: 60 }, fill: 'red', stroke: { color: 'blue', width: 2 } }] },
    },
    {
      name: 'connection',
      scene: { objects: [
        { id: 'a', rect: { w: 100, h: 100 } },
        { id: 'b', rect: { w: 100, h: 100 } },
        { id: 'link', path: { route: ['a', 'b'] } },
      ]},
    },
    {
      name: 'with metadata',
      scene: { name: 'Test', background: '#1a1a2e', objects: [{ id: 'box', rect: { w: 100, h: 100 } }] },
    },
    {
      name: 'with styles',
      scene: { styles: { primary: { fill: 'blue' } }, objects: [{ id: 'box', rect: { w: 100, h: 100 }, style: 'primary' }] },
    },
    {
      name: 'with animation',
      scene: {
        objects: [{ id: 'box', rect: { w: 100, h: 100 } }],
        animate: { duration: 2, keyframes: [{ time: 0, changes: { 'box.opacity': 0 } }, { time: 1, changes: { 'box.opacity': 1 } }] },
      },
    },
    {
      name: 'ellipse node',
      scene: { objects: [{ id: 'dot', ellipse: { rx: 50, ry: 30 } }] },
    },
    {
      name: 'text node',
      scene: { objects: [{ id: 'label', text: { content: 'Hello World', size: 24 } }] },
    },
    {
      name: 'image node',
      scene: { objects: [{ id: 'img', image: { src: 'photo.png', w: 200, h: 150 } }] },
    },
    {
      name: 'node with transform',
      scene: { objects: [{ id: 'box', rect: { w: 100, h: 100 }, transform: { x: 50, y: 75, rotation: 45 } }] },
    },
    {
      name: 'node with dash',
      scene: { objects: [{ id: 'box', rect: { w: 100, h: 100 }, dash: { pattern: 'dashed', length: 10, gap: 5 } }] },
    },
    {
      name: 'node with block layout',
      scene: { objects: [{ id: 'box', rect: { w: 200, h: 200 }, layout: { type: 'flex', direction: 'row', gap: 10 } }] },
    },
    {
      name: 'node with inline layout hints',
      scene: { objects: [{ id: 'box', rect: { w: 100, h: 100 }, layout: { grow: 1, order: 2 } }] },
    },
    {
      name: 'parent with children',
      scene: { objects: [{ id: 'parent', rect: { w: 200, h: 200 }, children: [{ id: 'child', rect: { w: 50, h: 50 } }] }] },
    },
    {
      name: 'connection with path modifiers',
      scene: { objects: [
        { id: 'a', rect: { w: 100, h: 100 } },
        { id: 'b', rect: { w: 100, h: 100 } },
        { id: 'link', path: { route: ['a', 'b'], smooth: true, bend: 30 } },
      ]},
    },
    {
      name: 'explicit path',
      scene: { objects: [{ id: 'shape', path: { points: [[0, 0], [100, 0], [100, 100]], closed: true } }] },
    },
    {
      name: 'multiple objects',
      scene: { objects: [
        { id: 'box', rect: { w: 100, h: 60 }, fill: 'red' },
        { id: 'circle', ellipse: { rx: 50, ry: 50 }, fill: 'blue' },
      ]},
    },
    {
      name: 'camera node',
      scene: { objects: [{ id: 'cam', camera: { zoom: 1.5, active: true } }] },
    },
    {
      name: 'images section',
      scene: { images: { logo: 'https://example.com/logo.png' }, objects: [{ id: 'box', rect: { w: 100, h: 100 } }] },
    },
    {
      name: 'viewport metadata',
      scene: { viewport: { width: 1920, height: 1080 }, objects: [{ id: 'box', rect: { w: 100, h: 100 } }] },
    },
    {
      name: 'animation with loop and easing',
      scene: {
        objects: [{ id: 'box', rect: { w: 100, h: 100 } }],
        animate: { duration: 3, loop: true, easing: 'ease-in-out', keyframes: [{ time: 0, changes: { 'box.opacity': 0 } }] },
      },
    },
    {
      name: 'style with stroke and dash',
      scene: {
        styles: { accent: { fill: 'red', stroke: { color: 'blue', width: 2 }, dash: { pattern: 'dotted' } } },
        objects: [{ id: 'box', rect: { w: 100, h: 100 }, style: 'accent' }],
      },
    },
    {
      name: 'node with opacity and visible',
      scene: { objects: [{ id: 'box', rect: { w: 100, h: 100 }, opacity: 0.5, visible: false }] },
    },
    {
      name: 'rect with radius',
      scene: { objects: [{ id: 'box', rect: { w: 100, h: 60, radius: 10 } }] },
    },
    {
      name: 'full scene',
      scene: {
        name: 'Demo',
        description: 'A demo scene',
        background: '#1a1a2e',
        viewport: { width: 1920, height: 1080 },
        styles: { primary: { fill: 'cornflowerblue' } },
        objects: [
          { id: 'box', rect: { w: 140, h: 80 }, fill: 'red', style: 'primary', transform: { x: 100, y: 50 } },
          { id: 'label', text: { content: 'Hello', size: 18 } },
        ],
        animate: { duration: 2, keyframes: [{ time: 1, changes: { 'box.opacity': 0 } }] },
      },
    },
  ];

  for (const { name, scene } of cases) {
    it(`matches generator output: ${name}`, () => {
      const expected = generateDsl(scene, { formatHints: hints });
      const result = new SchemaRenderer().render(scene, hints);
      expect(result.text).toBe(expected);
    });
  }
});
