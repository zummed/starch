import { describe, it, expect } from 'vitest';
import { buildTimeline } from '../../animation/timeline';
import { createNode } from '../../types/node';
import type { AnimConfig } from '../../types/animation';

describe('camera track expansion', () => {
  it('expands camera look (target) into rect/transform tracks', () => {
    const cam = createNode({ id: 'cam', camera: { look: [200, 150], zoom: 1 } });
    const config: AnimConfig = {
      duration: 3,
      keyframes: [
        { time: 0, changes: { 'cam.camera.look': [200, 150] } },
        { time: 2, changes: { 'cam.camera.look': [400, 300] } },
      ],
    };
    const { tracks } = buildTimeline(config, [cam]);
    expect(tracks.has('cam.transform.x')).toBe(true);
    expect(tracks.has('cam.transform.y')).toBe(true);
    expect(tracks.has('cam.rect.w')).toBe(true);
    expect(tracks.has('cam.rect.h')).toBe(true);
  });

  it('expands camera look (fit) into rect/transform tracks', () => {
    const a = createNode({ id: 'a', transform: { x: 0, y: 0 }, rect: { w: 50, h: 50 } });
    const b = createNode({ id: 'b', transform: { x: 200, y: 200 }, rect: { w: 50, h: 50 } });
    const cam = createNode({ id: 'cam', camera: { look: ['a', 'b'] } });
    const config: AnimConfig = {
      duration: 3,
      keyframes: [
        { time: 0, changes: { 'cam.camera.look': ['a'] } },
        { time: 2, changes: { 'cam.camera.look': ['a', 'b'] } },
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
    const cam = createNode({ id: 'cam', camera: { look: [100, 100] } });
    const config: AnimConfig = {
      duration: 3,
      keyframes: [
        { time: 0, changes: { 'box.transform.x': 0, 'cam.camera.look': [100, 100] } },
        { time: 2, changes: { 'box.transform.x': 200, 'cam.camera.look': [300, 100] } },
      ],
    };
    const { tracks } = buildTimeline(config, [box, cam]);
    expect(tracks.has('box.transform.x')).toBe(true);
    const boxTrack = tracks.get('box.transform.x')!;
    expect(boxTrack[0].value).toBe(0);
    expect(boxTrack[1].value).toBe(200);
  });

  // ── Stage 8: camera follows a target moving on a densely-sampled track ──

  it('a camera with its own track still follows a slot mover at the mover\'s (not its own) keyframe times', () => {
    const board = createNode({ id: 'board', rect: { w: 200, h: 100 }, layout: { type: 'grid', columns: 2, gap: 0, padding: 0 } });
    const mover = createNode({ id: 'mover', rect: { w: 40, h: 40 }, transform: { x: 500, y: 500 } });
    const cam = createNode({ id: 'cam', camera: { look: 'mover', zoom: 1 } });
    const config: AnimConfig = {
      duration: 4,
      easing: 'easeInOut',
      keyframes: [
        { time: 0, changes: { 'cam.camera.zoom': 1 } },
        // autoKey: false so this block doesn't also hold cam.camera.zoom at
        // t=2 — that would sample the camera there anyway, masking the bug
        // the union-times fix addresses.
        { time: 2, changes: { 'mover.layout.slot': 'board' }, autoKey: false },
        { time: 4, changes: { 'cam.camera.zoom': 2 } },
      ],
    };
    const { tracks } = buildTimeline(config, [board, mover, cam]);

    const moverX = tracks.get('mover.transform.x')!;
    const moverKfAt2 = moverX.find(kf => kf.time === 2)!;
    expect(moverKfAt2).toBeDefined();

    const camX = tracks.get('cam.transform.x')!;
    const camKfAt2 = camX.find(kf => kf.time === 2);
    // Fails before the union-times fix: the camera only had its own zoom
    // keyframes (0, 4) to sample at, so it never re-evaluates at t=2.
    expect(camKfAt2).toBeDefined();
    expect(camKfAt2!.value).toBe(moverKfAt2.value);
    // Inserted for follow-tracking, not an authored cam-track time — must
    // interpolate linearly, not with the block's easeInOut.
    expect(camKfAt2!.easing).toBe('linear');

    const camKfAt0 = camX.find(kf => kf.time === 0)!;
    const camKfAt4 = camX.find(kf => kf.time === 4)!;
    expect(camKfAt0.easing).toBe('easeInOut');
    expect(camKfAt4.easing).toBe('easeInOut');
  });

  it('warns once when camera look targets a node id that does not exist', () => {
    const cam = createNode({ id: 'cam', camera: { look: 'ghost' } });
    const config: AnimConfig = { duration: 2, keyframes: [] };
    const { warnings } = buildTimeline(config, [cam]);
    expect(warnings).toEqual(['camera "cam" look target "ghost" not found']);
  });
});
