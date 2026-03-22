import { describe, it, expect } from 'vitest';
import { buildTimeline } from '../../animation/timeline';
import { createNode } from '../../types/node';
import type { AnimConfig } from '../../types/animation';

describe('camera track expansion', () => {
  it('expands camera target into rect/transform tracks', () => {
    const cam = createNode({ id: 'cam', camera: { target: [200, 150], zoom: 1 } });
    const config: AnimConfig = {
      duration: 3,
      keyframes: [
        { time: 0, changes: { 'cam.camera.target': [200, 150] } },
        { time: 2, changes: { 'cam.camera.target': [400, 300] } },
      ],
    };
    const { tracks } = buildTimeline(config, [cam]);
    expect(tracks.has('cam.transform.x')).toBe(true);
    expect(tracks.has('cam.transform.y')).toBe(true);
    expect(tracks.has('cam.rect.w')).toBe(true);
    expect(tracks.has('cam.rect.h')).toBe(true);
  });

  it('expands camera fit into rect/transform tracks', () => {
    const a = createNode({ id: 'a', transform: { x: 0, y: 0 }, rect: { w: 50, h: 50 } });
    const b = createNode({ id: 'b', transform: { x: 200, y: 200 }, rect: { w: 50, h: 50 } });
    const cam = createNode({ id: 'cam', camera: { fit: ['a', 'b'] } });
    const config: AnimConfig = {
      duration: 3,
      keyframes: [
        { time: 0, changes: { 'cam.camera.fit': ['a'] } },
        { time: 2, changes: { 'cam.camera.fit': ['a', 'b'] } },
      ],
    };
    const { tracks } = buildTimeline(config, [a, b, cam]);
    const wTrack = tracks.get('cam.rect.w')!;
    expect(wTrack.length).toBe(2);
    expect(wTrack[1].value).toBeGreaterThan(wTrack[0].value as number);
  });

  it('expands camera zoom into rect dimensions', () => {
    const cam = createNode({ id: 'cam', camera: { zoom: 1 } });
    const config: AnimConfig = {
      duration: 3,
      keyframes: [
        { time: 0, changes: { 'cam.camera.zoom': 1 } },
        { time: 2, changes: { 'cam.camera.zoom': 2 } },
      ],
    };
    const { tracks } = buildTimeline(config, [cam]);
    const wTrack = tracks.get('cam.rect.w')!;
    expect(wTrack[1].value).toBeCloseTo((wTrack[0].value as number) / 2, 1);
  });

  it('preserves existing non-camera tracks', () => {
    const box = createNode({ id: 'box', transform: { x: 0, y: 0 }, rect: { w: 50, h: 50 } });
    const cam = createNode({ id: 'cam', camera: { target: [100, 100] } });
    const config: AnimConfig = {
      duration: 3,
      keyframes: [
        { time: 0, changes: { 'box.transform.x': 0, 'cam.camera.target': [100, 100] } },
        { time: 2, changes: { 'box.transform.x': 200, 'cam.camera.target': [300, 100] } },
      ],
    };
    const { tracks } = buildTimeline(config, [box, cam]);
    expect(tracks.has('box.transform.x')).toBe(true);
    const boxTrack = tracks.get('box.transform.x')!;
    expect(boxTrack[0].value).toBe(0);
    expect(boxTrack[1].value).toBe(200);
  });
});
