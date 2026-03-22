import { describe, it, expect } from 'vitest';
import { resolveCameraView } from '../../animation/cameraExpansion';
import { createNode } from '../../types/node';

const DEFAULT_VB = { x: 0, y: 0, w: 800, h: 600 };

describe('resolveCameraView', () => {
  it('returns default viewbox when camera has no settings', () => {
    const cam = createNode({ id: 'cam', camera: {} });
    const result = resolveCameraView(cam, [], DEFAULT_VB);
    expect(result).toEqual({ x: 400, y: 300, w: 800, h: 600 });
  });

  it('targets a coordinate', () => {
    const cam = createNode({ id: 'cam', camera: { target: [100, 200] } });
    const result = resolveCameraView(cam, [], DEFAULT_VB);
    expect(result.x).toBe(100);
    expect(result.y).toBe(200);
  });

  it('targets a node by ID', () => {
    const box = createNode({ id: 'box', transform: { x: 300, y: 150 } });
    const cam = createNode({ id: 'cam', camera: { target: 'box' } });
    const result = resolveCameraView(cam, [box], DEFAULT_VB);
    expect(result.x).toBe(300);
    expect(result.y).toBe(150);
  });

  it('targets a node with offset', () => {
    const box = createNode({ id: 'box', transform: { x: 300, y: 150 } });
    const cam = createNode({ id: 'cam', camera: { target: ['box', 50, -20] } });
    const result = resolveCameraView(cam, [box], DEFAULT_VB);
    expect(result.x).toBe(350);
    expect(result.y).toBe(130);
  });

  it('applies zoom', () => {
    const cam = createNode({ id: 'cam', camera: { zoom: 2 } });
    const result = resolveCameraView(cam, [], DEFAULT_VB);
    expect(result.w).toBe(400);
    expect(result.h).toBe(300);
  });

  it('fits to specific nodes', () => {
    const a = createNode({ id: 'a', transform: { x: 0, y: 0 }, rect: { w: 50, h: 50 } });
    const b = createNode({ id: 'b', transform: { x: 200, y: 200 }, rect: { w: 50, h: 50 } });
    const cam = createNode({ id: 'cam', camera: { fit: ['a', 'b'] } });
    const result = resolveCameraView(cam, [a, b], DEFAULT_VB);
    // Center should be midpoint of bounding box
    expect(result.x).toBe(100);
    expect(result.y).toBe(100);
    // Width/height should encompass both nodes + margin
    expect(result.w).toBeGreaterThan(200);
    expect(result.h).toBeGreaterThan(200);
  });

  it('fits all nodes with fit: "all"', () => {
    const a = createNode({ id: 'a', transform: { x: 0, y: 0 }, rect: { w: 50, h: 50 } });
    const b = createNode({ id: 'b', transform: { x: 200, y: 200 }, rect: { w: 50, h: 50 } });
    const cam = createNode({ id: 'cam', camera: { fit: 'all' } });
    const result = resolveCameraView(cam, [a, b, cam], DEFAULT_VB);
    // Should encompass a and b but not cam
    expect(result.w).toBeGreaterThan(200);
  });

  it('applies ratio by expanding the smaller dimension', () => {
    const a = createNode({ id: 'a', transform: { x: 0, y: 0 }, rect: { w: 100, h: 100 } });
    const cam = createNode({ id: 'cam', camera: { fit: ['a'], ratio: 2 } });
    const result = resolveCameraView(cam, [a], DEFAULT_VB);
    expect(result.w / result.h).toBeCloseTo(2, 1);
    expect(result.w).toBeGreaterThan(result.h);
  });

  it('combines zoom and fit', () => {
    const a = createNode({ id: 'a', transform: { x: 100, y: 100 }, rect: { w: 100, h: 100 } });
    const cam = createNode({ id: 'cam', camera: { fit: ['a'], zoom: 2 } });
    const result = resolveCameraView(cam, [a], DEFAULT_VB);
    const noZoom = resolveCameraView(
      createNode({ id: 'cam2', camera: { fit: ['a'] } }),
      [a],
      DEFAULT_VB,
    );
    expect(result.w).toBeCloseTo(noZoom.w / 2, 1);
  });
});
