import { describe, it, expect } from 'vitest';
import { computeViewBox, lerpViewBox, type ViewBox } from '../../renderer/camera';
import { createNode } from '../../types/node';

const defaultVB: ViewBox = { x: 0, y: 0, w: 800, h: 600 };

describe('computeViewBox', () => {
  it('returns default when no camera', () => {
    expect(computeViewBox(undefined, [], defaultVB)).toEqual(defaultVB);
  });

  it('zooms around center', () => {
    const cam = createNode({
      id: 'cam',
      camera: { zoom: 2 },
    });
    const vb = computeViewBox(cam, [], defaultVB);
    expect(vb.w).toBe(400);
    expect(vb.h).toBe(300);
  });

  it('targets a specific node', () => {
    const target = createNode({ id: 'box', transform: { x: 200, y: 150 } });
    const cam = createNode({
      id: 'cam',
      camera: { target: 'box', zoom: 1 },
    });
    const vb = computeViewBox(cam, [target], defaultVB);
    expect(vb.x).toBe(200 - 400);
    expect(vb.y).toBe(150 - 300);
  });

  it('fits to multiple objects', () => {
    const a = createNode({ id: 'a', transform: { x: 0, y: 0 }, rect: { w: 50, h: 50 } });
    const b = createNode({ id: 'b', transform: { x: 200, y: 200 }, rect: { w: 50, h: 50 } });
    const cam = createNode({
      id: 'cam',
      camera: { fit: ['a', 'b'], zoom: 1 },
    });
    const vb = computeViewBox(cam, [a, b], defaultVB);
    // Should encompass both nodes
    expect(vb.x).toBeLessThan(0);
    expect(vb.w).toBeGreaterThan(200);
  });
});

describe('lerpViewBox', () => {
  it('interpolates between two viewboxes', () => {
    const a: ViewBox = { x: 0, y: 0, w: 100, h: 100 };
    const b: ViewBox = { x: 100, y: 100, w: 200, h: 200 };
    const mid = lerpViewBox(a, b, 0.5);
    expect(mid).toEqual({ x: 50, y: 50, w: 150, h: 150 });
  });

  it('returns a at t=0', () => {
    const a: ViewBox = { x: 10, y: 20, w: 30, h: 40 };
    const b: ViewBox = { x: 50, y: 60, w: 70, h: 80 };
    expect(lerpViewBox(a, b, 0)).toEqual(a);
  });

  it('returns b at t=1', () => {
    const a: ViewBox = { x: 10, y: 20, w: 30, h: 40 };
    const b: ViewBox = { x: 50, y: 60, w: 70, h: 80 };
    expect(lerpViewBox(a, b, 1)).toEqual(b);
  });
});
