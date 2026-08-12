import { describe, it, expect } from 'vitest';
import { geometryToSvg, computeSceneWorldBounds } from '../../renderer/geometry';
import type { Node } from '../../types/node';
import { createNode } from '../../types/node';

describe('geometryToSvg', () => {
  it('converts rect to SVG attrs', () => {
    const node = createNode({
      id: 'r',
      rect: { w: 100, h: 60, radius: 4 },
      fill: { h: 210, s: 80, l: 50 },
    });
    const result = geometryToSvg(node);
    expect(result).not.toBeNull();
    expect(result!.tag).toBe('rect');
    expect(result!.attrs.width).toBe(100);
    expect(result!.attrs.height).toBe(60);
    expect(result!.attrs.rx).toBe(4);
    // colorToCSS now converts through RGBA
    expect(result!.attrs.fill).toMatch(/^rgba?\(/);
  });

  it('converts ellipse to SVG attrs', () => {
    const node = createNode({
      id: 'e',
      ellipse: { rx: 30, ry: 20 },
    });
    const result = geometryToSvg(node);
    expect(result!.tag).toBe('ellipse');
    expect(result!.attrs.rx).toBe(30);
    expect(result!.attrs.ry).toBe(20);
  });

  it('converts text to SVG attrs', () => {
    const node = createNode({
      id: 't',
      text: { content: 'Hello', size: 16, bold: true },
    });
    const result = geometryToSvg(node);
    expect(result!.tag).toBe('text');
    expect(result!.attrs['font-size']).toBe(16);
    expect(result!.attrs['font-weight']).toBe('bold');
  });

  it('converts path with points to SVG', () => {
    const node = createNode({
      id: 'p',
      path: { points: [[0,0], [100,100], [200,0]], closed: true },
      stroke: { color: { h: 0, s: 0, l: 60 }, width: 2 },
    });
    const result = geometryToSvg(node);
    expect(result!.tag).toBe('path');
    expect(result!.attrs.d).toContain('M0,0');
    expect(result!.attrs.d).toContain('Z');
  });

  it('converts image to SVG attrs', () => {
    const node = createNode({
      id: 'img',
      image: { src: 'test.png', w: 100, h: 80, fit: 'cover' },
    });
    const result = geometryToSvg(node);
    expect(result!.tag).toBe('image');
    expect(result!.attrs.href).toBe('test.png');
    expect(result!.attrs.preserveAspectRatio).toBe('xMidYMid slice');
  });

  it('returns null for node without geometry', () => {
    const node = createNode({ id: 'empty' });
    expect(geometryToSvg(node)).toBeNull();
  });

  it('inherits fill from parent', () => {
    const node = createNode({
      id: 'r',
      rect: { w: 50, h: 50 },
    });
    const parentFill = { h: 120, s: 50, l: 40 };
    const result = geometryToSvg(node, parentFill);
    expect(result!.attrs.fill).toMatch(/^rgba?\(/);
  });

  it('own fill overrides parent fill', () => {
    const node = createNode({
      id: 'r',
      rect: { w: 50, h: 50 },
      fill: { h: 0, s: 100, l: 50 },
    });
    const parentFill = { h: 120, s: 50, l: 40 };
    const result = geometryToSvg(node, parentFill);
    // Own fill (red) overrides parent fill
    expect(result!.attrs.fill).toContain('255');
    expect(result!.attrs.fill).toMatch(/^rgba?\(/);
  });
});

/**
 * Auto-fit framed every text node as if it were centred, whatever its
 * `align`. The renderer meanwhile anchors it with SVG text-anchor, so a
 * left-aligned label grew right while the frame grew left — the label ran
 * off one edge and the other edge gained a margin of empty canvas the
 * width of the text. It got worse the longer the label, which is why the
 * lesson captions and the easing-comparison legend were the ones clipped.
 */
describe('text bounds respect alignment', () => {
  const measured = (align: 'start' | 'middle' | 'end') => ({
    id: 't',
    text: { content: 'a label', size: 10, align },
    _measured: { width: 100, height: 10 },
    transform: { x: 200, y: 50 },
    children: [],
  }) as unknown as Node;

  it('grows right from the anchor when align=start', () => {
    const b = computeSceneWorldBounds([measured('start')])!;
    expect([b.minX, b.maxX]).toEqual([200, 300]);
  });

  it('grows left from the anchor when align=end', () => {
    const b = computeSceneWorldBounds([measured('end')])!;
    expect([b.minX, b.maxX]).toEqual([100, 200]);
  });

  it('straddles the anchor when align=middle', () => {
    const b = computeSceneWorldBounds([measured('middle')])!;
    expect([b.minX, b.maxX]).toEqual([150, 250]);
  });

  it('leaves non-text geometry centred on its transform', () => {
    const rect = { id: 'r', rect: { w: 100, h: 20 }, transform: { x: 200, y: 50 }, children: [] } as unknown as Node;
    const b = computeSceneWorldBounds([rect])!;
    expect([b.minX, b.maxX]).toEqual([150, 250]);
  });
});

describe('route waypoints count toward the scene bounds', () => {
  const scene = (route: unknown[]) => ([
    { id: 'a', rect: { w: 40, h: 20 }, transform: { x: 100, y: 100 }, children: [] },
    { id: 'b', rect: { w: 40, h: 20 }, transform: { x: 300, y: 100 }, children: [] },
    { id: 'c', children: [{ id: 'c.route', path: { route }, children: [] }] },
  ] as unknown as Node[]);

  it('includes a waypoint that routes outside the nodes', () => {
    // Without this the auto-fit frame stops at the nodes and the detour
    // renders clipped — visible as a connection with its middle missing.
    const b = computeSceneWorldBounds(scene(['a', [200, 260], 'b']))!;
    expect(b.maxY).toBe(260);
  });

  it('ignores waypoints that name a node', () => {
    const b = computeSceneWorldBounds(scene(['a', 'b']))!;
    expect(b.maxY).toBe(110);
  });
});
