import { describe, it, expect } from 'vitest';
import { geometryToSvg } from '../../renderer/geometry';
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
    expect(result!.attrs.fill).toBe('hsl(210, 80%, 50%)');
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
      stroke: { h: 0, s: 0, l: 60, width: 2 },
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
    expect(result!.attrs.fill).toBe('hsl(120, 50%, 40%)');
  });

  it('own fill overrides parent fill', () => {
    const node = createNode({
      id: 'r',
      rect: { w: 50, h: 50 },
      fill: { h: 0, s: 100, l: 50 },
    });
    const parentFill = { h: 120, s: 50, l: 40 };
    const result = geometryToSvg(node, parentFill);
    expect(result!.attrs.fill).toBe('hsl(0, 100%, 50%)');
  });
});
