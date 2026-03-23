import { describe, it, expect } from 'vitest';
import { parseDsl } from '../../dsl/parser';
import { generateDsl } from '../../dsl/generator';

/**
 * Helper: generate DSL from a scene, parse it back, and compare.
 * Strips the default `styles: {}` that parseDsl always adds.
 */
function roundTrip(scene: any): any {
  const dsl = generateDsl(scene);
  const parsed = parseDsl(dsl);
  return parsed;
}

describe('DSL round-trip fidelity', () => {
  // ── Simple rect with fill and position ─────────────────────────
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
    const result = roundTrip(scene);
    expect(result.objects).toHaveLength(1);
    const obj = result.objects[0];
    expect(obj.id).toBe('box');
    expect(obj.rect).toEqual({ w: 160, h: 100 });
    expect(obj.fill).toEqual({ h: 210, s: 70, l: 45 });
    expect(obj.transform).toEqual({ x: 200, y: 150 });
  });

  // ── Children hierarchy ─────────────────────────────────────────
  it('round-trips children hierarchy', () => {
    const scene = {
      objects: [
        {
          id: 'card',
          rect: { w: 200, h: 150 },
          transform: { x: 100, y: 100 },
          children: [
            { id: 'title', text: { content: 'Hello', size: 14 } },
            { id: 'badge', ellipse: { rx: 4, ry: 4 } },
          ],
        },
      ],
    };
    const result = roundTrip(scene);
    const card = result.objects[0];
    expect(card.id).toBe('card');
    expect(card.children).toHaveLength(2);
    expect(card.children[0].id).toBe('title');
    expect(card.children[0].text).toEqual({ content: 'Hello', size: 14 });
    expect(card.children[1].id).toBe('badge');
    expect(card.children[1].ellipse).toEqual({ rx: 4, ry: 4 });
  });

  // ── Nested children ────────────────────────────────────────────
  it('round-trips nested children (3 levels)', () => {
    const scene = {
      objects: [
        {
          id: 'outer',
          rect: { w: 300, h: 300 },
          children: [
            {
              id: 'inner',
              rect: { w: 150, h: 150 },
              children: [
                { id: 'deep', ellipse: { rx: 5, ry: 5 } },
              ],
            },
          ],
        },
      ],
    };
    const result = roundTrip(scene);
    const outer = result.objects[0];
    expect(outer.children[0].id).toBe('inner');
    expect(outer.children[0].children[0].id).toBe('deep');
    expect(outer.children[0].children[0].ellipse).toEqual({ rx: 5, ry: 5 });
  });

  // ── Connections with waypoints ─────────────────────────────────
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
    const result = roundTrip(scene);
    const link = result.objects[2];
    expect(link.id).toBe('link');
    expect(link.path.route).toEqual(['a', [250, 100], 'b']);
    expect(link.path.smooth).toBe(true);
    expect(link.path.radius).toBe(15);
  });

  // ── Simple connection ──────────────────────────────────────────
  it('round-trips a simple connection a -> b', () => {
    const scene = {
      objects: [
        { id: 'link', path: { route: ['a', 'b'] } },
      ],
    };
    const result = roundTrip(scene);
    expect(result.objects[0].path).toEqual({ route: ['a', 'b'] });
  });

  // ── Connection with stroke ─────────────────────────────────────
  it('round-trips connection with stroke', () => {
    const scene = {
      objects: [
        {
          id: 'link',
          path: { route: ['a', 'b'] },
          stroke: { h: 0, s: 0, l: 60, width: 2 },
        },
      ],
    };
    const result = roundTrip(scene);
    expect(result.objects[0].path).toEqual({ route: ['a', 'b'] });
    expect(result.objects[0].stroke).toEqual({ h: 0, s: 0, l: 60, width: 2 });
  });

  // ── Styles ─────────────────────────────────────────────────────
  it('round-trips style definitions', () => {
    const scene = {
      objects: [],
      styles: {
        primary: {
          fill: { h: 210, s: 70, l: 45 },
          stroke: { h: 210, s: 80, l: 30, width: 2 },
        },
      },
    };
    const result = roundTrip(scene);
    expect(result.styles.primary).toEqual({
      fill: { h: 210, s: 70, l: 45 },
      stroke: { h: 210, s: 80, l: 30, width: 2 },
    });
  });

  // ── Multiple styles ────────────────────────────────────────────
  it('round-trips multiple styles', () => {
    const scene = {
      objects: [],
      styles: {
        primary: { fill: { h: 210, s: 70, l: 45 } },
        danger: { fill: { h: 0, s: 80, l: 50 } },
      },
    };
    const result = roundTrip(scene);
    expect(result.styles.primary.fill).toEqual({ h: 210, s: 70, l: 45 });
    expect(result.styles.danger.fill).toEqual({ h: 0, s: 80, l: 50 });
  });

  // ── Style reference ────────────────────────────────────────────
  it('round-trips a node with style reference', () => {
    const scene = {
      objects: [
        { id: 'box', rect: { w: 100, h: 80 }, style: 'primary' },
      ],
    };
    const result = roundTrip(scene);
    expect(result.objects[0].style).toBe('primary');
  });

  // ── Named colors round-trip ────────────────────────────────────
  it('round-trips named colors (white)', () => {
    const scene = {
      objects: [
        { id: 'box', rect: { w: 10, h: 10 }, fill: { h: 0, s: 0, l: 100 } },
      ],
    };

    // First verify the DSL uses the name "white"
    const dsl = generateDsl(scene);
    expect(dsl).toContain('fill white');

    // Then verify round-trip preserves values
    const result = roundTrip(scene);
    expect(result.objects[0].fill).toEqual({ h: 0, s: 0, l: 100 });
  });

  it('round-trips named colors (black)', () => {
    const scene = {
      objects: [
        { id: 'box', rect: { w: 10, h: 10 }, fill: { h: 0, s: 0, l: 0 } },
      ],
    };
    const dsl = generateDsl(scene);
    expect(dsl).toContain('fill black');
    const result = roundTrip(scene);
    expect(result.objects[0].fill).toEqual({ h: 0, s: 0, l: 0 });
  });

  it('round-trips named colors (red)', () => {
    const scene = {
      objects: [
        { id: 'box', rect: { w: 10, h: 10 }, fill: { h: 0, s: 100, l: 50 } },
      ],
    };
    const dsl = generateDsl(scene);
    expect(dsl).toContain('fill red');
    const result = roundTrip(scene);
    expect(result.objects[0].fill).toEqual({ h: 0, s: 100, l: 50 });
  });

  // ── Fill with alpha ────────────────────────────────────────────
  it('round-trips fill with alpha', () => {
    const scene = {
      objects: [
        { id: 'box', rect: { w: 10, h: 10 }, fill: { h: 210, s: 70, l: 45, a: 0.5 } },
      ],
    };
    const result = roundTrip(scene);
    expect(result.objects[0].fill).toEqual({ h: 210, s: 70, l: 45, a: 0.5 });
  });

  // ── Stroke with alpha and width ────────────────────────────────
  it('round-trips stroke with alpha and width', () => {
    const scene = {
      objects: [
        { id: 'box', rect: { w: 10, h: 10 }, stroke: { h: 0, s: 0, l: 60, a: 0.5, width: 3 } },
      ],
    };
    const result = roundTrip(scene);
    expect(result.objects[0].stroke).toEqual({ h: 0, s: 0, l: 60, a: 0.5, width: 3 });
  });

  // ── Point paths ────────────────────────────────────────────────
  it('round-trips explicit point paths', () => {
    const scene = {
      objects: [
        {
          id: 'tri',
          path: { points: [[0, -40], [40, 30], [-40, 30]], closed: true },
          fill: { h: 280, s: 60, l: 45 },
        },
      ],
    };
    const result = roundTrip(scene);
    expect(result.objects[0].path.points).toEqual([[0, -40], [40, 30], [-40, 30]]);
    expect(result.objects[0].path.closed).toBe(true);
    expect(result.objects[0].fill).toEqual({ h: 280, s: 60, l: 45 });
  });

  // ── Animation with keyframes ───────────────────────────────────
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
    const result = roundTrip(scene);
    expect(result.animate.duration).toBe(3);
    expect(result.animate.loop).toBe(true);
    expect(result.animate.keyframes).toHaveLength(3);
    expect(result.animate.keyframes[0]).toEqual({ time: 0, changes: { 'box.fill.h': 120 } });
    expect(result.animate.keyframes[1]).toEqual({ time: 1.5, changes: { 'box.fill.h': 0 } });
    expect(result.animate.keyframes[2]).toEqual({ time: 3, changes: { 'box.fill.h': 120 } });
  });

  // ── Animation with easing ──────────────────────────────────────
  it('round-trips animation with per-change easing', () => {
    const scene = {
      objects: [],
      animate: {
        duration: 3,
        keyframes: [
          { time: 1.5, changes: { 'box.fill.h': { value: 0, easing: 'bounce' } } },
        ],
      },
    };
    const result = roundTrip(scene);
    expect(result.animate.keyframes[0].changes['box.fill.h']).toEqual({
      value: 0,
      easing: 'bounce',
    });
  });

  // ── Animation with chapters ────────────────────────────────────
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
    const result = roundTrip(scene);
    expect(result.animate.chapters).toEqual([
      { name: 'Intro', time: 0 },
      { name: 'Middle', time: 2.5 },
    ]);
  });

  // ── Animation effects ──────────────────────────────────────────
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
    const result = roundTrip(scene);
    expect(result.animate.keyframes[0].changes['card']).toBe('pulse');
  });

  // ── Document metadata ──────────────────────────────────────────
  it('round-trips document metadata', () => {
    const scene = {
      name: 'My Diagram',
      description: 'A test',
      background: '#1a1a2e',
      viewport: { width: 600, height: 400 },
      objects: [],
    };
    const result = roundTrip(scene);
    expect(result.name).toBe('My Diagram');
    expect(result.description).toBe('A test');
    expect(result.background).toBe('#1a1a2e');
    expect(result.viewport).toEqual({ width: 600, height: 400 });
  });

  // ── Geometry types ─────────────────────────────────────────────
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
    const result = roundTrip(scene);
    expect(result.objects[0].rect).toEqual({ w: 100, h: 80 });
    expect(result.objects[1].ellipse).toEqual({ rx: 20, ry: 15 });
    expect(result.objects[2].text).toEqual({ content: 'Hello', size: 16, bold: true });
    expect(result.objects[3].image).toEqual({ src: 'photo.png', w: 200, h: 150 });
    expect(result.objects[4].camera).toEqual({ look: 'all', zoom: 1.5 });
  });

  // ── Transform with rotation and scale ──────────────────────────
  it('round-trips transform with rotation and scale', () => {
    const scene = {
      objects: [
        { id: 'box', rect: { w: 10, h: 10 }, transform: { x: 100, y: 200, rotation: 45, scale: 2 } },
      ],
    };
    const result = roundTrip(scene);
    expect(result.objects[0].transform).toEqual({ x: 100, y: 200, rotation: 45, scale: 2 });
  });

  // ── Opacity, depth, slot, visible ──────────────────────────────
  it('round-trips misc properties', () => {
    const scene = {
      objects: [
        {
          id: 'box',
          rect: { w: 10, h: 10 },
          opacity: 0.8,
          depth: 5,
          visible: false,
          slot: 'container',
        },
      ],
    };
    const result = roundTrip(scene);
    const obj = result.objects[0];
    expect(obj.opacity).toBe(0.8);
    expect(obj.depth).toBe(5);
    expect(obj.visible).toBe(false);
    expect(obj.slot).toBe('container');
  });

  // ── Complete scene ─────────────────────────────────────────────
  it('round-trips a complete scene end-to-end', () => {
    const scene = {
      name: 'Full Scene',
      viewport: { width: 800, height: 600 },
      background: '#000',
      styles: {
        primary: {
          fill: { h: 210, s: 70, l: 45 },
          stroke: { h: 210, s: 80, l: 30, width: 2 },
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
        { id: 'dot', ellipse: { rx: 5, ry: 5 }, fill: { h: 0, s: 0, l: 100 } },
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

    const result = roundTrip(scene);

    // Metadata
    expect(result.name).toBe('Full Scene');
    expect(result.viewport).toEqual({ width: 800, height: 600 });
    expect(result.background).toBe('#000');

    // Styles
    expect(result.styles.primary.fill).toEqual({ h: 210, s: 70, l: 45 });
    expect(result.styles.primary.stroke).toEqual({ h: 210, s: 80, l: 30, width: 2 });

    // Objects
    expect(result.objects).toHaveLength(3);
    expect(result.objects[0].id).toBe('box');
    expect(result.objects[0].style).toBe('primary');
    expect(result.objects[0].transform).toEqual({ x: 200, y: 150 });
    expect(result.objects[0].children[0].text.content).toBe('Hi');
    expect(result.objects[1].fill).toEqual({ h: 0, s: 0, l: 100 });
    expect(result.objects[2].path.route).toEqual(['box', 'dot']);

    // Animation
    expect(result.animate.duration).toBe(3);
    expect(result.animate.loop).toBe(true);
    expect(result.animate.keyframes).toHaveLength(3);
    expect(result.animate.chapters).toHaveLength(2);
  });

  // ── Images block ───────────────────────────────────────────────
  it('round-trips images block', () => {
    const scene = {
      objects: [],
      images: {
        photo: 'https://example.com/photo.png',
        logo: 'logo.svg',
      },
    };
    const result = roundTrip(scene);
    expect(result.images).toEqual({
      photo: 'https://example.com/photo.png',
      logo: 'logo.svg',
    });
  });

  // ── Layout property ────────────────────────────────────────────
  it('round-trips layout property', () => {
    const scene = {
      objects: [
        {
          id: 'container',
          rect: { w: 300, h: 200 },
          layout: { type: 'flex', direction: 'row', gap: 10 },
        },
      ],
    };
    const result = roundTrip(scene);
    expect(result.objects[0].layout).toEqual({ type: 'flex', direction: 'row', gap: 10 });
  });

  // ── Rect with radius ──────────────────────────────────────────
  it('round-trips rect with radius', () => {
    const scene = {
      objects: [
        { id: 'box', rect: { w: 160, h: 100, radius: 8 } },
      ],
    };
    const result = roundTrip(scene);
    expect(result.objects[0].rect).toEqual({ w: 160, h: 100, radius: 8 });
  });

  // ── Dash property ──────────────────────────────────────────────
  it('round-trips dash property', () => {
    const scene = {
      objects: [
        { id: 'box', rect: { w: 10, h: 10 }, dash: { pattern: 'dashed' } },
      ],
    };
    const result = roundTrip(scene);
    expect(result.objects[0].dash).toEqual({ pattern: 'dashed' });
  });
});
