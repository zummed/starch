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

  it('targets a coordinate via look', () => {
    const cam = createNode({ id: 'cam', camera: { look: [100, 200] } });
    const result = resolveCameraView(cam, [], DEFAULT_VB);
    expect(result.x).toBe(100);
    expect(result.y).toBe(200);
  });

  it('targets a node by ID via look', () => {
    const box = createNode({ id: 'box', transform: { x: 300, y: 150 } });
    const cam = createNode({ id: 'cam', camera: { look: 'box' } });
    const result = resolveCameraView(cam, [box], DEFAULT_VB);
    expect(result.x).toBe(300);
    expect(result.y).toBe(150);
  });

  it('targets a node with offset via look', () => {
    const box = createNode({ id: 'box', transform: { x: 300, y: 150 } });
    const cam = createNode({ id: 'cam', camera: { look: ['box', 50, -20] } });
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

  it('fits to specific nodes via look array', () => {
    const a = createNode({ id: 'a', transform: { x: 0, y: 0 }, rect: { w: 50, h: 50 } });
    const b = createNode({ id: 'b', transform: { x: 200, y: 200 }, rect: { w: 50, h: 50 } });
    const cam = createNode({ id: 'cam', camera: { look: ['a', 'b'] } });
    const result = resolveCameraView(cam, [a, b], DEFAULT_VB);
    expect(result.x).toBe(100);
    expect(result.y).toBe(100);
    expect(result.w).toBeGreaterThan(200);
    expect(result.h).toBeGreaterThan(200);
  });

  it('fits all nodes with look: "all"', () => {
    const a = createNode({ id: 'a', transform: { x: 0, y: 0 }, rect: { w: 50, h: 50 } });
    const b = createNode({ id: 'b', transform: { x: 200, y: 200 }, rect: { w: 50, h: 50 } });
    const cam = createNode({ id: 'cam', camera: { look: 'all' } });
    const result = resolveCameraView(cam, [a, b, cam], DEFAULT_VB);
    expect(result.w).toBeGreaterThan(200);
  });

  it('applies ratio by expanding the smaller dimension', () => {
    const a = createNode({ id: 'a', transform: { x: 0, y: 0 }, rect: { w: 100, h: 100 } });
    const cam = createNode({ id: 'cam', camera: { look: ['a'], ratio: 2 } });
    const result = resolveCameraView(cam, [a], DEFAULT_VB);
    expect(result.w / result.h).toBeCloseTo(2, 1);
    expect(result.w).toBeGreaterThan(result.h);
  });

  it('combines zoom and look fit', () => {
    const a = createNode({ id: 'a', transform: { x: 100, y: 100 }, rect: { w: 100, h: 100 } });
    const cam = createNode({ id: 'cam', camera: { look: ['a'], zoom: 2 } });
    const result = resolveCameraView(cam, [a], DEFAULT_VB);
    const noZoom = resolveCameraView(
      createNode({ id: 'cam2', camera: { look: ['a'] } }),
      [a],
      DEFAULT_VB,
    );
    expect(result.w).toBeCloseTo(noZoom.w / 2, 1);
  });

  // ── Stage 8: world-aware look (nesting + layout) ─────────────────────

  it('targets a nested node by its world position, not its local transform', () => {
    const child = createNode({ id: 'child', transform: { x: 30, y: 10 }, rect: { w: 10, h: 10 } });
    const parent = createNode({ id: 'parent', transform: { x: 100, y: 50 }, children: [child] });
    const cam = createNode({ id: 'cam', camera: { look: 'child' } });
    const result = resolveCameraView(cam, [parent], DEFAULT_VB);
    expect(result.x).toBe(130);
    expect(result.y).toBe(60);
  });

  it('fits a container by id to include its children\'s world extent', () => {
    const childA = createNode({ id: 'ca', transform: { x: -50, y: 0 }, rect: { w: 20, h: 20 } });
    const childB = createNode({ id: 'cb', transform: { x: 50, y: 0 }, rect: { w: 20, h: 20 } });
    const container = createNode({ id: 'group', transform: { x: 200, y: 200 }, children: [childA, childB] });
    const cam = createNode({ id: 'cam', camera: { look: ['group'] } });
    const result = resolveCameraView(cam, [container], DEFAULT_VB);
    // group itself has no rect: bounds come entirely from its children,
    // spanning world x 200-50-10=140 to 200+50+10=260.
    expect(result.x).toBe(200);
    expect(result.w).toBeGreaterThanOrEqual(120);
  });

  it('look "all" includes a root group whose geometry lives entirely in its children', () => {
    const leaf = createNode({ id: 'leaf', transform: { x: 40, y: 0 }, rect: { w: 20, h: 20 } });
    const group = createNode({ id: 'group', transform: { x: 100, y: 100 }, children: [leaf] });
    const cam = createNode({ id: 'cam', camera: { look: 'all' } });
    const result = resolveCameraView(cam, [group, cam], DEFAULT_VB);
    // Bounds come from the leaf's world position (140,100), not the empty
    // group's own (0-sized) local geometry.
    expect(result.x).toBe(140);
    expect(result.y).toBe(100);
  });

  it('reports an unresolved look target instead of throwing', () => {
    const cam = createNode({ id: 'cam', camera: { look: 'ghost' } });
    const result = resolveCameraView(cam, [], DEFAULT_VB);
    expect(result.unresolvedLookId).toBe('ghost');
    // Fallback behavior unchanged: centers on the default viewbox.
    expect(result.x).toBe(400);
    expect(result.y).toBe(300);
  });
});
