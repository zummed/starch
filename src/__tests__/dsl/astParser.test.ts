import { describe, it, expect } from 'vitest';
import { buildAstFromText } from '../../dsl/astParser';
import { nodeAt, flattenLeaves } from '../../dsl/astTypes';

// ─── Basic Parsing ──────────────────────────────────────────────

describe('astParser - basic parsing', () => {
  it('parses a simple rect node', () => {
    const { model } = buildAstFromText('box: rect 140x80\n');
    expect(model.objects).toHaveLength(1);
    expect(model.objects[0].id).toBe('box');
    expect(model.objects[0].rect.w).toBe(140);
    expect(model.objects[0].rect.h).toBe(80);
  });

  it('produces AST with document root', () => {
    const { ast } = buildAstFromText('box: rect 140x80\n');
    expect(ast.dslRole).toBe('document');
    expect(ast.children.length).toBeGreaterThan(0);
  });

  it('produces AST with correct positions', () => {
    const text = 'box: rect 140x80\n';
    const { ast } = buildAstFromText(text);
    // The AST should span the full text
    expect(ast.from).toBe(0);
    expect(ast.to).toBe(text.length);
  });

  it('parses fill with named color', () => {
    const { model } = buildAstFromText('box: rect 100x100 fill red\n');
    expect(model.objects[0].fill).toBe('red');
  });

  it('parses fill with hex color', () => {
    const { model } = buildAstFromText('box: rect 100x100 fill #3B82F6\n');
    expect(model.objects[0].fill).toBe('#3B82F6');
  });

  it('parses fill with HSL', () => {
    const { model } = buildAstFromText('box: rect 100x100 fill hsl 210 70 45\n');
    expect(model.objects[0].fill).toEqual({ h: 210, s: 70, l: 45 });
  });

  it('parses fill with HSL and alpha', () => {
    const { model } = buildAstFromText('box: rect 100x100 fill hsl 210 70 45 a=0.5\n');
    expect(model.objects[0].fill).toEqual({ h: 210, s: 70, l: 45, a: 0.5 });
  });

  it('parses fill with RGB', () => {
    const { model } = buildAstFromText('box: rect 100x100 fill rgb 255 128 0\n');
    expect(model.objects[0].fill).toEqual({ r: 255, g: 128, b: 0 });
  });

  it('parses fill with RGB and alpha', () => {
    const { model } = buildAstFromText('box: rect 100x100 fill rgb 255 128 0 a=0.3\n');
    expect(model.objects[0].fill).toEqual({ r: 255, g: 128, b: 0, a: 0.3 });
  });

  it('parses fill with named-alpha', () => {
    const { model } = buildAstFromText('box: rect 100x100 fill cornflowerblue a=0.5\n');
    expect(model.objects[0].fill).toEqual({ name: 'cornflowerblue', a: 0.5 });
  });

  it('parses fill with hex-alpha', () => {
    const { model } = buildAstFromText('box: rect 100x100 fill #ff0000 a=0.7\n');
    expect(model.objects[0].fill).toEqual({ hex: '#ff0000', a: 0.7 });
  });

  it('parses stroke with color and width', () => {
    const { model } = buildAstFromText('box: rect 100x100 stroke blue width=2\n');
    expect(model.objects[0].stroke.color).toBe('blue');
    expect(model.objects[0].stroke.width).toBe(2);
  });

  it('parses stroke with HSL color and alpha and width', () => {
    const { model } = buildAstFromText('box: rect 100x100 stroke hsl 0 0 60 a=0.5 width=3\n');
    expect(model.objects[0].stroke.color).toEqual({ h: 0, s: 0, l: 60, a: 0.5 });
    expect(model.objects[0].stroke.width).toBe(3);
  });

  it('parses transform with x,y', () => {
    const { model } = buildAstFromText('box: rect 100x100 at 50,75\n');
    expect(model.objects[0].transform.x).toBe(50);
    expect(model.objects[0].transform.y).toBe(75);
  });

  it('parses transform with only x', () => {
    const { model } = buildAstFromText('box: rect 100x100 at x=50\n');
    expect(model.objects[0].transform.x).toBe(50);
    expect(model.objects[0].transform.y).toBeUndefined();
  });

  it('parses transform with only y', () => {
    const { model } = buildAstFromText('box: rect 100x100 at y=-20\n');
    expect(model.objects[0].transform.y).toBe(-20);
    expect(model.objects[0].transform.x).toBeUndefined();
  });

  it('parses transform with rotation and scale', () => {
    const { model } = buildAstFromText('box: rect 100x100 at 100,200 rotation=45 scale=2\n');
    expect(model.objects[0].transform).toEqual({ x: 100, y: 200, rotation: 45, scale: 2 });
  });

  it('parses transform extras only (no at keyword)', () => {
    const { model } = buildAstFromText('box: rect 100x100 rotation=45\n');
    expect(model.objects[0].transform).toEqual({ rotation: 45 });
  });

  it('parses transform with anchor', () => {
    const { model } = buildAstFromText('box: rect 100x100 at 100,200 anchor=N\n');
    expect(model.objects[0].transform.anchor).toBe('N');
  });

  it('parses style reference with @', () => {
    const { model } = buildAstFromText('box: rect 100x100 @primary\n');
    expect(model.objects[0].style).toBe('primary');
  });

  it('parses opacity', () => {
    const { model } = buildAstFromText('box: rect 100x100 opacity=0.5\n');
    expect(model.objects[0].opacity).toBe(0.5);
  });

  it('parses visible=false', () => {
    const { model } = buildAstFromText('box: rect 100x100 visible=false\n');
    expect(model.objects[0].visible).toBe(false);
  });

  it('parses depth', () => {
    const { model } = buildAstFromText('box: rect 100x100 depth=3\n');
    expect(model.objects[0].depth).toBe(3);
  });

  it('parses empty node', () => {
    const { model } = buildAstFromText('empty:\n');
    expect(model.objects[0].id).toBe('empty');
  });
});

// ─── Geometry Types ──────────────────────────────────────────────

describe('astParser - geometry types', () => {
  it('parses rect with dimensions', () => {
    const { model } = buildAstFromText('box: rect 160x100\n');
    expect(model.objects[0].rect).toEqual({ w: 160, h: 100 });
  });

  it('parses rect with radius', () => {
    const { model } = buildAstFromText('box: rect 160x100 radius=8\n');
    expect(model.objects[0].rect).toEqual({ w: 160, h: 100, radius: 8 });
  });

  it('parses ellipse with diameter -> radius conversion', () => {
    const { model } = buildAstFromText('dot: ellipse 8x8\n');
    expect(model.objects[0].ellipse).toEqual({ rx: 4, ry: 4 });
  });

  it('parses text with content', () => {
    const { model } = buildAstFromText('title: text "Hello"\n');
    expect(model.objects[0].text).toEqual({ content: 'Hello' });
  });

  it('parses text with size and bold', () => {
    const { model } = buildAstFromText('title: text "Hello" size=14 bold\n');
    expect(model.objects[0].text).toEqual({ content: 'Hello', size: 14, bold: true });
  });

  it('parses text with mono', () => {
    const { model } = buildAstFromText('code: text "const x = 1" mono\n');
    expect(model.objects[0].text).toEqual({ content: 'const x = 1', mono: true });
  });

  it('parses text with lineHeight and align', () => {
    const { model } = buildAstFromText('label: text "Hi" lineHeight=1.5 align=middle\n');
    expect(model.objects[0].text).toEqual({ content: 'Hi', lineHeight: 1.5, align: 'middle' });
  });

  it('parses image with src and dimensions', () => {
    const { model } = buildAstFromText('pic: image "photo.png" 200x150\n');
    expect(model.objects[0].image).toEqual({ src: 'photo.png', w: 200, h: 150 });
  });

  it('parses image with fit', () => {
    const { model } = buildAstFromText('pic: image "photo.png" 200x150 fit=cover\n');
    expect(model.objects[0].image).toEqual({ src: 'photo.png', w: 200, h: 150, fit: 'cover' });
  });

  it('parses camera', () => {
    const { model } = buildAstFromText('cam: camera look=all zoom=1.5 active\n');
    expect(model.objects[0].camera).toEqual({ look: 'all', zoom: 1.5, active: true });
  });

  it('parses camera zoom only', () => {
    const { model } = buildAstFromText('cam: camera zoom=2\n');
    expect(model.objects[0].camera).toEqual({ zoom: 2 });
  });
});

// ─── Connections ─────────────────────────────────────────────────

describe('astParser - connections', () => {
  it('parses simple connection', () => {
    const { model } = buildAstFromText('link: a -> b\n');
    expect(model.objects[0].path.route).toEqual(['a', 'b']);
  });

  it('parses connection with waypoints', () => {
    const { model } = buildAstFromText('link: a -> (250,100) -> b smooth radius=15\n');
    expect(model.objects[0].path.route).toEqual(['a', [250, 100], 'b']);
    expect(model.objects[0].path.smooth).toBe(true);
    expect(model.objects[0].path.radius).toBe(15);
  });

  it('parses connection with stroke', () => {
    const { model } = buildAstFromText('link: a -> b stroke hsl 0 0 60 width=2\n');
    expect(model.objects[0].path.route).toEqual(['a', 'b']);
    expect(model.objects[0].stroke.color).toEqual({ h: 0, s: 0, l: 60 });
    expect(model.objects[0].stroke.width).toBe(2);
  });

  it('parses connection with all path modifiers', () => {
    const { model } = buildAstFromText('link: a -> b smooth closed bend=0.5 radius=10 gap=5 fromGap=3 toGap=4 drawProgress=0.7\n');
    expect(model.objects[0].path.smooth).toBe(true);
    expect(model.objects[0].path.closed).toBe(true);
    expect(model.objects[0].path.bend).toBe(0.5);
    expect(model.objects[0].path.radius).toBe(10);
    expect(model.objects[0].path.gap).toBe(5);
    expect(model.objects[0].path.fromGap).toBe(3);
    expect(model.objects[0].path.toGap).toBe(4);
    expect(model.objects[0].path.drawProgress).toBe(0.7);
  });
});

// ─── Explicit Paths ──────────────────────────────────────────────

describe('astParser - explicit paths', () => {
  it('parses explicit path with points', () => {
    const { model } = buildAstFromText('tri: path (0,-40) (40,30) (-40,30) closed\n');
    expect(model.objects[0].path.points).toEqual([[0, -40], [40, 30], [-40, 30]]);
    expect(model.objects[0].path.closed).toBe(true);
  });

  it('parses explicit path with fill', () => {
    const { model } = buildAstFromText('tri: path (0,-40) (40,30) (-40,30) closed fill hsl 280 60 45\n');
    expect(model.objects[0].path.points).toEqual([[0, -40], [40, 30], [-40, 30]]);
    expect(model.objects[0].path.closed).toBe(true);
    expect(model.objects[0].fill).toEqual({ h: 280, s: 60, l: 45 });
  });
});

// ─── Children and Block Mode ─────────────────────────────────────

describe('astParser - children and block mode', () => {
  it('parses block node with indented properties', () => {
    const text = 'box: rect 140x80\n  fill red\n  stroke blue width=2\n';
    const { model, formatHints } = buildAstFromText(text);
    expect(model.objects[0].fill).toBe('red');
    expect(model.objects[0].stroke.color).toBe('blue');
    expect(model.objects[0].stroke.width).toBe(2);
    expect(formatHints.nodes['box']?.display).toBe('block');
  });

  it('parses children with deeper indentation', () => {
    const text = 'parent: rect 200x200\n  child: rect 50x50\n';
    const { model } = buildAstFromText(text);
    expect(model.objects[0].children).toHaveLength(1);
    expect(model.objects[0].children[0].id).toBe('child');
    expect(model.objects[0].children[0].rect).toEqual({ w: 50, h: 50 });
  });

  it('parses nested children', () => {
    const text = 'outer: rect 200x200\n  inner: rect 100x100\n    deep: ellipse 10x10\n';
    const { model } = buildAstFromText(text);
    expect(model.objects[0].children[0].id).toBe('inner');
    expect(model.objects[0].children[0].children[0].id).toBe('deep');
    expect(model.objects[0].children[0].children[0].ellipse).toEqual({ rx: 5, ry: 5 });
  });

  it('parses block properties (dash)', () => {
    const text = 'box: rect 100x100\n  dash dashed length=10 gap=5\n';
    const { model } = buildAstFromText(text);
    expect(model.objects[0].dash).toEqual({ pattern: 'dashed', length: 10, gap: 5 });
  });

  it('parses block properties (layout)', () => {
    const text = 'box: rect 300x200\n  layout flex row gap=10\n';
    const { model } = buildAstFromText(text);
    expect(model.objects[0].layout).toEqual({ type: 'flex', direction: 'row', gap: 10 });
  });

  it('detects inline format', () => {
    const text = 'box: rect 100x100 fill red\n';
    const { formatHints } = buildAstFromText(text);
    expect(formatHints.nodes['box']?.display).toBe('inline');
  });

  it('detects block format', () => {
    const text = 'box: rect 100x100\n  fill red\n';
    const { formatHints } = buildAstFromText(text);
    expect(formatHints.nodes['box']?.display).toBe('block');
  });

  it('mixes block props and child nodes', () => {
    const text = 'card: rect 200x150\n  fill blue\n  title: text "Hello"\n';
    const { model } = buildAstFromText(text);
    expect(model.objects[0].fill).toBe('blue');
    expect(model.objects[0].children).toHaveLength(1);
    expect(model.objects[0].children[0].id).toBe('title');
  });
});

// ─── Metadata ────────────────────────────────────────────────────

describe('astParser - metadata', () => {
  it('parses name', () => {
    const { model } = buildAstFromText('name "My Diagram"\n');
    expect(model.name).toBe('My Diagram');
  });

  it('parses description', () => {
    const { model } = buildAstFromText('description "A test"\n');
    expect(model.description).toBe('A test');
  });

  it('parses background', () => {
    const { model } = buildAstFromText('background "#1a1a2e"\n');
    expect(model.background).toBe('#1a1a2e');
  });

  it('parses viewport', () => {
    const { model } = buildAstFromText('viewport 600x400\n');
    expect(model.viewport).toEqual({ width: 600, height: 400 });
  });

  it('parses all metadata together', () => {
    const text = 'name "My Diagram"\ndescription "A test"\nbackground "#1a1a2e"\nviewport 600x400\n';
    const { model } = buildAstFromText(text);
    expect(model.name).toBe('My Diagram');
    expect(model.description).toBe('A test');
    expect(model.background).toBe('#1a1a2e');
    expect(model.viewport).toEqual({ width: 600, height: 400 });
  });
});

// ─── Images ──────────────────────────────────────────────────────

describe('astParser - images', () => {
  it('parses images block', () => {
    const text = 'images\n  photo: "https://example.com/photo.png"\n  logo: "logo.svg"\n';
    const { model } = buildAstFromText(text);
    expect(model.images).toEqual({
      photo: 'https://example.com/photo.png',
      logo: 'logo.svg',
    });
  });
});

// ─── Styles ──────────────────────────────────────────────────────

describe('astParser - styles', () => {
  it('parses a style block', () => {
    const text = 'style primary\n  fill hsl 210 70 45\n  stroke hsl 210 80 30 width=2\n';
    const { model } = buildAstFromText(text);
    expect(model.styles.primary.fill).toEqual({ h: 210, s: 70, l: 45 });
    expect(model.styles.primary.stroke).toEqual({ color: { h: 210, s: 80, l: 30 }, width: 2 });
  });

  it('parses multiple styles', () => {
    const text = 'style primary\n  fill hsl 210 70 45\n\nstyle danger\n  fill red\n';
    const { model } = buildAstFromText(text);
    expect(model.styles.primary.fill).toEqual({ h: 210, s: 70, l: 45 });
    expect(model.styles.danger.fill).toBe('red');
  });

  it('parses style with dash', () => {
    const text = 'style dashed\n  dash dashed length=10 gap=5\n';
    const { model } = buildAstFromText(text);
    expect(model.styles.dashed.dash).toEqual({ pattern: 'dashed', length: 10, gap: 5 });
  });

  it('parses style with key=value props', () => {
    const text = 'style custom\n  opacity=0.5\n';
    const { model } = buildAstFromText(text);
    expect(model.styles.custom.opacity).toBe(0.5);
  });
});

// ─── Animation ───────────────────────────────────────────────────

describe('astParser - animation', () => {
  it('parses animate header', () => {
    const { model } = buildAstFromText('animate 3s\n');
    expect(model.animate.duration).toBe(3);
  });

  it('parses animate with loop', () => {
    const { model } = buildAstFromText('animate 3s loop\n');
    expect(model.animate.duration).toBe(3);
    expect(model.animate.loop).toBe(true);
  });

  it('parses animate with autoKey', () => {
    const { model } = buildAstFromText('animate 3s autoKey\n');
    expect(model.animate.autoKey).toBe(true);
  });

  it('parses animate with easing', () => {
    const { model } = buildAstFromText('animate 3s easing=easeInOut\n');
    expect(model.animate.easing).toBe('easeInOut');
  });

  it('parses chapters', () => {
    const text = 'animate 5s\n  chapter "Intro" at 0\n  chapter "Middle" at 2.5\n';
    const { model } = buildAstFromText(text);
    expect(model.animate.chapters).toEqual([
      { name: 'Intro', time: 0 },
      { name: 'Middle', time: 2.5 },
    ]);
  });

  it('parses flat keyframes', () => {
    const text = 'animate 3s\n  0  box.fill.h: 120\n  1.5  box.fill.h: 0\n';
    const { model } = buildAstFromText(text);
    expect(model.animate.keyframes).toHaveLength(2);
    expect(model.animate.keyframes[0]).toEqual({ time: 0, changes: { 'box.fill.h': 120 } });
    expect(model.animate.keyframes[1]).toEqual({ time: 1.5, changes: { 'box.fill.h': 0 } });
  });

  it('parses keyframe with per-change easing', () => {
    const text = 'animate 3s\n  1.5  box.fill.h: 0 easing=bounce\n';
    const { model } = buildAstFromText(text);
    expect(model.animate.keyframes[0].changes['box.fill.h']).toEqual({ value: 0, easing: 'bounce' });
  });

  it('parses effect (string value)', () => {
    const text = 'animate 3s\n  1.5  card pulse\n';
    const { model } = buildAstFromText(text);
    expect(model.animate.keyframes[0].changes['card']).toBe('pulse');
  });

  it('parses effect with params', () => {
    const text = 'animate 3s\n  1.5  card flash amplitude=2\n';
    const { model } = buildAstFromText(text);
    expect(model.animate.keyframes[0].changes['card']).toEqual({ effect: 'flash', amplitude: 2 });
  });

  it('parses multi-change keyframes with continuation', () => {
    const text = 'animate 3s\n  0  cam.camera.look: all\n    cam.camera.zoom: 1\n';
    const { model } = buildAstFromText(text);
    expect(model.animate.keyframes[0].changes['cam.camera.look']).toBe('all');
    expect(model.animate.keyframes[0].changes['cam.camera.zoom']).toBe(1);
  });

  it('parses relative time with +', () => {
    const text = 'animate 3s\n  +2  box.fill.h: 120\n';
    const { model } = buildAstFromText(text);
    expect(model.animate.keyframes[0].plus).toBe(2);
    expect(model.animate.keyframes[0].changes['box.fill.h']).toBe(120);
  });

  it('parses boolean keyframe values', () => {
    const text = 'animate 3s\n  0  box.visible: true\n  1  box.visible: false\n';
    const { model } = buildAstFromText(text);
    expect(model.animate.keyframes[0].changes['box.visible']).toBe(true);
    expect(model.animate.keyframes[1].changes['box.visible']).toBe(false);
  });

  it('parses array/tuple keyframe values', () => {
    const text = 'animate 3s\n  0  box.transform.anchor: (0.5,-0.5)\n';
    const { model } = buildAstFromText(text);
    expect(model.animate.keyframes[0].changes['box.transform.anchor']).toEqual([0.5, -0.5]);
  });

  it('parses color keyframe values', () => {
    const text = 'animate 3s\n  0  box.fill: blue\n  2  box.fill: hsl 210 70 45\n';
    const { model } = buildAstFromText(text);
    expect(model.animate.keyframes[0].changes['box.fill']).toBe('blue');
    expect(model.animate.keyframes[1].changes['box.fill']).toEqual({ h: 210, s: 70, l: 45 });
  });

  it('parses keyframe-level easing', () => {
    const text = 'animate 3s\n  1.5  box.fill.h: 0 easing=easeOut\n';
    const { model } = buildAstFromText(text);
    // Per-change easing vs keyframe-level easing:
    // When there's only a colon path, the easing is per-change
    expect(model.animate.keyframes[0].changes['box.fill.h']).toEqual({ value: 0, easing: 'easeOut' });
  });
});

// ─── Layout ──────────────────────────────────────────────────────

describe('astParser - layout', () => {
  it('parses inline layout hint (slot)', () => {
    const { model } = buildAstFromText('box: rect 100x100 layout slot=container\n');
    expect(model.objects[0].layout).toEqual({ slot: 'container' });
  });

  it('parses inline layout hint (grow)', () => {
    const { model } = buildAstFromText('box: rect 100x100 layout grow=1\n');
    expect(model.objects[0].layout).toEqual({ grow: 1 });
  });

  it('parses block layout', () => {
    const text = 'box: rect 300x200\n  layout flex row gap=10\n';
    const { model } = buildAstFromText(text);
    expect(model.objects[0].layout).toEqual({ type: 'flex', direction: 'row', gap: 10 });
  });
});

// ─── Multiple objects ────────────────────────────────────────────

describe('astParser - multiple objects', () => {
  it('parses multiple top-level objects', () => {
    const text = 'box: rect 100x100\ndot: ellipse 10x10\n';
    const { model } = buildAstFromText(text);
    expect(model.objects).toHaveLength(2);
    expect(model.objects[0].id).toBe('box');
    expect(model.objects[1].id).toBe('dot');
  });

  it('parses objects separated by blank lines', () => {
    const text = 'box: rect 100x100 fill red\n\ndot: ellipse 10x10 fill blue\n';
    const { model } = buildAstFromText(text);
    expect(model.objects).toHaveLength(2);
    expect(model.objects[0].fill).toBe('red');
    expect(model.objects[1].fill).toBe('blue');
  });
});

// ─── Complete Scene ──────────────────────────────────────────────

describe('astParser - complete scene', () => {
  it('parses a complete scene with all sections', () => {
    const text = [
      'name "Full Scene"',
      'viewport 800x600',
      'background "#000"',
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
      '',
    ].join('\n');

    const { model } = buildAstFromText(text);

    // Metadata
    expect(model.name).toBe('Full Scene');
    expect(model.viewport).toEqual({ width: 800, height: 600 });
    expect(model.background).toBe('#000');

    // Styles
    expect(model.styles.primary.fill).toEqual({ h: 210, s: 70, l: 45 });
    expect(model.styles.primary.stroke).toEqual({ color: { h: 210, s: 80, l: 30 }, width: 2 });

    // Objects
    expect(model.objects).toHaveLength(3);
    expect(model.objects[0].id).toBe('box');
    expect(model.objects[0].style).toBe('primary');
    expect(model.objects[0].transform).toEqual({ x: 200, y: 150 });
    expect(model.objects[0].children[0].text.content).toBe('Hi');
    expect(model.objects[1].fill).toBe('white');
    expect(model.objects[2].path.route).toEqual(['box', 'dot']);

    // Animation
    expect(model.animate.duration).toBe(3);
    expect(model.animate.loop).toBe(true);
    expect(model.animate.keyframes).toHaveLength(3);
    expect(model.animate.chapters).toHaveLength(2);
  });
});

// ─── AST Structure ──────────────────────────────────────────────

describe('astParser - AST structure', () => {
  it('AST has document root', () => {
    const { ast } = buildAstFromText('box: rect 100x100\n');
    expect(ast.dslRole).toBe('document');
  });

  it('AST has section children', () => {
    const { ast } = buildAstFromText('box: rect 100x100\n');
    const objectsSection = ast.children.find(c => c.schemaPath === 'objects');
    expect(objectsSection).toBeDefined();
    expect(objectsSection!.dslRole).toBe('section');
  });

  it('AST has compound node for each object', () => {
    const { ast } = buildAstFromText('box: rect 100x100\n');
    const objectsSection = ast.children.find(c => c.schemaPath === 'objects');
    expect(objectsSection!.children.length).toBeGreaterThan(0);
    expect(objectsSection!.children[0].dslRole).toBe('compound');
    expect(objectsSection!.children[0].modelPath).toBe('objects.box');
  });

  it('parent references are consistent', () => {
    const { ast } = buildAstFromText('box: rect 100x100 fill red\n');
    function checkParents(node: typeof ast) {
      for (const child of node.children) {
        expect(child.parent).toBe(node);
        checkParents(child);
      }
    }
    checkParents(ast);
  });

  it('nodeAt finds values inside the text', () => {
    const text = 'box: rect 140x80\n';
    const { ast } = buildAstFromText(text);
    // Find something inside the AST
    const leaves = flattenLeaves(ast);
    // At least we should have some leaves
    expect(leaves.length).toBeGreaterThan(0);
    // The value "box" should be findable
    const boxNode = leaves.find(n => n.value === 'box');
    expect(boxNode).toBeDefined();
    expect(text.slice(boxNode!.from, boxNode!.to)).toBe('box');
  });
});

// ─── Inline Compound Nodes ───────────────────────────────────────

describe('astParser - inline compound nodes', () => {
  it('wraps stroke in a compound AST node', () => {
    const { ast } = buildAstFromText('box: rect 100x100 stroke red\n');
    const objectsSection = ast.children.find(c => c.schemaPath === 'objects');
    const nodeCompound = objectsSection!.children[0];
    const strokeCompound = nodeCompound.children.find(
      c => c.dslRole === 'compound' && c.schemaPath === 'stroke'
    );
    expect(strokeCompound).toBeDefined();
    expect(strokeCompound!.modelPath).toBe('objects.box.stroke');
    // Should have keyword child
    const kwChild = strokeCompound!.children.find(c => c.dslRole === 'keyword' && c.value === 'stroke');
    expect(kwChild).toBeDefined();
    // Should have value child for color
    const valChild = strokeCompound!.children.find(c => c.dslRole === 'value');
    expect(valChild).toBeDefined();
  });

  it('wraps fill in a compound AST node', () => {
    const { ast } = buildAstFromText('box: rect 100x100 fill blue\n');
    const objectsSection = ast.children.find(c => c.schemaPath === 'objects');
    const nodeCompound = objectsSection!.children[0];
    const fillCompound = nodeCompound.children.find(
      c => c.dslRole === 'compound' && c.schemaPath === 'fill'
    );
    expect(fillCompound).toBeDefined();
    expect(fillCompound!.modelPath).toBe('objects.box.fill');
  });

  it('wraps at/transform in a compound AST node', () => {
    const { ast } = buildAstFromText('box: rect 100x100 at 50,75\n');
    const objectsSection = ast.children.find(c => c.schemaPath === 'objects');
    const nodeCompound = objectsSection!.children[0];
    const transformCompound = nodeCompound.children.find(
      c => c.dslRole === 'compound' && c.schemaPath === 'transform'
    );
    expect(transformCompound).toBeDefined();
    expect(transformCompound!.modelPath).toBe('objects.box.transform');
    const kwChild = transformCompound!.children.find(c => c.dslRole === 'keyword' && c.value === 'at');
    expect(kwChild).toBeDefined();
  });

  it('wraps stroke with width in a compound AST node', () => {
    const { ast } = buildAstFromText('box: rect 100x100 stroke red width=2\n');
    const objectsSection = ast.children.find(c => c.schemaPath === 'objects');
    const nodeCompound = objectsSection!.children[0];
    const strokeCompound = nodeCompound.children.find(
      c => c.dslRole === 'compound' && c.schemaPath === 'stroke'
    );
    expect(strokeCompound).toBeDefined();
    // width kwarg should be inside the stroke compound
    const widthKey = strokeCompound!.children.find(c => c.dslRole === 'kwarg-key' && c.value === 'width');
    expect(widthKey).toBeDefined();
  });

  it('wraps dash in a compound AST node in block mode', () => {
    const { ast } = buildAstFromText('box: rect 100x100\n  dash dashed length=10\n');
    const objectsSection = ast.children.find(c => c.schemaPath === 'objects');
    const nodeCompound = objectsSection!.children[0];
    const dashCompound = nodeCompound.children.find(
      c => c.dslRole === 'compound' && c.schemaPath === 'dash'
    );
    expect(dashCompound).toBeDefined();
    expect(dashCompound!.modelPath).toBe('objects.box.dash');
  });

  it('parent references remain consistent with compounds', () => {
    const { ast } = buildAstFromText('box: rect 100x100 fill red stroke blue width=2 at 50,75\n');
    function checkParents(node: typeof ast) {
      for (const child of node.children) {
        expect(child.parent).toBe(node);
        checkParents(child);
      }
    }
    checkParents(ast);
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────

describe('astParser - edge cases', () => {
  it('handles empty input', () => {
    const { model } = buildAstFromText('');
    expect(model.objects).toEqual([]);
  });

  it('handles whitespace-only input', () => {
    const { model } = buildAstFromText('\n\n\n');
    expect(model.objects).toEqual([]);
  });

  it('handles comments', () => {
    const text = '// This is a comment\nbox: rect 100x100\n';
    const { model } = buildAstFromText(text);
    expect(model.objects).toHaveLength(1);
    expect(model.objects[0].id).toBe('box');
  });

  it('skips blank lines between objects', () => {
    const text = 'a: rect 50x50\n\n\nb: rect 50x50\n';
    const { model } = buildAstFromText(text);
    expect(model.objects).toHaveLength(2);
  });
});
