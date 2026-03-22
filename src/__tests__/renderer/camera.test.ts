import { describe, it, expect } from 'vitest';
import { computeViewBox, findActiveCamera, type ViewBox } from '../../renderer/camera';
import { createNode } from '../../types/node';

const defaultVB: ViewBox = { x: 0, y: 0, w: 800, h: 600 };

describe('findActiveCamera', () => {
  it('returns undefined when no camera nodes', () => {
    const box = createNode({ id: 'box', rect: { w: 50, h: 50 } });
    expect(findActiveCamera([box])).toBeUndefined();
  });

  it('finds a camera node', () => {
    const cam = createNode({ id: 'cam', camera: { zoom: 1 } });
    const box = createNode({ id: 'box', rect: { w: 50, h: 50 } });
    expect(findActiveCamera([box, cam])?.id).toBe('cam');
  });

  it('returns first active camera when multiple exist', () => {
    const cam1 = createNode({ id: 'cam1', camera: { zoom: 1, active: true } });
    const cam2 = createNode({ id: 'cam2', camera: { zoom: 2, active: true } });
    expect(findActiveCamera([cam1, cam2])?.id).toBe('cam1');
  });

  it('skips inactive cameras', () => {
    const cam1 = createNode({ id: 'cam1', camera: { zoom: 1, active: false } });
    const cam2 = createNode({ id: 'cam2', camera: { zoom: 2 } });
    expect(findActiveCamera([cam1, cam2])?.id).toBe('cam2');
  });
});

describe('computeViewBox', () => {
  it('returns default when no camera', () => {
    expect(computeViewBox(undefined, defaultVB)).toEqual(defaultVB);
  });

  it('reads rect and transform from camera node', () => {
    const cam = createNode({
      id: 'cam',
      camera: { zoom: 1 },
      rect: { w: 400, h: 300 },
      transform: { x: 200, y: 150 },
    });
    const vb = computeViewBox(cam, defaultVB);
    expect(vb.x).toBe(0);    // 200 - 400/2
    expect(vb.y).toBe(0);    // 150 - 300/2
    expect(vb.w).toBe(400);
    expect(vb.h).toBe(300);
  });

  it('returns default when camera has no rect', () => {
    const cam = createNode({ id: 'cam', camera: { zoom: 1 } });
    expect(computeViewBox(cam, defaultVB)).toEqual(defaultVB);
  });

  it('includes rotation from transform', () => {
    const cam = createNode({
      id: 'cam',
      camera: { zoom: 1 },
      rect: { w: 800, h: 600 },
      transform: { x: 400, y: 300, rotation: 45 },
    });
    const vb = computeViewBox(cam, defaultVB);
    expect(vb.rotation).toBe(45);
  });
});
