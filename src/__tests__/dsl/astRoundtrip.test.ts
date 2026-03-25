import { describe, it, expect } from 'vitest';
import { buildAstFromModel } from '../../dsl/astEmitter';
import { buildAstFromText } from '../../dsl/astParser';
import { emptyFormatHints } from '../../dsl/formatHints';
import type { FormatHints } from '../../dsl/formatHints';

// ─── Helpers ─────────────────────────────────────────────────────

const hints = emptyFormatHints();

/**
 * Parse → Render round-trip: text → model → text, compare trimmed.
 */
function parseRenderTrip(input: string): string {
  const { model, formatHints } = buildAstFromText(input);
  const { text } = buildAstFromModel(model, formatHints);
  return text;
}

/**
 * Render → Parse → Render: model → text → model → text, compare exactly.
 */
function renderParseRenderTrip(scene: any, formatHints?: FormatHints, nodeFormats?: Record<string, 'inline' | 'block'>): { text1: string; text2: string } {
  const fh = formatHints ?? hints;
  const { text: text1 } = buildAstFromModel(scene, fh, nodeFormats);
  const { model, formatHints: parsedHints } = buildAstFromText(text1);
  const { text: text2 } = buildAstFromModel(model, parsedHints);
  return { text1, text2 };
}

// ─── Parse → Render Round-Trips ──────────────────────────────────

describe('AST round-trip: parse → render', () => {
  it('round-trips a simple rect node', () => {
    const input = 'box: rect 140x80\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips rect with fill and position', () => {
    const input = 'box: rect 140x80 fill red at 200,150\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips rect with fill stroke and position', () => {
    const input = 'box: rect 140x80 fill red stroke blue width=2 at 50,75\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips ellipse', () => {
    const input = 'dot: ellipse 10x10\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips text with size and bold', () => {
    const input = 'title: text "Hello" size=14 bold\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips image with fit', () => {
    const input = 'pic: image "photo.png" 200x150 fit=cover\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips camera', () => {
    const input = 'cam: camera look=all zoom=1.5 active\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips style reference', () => {
    const input = 'box: rect 100x100 @primary\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips opacity', () => {
    const input = 'box: rect 100x100 opacity=0.5\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips visible=false', () => {
    const input = 'box: rect 100x100 visible=false\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips depth', () => {
    const input = 'box: rect 100x100 depth=3\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips empty node', () => {
    const input = 'empty:\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips block mode', () => {
    const input = 'box: rect 140x80\n  fill red\n  stroke blue width=2\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips simple connection', () => {
    const input = 'link: a -> b\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips connection with smooth and radius', () => {
    const input = 'link: a -> (250,100) -> b smooth radius=15\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips connection with stroke', () => {
    const input = 'link: a -> b stroke hsl 0 0 60 width=2\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips explicit path', () => {
    const input = 'tri: path (0,-40) (40,30) (-40,30) closed fill hsl 280 60 45\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips children', () => {
    const input = 'card: rect 160x100 at 200,150\n  title: text "Hello" size=14\n  badge: ellipse 8x8\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips nested children', () => {
    const input = 'outer: rect 200x200\n  inner: rect 100x100\n    deep: ellipse 10x10\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips dash', () => {
    const input = 'box: rect 100x100\n  dash dashed length=10 gap=5\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips layout inline hint', () => {
    const input = 'box: rect 100x100 layout slot=container\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips HSL fill', () => {
    const input = 'box: rect 100x100 fill hsl 210 70 45\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips HSL fill with alpha', () => {
    const input = 'box: rect 100x100 fill hsl 210 70 45 a=0.5\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips RGB fill', () => {
    const input = 'box: rect 100x100 fill rgb 255 128 0\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips named-alpha fill', () => {
    const input = 'box: rect 100x100 fill cornflowerblue a=0.5\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips hex-alpha fill', () => {
    const input = 'box: rect 100x100 fill #ff0000 a=0.7\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips named fill (white)', () => {
    const input = 'box: rect 100x100 fill white\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips transform with only y', () => {
    const input = 'title: text "Hi" at y=-20\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips transform with only x', () => {
    const input = 'box: rect 100x100 at x=50\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips transform extras only (rotation)', () => {
    const input = 'box: rect 100x100 rotation=45\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips transform with anchor', () => {
    const input = 'box: rect 100x100 at 100,200 anchor=N\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });
});

// ─── Parse → Render: Metadata ────────────────────────────────────

describe('AST round-trip: parse → render metadata', () => {
  it('round-trips name', () => {
    const input = 'name "My Diagram"\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips all metadata', () => {
    const input = 'name "My Diagram"\ndescription "A test"\nbackground "#1a1a2e"\nviewport 600x400\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });
});

// ─── Parse → Render: Images ──────────────────────────────────────

describe('AST round-trip: parse → render images', () => {
  it('round-trips images block', () => {
    const input = 'images\n  photo: "https://example.com/photo.png"\n  logo: "logo.svg"\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });
});

// ─── Parse → Render: Styles ──────────────────────────────────────

describe('AST round-trip: parse → render styles', () => {
  it('round-trips a style with fill', () => {
    const input = 'style primary\n  fill hsl 210 70 45\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips a style with fill and stroke', () => {
    const input = 'style primary\n  fill hsl 210 70 45\n  stroke hsl 210 80 30 width=2\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });
});

// ─── Parse → Render: Animation ───────────────────────────────────

describe('AST round-trip: parse → render animation', () => {
  it('round-trips animate header', () => {
    const input = 'animate 3s\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips animate with loop', () => {
    const input = 'animate 3s loop\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips animate with easing', () => {
    const input = 'animate 3s easing=easeInOut\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips chapters', () => {
    const input = 'animate 5s\n  chapter "Intro" at 0\n  chapter "Middle" at 2.5\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips flat keyframes', () => {
    const input = 'animate 3s\n  0  box.fill.h: 120\n  1.5  box.fill.h: 0\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips effect', () => {
    const input = 'animate 3s\n  1.5  card pulse\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips effect with params', () => {
    const input = 'animate 3s\n  1.5  card flash amplitude=2\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips per-change easing', () => {
    const input = 'animate 3s\n  1.5  box.fill.h: 0 easing=bounce\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips relative time', () => {
    const input = 'animate 3s\n  +2  box.fill.h: 120\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips multi-change continuation', () => {
    const input = 'animate 3s\n  0  cam.camera.look: all\n    cam.camera.zoom: 1\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips boolean values', () => {
    const input = 'animate 3s\n  0  box.visible: true\n  1  box.visible: false\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips tuple values', () => {
    const input = 'animate 3s\n  0  box.transform.anchor: (0.5,-0.5)\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips color keyframe values', () => {
    const input = 'animate 3s\n  0  box.fill: blue\n  2  box.fill: hsl 210 70 45\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });
});

// ─── Parse → Render: Complete ────────────────────────────────────

describe('AST round-trip: parse → render complete scene', () => {
  it('round-trips objects + animation', () => {
    const input = 'box: rect 100x100\n\nanimate 2s\n  0  box.opacity: 0\n  1  box.opacity: 1\n';
    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });

  it('round-trips a complete scene', () => {
    // Note: emitter always outputs metadata in fixed order: name, description, background, viewport
    const input = [
      'name "Full Scene"',
      'background "#000"',
      'viewport 800x600',
      '',
      'style primary',
      '  fill hsl 210 70 45',
      '  stroke hsl 210 80 30 width=2',
      '',
      'box: rect 160x100 @primary at 200,150',
      '  label: text "Hi" size=12',
      'dot: ellipse 10x10 fill white',
      'link: box -> dot',
      '',
      'animate 3s loop',
      '  chapter "Start" at 0',
      '  chapter "End" at 3',
      '  0  box.fill.h: 210',
      '  1.5  box.fill.h: 0',
      '  3  box.fill.h: 210',
    ].join('\n') + '\n';

    expect(parseRenderTrip(input).trim()).toBe(input.trim());
  });
});

// ─── Render → Parse → Render Round-Trips ─────────────────────────

describe('AST round-trip: render → parse → render', () => {
  const scenes: Array<{ name: string; scene: any; nodeFormats?: Record<string, 'inline' | 'block'> }> = [
    // Basic geometry
    { name: 'simple rect', scene: { objects: [{ id: 'box', rect: { w: 100, h: 60 } }] } },
    { name: 'rect with radius', scene: { objects: [{ id: 'box', rect: { w: 160, h: 100, radius: 8 } }] } },
    { name: 'ellipse', scene: { objects: [{ id: 'dot', ellipse: { rx: 4, ry: 4 } }] } },
    { name: 'text node', scene: { objects: [{ id: 'title', text: { content: 'Hello', size: 14, bold: true } }] } },
    { name: 'text with mono', scene: { objects: [{ id: 'code', text: { content: 'const x = 1', mono: true } }] } },
    { name: 'image', scene: { objects: [{ id: 'pic', image: { src: 'photo.png', w: 200, h: 150 } }] } },
    { name: 'image with fit', scene: { objects: [{ id: 'pic', image: { src: 'photo.png', w: 200, h: 150, fit: 'cover' } }] } },
    { name: 'camera', scene: { objects: [{ id: 'cam', camera: { look: 'all', zoom: 1.5, active: true } }] } },
    { name: 'camera zoom only', scene: { objects: [{ id: 'cam', camera: { zoom: 2 } }] } },

    // Properties
    { name: 'fill string', scene: { objects: [{ id: 'box', rect: { w: 100, h: 60 }, fill: 'red' }] } },
    { name: 'fill HSL', scene: { objects: [{ id: 'box', rect: { w: 100, h: 60 }, fill: { h: 210, s: 70, l: 45 } }] } },
    { name: 'fill HSL named', scene: { objects: [{ id: 'box', rect: { w: 100, h: 60 }, fill: { h: 0, s: 0, l: 100 } }] } },
    { name: 'fill HSL alpha', scene: { objects: [{ id: 'box', rect: { w: 100, h: 60 }, fill: { h: 210, s: 70, l: 45, a: 0.5 } }] } },
    { name: 'fill RGB', scene: { objects: [{ id: 'box', rect: { w: 100, h: 60 }, fill: { r: 255, g: 128, b: 0 } }] } },
    { name: 'fill RGB named', scene: { objects: [{ id: 'box', rect: { w: 100, h: 60 }, fill: { r: 255, g: 0, b: 0 } }] } },
    { name: 'fill RGB alpha', scene: { objects: [{ id: 'box', rect: { w: 100, h: 60 }, fill: { r: 255, g: 128, b: 0, a: 0.3 } }] } },
    { name: 'fill named-alpha', scene: { objects: [{ id: 'box', rect: { w: 100, h: 60 }, fill: { name: 'cornflowerblue', a: 0.5 } }] } },
    { name: 'fill hex-alpha', scene: { objects: [{ id: 'box', rect: { w: 100, h: 60 }, fill: { hex: '#ff0000', a: 0.7 } }] } },
    { name: 'stroke simple', scene: { objects: [{ id: 'box', rect: { w: 100, h: 60 }, stroke: { color: 'blue', width: 2 } }] } },
    { name: 'stroke HSL with alpha and width', scene: { objects: [{ id: 'box', rect: { w: 100, h: 60 }, stroke: { color: { h: 0, s: 0, l: 60, a: 0.5 }, width: 3 } }] } },
    { name: 'transform full', scene: { objects: [{ id: 'box', rect: { w: 100, h: 60 }, transform: { x: 200, y: 150, rotation: 45, scale: 2 } }] } },
    { name: 'transform partial x', scene: { objects: [{ id: 'box', rect: { w: 100, h: 60 }, transform: { x: 50 } }] } },
    { name: 'transform partial y', scene: { objects: [{ id: 'box', rect: { w: 100, h: 60 }, transform: { y: -20 } }] } },
    { name: 'transform extras only', scene: { objects: [{ id: 'box', rect: { w: 100, h: 60 }, transform: { rotation: 45 } }] } },
    { name: 'transform with anchor', scene: { objects: [{ id: 'box', rect: { w: 100, h: 60 }, transform: { x: 100, y: 200, anchor: 'N' } }] } },
    { name: 'opacity', scene: { objects: [{ id: 'box', rect: { w: 10, h: 10 }, opacity: 0.5 }] } },
    { name: 'visible false', scene: { objects: [{ id: 'box', rect: { w: 10, h: 10 }, visible: false }] } },
    { name: 'depth', scene: { objects: [{ id: 'box', rect: { w: 10, h: 10 }, depth: 3 }] } },
    { name: 'style ref', scene: { objects: [{ id: 'box', rect: { w: 10, h: 10 }, style: 'primary' }] } },
    { name: 'dash simple', scene: { objects: [{ id: 'box', rect: { w: 10, h: 10 }, dash: { pattern: 'dashed' } }] } },
    { name: 'dash with args', scene: { objects: [{ id: 'box', rect: { w: 10, h: 10 }, dash: { pattern: 'dashed', length: 10, gap: 5 } }] } },
    { name: 'layout inline hint', scene: { objects: [{ id: 'box', rect: { w: 10, h: 10 }, layout: { slot: 'container' } }] } },

    // Children
    { name: 'children', scene: { objects: [{ id: 'card', rect: { w: 160, h: 100 }, children: [{ id: 'title', text: { content: 'Hello', size: 14 } }] }] } },
    { name: 'nested children', scene: { objects: [{ id: 'outer', rect: { w: 200, h: 200 }, children: [{ id: 'inner', rect: { w: 100, h: 100 }, children: [{ id: 'deep', ellipse: { rx: 5, ry: 5 } }] }] }] } },

    // Connections
    { name: 'connection', scene: { objects: [{ id: 'link', path: { route: ['a', 'b'] } }] } },
    { name: 'connection with waypoints', scene: { objects: [{ id: 'link', path: { route: ['a', [250, 100], 'b'], smooth: true, radius: 15 } }] } },
    { name: 'connection with stroke', scene: { objects: [{ id: 'link', path: { route: ['a', 'b'] }, stroke: { color: { h: 0, s: 0, l: 60 }, width: 2 } }] } },

    // Explicit paths
    { name: 'explicit path', scene: { objects: [{ id: 'tri', path: { points: [[0, -40], [40, 30], [-40, 30]], closed: true }, fill: { h: 280, s: 60, l: 45 } }] } },

    // Metadata
    { name: 'metadata', scene: { name: 'Test', background: '#1a1a2e', objects: [{ id: 'box', rect: { w: 100, h: 100 } }] } },
    { name: 'metadata all', scene: { name: 'My Diagram', description: 'A test', background: '#1a1a2e', viewport: { width: 600, height: 400 }, objects: [] } },

    // Images
    { name: 'images', scene: { objects: [], images: { photo: 'https://example.com/photo.png', logo: 'logo.svg' } } },

    // Styles
    { name: 'style with fill', scene: { styles: { primary: { fill: 'blue' } }, objects: [] } },
    { name: 'style with fill and stroke', scene: { styles: { primary: { fill: { h: 210, s: 70, l: 45 }, stroke: { color: { h: 210, s: 80, l: 30 }, width: 2 } } }, objects: [] } },

    // Animation
    { name: 'animate header', scene: { objects: [], animate: { duration: 3, keyframes: [] } } },
    { name: 'animate with loop', scene: { objects: [], animate: { duration: 3, loop: true, keyframes: [] } } },
    { name: 'animate with autoKey', scene: { objects: [], animate: { duration: 3, autoKey: true, keyframes: [] } } },
    { name: 'animate with easing', scene: { objects: [], animate: { duration: 3, easing: 'easeInOut', keyframes: [] } } },
    { name: 'animate chapters', scene: { objects: [], animate: { duration: 5, keyframes: [], chapters: [{ name: 'Intro', time: 0 }, { name: 'Middle', time: 2.5 }] } } },
    { name: 'animate keyframes', scene: { objects: [], animate: { duration: 3, keyframes: [{ time: 0, changes: { 'box.fill.h': 120 } }, { time: 1.5, changes: { 'box.fill.h': 0 } }] } } },
    { name: 'animate effect', scene: { objects: [], animate: { duration: 3, keyframes: [{ time: 1.5, changes: { card: 'pulse' } }] } } },
    { name: 'animate effect with params', scene: { objects: [], animate: { duration: 3, keyframes: [{ time: 1.5, changes: { card: { effect: 'flash', amplitude: 2 } } }] } } },
    { name: 'animate per-change easing', scene: { objects: [], animate: { duration: 3, keyframes: [{ time: 1.5, changes: { 'box.fill.h': { value: 0, easing: 'bounce' } } }] } } },
    { name: 'animate multi-change', scene: { objects: [], animate: { duration: 3, keyframes: [{ time: 0, changes: { 'cam.camera.look': 'all', 'cam.camera.zoom': 1 } }] } } },
    { name: 'animate relative time', scene: { objects: [], animate: { duration: 3, keyframes: [{ time: 0, plus: 2, changes: { 'box.fill.h': 120 } }] } } },
    { name: 'animate boolean', scene: { objects: [], animate: { duration: 3, keyframes: [{ time: 0, changes: { 'box.visible': true } }, { time: 1, changes: { 'box.visible': false } }] } } },
    { name: 'animate tuple', scene: { objects: [], animate: { duration: 3, keyframes: [{ time: 0, changes: { 'box.transform.anchor': [0.5, -0.5] } }] } } },
    { name: 'animate color string', scene: { objects: [], animate: { duration: 3, keyframes: [{ time: 0, changes: { 'box.fill': 'blue' } }] } } },
    { name: 'animate color hsl', scene: { objects: [], animate: { duration: 3, keyframes: [{ time: 0, changes: { 'box.fill': { h: 210, s: 70, l: 45 } } }] } } },

    // Complete scene
    {
      name: 'complete scene',
      scene: {
        name: 'Full Scene',
        viewport: { width: 800, height: 600 },
        background: '#000',
        styles: {
          primary: { fill: { h: 210, s: 70, l: 45 }, stroke: { color: { h: 210, s: 80, l: 30 }, width: 2 } },
        },
        objects: [
          { id: 'box', rect: { w: 160, h: 100 }, style: 'primary', transform: { x: 200, y: 150 }, children: [{ id: 'label', text: { content: 'Hi', size: 12 } }] },
          { id: 'dot', ellipse: { rx: 5, ry: 5 }, fill: 'white' },
          { id: 'link', path: { route: ['box', 'dot'] } },
        ],
        animate: {
          duration: 3,
          loop: true,
          keyframes: [
            { time: 0, changes: { 'box.fill.h': 210 } },
            { time: 1.5, changes: { 'box.fill.h': 0 } },
            { time: 3, changes: { 'box.fill.h': 210 } },
          ],
          chapters: [
            { name: 'Start', time: 0 },
            { name: 'End', time: 3 },
          ],
        },
      },
    },
  ];

  for (const { name, scene, nodeFormats } of scenes) {
    it(`render → parse → render: ${name}`, () => {
      const { text1, text2 } = renderParseRenderTrip(scene, hints, nodeFormats);
      expect(text2).toBe(text1);
    });
  }
});

// ─── Model Fidelity Round-Trips (ported from roundtrip.test.ts) ──

describe('AST round-trip: model fidelity', () => {
  function modelTrip(scene: any): any {
    const { text: text1 } = buildAstFromModel(scene, hints);
    const { model } = buildAstFromText(text1);
    return model;
  }

  it('round-trips a simple rect with fill and position', () => {
    const scene = {
      objects: [
        {
          id: 'box',
          rect: { w: 160, h: 100 },
          fill: { h: 210, s: 70, l: 45 },
          transform: { x: 200, y: 150 },
        },
      ],
    };
    const result = modelTrip(scene);
    expect(result.objects).toHaveLength(1);
    const obj = result.objects[0];
    expect(obj.id).toBe('box');
    expect(obj.rect).toEqual({ w: 160, h: 100 });
    expect(obj.fill).toEqual({ h: 210, s: 70, l: 45 });
    expect(obj.transform).toEqual({ x: 200, y: 150 });
  });

  it('round-trips children hierarchy', () => {
    const scene = {
      objects: [{
        id: 'card',
        rect: { w: 200, h: 150 },
        transform: { x: 100, y: 100 },
        children: [
          { id: 'title', text: { content: 'Hello', size: 14 } },
          { id: 'badge', ellipse: { rx: 4, ry: 4 } },
        ],
      }],
    };
    const result = modelTrip(scene);
    const card = result.objects[0];
    expect(card.children).toHaveLength(2);
    expect(card.children[0].id).toBe('title');
    expect(card.children[0].text).toEqual({ content: 'Hello', size: 14 });
    expect(card.children[1].id).toBe('badge');
    expect(card.children[1].ellipse).toEqual({ rx: 4, ry: 4 });
  });

  it('round-trips nested children (3 levels)', () => {
    const scene = {
      objects: [{
        id: 'outer',
        rect: { w: 300, h: 300 },
        children: [{
          id: 'inner',
          rect: { w: 150, h: 150 },
          children: [
            { id: 'deep', ellipse: { rx: 5, ry: 5 } },
          ],
        }],
      }],
    };
    const result = modelTrip(scene);
    expect(result.objects[0].children[0].children[0].ellipse).toEqual({ rx: 5, ry: 5 });
  });

  it('round-trips connections with waypoints', () => {
    const scene = {
      objects: [
        { id: 'a', rect: { w: 50, h: 50 } },
        { id: 'b', rect: { w: 50, h: 50 } },
        {
          id: 'link',
          path: { route: ['a', [250, 100], 'b'], smooth: true, radius: 15 },
        },
      ],
    };
    const result = modelTrip(scene);
    const link = result.objects[2];
    expect(link.path.route).toEqual(['a', [250, 100], 'b']);
    expect(link.path.smooth).toBe(true);
    expect(link.path.radius).toBe(15);
  });

  it('round-trips styles', () => {
    const scene = {
      objects: [],
      styles: {
        primary: {
          fill: { h: 210, s: 70, l: 45 },
          stroke: { color: { h: 210, s: 80, l: 30 }, width: 2 },
        },
      },
    };
    const result = modelTrip(scene);
    expect(result.styles.primary).toEqual({
      fill: { h: 210, s: 70, l: 45 },
      stroke: { color: { h: 210, s: 80, l: 30 }, width: 2 },
    });
  });

  it('round-trips named colors', () => {
    const scene = { objects: [{ id: 'box', rect: { w: 10, h: 10 }, fill: 'red' }] };
    const result = modelTrip(scene);
    expect(result.objects[0].fill).toBe('red');
  });

  it('round-trips hex colors', () => {
    const scene = { objects: [{ id: 'box', rect: { w: 10, h: 10 }, fill: '#3B82F6' }] };
    const result = modelTrip(scene);
    expect(result.objects[0].fill).toBe('#3B82F6');
  });

  it('round-trips fill with alpha', () => {
    const scene = { objects: [{ id: 'box', rect: { w: 10, h: 10 }, fill: { h: 210, s: 70, l: 45, a: 0.5 } }] };
    const result = modelTrip(scene);
    expect(result.objects[0].fill).toEqual({ h: 210, s: 70, l: 45, a: 0.5 });
  });

  it('round-trips document metadata', () => {
    const scene = {
      name: 'My Diagram',
      description: 'A test',
      background: '#1a1a2e',
      viewport: { width: 600, height: 400 },
      objects: [],
    };
    const result = modelTrip(scene);
    expect(result.name).toBe('My Diagram');
    expect(result.description).toBe('A test');
    expect(result.background).toBe('#1a1a2e');
    expect(result.viewport).toEqual({ width: 600, height: 400 });
  });

  it('round-trips all geometry types', () => {
    const scene = {
      objects: [
        { id: 'r', rect: { w: 100, h: 80 } },
        { id: 'e', ellipse: { rx: 20, ry: 15 } },
        { id: 't', text: { content: 'Hello', size: 16, bold: true } },
        { id: 'i', image: { src: 'photo.png', w: 200, h: 150 } },
        { id: 'c', camera: { look: 'all', zoom: 1.5 } },
      ],
    };
    const result = modelTrip(scene);
    expect(result.objects[0].rect).toEqual({ w: 100, h: 80 });
    expect(result.objects[1].ellipse).toEqual({ rx: 20, ry: 15 });
    expect(result.objects[2].text).toEqual({ content: 'Hello', size: 16, bold: true });
    expect(result.objects[3].image).toEqual({ src: 'photo.png', w: 200, h: 150 });
    expect(result.objects[4].camera).toEqual({ look: 'all', zoom: 1.5 });
  });

  it('round-trips transform with rotation and scale', () => {
    const scene = {
      objects: [
        { id: 'box', rect: { w: 10, h: 10 }, transform: { x: 100, y: 200, rotation: 45, scale: 2 } },
      ],
    };
    const result = modelTrip(scene);
    expect(result.objects[0].transform).toEqual({ x: 100, y: 200, rotation: 45, scale: 2 });
  });

  it('round-trips misc properties', () => {
    const scene = {
      objects: [{
        id: 'box',
        rect: { w: 10, h: 10 },
        opacity: 0.8,
        depth: 5,
        visible: false,
        layout: { slot: 'container' },
      }],
    };
    const result = modelTrip(scene);
    const obj = result.objects[0];
    expect(obj.opacity).toBe(0.8);
    expect(obj.depth).toBe(5);
    expect(obj.visible).toBe(false);
    expect(obj.layout?.slot).toBe('container');
  });

  it('round-trips images block', () => {
    const scene = {
      objects: [],
      images: {
        photo: 'https://example.com/photo.png',
        logo: 'logo.svg',
      },
    };
    const result = modelTrip(scene);
    expect(result.images).toEqual({
      photo: 'https://example.com/photo.png',
      logo: 'logo.svg',
    });
  });

  it('round-trips layout property', () => {
    const scene = {
      objects: [{
        id: 'container',
        rect: { w: 300, h: 200 },
        layout: { type: 'flex', direction: 'row', gap: 10 },
      }],
    };
    const result = modelTrip(scene);
    expect(result.objects[0].layout).toEqual({ type: 'flex', direction: 'row', gap: 10 });
  });

  it('round-trips explicit point paths', () => {
    const scene = {
      objects: [{
        id: 'tri',
        path: { points: [[0, -40], [40, 30], [-40, 30]], closed: true },
        fill: { h: 280, s: 60, l: 45 },
      }],
    };
    const result = modelTrip(scene);
    expect(result.objects[0].path.points).toEqual([[0, -40], [40, 30], [-40, 30]]);
    expect(result.objects[0].path.closed).toBe(true);
    expect(result.objects[0].fill).toEqual({ h: 280, s: 60, l: 45 });
  });

  it('round-trips animation with keyframes', () => {
    const scene = {
      objects: [
        { id: 'box', rect: { w: 100, h: 80 }, fill: { h: 210, s: 70, l: 45 } },
      ],
      animate: {
        duration: 3,
        loop: true,
        keyframes: [
          { time: 0, changes: { 'box.fill.h': 120 } },
          { time: 1.5, changes: { 'box.fill.h': 0 } },
          { time: 3, changes: { 'box.fill.h': 120 } },
        ],
      },
    };
    const result = modelTrip(scene);
    expect(result.animate.duration).toBe(3);
    expect(result.animate.loop).toBe(true);
    expect(result.animate.keyframes).toHaveLength(3);
    expect(result.animate.keyframes[0]).toEqual({ time: 0, changes: { 'box.fill.h': 120 } });
  });

  it('round-trips animation effects', () => {
    const scene = {
      objects: [],
      animate: {
        duration: 3,
        keyframes: [
          { time: 1.5, changes: { card: 'pulse' } },
        ],
      },
    };
    const result = modelTrip(scene);
    expect(result.animate.keyframes[0].changes['card']).toBe('pulse');
  });

  it('round-trips animation chapters', () => {
    const scene = {
      objects: [],
      animate: {
        duration: 5,
        keyframes: [],
        chapters: [
          { name: 'Intro', time: 0 },
          { name: 'Middle', time: 2.5 },
        ],
      },
    };
    const result = modelTrip(scene);
    expect(result.animate.chapters).toEqual([
      { name: 'Intro', time: 0 },
      { name: 'Middle', time: 2.5 },
    ]);
  });

  it('round-trips a complete scene', () => {
    const scene = {
      name: 'Full Scene',
      viewport: { width: 800, height: 600 },
      background: '#000',
      styles: {
        primary: {
          fill: { h: 210, s: 70, l: 45 },
          stroke: { color: { h: 210, s: 80, l: 30 }, width: 2 },
        },
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
        { id: 'dot', ellipse: { rx: 5, ry: 5 }, fill: 'white' },
        { id: 'link', path: { route: ['box', 'dot'] } },
      ],
      animate: {
        duration: 3,
        loop: true,
        keyframes: [
          { time: 0, changes: { 'box.fill.h': 210 } },
          { time: 1.5, changes: { 'box.fill.h': 0 } },
          { time: 3, changes: { 'box.fill.h': 210 } },
        ],
        chapters: [
          { name: 'Start', time: 0 },
          { name: 'End', time: 3 },
        ],
      },
    };

    const result = modelTrip(scene);

    expect(result.name).toBe('Full Scene');
    expect(result.viewport).toEqual({ width: 800, height: 600 });
    expect(result.background).toBe('#000');
    expect(result.styles.primary.fill).toEqual({ h: 210, s: 70, l: 45 });
    expect(result.objects).toHaveLength(3);
    expect(result.objects[0].style).toBe('primary');
    expect(result.objects[0].children[0].text.content).toBe('Hi');
    expect(result.objects[2].path.route).toEqual(['box', 'dot']);
    expect(result.animate.duration).toBe(3);
    expect(result.animate.loop).toBe(true);
    expect(result.animate.keyframes).toHaveLength(3);
    expect(result.animate.chapters).toHaveLength(2);
  });
});
