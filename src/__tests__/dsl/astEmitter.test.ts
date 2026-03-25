import { describe, it, expect } from 'vitest';
import { buildAstFromModel } from '../../dsl/astEmitter';
import { emptyFormatHints } from '../../dsl/formatHints';
import { flattenLeaves } from '../../dsl/astTypes';
import type { FormatHints } from '../../dsl/formatHints';

const hints = emptyFormatHints();

// ─── Basic Rendering ─────────────────────────────────────────────

describe('astEmitter - basic rendering', () => {
  it('renders a simple rect node', () => {
    const scene = { objects: [{ id: 'box', rect: { w: 140, h: 80 } }] };
    const { text } = buildAstFromModel(scene, hints);
    expect(text).toContain('box: rect 140x80');
  });

  it('produces AST with correct tree structure', () => {
    const scene = { objects: [{ id: 'box', rect: { w: 140, h: 80 } }] };
    const { ast } = buildAstFromModel(scene, hints);
    expect(ast.dslRole).toBe('document');
    expect(ast.children.length).toBeGreaterThan(0);
    // Find the section
    const section = ast.children[0];
    expect(section.dslRole).toBe('section');
    // Find the node line
    const nodeLine = section.children[0];
    expect(nodeLine.dslRole).toBe('compound');
    expect(nodeLine.modelPath).toBe('objects.box');
  });

  it('AST leaf nodes have correct text positions', () => {
    const scene = { objects: [{ id: 'box', rect: { w: 140, h: 80 } }] };
    const { text, ast } = buildAstFromModel(scene, hints);
    const leaves = flattenLeaves(ast);
    const wLeaf = leaves.find(n => n.schemaPath === 'rect.w');
    expect(wLeaf).toBeDefined();
    expect(text.slice(wLeaf!.from, wLeaf!.to)).toBe('140');
  });

  it('renders fill with keyword and value nodes', () => {
    const scene = { objects: [{ id: 'box', rect: { w: 100, h: 100 }, fill: 'red' }] };
    const { text, ast } = buildAstFromModel(scene, hints);
    expect(text).toContain('fill red');
    const leaves = flattenLeaves(ast);
    const fillKw = leaves.find(n => n.dslRole === 'keyword' && n.value === 'fill');
    const fillVal = leaves.find(n => n.schemaPath === 'fill' && n.dslRole === 'value');
    expect(fillKw).toBeDefined();
    expect(fillVal).toBeDefined();
  });

  it('renders stroke with color and width', () => {
    const scene = { objects: [{ id: 'box', rect: { w: 100, h: 100 }, stroke: { color: 'blue', width: 2 } }] };
    const { text } = buildAstFromModel(scene, hints);
    expect(text).toContain('stroke blue width=2');
  });

  it('renders transform with at keyword', () => {
    const scene = { objects: [{ id: 'box', rect: { w: 100, h: 100 }, transform: { x: 50, y: 75 } }] };
    const { text } = buildAstFromModel(scene, hints);
    expect(text).toContain('at 50,75');
  });

  it('renders transform fallback to kwargs when only x present', () => {
    const scene = { objects: [{ id: 'box', rect: { w: 100, h: 100 }, transform: { x: 50 } }] };
    const { text } = buildAstFromModel(scene, hints);
    expect(text).toContain('at x=50');
  });

  it('renders transform fallback to kwargs when only y present', () => {
    const scene = { objects: [{ id: 'title', text: { content: 'Hi' }, transform: { y: -20 } }] };
    const { text } = buildAstFromModel(scene, hints);
    expect(text).toContain('at y=-20');
  });

  it('model paths use node IDs not array indices', () => {
    const scene = { objects: [{ id: 'box', rect: { w: 100, h: 100 } }] };
    const { ast } = buildAstFromModel(scene, hints);
    const leaves = flattenLeaves(ast);
    const wNode = leaves.find(n => n.schemaPath === 'rect.w');
    expect(wNode!.modelPath).toBe('objects.box.rect.w');
  });

  it('renders an empty node with just id', () => {
    const scene = { objects: [{ id: 'empty' }] };
    const { text } = buildAstFromModel(scene, hints);
    expect(text).toContain('empty:');
  });
});

// ─── Document Metadata ───────────────────────────────────────────

describe('astEmitter - metadata', () => {
  it('renders name', () => {
    const { text } = buildAstFromModel({ name: 'My Diagram', objects: [] }, hints);
    expect(text).toContain('name "My Diagram"');
  });

  it('renders description', () => {
    const { text } = buildAstFromModel({ description: 'A test', objects: [] }, hints);
    expect(text).toContain('description "A test"');
  });

  it('renders background', () => {
    const { text } = buildAstFromModel({ background: '#1a1a2e', objects: [] }, hints);
    expect(text).toContain('background "#1a1a2e"');
  });

  it('renders viewport', () => {
    const { text } = buildAstFromModel({ viewport: { width: 600, height: 400 }, objects: [] }, hints);
    expect(text).toContain('viewport 600x400');
  });

  it('renders all metadata together', () => {
    const { text } = buildAstFromModel({
      name: 'My Diagram',
      description: 'A test',
      background: '#1a1a2e',
      viewport: { width: 600, height: 400 },
      objects: [],
    }, hints);
    expect(text).toContain('name "My Diagram"');
    expect(text).toContain('description "A test"');
    expect(text).toContain('background "#1a1a2e"');
    expect(text).toContain('viewport 600x400');
  });
});

// ─── Images ──────────────────────────────────────────────────────

describe('astEmitter - images', () => {
  it('renders images block', () => {
    const { text } = buildAstFromModel({
      objects: [],
      images: {
        photo: 'https://example.com/photo.png',
        logo: 'logo.svg',
      },
    }, hints);
    expect(text).toContain('images');
    expect(text).toContain('  photo: "https://example.com/photo.png"');
    expect(text).toContain('  logo: "logo.svg"');
  });
});

// ─── Styles ──────────────────────────────────────────────────────

describe('astEmitter - styles', () => {
  it('renders a style block', () => {
    const { text } = buildAstFromModel({
      objects: [],
      styles: {
        primary: {
          fill: { h: 210, s: 70, l: 45 },
          stroke: { color: { h: 210, s: 80, l: 30 }, width: 2 },
        },
      },
    }, hints);
    expect(text).toContain('style primary');
    expect(text).toContain('  fill hsl 210 70 45');
    expect(text).toContain('  stroke hsl 210 80 30 width=2');
  });

  it('renders multiple styles', () => {
    const { text } = buildAstFromModel({
      objects: [],
      styles: {
        primary: { fill: { h: 210, s: 70, l: 45 } },
        danger: { fill: { h: 0, s: 80, l: 50 } },
      },
    }, hints);
    expect(text).toContain('style primary');
    expect(text).toContain('style danger');
  });
});

// ─── Geometry Types ──────────────────────────────────────────────

describe('astEmitter - geometry types', () => {
  it('renders rect with dimensions', () => {
    const { text } = buildAstFromModel({
      objects: [{ id: 'box', rect: { w: 160, h: 100 } }],
    }, hints);
    expect(text).toContain('box: rect 160x100');
  });

  it('renders rect with radius', () => {
    const { text } = buildAstFromModel({
      objects: [{ id: 'box', rect: { w: 160, h: 100, radius: 8 } }],
    }, hints);
    expect(text).toContain('box: rect 160x100 radius=8');
  });

  it('renders ellipse', () => {
    const { text } = buildAstFromModel({
      objects: [{ id: 'dot', ellipse: { rx: 4, ry: 4 } }],
    }, hints);
    expect(text).toContain('dot: ellipse 8x8');
  });

  it('renders text with content and properties', () => {
    const { text } = buildAstFromModel({
      objects: [{ id: 'title', text: { content: 'Hello', size: 14, bold: true } }],
    }, hints);
    expect(text).toContain('title: text "Hello" size=14 bold');
  });

  it('renders image with src and dimensions', () => {
    const { text } = buildAstFromModel({
      objects: [{ id: 'pic', image: { src: 'photo.png', w: 200, h: 150 } }],
    }, hints);
    expect(text).toContain('pic: image "photo.png" 200x150');
  });

  it('renders image with fit', () => {
    const { text } = buildAstFromModel({
      objects: [{ id: 'pic', image: { src: 'photo.png', w: 200, h: 150, fit: 'cover' } }],
    }, hints);
    expect(text).toContain('pic: image "photo.png" 200x150 fit=cover');
  });

  it('renders camera', () => {
    const { text } = buildAstFromModel({
      objects: [{ id: 'cam', camera: { look: 'all', zoom: 1.5, active: true } }],
    }, hints);
    expect(text).toContain('cam: camera look=all zoom=1.5 active');
  });
});

// ─── Properties ──────────────────────────────────────────────────

describe('astEmitter - properties', () => {
  it('renders fill with HSL', () => {
    const { text } = buildAstFromModel({
      objects: [{ id: 'box', rect: { w: 10, h: 10 }, fill: { h: 210, s: 70, l: 45 } }],
    }, hints);
    expect(text).toContain('fill hsl 210 70 45');
  });

  it('renders fill with named color', () => {
    const { text } = buildAstFromModel({
      objects: [{ id: 'box', rect: { w: 10, h: 10 }, fill: { h: 0, s: 0, l: 100 } }],
    }, hints);
    expect(text).toContain('fill white');
  });

  it('renders fill with alpha', () => {
    const { text } = buildAstFromModel({
      objects: [{ id: 'box', rect: { w: 10, h: 10 }, fill: { h: 210, s: 70, l: 45, a: 0.5 } }],
    }, hints);
    expect(text).toContain('fill hsl 210 70 45 a=0.5');
  });

  it('renders fill with RGB', () => {
    const { text } = buildAstFromModel({
      objects: [{ id: 'box', rect: { w: 10, h: 10 }, fill: { r: 255, g: 128, b: 0 } }],
    }, hints);
    expect(text).toContain('fill rgb 255 128 0');
  });

  it('renders fill with named RGB color', () => {
    const { text } = buildAstFromModel({
      objects: [{ id: 'box', rect: { w: 10, h: 10 }, fill: { r: 255, g: 0, b: 0 } }],
    }, hints);
    expect(text).toContain('fill red');
  });

  it('renders fill with named-alpha', () => {
    const { text } = buildAstFromModel({
      objects: [{ id: 'box', rect: { w: 10, h: 10 }, fill: { name: 'cornflowerblue', a: 0.5 } }],
    }, hints);
    expect(text).toContain('fill cornflowerblue a=0.5');
  });

  it('renders fill with hex-alpha', () => {
    const { text } = buildAstFromModel({
      objects: [{ id: 'box', rect: { w: 10, h: 10 }, fill: { hex: '#ff0000', a: 0.7 } }],
    }, hints);
    expect(text).toContain('fill #ff0000 a=0.7');
  });

  it('renders stroke with width', () => {
    const { text } = buildAstFromModel({
      objects: [{ id: 'box', rect: { w: 10, h: 10 }, stroke: { color: { h: 210, s: 80, l: 30 }, width: 2 } }],
    }, hints);
    expect(text).toContain('stroke hsl 210 80 30 width=2');
  });

  it('renders stroke with alpha and width', () => {
    const { text } = buildAstFromModel({
      objects: [{ id: 'box', rect: { w: 10, h: 10 }, stroke: { color: { h: 0, s: 0, l: 60, a: 0.5 }, width: 3 } }],
    }, hints);
    expect(text).toContain('stroke hsl 0 0 60 a=0.5 width=3');
  });

  it('renders at position', () => {
    const { text } = buildAstFromModel({
      objects: [{ id: 'box', rect: { w: 10, h: 10 }, transform: { x: 200, y: 150 } }],
    }, hints);
    expect(text).toContain('at 200,150');
  });

  it('renders at with rotation', () => {
    const { text } = buildAstFromModel({
      objects: [{ id: 'box', rect: { w: 10, h: 10 }, transform: { x: 200, y: 150, rotation: 45 } }],
    }, hints);
    expect(text).toContain('at 200,150 rotation=45');
  });

  it('renders style reference', () => {
    const { text } = buildAstFromModel({
      objects: [{ id: 'box', rect: { w: 10, h: 10 }, style: 'primary' }],
    }, hints);
    expect(text).toContain('@primary');
  });

  it('renders dash as block property', () => {
    const { text } = buildAstFromModel({
      objects: [{ id: 'box', rect: { w: 10, h: 10 }, dash: { pattern: 'dashed' } }],
    }, hints);
    expect(text).toContain('dash dashed');
  });

  it('renders dash with length and gap', () => {
    const { text } = buildAstFromModel({
      objects: [{ id: 'box', rect: { w: 10, h: 10 }, dash: { pattern: 'dashed', length: 10, gap: 5 } }],
    }, hints);
    expect(text).toContain('dash dashed length=10 gap=5');
  });

  it('renders opacity', () => {
    const { text } = buildAstFromModel({
      objects: [{ id: 'box', rect: { w: 10, h: 10 }, opacity: 0.5 }],
    }, hints);
    expect(text).toContain('opacity=0.5');
  });

  it('renders visible=false', () => {
    const { text } = buildAstFromModel({
      objects: [{ id: 'box', rect: { w: 10, h: 10 }, visible: false }],
    }, hints);
    expect(text).toContain('visible=false');
  });

  it('renders depth', () => {
    const { text } = buildAstFromModel({
      objects: [{ id: 'box', rect: { w: 10, h: 10 }, depth: 3 }],
    }, hints);
    expect(text).toContain('depth=3');
  });

  it('renders slot under layout', () => {
    const { text } = buildAstFromModel({
      objects: [{ id: 'box', rect: { w: 10, h: 10 }, layout: { slot: 'container' } }],
    }, hints);
    expect(text).toContain('layout slot=container');
  });

  it('renders layout', () => {
    const { text } = buildAstFromModel({
      objects: [{ id: 'box', rect: { w: 10, h: 10 }, layout: { type: 'flex', direction: 'row', gap: 10 } }],
    }, hints);
    expect(text).toContain('layout flex row gap=10');
  });

  it('renders transform with anchor', () => {
    const { text } = buildAstFromModel({
      objects: [{ id: 'box', rect: { w: 10, h: 10 }, transform: { x: 100, y: 200, anchor: 'N' } }],
    }, hints);
    expect(text).toContain('at 100,200 anchor=N');
  });

  it('renders transform with only extras (no x/y)', () => {
    const { text } = buildAstFromModel({
      objects: [{ id: 'box', rect: { w: 10, h: 10 }, transform: { rotation: 45 } }],
    }, hints);
    expect(text).toContain('rotation=45');
    // Should not contain 'at' since no x/y
    expect(text).not.toContain('at ');
  });
});

// ─── Children ────────────────────────────────────────────────────

describe('astEmitter - children', () => {
  it('renders children indented', () => {
    const { text } = buildAstFromModel({
      objects: [{
        id: 'card',
        rect: { w: 160, h: 100 },
        transform: { x: 200, y: 150 },
        children: [
          { id: 'title', text: { content: 'Hello', size: 14 } },
          { id: 'badge', ellipse: { rx: 4, ry: 4 } },
        ],
      }],
    }, hints);
    expect(text).toContain('card: rect 160x100');
    expect(text).toContain('  title: text "Hello" size=14');
    expect(text).toContain('  badge: ellipse 8x8');
  });

  it('renders nested children', () => {
    const { text } = buildAstFromModel({
      objects: [{
        id: 'outer',
        rect: { w: 200, h: 200 },
        children: [{
          id: 'inner',
          rect: { w: 100, h: 100 },
          children: [{ id: 'deep', ellipse: { rx: 5, ry: 5 } }],
        }],
      }],
    }, hints);
    expect(text).toContain('outer: rect 200x200');
    expect(text).toContain('  inner: rect 100x100');
    expect(text).toContain('    deep: ellipse 10x10');
  });
});

// ─── Connections ─────────────────────────────────────────────────

describe('astEmitter - connections', () => {
  it('renders simple connection', () => {
    const { text } = buildAstFromModel({
      objects: [{ id: 'link', path: { route: ['a', 'b'] } }],
    }, hints);
    expect(text).toContain('link: a -> b');
  });

  it('renders connection with waypoints', () => {
    const { text } = buildAstFromModel({
      objects: [{
        id: 'link',
        path: { route: ['a', [250, 100], 'b'], smooth: true, radius: 15 },
      }],
    }, hints);
    expect(text).toContain('link: a -> (250,100) -> b smooth radius=15');
  });

  it('renders connection with stroke', () => {
    const { text } = buildAstFromModel({
      objects: [{
        id: 'link',
        path: { route: ['a', 'b'] },
        stroke: { color: { h: 0, s: 0, l: 60 }, width: 2 },
      }],
    }, hints);
    expect(text).toContain('link: a -> b stroke hsl 0 0 60 width=2');
  });

  it('renders connection with all path modifiers', () => {
    const { text } = buildAstFromModel({
      objects: [{
        id: 'link',
        path: {
          route: ['a', 'b'],
          smooth: true,
          closed: true,
          bend: 0.5,
          radius: 10,
          gap: 5,
          fromGap: 3,
          toGap: 4,
          drawProgress: 0.7,
        },
      }],
    }, hints);
    expect(text).toContain('smooth');
    expect(text).toContain('closed');
    expect(text).toContain('bend=0.5');
    expect(text).toContain('radius=10');
    expect(text).toContain('gap=5');
    expect(text).toContain('fromGap=3');
    expect(text).toContain('toGap=4');
    expect(text).toContain('drawProgress=0.7');
  });
});

// ─── Explicit Paths ──────────────────────────────────────────────

describe('astEmitter - explicit paths', () => {
  it('renders explicit path with points', () => {
    const { text } = buildAstFromModel({
      objects: [{
        id: 'tri',
        path: { points: [[0, -40], [40, 30], [-40, 30]], closed: true },
        fill: { h: 280, s: 60, l: 45 },
      }],
    }, hints);
    expect(text).toContain('tri: path (0,-40) (40,30) (-40,30) closed');
    expect(text).toContain('fill hsl 280 60 45');
  });
});

// ─── Inline vs Block Rendering ───────────────────────────────────

describe('astEmitter - inline vs block rendering', () => {
  it('renders inline when props <= 6', () => {
    const { text } = buildAstFromModel({
      objects: [{ id: 'box', rect: { w: 10, h: 10 }, fill: { h: 0, s: 0, l: 100 } }],
    }, hints);
    const lines = text.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('box: rect 10x10 fill white');
  });

  it('renders block when props > 6', () => {
    const { text } = buildAstFromModel({
      objects: [{
        id: 'box',
        rect: { w: 160, h: 100 },
        fill: { h: 210, s: 70, l: 45 },
        stroke: { color: 'black' },
        opacity: 0.8,
        depth: 5,
        visible: false,
        transform: { x: 10, y: 20 },
      }],
    }, hints);
    const lines = text.trim().split('\n');
    expect(lines.length).toBeGreaterThan(1);
  });

  it('forces inline with nodeFormats option', () => {
    const { text } = buildAstFromModel({
      objects: [{
        id: 'box',
        rect: { w: 160, h: 100 },
        fill: { h: 210, s: 70, l: 45 },
        stroke: { color: 'black' },
        opacity: 0.8,
        depth: 5,
      }],
    }, hints, { box: 'inline' });
    const nodeLines = text.trim().split('\n').filter((l: string) => l.startsWith('box:'));
    expect(nodeLines).toHaveLength(1);
  });

  it('forces block with nodeFormats option', () => {
    const { text } = buildAstFromModel({
      objects: [{ id: 'box', rect: { w: 10, h: 10 }, fill: { h: 0, s: 0, l: 100 } }],
    }, hints, { box: 'block' });
    const lines = text.trim().split('\n');
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0]).toContain('box: rect 10x10');
    expect(lines[1]).toContain('  fill white');
  });

  it('uses formatHints display property', () => {
    const blockHints: FormatHints = { nodes: { dot: { display: 'block' } } };
    const { text } = buildAstFromModel({
      objects: [{ id: 'dot', ellipse: { rx: 5, ry: 5 }, fill: { h: 0, s: 80, l: 50 } }],
    }, blockHints);
    expect(text).toContain('\n  fill');
  });
});

// ─── Animation ───────────────────────────────────────────────────

describe('astEmitter - animation', () => {
  it('renders animate header', () => {
    const { text } = buildAstFromModel({
      objects: [],
      animate: { duration: 3, keyframes: [] },
    }, hints);
    expect(text).toContain('animate 3s');
  });

  it('renders animate with loop', () => {
    const { text } = buildAstFromModel({
      objects: [],
      animate: { duration: 3, loop: true, keyframes: [] },
    }, hints);
    expect(text).toContain('animate 3s loop');
  });

  it('renders animate with easing', () => {
    const { text } = buildAstFromModel({
      objects: [],
      animate: { duration: 3, easing: 'easeInOut', keyframes: [] },
    }, hints);
    expect(text).toContain('animate 3s easing=easeInOut');
  });

  it('renders animate with autoKey', () => {
    const { text } = buildAstFromModel({
      objects: [],
      animate: { duration: 3, autoKey: true, keyframes: [] },
    }, hints);
    expect(text).toContain('animate 3s autoKey');
  });

  it('renders chapters', () => {
    const { text } = buildAstFromModel({
      objects: [],
      animate: {
        duration: 5,
        keyframes: [],
        chapters: [
          { name: 'Intro', time: 0 },
          { name: 'Middle', time: 2.5 },
        ],
      },
    }, hints);
    expect(text).toContain('chapter "Intro" at 0');
    expect(text).toContain('chapter "Middle" at 2.5');
  });

  it('renders flat keyframes', () => {
    const { text } = buildAstFromModel({
      objects: [],
      animate: {
        duration: 3,
        keyframes: [
          { time: 0, changes: { 'box.fill.h': 120 } },
          { time: 1.5, changes: { 'box.fill.h': 0 } },
        ],
      },
    }, hints);
    expect(text).toContain('0  box.fill.h: 120');
    expect(text).toContain('1.5  box.fill.h: 0');
  });

  it('renders keyframe with per-change easing', () => {
    const { text } = buildAstFromModel({
      objects: [],
      animate: {
        duration: 3,
        keyframes: [
          { time: 1.5, changes: { 'box.fill.h': { value: 0, easing: 'bounce' } } },
        ],
      },
    }, hints);
    expect(text).toContain('1.5  box.fill.h: 0 easing=bounce');
  });

  it('renders effect (string value)', () => {
    const { text } = buildAstFromModel({
      objects: [],
      animate: {
        duration: 3,
        keyframes: [
          { time: 1.5, changes: { card: 'pulse' } },
        ],
      },
    }, hints);
    expect(text).toContain('1.5  card pulse');
  });

  it('renders effect with params', () => {
    const { text } = buildAstFromModel({
      objects: [],
      animate: {
        duration: 3,
        keyframes: [
          { time: 1.5, changes: { card: { effect: 'flash', amplitude: 2 } } },
        ],
      },
    }, hints);
    expect(text).toContain('1.5  card flash amplitude=2');
  });

  it('renders multi-change keyframes with continuation', () => {
    const { text } = buildAstFromModel({
      objects: [],
      animate: {
        duration: 3,
        keyframes: [
          {
            time: 0,
            changes: {
              'cam.camera.look': 'all',
              'cam.camera.zoom': 1,
            },
          },
        ],
      },
    }, hints);
    expect(text).toContain('0  cam.camera.look: all');
    expect(text).toContain('    cam.camera.zoom: 1');
  });

  it('renders relative time with +', () => {
    const { text } = buildAstFromModel({
      objects: [],
      animate: {
        duration: 3,
        keyframes: [
          { time: 0, plus: 2, changes: { 'box.fill.h': 120 } },
        ],
      },
    }, hints);
    expect(text).toContain('+2  box.fill.h: 120');
  });

  it('renders boolean keyframe values', () => {
    const { text } = buildAstFromModel({
      objects: [],
      animate: {
        duration: 3,
        keyframes: [
          { time: 0, changes: { 'box.visible': true } },
          { time: 1, changes: { 'box.visible': false } },
        ],
      },
    }, hints);
    expect(text).toContain('0  box.visible: true');
    expect(text).toContain('1  box.visible: false');
  });

  it('renders array/tuple keyframe values', () => {
    const { text } = buildAstFromModel({
      objects: [],
      animate: {
        duration: 3,
        keyframes: [
          { time: 0, changes: { 'box.transform.anchor': [0.5, -0.5] } },
        ],
      },
    }, hints);
    expect(text).toContain('0  box.transform.anchor: (0.5,-0.5)');
  });

  it('renders color keyframe values', () => {
    const { text } = buildAstFromModel({
      objects: [],
      animate: {
        duration: 3,
        keyframes: [
          { time: 0, changes: { 'box.fill': 'blue' } },
          { time: 2, changes: { 'box.fill': { h: 210, s: 70, l: 45 } } },
        ],
      },
    }, hints);
    expect(text).toContain('0  box.fill: blue');
    expect(text).toContain('2  box.fill: hsl 210 70 45');
  });
});

// ─── Complete Scene ──────────────────────────────────────────────

describe('astEmitter - complete scene', () => {
  it('renders a complete scene with all sections', () => {
    const { text } = buildAstFromModel({
      name: 'Test',
      viewport: { width: 800, height: 600 },
      background: '#000',
      styles: {
        primary: { fill: { h: 210, s: 70, l: 45 } },
      },
      objects: [
        {
          id: 'box',
          rect: { w: 160, h: 100 },
          style: 'primary',
          transform: { x: 200, y: 150 },
          children: [
            { id: 'label', text: { content: 'Hi', size: 12 } },
          ],
        },
      ],
    }, hints);
    expect(text).toContain('name "Test"');
    expect(text).toContain('viewport 800x600');
    expect(text).toContain('background "#000"');
    expect(text).toContain('style primary');
    expect(text).toContain('box: rect 160x100');
    expect(text).toContain('label: text "Hi" size=12');
  });
});

// ─── AST Tree Integrity ─────────────────────────────────────────

describe('astEmitter - AST integrity', () => {
  it('all leaf positions map to correct text', () => {
    const scene = {
      objects: [
        { id: 'box', rect: { w: 100, h: 80 }, fill: 'red', stroke: { color: 'blue', width: 2 } },
        { id: 'dot', ellipse: { rx: 5, ry: 5 } },
      ],
    };
    const { text, ast } = buildAstFromModel(scene, hints);
    const leaves = flattenLeaves(ast);
    for (const leaf of leaves) {
      const extracted = text.slice(leaf.from, leaf.to);
      expect(extracted.length).toBeGreaterThan(0);
      // No leaf should span a newline
      expect(extracted).not.toContain('\n');
    }
  });

  it('parent references are consistent', () => {
    const scene = { objects: [{ id: 'box', rect: { w: 100, h: 80 } }] };
    const { ast } = buildAstFromModel(scene, hints);
    function checkParents(node: typeof ast) {
      for (const child of node.children) {
        expect(child.parent).toBe(node);
        checkParents(child);
      }
    }
    checkParents(ast);
  });

  it('document node spans entire text', () => {
    const scene = {
      name: 'Test',
      objects: [{ id: 'box', rect: { w: 100, h: 80 } }],
    };
    const { text, ast } = buildAstFromModel(scene, hints);
    expect(ast.from).toBe(0);
    expect(ast.to).toBe(text.length);
  });
});

