import { describe, it, expect } from 'vitest';
import { parseDsl } from '../../dsl/parser';

describe('DSL parser', () => {
  // ── Document metadata ──────────────────────────────────────────
  describe('document metadata', () => {
    it('parses name', () => {
      const result = parseDsl('name "My Diagram"');
      expect(result.name).toBe('My Diagram');
    });

    it('parses description', () => {
      const result = parseDsl('description "A test diagram"');
      expect(result.description).toBe('A test diagram');
    });

    it('parses background color string', () => {
      const result = parseDsl('background "#1a1a2e"');
      expect(result.background).toBe('#1a1a2e');
    });

    it('parses viewport', () => {
      const result = parseDsl('viewport 600x400');
      expect(result.viewport).toEqual({ width: 600, height: 400 });
    });

    it('parses all metadata together', () => {
      const result = parseDsl(`
name "My Diagram"
description "A test"
background "#1a1a2e"
viewport 600x400
`);
      expect(result.name).toBe('My Diagram');
      expect(result.description).toBe('A test');
      expect(result.background).toBe('#1a1a2e');
      expect(result.viewport).toEqual({ width: 600, height: 400 });
    });
  });

  // ── Images ─────────────────────────────────────────────────────
  describe('images', () => {
    it('parses images block', () => {
      const result = parseDsl(`
images
  photo: "https://example.com/photo.png"
  logo: "logo.svg"
`);
      expect(result.images).toEqual({
        photo: 'https://example.com/photo.png',
        logo: 'logo.svg',
      });
    });
  });

  // ── Styles ─────────────────────────────────────────────────────
  describe('styles', () => {
    it('parses a style block', () => {
      const result = parseDsl(`
style primary
  fill 210 70 45
  stroke 210 80 30 width=2
`);
      expect(result.styles).toEqual({
        primary: {
          fill: { r: 210, g: 70, b: 45 },
          stroke: { color: { r: 210, g: 80, b: 30 }, width: 2 },
        },
      });
    });

    it('parses multiple styles', () => {
      const result = parseDsl(`
style primary
  fill 210 70 45

style danger
  fill 0 80 50
`);
      expect(result.styles.primary).toBeDefined();
      expect(result.styles.danger).toBeDefined();
      expect(result.styles.danger.fill).toEqual({ r: 0, g: 80, b: 50 });
    });
  });

  // ── Geometry types ─────────────────────────────────────────────
  describe('geometry types', () => {
    it('parses rect with dimensions and radius', () => {
      const result = parseDsl('box: rect 160x100 radius=8');
      const obj = result.objects[0];
      expect(obj.id).toBe('box');
      expect(obj.rect).toEqual({ w: 160, h: 100, radius: 8 });
    });

    it('parses ellipse with dimensions', () => {
      const result = parseDsl('dot: ellipse 8x8');
      const obj = result.objects[0];
      expect(obj.id).toBe('dot');
      expect(obj.ellipse).toEqual({ rx: 4, ry: 4 });
    });

    it('parses text with content', () => {
      const result = parseDsl('title: text "Hello" size=14 bold');
      const obj = result.objects[0];
      expect(obj.id).toBe('title');
      expect(obj.text).toEqual({ content: 'Hello', size: 14, bold: true });
    });

    it('parses image with src and dimensions', () => {
      const result = parseDsl('pic: image "photo.png" 200x150 fit=cover');
      const obj = result.objects[0];
      expect(obj.id).toBe('pic');
      expect(obj.image).toEqual({ src: 'photo.png', w: 200, h: 150, fit: 'cover' });
    });

    it('parses camera', () => {
      const result = parseDsl('cam: camera look=all zoom=1.5 active');
      const obj = result.objects[0];
      expect(obj.id).toBe('cam');
      expect(obj.camera).toEqual({ look: 'all', zoom: 1.5, active: true });
    });

    it('parses container (group with at)', () => {
      const result = parseDsl('group: at 100,100');
      const obj = result.objects[0];
      expect(obj.id).toBe('group');
      expect(obj.transform).toEqual({ x: 100, y: 100 });
    });
  });

  // ── Inline properties ──────────────────────────────────────────
  describe('inline properties', () => {
    it('parses fill with bare numbers (RGB)', () => {
      const result = parseDsl('box: rect 10x10 fill 255 0 0');
      expect(result.objects[0].fill).toEqual({ r: 255, g: 0, b: 0 });
    });

    it('parses fill with rgb prefix', () => {
      const result = parseDsl('box: rect 10x10 fill rgb 255 128 0');
      expect(result.objects[0].fill).toEqual({ r: 255, g: 128, b: 0 });
    });

    it('parses fill with hsl prefix', () => {
      const result = parseDsl('box: rect 10x10 fill hsl 210 70 45');
      expect(result.objects[0].fill).toEqual({ h: 210, s: 70, l: 45 });
    });

    it('parses fill with RGB and alpha', () => {
      const result = parseDsl('box: rect 10x10 fill 210 70 45 a=0.5');
      expect(result.objects[0].fill).toEqual({ r: 210, g: 70, b: 45, a: 0.5 });
    });

    it('parses fill with named color', () => {
      const result = parseDsl('box: rect 10x10 fill white');
      expect(result.objects[0].fill).toBe('white');
    });

    it('parses fill with named color and alpha', () => {
      const result = parseDsl('box: rect 10x10 fill red a=0.5');
      expect(result.objects[0].fill).toEqual({ name: 'red', a: 0.5 });
    });

    it('parses fill with hex color', () => {
      const result = parseDsl('box: rect 10x10 fill #3B82F6');
      expect(result.objects[0].fill).toBe('#3B82F6');
    });

    it('parses stroke with width', () => {
      const result = parseDsl('box: rect 10x10 stroke 210 80 30 width=2');
      expect(result.objects[0].stroke).toEqual({ color: { r: 210, g: 80, b: 30 }, width: 2 });
    });

    it('parses stroke with named color and width', () => {
      const result = parseDsl('box: rect 10x10 stroke red width=2');
      expect(result.objects[0].stroke).toEqual({ color: 'red', width: 2 });
    });

    it('parses stroke with alpha', () => {
      const result = parseDsl('box: rect 10x10 stroke 0 0 60 a=0.5 width=3');
      expect(result.objects[0].stroke).toEqual({ color: { r: 0, g: 0, b: 60, a: 0.5 }, width: 3 });
    });

    it('parses at position x,y', () => {
      const result = parseDsl('box: rect 10x10 at 200,150');
      expect(result.objects[0].transform).toEqual({ x: 200, y: 150 });
    });

    it('parses partial at position y=-20', () => {
      const result = parseDsl('title: text "Hi" at y=-20');
      expect(result.objects[0].transform).toEqual({ y: -20 });
    });

    it('parses style reference with @', () => {
      const result = parseDsl('box: rect 10x10 @primary');
      expect(result.objects[0].style).toBe('primary');
    });

    it('parses key=value properties', () => {
      const result = parseDsl('box: rect 10x10 opacity=0.8 depth=5');
      expect(result.objects[0].opacity).toBe(0.8);
      expect(result.objects[0].depth).toBe(5);
    });

    it('parses boolean properties', () => {
      const result = parseDsl('title: text "Hi" bold mono');
      expect(result.objects[0].text.bold).toBe(true);
      expect(result.objects[0].text.mono).toBe(true);
    });

    it('parses visible=false', () => {
      const result = parseDsl('box: rect 10x10 visible=false');
      expect(result.objects[0].visible).toBe(false);
    });

    it('parses slot under layout keyword', () => {
      const result = parseDsl('box: rect 10x10 layout slot=container');
      expect(result.objects[0].layout).toEqual({ slot: 'container' });
    });

    it('parses multiple properties on one node', () => {
      const result = parseDsl('box: rect 160x100 radius=8 @primary fill 210 70 45 at 200,150');
      const obj = result.objects[0];
      expect(obj.id).toBe('box');
      expect(obj.rect).toEqual({ w: 160, h: 100, radius: 8 });
      expect(obj.style).toBe('primary');
      expect(obj.fill).toEqual({ r: 210, g: 70, b: 45 });
      expect(obj.transform).toEqual({ x: 200, y: 150 });
    });
  });

  // ── Children ───────────────────────────────────────────────────
  describe('children', () => {
    it('parses indented children', () => {
      const result = parseDsl(`
card: rect 160x100 at 200,150
  title: text "Hello" size=14
  badge: ellipse 8x8
`);
      const card = result.objects[0];
      expect(card.id).toBe('card');
      expect(card.children).toHaveLength(2);
      expect(card.children[0].id).toBe('title');
      expect(card.children[0].text.content).toBe('Hello');
      expect(card.children[1].id).toBe('badge');
      expect(card.children[1].ellipse).toEqual({ rx: 4, ry: 4 });
    });

    it('parses nested children (multi-level)', () => {
      const result = parseDsl(`
outer: rect 200x200
  inner: rect 100x100
    deep: ellipse 10x10
`);
      const outer = result.objects[0];
      expect(outer.children).toHaveLength(1);
      expect(outer.children[0].id).toBe('inner');
      expect(outer.children[0].children).toHaveLength(1);
      expect(outer.children[0].children[0].id).toBe('deep');
    });
  });

  // ── Block properties ───────────────────────────────────────────
  describe('block properties', () => {
    it('parses fill as block property', () => {
      const result = parseDsl(`
card: rect 160x100
  fill 210 70 45
`);
      expect(result.objects[0].fill).toEqual({ r: 210, g: 70, b: 45 });
    });

    it('parses stroke as block property', () => {
      const result = parseDsl(`
card: rect 160x100
  stroke 210 80 30 width=2
`);
      expect(result.objects[0].stroke).toEqual({ color: { r: 210, g: 80, b: 30 }, width: 2 });
    });

    it('parses layout as block property', () => {
      const result = parseDsl(`
card: rect 160x100
  layout flex row gap=10
`);
      expect(result.objects[0].layout).toEqual({ type: 'flex', direction: 'row', gap: 10 });
    });

    it('parses dash as block property', () => {
      const result = parseDsl(`
card: rect 160x100
  dash dashed length=10 gap=5
`);
      expect(result.objects[0].dash).toEqual({ pattern: 'dashed', length: 10, gap: 5 });
    });

    it('distinguishes block properties from child nodes', () => {
      const result = parseDsl(`
card: rect 160x100
  fill 210 70 45
  stroke 0 0 0
  title: text "Hello"
`);
      const card = result.objects[0];
      expect(card.fill).toEqual({ r: 210, g: 70, b: 45 });
      expect(card.stroke).toEqual({ color: { r: 0, g: 0, b: 0 } });
      expect(card.children).toHaveLength(1);
      expect(card.children[0].id).toBe('title');
    });
  });

  // ── Connections ────────────────────────────────────────────────
  describe('connections', () => {
    it('parses simple connection a -> b', () => {
      const result = parseDsl('link: a -> b');
      const obj = result.objects[0];
      expect(obj.id).toBe('link');
      expect(obj.path).toEqual({ route: ['a', 'b'] });
    });

    it('parses connection with properties', () => {
      const result = parseDsl('link: a -> b stroke 0 0 60 width=2');
      const obj = result.objects[0];
      expect(obj.path).toEqual({ route: ['a', 'b'] });
      expect(obj.stroke).toEqual({ color: { r: 0, g: 0, b: 60 }, width: 2 });
    });

    it('parses connection with waypoints', () => {
      const result = parseDsl('link: a -> (250,100) -> (250,200) -> b smooth radius=15');
      const obj = result.objects[0];
      expect(obj.path).toEqual({
        route: ['a', [250, 100], [250, 200], 'b'],
        smooth: true,
        radius: 15,
      });
    });

    it('parses connection with node+offset PointRef', () => {
      const result = parseDsl('link: a -> ("b", 0, -30)');
      const obj = result.objects[0];
      expect(obj.path).toEqual({ route: ['a', ['b', 0, -30]] });
    });
  });

  // ── Explicit point paths ───────────────────────────────────────
  describe('explicit point paths', () => {
    it('parses path with points', () => {
      const result = parseDsl('tri: path (0,-40) (40,30) (-40,30) closed fill 280 60 45');
      const obj = result.objects[0];
      expect(obj.id).toBe('tri');
      expect(obj.path).toEqual({
        points: [[0, -40], [40, 30], [-40, 30]],
        closed: true,
      });
      expect(obj.fill).toEqual({ r: 280, g: 60, b: 45 });
    });
  });

  // ── Flat references ────────────────────────────────────────────
  describe('flat references', () => {
    it('applies flat reference to nested property', () => {
      const result = parseDsl(`
card: rect 160x100
  badge: ellipse 8x8

card.badge.fill: 120 70 45
`);
      const card = result.objects[0];
      expect(card.children[0].fill).toEqual({ r: 120, g: 70, b: 45 });
    });
  });

  // ── JSON escape hatch ─────────────────────────────────────────
  describe('JSON escape hatch', () => {
    it('parses JSON object in braces', () => {
      const result = parseDsl('box: rect 10x10 layout={ type: "flex", direction: "row" }');
      expect(result.objects[0].layout).toEqual({ type: 'flex', direction: 'row' });
    });
  });

  // ── Multiple objects ───────────────────────────────────────────
  describe('multiple objects', () => {
    it('parses multiple top-level objects', () => {
      const result = parseDsl(`
a: rect 10x10
b: ellipse 20x20
c: text "hello"
`);
      expect(result.objects).toHaveLength(3);
      expect(result.objects[0].id).toBe('a');
      expect(result.objects[1].id).toBe('b');
      expect(result.objects[2].id).toBe('c');
    });
  });

  // ── Transform extras ──────────────────────────────────────────
  describe('transform extras', () => {
    it('parses rotation and scale in at', () => {
      const result = parseDsl('box: rect 10x10 at 100,200 rotation=45 scale=2');
      expect(result.objects[0].transform).toEqual({ x: 100, y: 200, rotation: 45, scale: 2 });
    });
  });

  // ── Complete scene ─────────────────────────────────────────────
  describe('complete scene', () => {
    it('parses a complete scene with metadata, styles, and objects', () => {
      const result = parseDsl(`
name "Test"
viewport 800x600
background "#000"

style primary
  fill hsl 210 70 45

box: rect 160x100 @primary at 200,150
  label: text "Hi" size=12
`);
      expect(result.name).toBe('Test');
      expect(result.viewport).toEqual({ width: 800, height: 600 });
      expect(result.background).toBe('#000');
      expect(result.styles.primary).toBeDefined();
      expect(result.objects).toHaveLength(1);
      expect(result.objects[0].id).toBe('box');
      expect(result.objects[0].style).toBe('primary');
      expect(result.objects[0].children[0].id).toBe('label');
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ── Animation (Task 7) ─────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════

  describe('animation', () => {
    // ── Top-level animate block ──────────────────────────────────
    describe('animate block header', () => {
      it('parses duration', () => {
        const result = parseDsl(`
animate 3s
`);
        expect(result.animate.duration).toBe(3);
        expect(result.animate.keyframes).toEqual([]);
      });

      it('parses loop flag', () => {
        const result = parseDsl(`animate 3s loop`);
        expect(result.animate.loop).toBe(true);
      });

      it('parses easing=name', () => {
        const result = parseDsl(`animate 3s easing=easeInOut`);
        expect(result.animate.easing).toBe('easeInOut');
      });

      it('parses autoKey flag', () => {
        const result = parseDsl(`animate 3s autoKey`);
        expect(result.animate.autoKey).toBe(true);
      });

      it('parses all header options together', () => {
        const result = parseDsl(`animate 3s loop easing=easeInOut autoKey`);
        expect(result.animate.duration).toBe(3);
        expect(result.animate.loop).toBe(true);
        expect(result.animate.easing).toBe('easeInOut');
        expect(result.animate.autoKey).toBe(true);
      });
    });

    // ── Flat keyframes (Form 1) ──────────────────────────────────
    describe('flat keyframes', () => {
      it('parses flat keyframes with numeric values', () => {
        const result = parseDsl(`
animate 3s
  0.0  box.fill.h: 120
  1.5  box.fill.h: 0
`);
        expect(result.animate.keyframes).toHaveLength(2);
        expect(result.animate.keyframes[0]).toEqual({
          time: 0,
          changes: { 'box.fill.h': 120 },
        });
        expect(result.animate.keyframes[1]).toEqual({
          time: 1.5,
          changes: { 'box.fill.h': 0 },
        });
      });

      it('parses flat keyframe with string value', () => {
        const result = parseDsl(`
animate 3s
  0.0  cam.camera.look: all
`);
        expect(result.animate.keyframes[0].changes['cam.camera.look']).toBe('all');
      });

      it('parses flat keyframe with boolean value', () => {
        const result = parseDsl(`
animate 3s
  0.0  box.visible: true
  1.0  box.visible: false
`);
        expect(result.animate.keyframes[0].changes['box.visible']).toBe(true);
        expect(result.animate.keyframes[1].changes['box.visible']).toBe(false);
      });

      it('parses named color as string in keyframe', () => {
        const result = parseDsl(`
animate 3s
  0.0  box.fill: blue
  2.0  box.fill: red
`);
        expect(result.animate.keyframes[0].changes['box.fill']).toBe('blue');
        expect(result.animate.keyframes[1].changes['box.fill']).toBe('red');
      });

      it('parses hex color as string in keyframe', () => {
        const result = parseDsl(`
animate 3s
  1.0  box.fill: #ff0000
`);
        expect(result.animate.keyframes[0].changes['box.fill']).toBe('#ff0000');
      });

      it('parses bare triplet as RGB color in keyframe', () => {
        const result = parseDsl(`
animate 3s
  1.0  box.fill: 180 50 60
`);
        expect(result.animate.keyframes[0].changes['box.fill']).toEqual({ r: 180, g: 50, b: 60 });
      });

      it('parses hsl prefix in keyframe', () => {
        const result = parseDsl(`
animate 3s
  1.0  box.fill: hsl 210 70 45
`);
        expect(result.animate.keyframes[0].changes['box.fill']).toEqual({ h: 210, s: 70, l: 45 });
      });

      it('parses rgb prefix in keyframe', () => {
        const result = parseDsl(`
animate 3s
  1.0  box.fill: rgb 255 128 0
`);
        expect(result.animate.keyframes[0].changes['box.fill']).toEqual({ r: 255, g: 128, b: 0 });
      });

      it('parses named color with alpha in keyframe', () => {
        const result = parseDsl(`
animate 3s
  1.0  box.fill: red a=0.5
`);
        expect(result.animate.keyframes[0].changes['box.fill']).toEqual({ name: 'red', a: 0.5 });
      });

      it('keeps non-color identifiers as strings in keyframe', () => {
        const result = parseDsl(`
animate 3s
  0.0  cam.camera.look: all
`);
        expect(result.animate.keyframes[0].changes['cam.camera.look']).toBe('all');
      });

      it('keeps single numbers as numbers in keyframe', () => {
        const result = parseDsl(`
animate 3s
  0.0  box.opacity: 0.5
`);
        expect(result.animate.keyframes[0].changes['box.opacity']).toBe(0.5);
      });
    });

    // ── Per-keyframe easing ──────────────────────────────────────
    describe('per-keyframe easing', () => {
      it('parses easing on a change value', () => {
        const result = parseDsl(`
animate 3s
  1.5  box.fill.h: 0 easing=bounce
`);
        expect(result.animate.keyframes[0].changes['box.fill.h']).toEqual({
          value: 0,
          easing: 'bounce',
        });
      });
    });

    // ── Scoped blocks (Form 2) ───────────────────────────────────
    describe('scoped blocks', () => {
      it('parses a scoped block with track paths', () => {
        const result = parseDsl(`
animate 3s
  card.badge:
    0.0  fill.h: 120
    1.5  fill.h: 0
`);
        expect(result.animate.keyframes).toHaveLength(2);
        expect(result.animate.keyframes[0]).toEqual({
          time: 0,
          changes: { 'card.badge.fill.h': 120 },
        });
        expect(result.animate.keyframes[1]).toEqual({
          time: 1.5,
          changes: { 'card.badge.fill.h': 0 },
        });
      });

      it('parses a single-id scope block', () => {
        const result = parseDsl(`
animate 3s
  box:
    0.0  fill.h: 120
`);
        expect(result.animate.keyframes[0].changes['box.fill.h']).toBe(120);
      });
    });

    // ── Relative time ────────────────────────────────────────────
    describe('relative time', () => {
      it('parses +N as relative time', () => {
        const result = parseDsl(`
animate 3s
  +2.0  box.fill.h: 120
`);
        const kf = result.animate.keyframes[0];
        expect(kf.plus).toBe(2);
        expect(kf.changes['box.fill.h']).toBe(120);
      });
    });

    // ── Chapters ─────────────────────────────────────────────────
    describe('chapters', () => {
      it('parses chapter declarations', () => {
        const result = parseDsl(`
animate 5s
  chapter "Intro" at 0
  chapter "Middle" at 2.5
`);
        expect(result.animate.chapters).toEqual([
          { name: 'Intro', time: 0 },
          { name: 'Middle', time: 2.5 },
        ]);
      });
    });

    // ── Effects ──────────────────────────────────────────────────
    describe('effects', () => {
      it('parses simple effect (no params)', () => {
        const result = parseDsl(`
animate 3s
  1.5  card pulse
`);
        const kf = result.animate.keyframes[0];
        expect(kf.time).toBe(1.5);
        expect(kf.changes['card']).toBe('pulse');
      });

      it('parses effect with parameters', () => {
        const result = parseDsl(`
animate 3s
  1.5  card flash amplitude=2
`);
        const kf = result.animate.keyframes[0];
        expect(kf.changes['card']).toEqual({ effect: 'flash', amplitude: 2 });
      });
    });

    // ── Multi-line keyframes (continuation lines) ────────────────
    describe('continuation lines', () => {
      it('parses continuation lines in a keyframe', () => {
        const result = parseDsl(`
animate 3s
  0.0  cam.camera.look: all
    cam.camera.zoom: 1
`);
        const kf = result.animate.keyframes[0];
        expect(kf.time).toBe(0);
        expect(kf.changes['cam.camera.look']).toBe('all');
        expect(kf.changes['cam.camera.zoom']).toBe(1);
      });
    });

    // ── Mixed scoped and flat entries ────────────────────────────
    describe('mixed scoped and flat entries', () => {
      it('interleaves scoped and flat keyframes', () => {
        const result = parseDsl(`
animate 5s
  0.0  box.fill.h: 210
  card.badge:
    0.0  fill.h: 120
    1.5  fill.h: 0
  3.0  box.fill.h: 0
`);
        expect(result.animate.keyframes).toHaveLength(4);
        expect(result.animate.keyframes[0]).toEqual({
          time: 0,
          changes: { 'box.fill.h': 210 },
        });
        expect(result.animate.keyframes[1]).toEqual({
          time: 0,
          changes: { 'card.badge.fill.h': 120 },
        });
        expect(result.animate.keyframes[2]).toEqual({
          time: 1.5,
          changes: { 'card.badge.fill.h': 0 },
        });
        expect(result.animate.keyframes[3]).toEqual({
          time: 3,
          changes: { 'box.fill.h': 0 },
        });
      });
    });

    // ── Complete animated scene ──────────────────────────────────
    describe('complete animated scene', () => {
      it('parses a full scene with objects and animation', () => {
        const result = parseDsl(`
name "Animated Demo"
viewport 800x600

box: rect 100x80 fill 210 70 45 at 100,100
dot: ellipse 10x10 fill white at 300,200

animate 3s loop
  0.0  box.fill.h: 210
  1.5  box.fill.h: 0
  3.0  box.fill.h: 210
  chapter "Start" at 0
  chapter "End" at 3
`);
        expect(result.name).toBe('Animated Demo');
        expect(result.objects).toHaveLength(2);
        expect(result.animate.duration).toBe(3);
        expect(result.animate.loop).toBe(true);
        expect(result.animate.keyframes).toHaveLength(3);
        expect(result.animate.chapters).toHaveLength(2);
      });
    });
  });
});
