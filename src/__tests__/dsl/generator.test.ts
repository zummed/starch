import { describe, it, expect } from 'vitest';
import { generateDsl } from '../../dsl/generator';

describe('DSL generator', () => {
  // ── Document metadata ──────────────────────────────────────────
  describe('document metadata', () => {
    it('generates name', () => {
      const dsl = generateDsl({ name: 'My Diagram', objects: [] });
      expect(dsl).toContain('name "My Diagram"');
    });

    it('generates description', () => {
      const dsl = generateDsl({ description: 'A test', objects: [] });
      expect(dsl).toContain('description "A test"');
    });

    it('generates background', () => {
      const dsl = generateDsl({ background: '#1a1a2e', objects: [] });
      expect(dsl).toContain('background "#1a1a2e"');
    });

    it('generates viewport', () => {
      const dsl = generateDsl({ viewport: { width: 600, height: 400 }, objects: [] });
      expect(dsl).toContain('viewport 600x400');
    });

    it('generates all metadata together', () => {
      const dsl = generateDsl({
        name: 'My Diagram',
        description: 'A test',
        background: '#1a1a2e',
        viewport: { width: 600, height: 400 },
        objects: [],
      });
      expect(dsl).toContain('name "My Diagram"');
      expect(dsl).toContain('description "A test"');
      expect(dsl).toContain('background "#1a1a2e"');
      expect(dsl).toContain('viewport 600x400');
    });
  });

  // ── Images ─────────────────────────────────────────────────────
  describe('images', () => {
    it('generates images block', () => {
      const dsl = generateDsl({
        objects: [],
        images: {
          photo: 'https://example.com/photo.png',
          logo: 'logo.svg',
        },
      });
      expect(dsl).toContain('images');
      expect(dsl).toContain('  photo: "https://example.com/photo.png"');
      expect(dsl).toContain('  logo: "logo.svg"');
    });
  });

  // ── Styles ─────────────────────────────────────────────────────
  describe('styles', () => {
    it('generates a style block', () => {
      const dsl = generateDsl({
        objects: [],
        styles: {
          primary: {
            fill: { h: 210, s: 70, l: 45 },
            stroke: { color: { h: 210, s: 80, l: 30 }, width: 2 },
          },
        },
      });
      expect(dsl).toContain('style primary');
      expect(dsl).toContain('  fill hsl 210 70 45');
      expect(dsl).toContain('  stroke hsl 210 80 30 width=2');
    });

    it('generates multiple styles', () => {
      const dsl = generateDsl({
        objects: [],
        styles: {
          primary: { fill: { h: 210, s: 70, l: 45 } },
          danger: { fill: { h: 0, s: 80, l: 50 } },
        },
      });
      expect(dsl).toContain('style primary');
      expect(dsl).toContain('style danger');
    });
  });

  // ── Geometry types ─────────────────────────────────────────────
  describe('geometry types', () => {
    it('generates rect with dimensions', () => {
      const dsl = generateDsl({
        objects: [{ id: 'box', rect: { w: 160, h: 100 } }],
      });
      expect(dsl).toContain('box: rect 160x100');
    });

    it('generates rect with radius', () => {
      const dsl = generateDsl({
        objects: [{ id: 'box', rect: { w: 160, h: 100, radius: 8 } }],
      });
      expect(dsl).toContain('box: rect 160x100 radius=8');
    });

    it('generates ellipse', () => {
      const dsl = generateDsl({
        objects: [{ id: 'dot', ellipse: { rx: 4, ry: 4 } }],
      });
      expect(dsl).toContain('dot: ellipse 8x8');
    });

    it('generates text with content and properties', () => {
      const dsl = generateDsl({
        objects: [{ id: 'title', text: { content: 'Hello', size: 14, bold: true } }],
      });
      expect(dsl).toContain('title: text "Hello" size=14 bold');
    });

    it('generates image with src and dimensions', () => {
      const dsl = generateDsl({
        objects: [{ id: 'pic', image: { src: 'photo.png', w: 200, h: 150 } }],
      });
      expect(dsl).toContain('pic: image "photo.png" 200x150');
    });

    it('generates image with fit', () => {
      const dsl = generateDsl({
        objects: [{ id: 'pic', image: { src: 'photo.png', w: 200, h: 150, fit: 'cover' } }],
      });
      expect(dsl).toContain('pic: image "photo.png" 200x150 fit=cover');
    });

    it('generates camera', () => {
      const dsl = generateDsl({
        objects: [{ id: 'cam', camera: { look: 'all', zoom: 1.5, active: true } }],
      });
      expect(dsl).toContain('cam: camera look=all zoom=1.5 active');
    });
  });

  // ── Properties ─────────────────────────────────────────────────
  describe('properties', () => {
    it('generates fill with HSL', () => {
      const dsl = generateDsl({
        objects: [{ id: 'box', rect: { w: 10, h: 10 }, fill: { h: 210, s: 70, l: 45 } }],
      });
      expect(dsl).toContain('fill hsl 210 70 45');
    });

    it('generates fill with named color', () => {
      const dsl = generateDsl({
        objects: [{ id: 'box', rect: { w: 10, h: 10 }, fill: { h: 0, s: 0, l: 100 } }],
      });
      expect(dsl).toContain('fill white');
    });

    it('generates fill with alpha', () => {
      const dsl = generateDsl({
        objects: [{ id: 'box', rect: { w: 10, h: 10 }, fill: { h: 210, s: 70, l: 45, a: 0.5 } }],
      });
      expect(dsl).toContain('fill hsl 210 70 45 a=0.5');
    });

    it('generates stroke with width', () => {
      const dsl = generateDsl({
        objects: [{ id: 'box', rect: { w: 10, h: 10 }, stroke: { color: { h: 210, s: 80, l: 30 }, width: 2 } }],
      });
      expect(dsl).toContain('stroke hsl 210 80 30 width=2');
    });

    it('generates stroke with alpha and width', () => {
      const dsl = generateDsl({
        objects: [{ id: 'box', rect: { w: 10, h: 10 }, stroke: { color: { h: 0, s: 0, l: 60, a: 0.5 }, width: 3 } }],
      });
      expect(dsl).toContain('stroke hsl 0 0 60 a=0.5 width=3');
    });

    it('generates at position', () => {
      const dsl = generateDsl({
        objects: [{ id: 'box', rect: { w: 10, h: 10 }, transform: { x: 200, y: 150 } }],
      });
      expect(dsl).toContain('at 200,150');
    });

    it('generates partial at position', () => {
      const dsl = generateDsl({
        objects: [{ id: 'title', text: { content: 'Hi' }, transform: { y: -20 } }],
      });
      expect(dsl).toContain('at y=-20');
    });

    it('generates at with rotation', () => {
      const dsl = generateDsl({
        objects: [{ id: 'box', rect: { w: 10, h: 10 }, transform: { x: 200, y: 150, rotation: 45 } }],
      });
      expect(dsl).toContain('at 200,150 rotation=45');
    });

    it('generates style reference', () => {
      const dsl = generateDsl({
        objects: [{ id: 'box', rect: { w: 10, h: 10 }, style: 'primary' }],
      });
      expect(dsl).toContain('@primary');
    });

    it('generates dash as block property', () => {
      const dsl = generateDsl({
        objects: [{ id: 'box', rect: { w: 10, h: 10 }, dash: { pattern: 'dashed' } }],
      });
      expect(dsl).toContain('dash dashed');
    });

    it('generates opacity', () => {
      const dsl = generateDsl({
        objects: [{ id: 'box', rect: { w: 10, h: 10 }, opacity: 0.5 }],
      });
      expect(dsl).toContain('opacity=0.5');
    });

    it('generates visible=false', () => {
      const dsl = generateDsl({
        objects: [{ id: 'box', rect: { w: 10, h: 10 }, visible: false }],
      });
      expect(dsl).toContain('visible=false');
    });

    it('generates depth', () => {
      const dsl = generateDsl({
        objects: [{ id: 'box', rect: { w: 10, h: 10 }, depth: 3 }],
      });
      expect(dsl).toContain('depth=3');
    });

    it('generates slot under layout', () => {
      const dsl = generateDsl({
        objects: [{ id: 'box', rect: { w: 10, h: 10 }, layout: { slot: 'container' } }],
      });
      expect(dsl).toContain('layout slot=container');
    });

    it('generates layout', () => {
      const dsl = generateDsl({
        objects: [{ id: 'box', rect: { w: 10, h: 10 }, layout: { type: 'flex', direction: 'row', gap: 10 } }],
      });
      expect(dsl).toContain('layout flex row gap=10');
    });
  });

  // ── Children ───────────────────────────────────────────────────
  describe('children', () => {
    it('generates children indented', () => {
      const dsl = generateDsl({
        objects: [{
          id: 'card',
          rect: { w: 160, h: 100 },
          transform: { x: 200, y: 150 },
          children: [
            { id: 'title', text: { content: 'Hello', size: 14 } },
            { id: 'badge', ellipse: { rx: 4, ry: 4 } },
          ],
        }],
      });
      expect(dsl).toContain('card: rect 160x100');
      expect(dsl).toContain('  title: text "Hello" size=14');
      expect(dsl).toContain('  badge: ellipse 8x8');
    });

    it('generates nested children', () => {
      const dsl = generateDsl({
        objects: [{
          id: 'outer',
          rect: { w: 200, h: 200 },
          children: [{
            id: 'inner',
            rect: { w: 100, h: 100 },
            children: [{ id: 'deep', ellipse: { rx: 5, ry: 5 } }],
          }],
        }],
      });
      expect(dsl).toContain('outer: rect 200x200');
      expect(dsl).toContain('  inner: rect 100x100');
      expect(dsl).toContain('    deep: ellipse 10x10');
    });
  });

  // ── Connections ────────────────────────────────────────────────
  describe('connections', () => {
    it('generates simple connection', () => {
      const dsl = generateDsl({
        objects: [{ id: 'link', path: { route: ['a', 'b'] } }],
      });
      expect(dsl).toContain('link: a -> b');
    });

    it('generates connection with waypoints', () => {
      const dsl = generateDsl({
        objects: [{
          id: 'link',
          path: { route: ['a', [250, 100], 'b'], smooth: true, radius: 15 },
        }],
      });
      expect(dsl).toContain('link: a -> (250,100) -> b smooth radius=15');
    });

    it('generates connection with stroke', () => {
      const dsl = generateDsl({
        objects: [{
          id: 'link',
          path: { route: ['a', 'b'] },
          stroke: { color: { h: 0, s: 0, l: 60 }, width: 2 },
        }],
      });
      expect(dsl).toContain('link: a -> b stroke hsl 0 0 60 width=2');
    });
  });

  // ── Explicit paths ─────────────────────────────────────────────
  describe('explicit paths', () => {
    it('generates explicit path with points', () => {
      const dsl = generateDsl({
        objects: [{
          id: 'tri',
          path: { points: [[0, -40], [40, 30], [-40, 30]], closed: true },
          fill: { h: 280, s: 60, l: 45 },
        }],
      });
      expect(dsl).toContain('tri: path (0,-40) (40,30) (-40,30) closed');
      expect(dsl).toContain('fill hsl 280 60 45');
    });
  });

  // ── Inline vs block heuristic ──────────────────────────────────
  describe('inline vs block rendering', () => {
    it('renders inline when props <= 4', () => {
      const dsl = generateDsl({
        objects: [{ id: 'box', rect: { w: 10, h: 10 }, fill: { h: 0, s: 0, l: 100 } }],
      });
      // Should be on a single line
      const lines = dsl.trim().split('\n');
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('box: rect 10x10 fill white');
    });

    it('renders block when props > 4', () => {
      const dsl = generateDsl({
        objects: [{
          id: 'box',
          rect: { w: 160, h: 100 },
          fill: { h: 210, s: 70, l: 45 },
          stroke: { color: 'black' },
          opacity: 0.8,
          depth: 5,
        }],
      });
      const lines = dsl.trim().split('\n');
      expect(lines.length).toBeGreaterThan(1);
    });

    it('forces inline with nodeFormats option', () => {
      const dsl = generateDsl({
        objects: [{
          id: 'box',
          rect: { w: 160, h: 100 },
          fill: { h: 210, s: 70, l: 45 },
          stroke: { color: 'black' },
          opacity: 0.8,
          depth: 5,
        }],
      }, { nodeFormats: { box: 'inline' } });
      const nodeLines = dsl.trim().split('\n').filter(l => l.startsWith('box:'));
      expect(nodeLines).toHaveLength(1);
    });

    it('forces block with nodeFormats option', () => {
      const dsl = generateDsl({
        objects: [{ id: 'box', rect: { w: 10, h: 10 }, fill: { h: 0, s: 0, l: 100 } }],
      }, { nodeFormats: { box: 'block' } });
      const lines = dsl.trim().split('\n');
      // Block mode puts geometry on line 1, then props on indented lines
      expect(lines.length).toBeGreaterThan(1);
      expect(lines[0]).toContain('box: rect 10x10');
      expect(lines[1]).toContain('  fill white');
    });
  });

  // ── Animation ──────────────────────────────────────────────────
  describe('animation', () => {
    it('generates animate header', () => {
      const dsl = generateDsl({
        objects: [],
        animate: { duration: 3, keyframes: [] },
      });
      expect(dsl).toContain('animate 3s');
    });

    it('generates animate with loop', () => {
      const dsl = generateDsl({
        objects: [],
        animate: { duration: 3, loop: true, keyframes: [] },
      });
      expect(dsl).toContain('animate 3s loop');
    });

    it('generates animate with easing', () => {
      const dsl = generateDsl({
        objects: [],
        animate: { duration: 3, easing: 'easeInOut', keyframes: [] },
      });
      expect(dsl).toContain('animate 3s easing=easeInOut');
    });

    it('generates animate with autoKey', () => {
      const dsl = generateDsl({
        objects: [],
        animate: { duration: 3, autoKey: true, keyframes: [] },
      });
      expect(dsl).toContain('animate 3s autoKey');
    });

    it('generates chapters', () => {
      const dsl = generateDsl({
        objects: [],
        animate: {
          duration: 5,
          keyframes: [],
          chapters: [
            { name: 'Intro', time: 0 },
            { name: 'Middle', time: 2.5 },
          ],
        },
      });
      expect(dsl).toContain('chapter "Intro" at 0');
      expect(dsl).toContain('chapter "Middle" at 2.5');
    });

    it('generates flat keyframes', () => {
      const dsl = generateDsl({
        objects: [],
        animate: {
          duration: 3,
          keyframes: [
            { time: 0, changes: { 'box.fill.h': 120 } },
            { time: 1.5, changes: { 'box.fill.h': 0 } },
          ],
        },
      });
      expect(dsl).toContain('0  box.fill.h: 120');
      expect(dsl).toContain('1.5  box.fill.h: 0');
    });

    it('generates keyframe with per-change easing', () => {
      const dsl = generateDsl({
        objects: [],
        animate: {
          duration: 3,
          keyframes: [
            { time: 1.5, changes: { 'box.fill.h': { value: 0, easing: 'bounce' } } },
          ],
        },
      });
      expect(dsl).toContain('1.5  box.fill.h: 0 easing=bounce');
    });

    it('generates effect (string value)', () => {
      const dsl = generateDsl({
        objects: [],
        animate: {
          duration: 3,
          keyframes: [
            { time: 1.5, changes: { card: 'pulse' } },
          ],
        },
      });
      expect(dsl).toContain('1.5  card pulse');
    });

    it('generates effect with params', () => {
      const dsl = generateDsl({
        objects: [],
        animate: {
          duration: 3,
          keyframes: [
            { time: 1.5, changes: { card: { effect: 'flash', amplitude: 2 } } },
          ],
        },
      });
      expect(dsl).toContain('1.5  card flash amplitude=2');
    });

    it('generates multi-change keyframes with continuation', () => {
      const dsl = generateDsl({
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
      });
      expect(dsl).toContain('0  cam.camera.look: all');
      expect(dsl).toContain('    cam.camera.zoom: 1');
    });

    it('generates relative time with +', () => {
      const dsl = generateDsl({
        objects: [],
        animate: {
          duration: 3,
          keyframes: [
            { time: 0, plus: 2, changes: { 'box.fill.h': 120 } },
          ],
        },
      });
      expect(dsl).toContain('+2  box.fill.h: 120');
    });

    it('generates boolean keyframe values', () => {
      const dsl = generateDsl({
        objects: [],
        animate: {
          duration: 3,
          keyframes: [
            { time: 0, changes: { 'box.visible': true } },
            { time: 1, changes: { 'box.visible': false } },
          ],
        },
      });
      expect(dsl).toContain('0  box.visible: true');
      expect(dsl).toContain('1  box.visible: false');
    });

    it('generates array/tuple keyframe values', () => {
      const dsl = generateDsl({
        objects: [],
        animate: {
          duration: 3,
          keyframes: [
            { time: 0, changes: { 'box.transform.anchor': [0.5, -0.5] } },
          ],
        },
      });
      expect(dsl).toContain('0  box.transform.anchor: (0.5,-0.5)');
    });
  });

  // ── Format hints ───────────────────────────────────────────────
  describe('format hints', () => {
    it('renders node as inline when hint says inline', () => {
      const scene = {
        objects: [{
          id: 'box',
          rect: { w: 100, h: 200 },
          fill: { h: 210, s: 70, l: 45 },
          stroke: { color: 'black' },
          transform: { x: 100, y: 200 },
          opacity: 0.5,
        }],
      };
      // Without hints, this has 5+ props → heuristic renders block
      const blockDsl = generateDsl(scene);
      expect(blockDsl).toContain('\n  fill');

      // With inline hint, force single line
      const inlineDsl = generateDsl(scene, { nodeFormats: { box: 'inline' } });
      expect(inlineDsl).not.toContain('\n  fill');
    });

    it('renders node as block when hint says block even with few props', () => {
      const scene = {
        objects: [{ id: 'dot', ellipse: { rx: 5, ry: 5 }, fill: { h: 0, s: 80, l: 50 } }],
      };
      // Without hints, few props → heuristic renders inline
      const inlineDsl = generateDsl(scene);
      expect(inlineDsl).not.toContain('\n  fill');

      // With block hint, force expanded
      const blockDsl = generateDsl(scene, { nodeFormats: { dot: 'block' } });
      expect(blockDsl).toContain('\n  fill');
    });

    it('falls back to heuristic when no hint for a node', () => {
      const scene = {
        objects: [{ id: 'box', rect: { w: 100, h: 200 } }],
      };
      const dsl = generateDsl(scene, { nodeFormats: { other: 'block' } });
      expect(dsl).toContain('box: rect 100x200');
    });

    it('accepts formatHints as alternative to nodeFormats', () => {
      const scene = {
        objects: [{ id: 'dot', ellipse: { rx: 5, ry: 5 }, fill: { h: 0, s: 80, l: 50 } }],
      };
      const dsl = generateDsl(scene, { formatHints: { nodes: { dot: { display: 'block' } } } });
      expect(dsl).toContain('\n  fill');
    });
  });

  // ── Complete scene ─────────────────────────────────────────────
  describe('complete scene', () => {
    it('generates a complete scene with all sections', () => {
      const dsl = generateDsl({
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
      });
      expect(dsl).toContain('name "Test"');
      expect(dsl).toContain('viewport 800x600');
      expect(dsl).toContain('background "#000"');
      expect(dsl).toContain('style primary');
      expect(dsl).toContain('box: rect 160x100');
      expect(dsl).toContain('label: text "Hi" size=12');
    });
  });
});
