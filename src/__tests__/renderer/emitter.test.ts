import { describe, it, expect } from 'vitest';
import { emitFrame } from '../../renderer/emitter';
import { createNode } from '../../types/node';
import type { RenderBackend, RgbaColor, StrokeStyle, RendererInfo } from '../../renderer/backend';

/** Mock backend that records all calls */
function createMockBackend() {
  const calls: Array<{ method: string; args: any[] }> = [];

  const backend: RenderBackend = {
    info: { name: 'mock', supports2D: true, supports3D: false, supportsInteraction: false },
    mount: () => {},
    destroy: () => {},
    beginFrame: () => calls.push({ method: 'beginFrame', args: [] }),
    endFrame: () => calls.push({ method: 'endFrame', args: [] }),
    setViewBox: (x, y, w, h) => calls.push({ method: 'setViewBox', args: [x, y, w, h] }),
    clearViewBox: () => calls.push({ method: 'clearViewBox', args: [] }),
    setBackground: (color) => calls.push({ method: 'setBackground', args: [color] }),
    pushTransform: (x, y, r, s) => calls.push({ method: 'pushTransform', args: [x, y, r, s] }),
    popTransform: () => calls.push({ method: 'popTransform', args: [] }),
    pushOpacity: (o) => calls.push({ method: 'pushOpacity', args: [o] }),
    popOpacity: () => calls.push({ method: 'popOpacity', args: [] }),
    drawRect: (w, h, radius, fill, stroke) => calls.push({ method: 'drawRect', args: [w, h, radius, fill, stroke] }),
    drawEllipse: (rx, ry, fill, stroke) => calls.push({ method: 'drawEllipse', args: [rx, ry, fill, stroke] }),
    drawText: (content, size, fill, align, bold, mono) => calls.push({ method: 'drawText', args: [content, size, fill, align, bold, mono] }),
    drawPath: (segments, fill, stroke, progress) => calls.push({ method: 'drawPath', args: [segments, fill, stroke, progress] }),
    drawImage: (src, w, h, fit) => calls.push({ method: 'drawImage', args: [src, w, h, fit] }),
  };

  return { backend, calls };
}

describe('emitFrame', () => {
  it('emits beginFrame and endFrame', () => {
    const { backend, calls } = createMockBackend();
    emitFrame(backend, [], []);
    expect(calls[0].method).toBe('beginFrame');
    expect(calls[calls.length - 1].method).toBe('endFrame');
  });

  it('calls setViewBox when viewBox is provided', () => {
    const { backend, calls } = createMockBackend();
    emitFrame(backend, [], [], { x: 0, y: 0, w: 800, h: 600 });
    const svbCall = calls.find(c => c.method === 'setViewBox');
    expect(svbCall).toBeDefined();
    expect(svbCall!.args).toEqual([0, 0, 800, 600]);
  });

  it('calls clearViewBox when no viewBox', () => {
    const { backend, calls } = createMockBackend();
    emitFrame(backend, [], []);
    expect(calls.find(c => c.method === 'clearViewBox')).toBeDefined();
  });

  it('emits drawRect for a rect node', () => {
    const { backend, calls } = createMockBackend();
    const node = createNode({
      id: 'box',
      rect: { w: 100, h: 60, radius: 4 },
      fill: { h: 0, s: 100, l: 50 },
      transform: { x: 50, y: 50 },
    });
    emitFrame(backend, [node], [node]);
    const drawCall = calls.find(c => c.method === 'drawRect');
    expect(drawCall).toBeDefined();
    expect(drawCall!.args[0]).toBe(100); // w
    expect(drawCall!.args[1]).toBe(60);  // h
    expect(drawCall!.args[2]).toBe(4);   // radius
    expect(drawCall!.args[3]).not.toBeNull(); // fill
  });

  it('emits drawEllipse for an ellipse node', () => {
    const { backend, calls } = createMockBackend();
    const node = createNode({ id: 'e', ellipse: { rx: 30, ry: 20 } });
    emitFrame(backend, [node], [node]);
    const drawCall = calls.find(c => c.method === 'drawEllipse');
    expect(drawCall).toBeDefined();
    expect(drawCall!.args[0]).toBe(30);
    expect(drawCall!.args[1]).toBe(20);
  });

  it('emits drawText for a text node', () => {
    const { backend, calls } = createMockBackend();
    const node = createNode({
      id: 't',
      text: { content: 'Hello', size: 14, bold: true },
      fill: { h: 0, s: 0, l: 90 },
    });
    emitFrame(backend, [node], [node]);
    const drawCall = calls.find(c => c.method === 'drawText');
    expect(drawCall).toBeDefined();
    expect(drawCall!.args[0]).toBe('Hello');
    expect(drawCall!.args[1]).toBe(14);
    expect(drawCall!.args[4]).toBe(true); // bold
  });

  it('emits drawPath for a path node with points', () => {
    const { backend, calls } = createMockBackend();
    const node = createNode({
      id: 'p',
      path: { points: [[0,0],[100,100]], closed: false },
      stroke: { color: { h: 0, s: 0, l: 60 }, width: 2 },
    });
    emitFrame(backend, [node], [node]);
    const drawCall = calls.find(c => c.method === 'drawPath');
    expect(drawCall).toBeDefined();
    // args[0] is PathSegment[] — check it has moveTo and lineTo
    const segments = drawCall!.args[0] as any[];
    expect(segments[0].type).toBe('moveTo');
    expect(segments[1].type).toBe('lineTo');
    expect(segments[1].x).toBe(100);
    expect(segments[1].y).toBe(100);
  });

  it('emits drawImage for an image node', () => {
    const { backend, calls } = createMockBackend();
    const node = createNode({
      id: 'img',
      image: { src: 'test.png', w: 100, h: 80 },
    });
    emitFrame(backend, [node], [node]);
    const drawCall = calls.find(c => c.method === 'drawImage');
    expect(drawCall).toBeDefined();
    expect(drawCall!.args[0]).toBe('test.png');
  });

  it('wraps nodes in pushTransform/popTransform', () => {
    const { backend, calls } = createMockBackend();
    const node = createNode({
      id: 'n',
      transform: { x: 100, y: 50, rotation: 45, scale: 2 },
      rect: { w: 10, h: 10 },
    });
    emitFrame(backend, [node], [node]);
    const pushCall = calls.find(c => c.method === 'pushTransform');
    expect(pushCall).toBeDefined();
    expect(pushCall!.args).toEqual([100, 50, 45, 2]);
    const popIdx = calls.findIndex(c => c.method === 'popTransform');
    expect(popIdx).toBeGreaterThan(0);
  });

  it('wraps nodes in pushOpacity/popOpacity', () => {
    const { backend, calls } = createMockBackend();
    const node = createNode({ id: 'n', opacity: 0.5, rect: { w: 10, h: 10 } });
    emitFrame(backend, [node], [node]);
    const pushCall = calls.find(c => c.method === 'pushOpacity');
    expect(pushCall).toBeDefined();
    expect(pushCall!.args[0]).toBe(0.5);
  });

  it('skips invisible nodes', () => {
    const { backend, calls } = createMockBackend();
    const node = createNode({ id: 'hidden', visible: false, rect: { w: 10, h: 10 } });
    emitFrame(backend, [node], [node]);
    expect(calls.find(c => c.method === 'drawRect')).toBeUndefined();
  });

  it('skips camera nodes', () => {
    const { backend, calls } = createMockBackend();
    const cam = createNode({ id: 'cam', camera: { zoom: 1.5 } });
    const box = createNode({ id: 'box', rect: { w: 10, h: 10 } });
    emitFrame(backend, [cam, box], [cam, box]);
    expect(calls.find(c => c.method === 'drawRect')).toBeDefined();
    // Camera should not emit any draw calls
    const pushCount = calls.filter(c => c.method === 'pushTransform').length;
    expect(pushCount).toBe(1); // only the box
  });

  it('emits children in depth order', () => {
    const { backend, calls } = createMockBackend();
    const node = createNode({
      id: 'parent',
      children: [
        createNode({ id: 'back', depth: 0, rect: { w: 10, h: 10 }, fill: { h: 0, s: 100, l: 50 } }),
        createNode({ id: 'front', depth: 10, rect: { w: 20, h: 20 }, fill: { h: 120, s: 100, l: 50 } }),
        createNode({ id: 'mid', depth: 5, rect: { w: 15, h: 15 }, fill: { h: 60, s: 100, l: 50 } }),
      ],
    });
    emitFrame(backend, [node], [node]);
    const drawCalls = calls.filter(c => c.method === 'drawRect');
    expect(drawCalls).toHaveLength(3);
    expect(drawCalls[0].args[0]).toBe(10); // back (w=10)
    expect(drawCalls[1].args[0]).toBe(15); // mid (w=15)
    expect(drawCalls[2].args[0]).toBe(20); // front (w=20)
  });

  it('inherits fill from parent', () => {
    const { backend, calls } = createMockBackend();
    const node = createNode({
      id: 'parent',
      fill: { h: 210, s: 80, l: 50 },
      children: [
        createNode({ id: 'child', rect: { w: 50, h: 50 } }),
      ],
    });
    emitFrame(backend, [node], [node]);
    const drawCall = calls.find(c => c.method === 'drawRect');
    expect(drawCall).toBeDefined();
    expect(drawCall!.args[3]).not.toBeNull(); // fill inherited
    expect(drawCall!.args[3].r).toBeGreaterThan(0); // has color
  });

  it('converts HSL fill to RGBA with a=1.0', () => {
    const { backend, calls } = createMockBackend();
    const node = createNode({
      id: 'n',
      rect: { w: 10, h: 10 },
      fill: { h: 0, s: 100, l: 50 },
    });
    emitFrame(backend, [node], [node]);
    const drawCall = calls.find(c => c.method === 'drawRect');
    const fill = drawCall!.args[3] as RgbaColor;
    expect(fill.r).toBe(255);
    expect(fill.g).toBe(0);
    expect(fill.b).toBe(0);
    expect(fill.a).toBe(1.0);
  });

  it('includes dash in stroke style', () => {
    const { backend, calls } = createMockBackend();
    const node = createNode({
      id: 'p',
      path: { points: [[0,0],[100,0]], closed: false },
      stroke: { color: { h: 0, s: 0, l: 60 }, width: 2 },
      dash: { pattern: 'dashed', length: 8, gap: 4 },
    });
    emitFrame(backend, [node], [node]);
    const drawCall = calls.find(c => c.method === 'drawPath');
    const stroke = drawCall!.args[2] as StrokeStyle;
    expect(stroke.dash).toBeDefined();
    expect(stroke.dash!.length).toBe(8);
    expect(stroke.dash!.gap).toBe(4);
    expect(stroke.dash!.pattern).toBe('dashed');
  });

  it('resolves connection paths via route', () => {
    const { backend, calls } = createMockBackend();
    const a = createNode({ id: 'a', transform: { x: 0, y: 0 } });
    const b = createNode({ id: 'b', transform: { x: 200, y: 0 } });
    const conn = createNode({
      id: 'conn',
      path: { route: ['a', 'b'] },
      stroke: { color: { h: 0, s: 0, l: 60 }, width: 2 },
    });
    emitFrame(backend, [a, b, conn], [a, b, conn]);
    const drawCall = calls.find(c => c.method === 'drawPath');
    expect(drawCall).toBeDefined();
    const segments = drawCall!.args[0] as any[];
    expect(segments[0].type).toBe('moveTo');
    expect(segments.length).toBeGreaterThanOrEqual(2);
  });

  it('resolves connection paths via unified route', () => {
    const { backend, calls } = createMockBackend();
    const a = createNode({ id: 'a', transform: { x: 0, y: 0 } });
    const b = createNode({ id: 'b', transform: { x: 200, y: 0 } });
    const conn = createNode({
      id: 'conn',
      path: { route: ['a', 'b'] },
      stroke: { color: { h: 0, s: 0, l: 60 }, width: 2 },
    });
    emitFrame(backend, [a, b, conn], [a, b, conn]);
    const drawCall = calls.find(c => c.method === 'drawPath');
    expect(drawCall).toBeDefined();
    const segments = drawCall!.args[0] as any[];
    expect(segments[0].type).toBe('moveTo');
    expect(segments.length).toBeGreaterThanOrEqual(2);
  });
});
