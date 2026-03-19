import { describe, it, expect } from 'vitest';
import type { AnimConfig, SceneObject } from '../../core/types';
import { buildTimeline } from '../timeline';

function makeObj(id: string, props: Record<string, unknown> = {}): SceneObject {
  return {
    type: 'box',
    id,
    props: { x: 0, y: 0, w: 100, h: 50, ...props } as never,
    _inputKeys: new Set(Object.keys(props)),
  };
}

describe('buildTimeline', () => {
  it('flattens keyframe blocks into per-property tracks', () => {
    const config: AnimConfig = {
      keyframes: [
        { time: 1, changes: { box1: { x: 200 }, box2: { opacity: 0.5 } } },
      ],
      chapters: [],
    };
    const tracks = buildTimeline(config);
    expect(tracks['box1.x']).toBeDefined();
    expect(tracks['box2.opacity']).toBeDefined();
    expect(tracks['box1.x'][0]).toEqual({ time: 1, value: 200, easing: 'linear' });
  });

  it('resolves easing cascade: animation → keyframe → object', () => {
    const config: AnimConfig = {
      easing: 'easeOut',
      keyframes: [
        { time: 1, easing: 'easeIn', changes: {
          box1: { x: 100 },
          box2: { x: 200, easing: 'bounce' },
        }},
      ],
      chapters: [],
    };
    const tracks = buildTimeline(config);
    expect(tracks['box1.x'][0].easing).toBe('easeIn');
    expect(tracks['box2.x'][0].easing).toBe('bounce');
  });

  it('falls back to animation-level easing', () => {
    const config: AnimConfig = {
      easing: 'easeOut',
      keyframes: [
        { time: 1, changes: { box1: { x: 100 } } },
      ],
      chapters: [],
    };
    const tracks = buildTimeline(config);
    expect(tracks['box1.x'][0].easing).toBe('easeOut');
  });

  it('prepends t=0 keyframe from base value', () => {
    const config: AnimConfig = {
      keyframes: [{ time: 2, changes: { box1: { x: 300 } } }],
      chapters: [],
    };
    const objects: Record<string, SceneObject> = { box1: makeObj('box1', { x: 50 }) };
    const tracks = buildTimeline(config, objects);
    expect(tracks['box1.x']).toHaveLength(2);
    expect(tracks['box1.x'][0]).toEqual({ time: 0, value: 50, easing: 'linear' });
    expect(tracks['box1.x'][1].time).toBe(2);
  });

  it('excludes easing key from property tracks', () => {
    const config: AnimConfig = {
      keyframes: [{ time: 1, changes: { box1: { x: 100, easing: 'bounce' } } }],
      chapters: [],
    };
    const tracks = buildTimeline(config);
    expect(tracks['box1.easing']).toBeUndefined();
    expect(tracks['box1.x']).toBeDefined();
  });

  it('auto-key inserts holds at block boundaries', () => {
    const config: AnimConfig = {
      keyframes: [
        { time: 1, changes: { box1: { x: 100 } } },
        { time: 2, changes: { box2: { y: 200 } } },
        { time: 3, changes: { box1: { x: 300 } } },
      ],
      chapters: [],
    };
    const objects: Record<string, SceneObject> = {
      box1: makeObj('box1', { x: 0 }),
      box2: makeObj('box2', { y: 0 }),
    };
    const tracks = buildTimeline(config, objects);
    // box1.x: base at t=0, explicit at t=1 and t=3 → auto-key inserts hold at t=2
    const times = tracks['box1.x'].map(kf => kf.time);
    expect(times).toContain(2);
    // Hold value at t=2 should be 100 (last value before t=2)
    const holdKf = tracks['box1.x'].find(kf => kf.time === 2);
    expect(holdKf?.value).toBe(100);
  });

  it('auto-key preserves explicit keyframes', () => {
    const config: AnimConfig = {
      keyframes: [
        { time: 1, changes: { box1: { x: 100 } } },
        { time: 2, changes: { box1: { x: 200 } } },
        { time: 3, changes: { box1: { x: 300 } } },
      ],
      chapters: [],
    };
    const tracks = buildTimeline(config);
    // All three explicit keyframes present, no duplicates
    expect(tracks['box1.x']).toHaveLength(3);
    expect(tracks['box1.x'].map(kf => kf.value)).toEqual([100, 200, 300]);
  });

  it('auto-key can be disabled', () => {
    const config: AnimConfig = {
      autoKey: false,
      keyframes: [
        { time: 1, changes: { box1: { x: 100 } } },
        { time: 2, changes: { box2: { y: 200 } } },
        { time: 3, changes: { box1: { x: 300 } } },
      ],
      chapters: [],
    };
    const tracks = buildTimeline(config);
    // No hold inserted at t=2 for box1.x
    const times = tracks['box1.x'].map(kf => kf.time);
    expect(times).toEqual([1, 3]);
  });

  it('per-block autoKey: false excludes block from timing', () => {
    const config: AnimConfig = {
      keyframes: [
        { time: 1, changes: { box1: { x: 100 } } },
        { time: 2, autoKey: false, changes: { box1: { opacity: 0.5 } } },
        { time: 3, changes: { box1: { x: 300 } } },
      ],
      chapters: [],
    };
    const objects: Record<string, SceneObject> = {
      box1: makeObj('box1', { x: 0 }),
    };
    const tracks = buildTimeline(config, objects);
    // box1.x should NOT get a hold at t=2 — the block opted out
    const xTimes = tracks['box1.x'].map(kf => kf.time);
    expect(xTimes).toEqual([0, 1, 3]);
    // box1.opacity still gets its keyframe at t=2
    expect(tracks['box1.opacity']).toBeDefined();
    const opTimes = tracks['box1.opacity'].map(kf => kf.time);
    expect(opTimes).toContain(2);
  });

  it('effects-only blocks are implicitly excluded from timing', () => {
    const config: AnimConfig = {
      keyframes: [
        { time: 1, changes: { box1: { x: 100 } } },
        { time: 2, changes: { box1: { shake: 5 } } },
        { time: 3, changes: { box1: { x: 300 } } },
      ],
      chapters: [],
    };
    const objects: Record<string, SceneObject> = {
      box1: makeObj('box1', { x: 0 }),
    };
    const tracks = buildTimeline(config, objects);
    // Effects are excluded from tracks, and the block shouldn't create holds
    const xTimes = tracks['box1.x'].map(kf => kf.time);
    expect(xTimes).toEqual([0, 1, 3]);
  });

  it('empty blocks are kept as timing markers', () => {
    const config: AnimConfig = {
      keyframes: [
        { time: 1, changes: { box1: { x: 100 } } },
        { time: 2, changes: {} },
        { time: 3, changes: { box1: { x: 300 } } },
      ],
      chapters: [],
    };
    const objects: Record<string, SceneObject> = {
      box1: makeObj('box1', { x: 0 }),
    };
    const tracks = buildTimeline(config, objects);
    // Empty block at t=2 should create a hold for box1.x
    const xTimes = tracks['box1.x'].map(kf => kf.time);
    expect(xTimes).toContain(2);
    const holdKf = tracks['box1.x'].find(kf => kf.time === 2);
    expect(holdKf?.value).toBe(100);
  });

  it('auto-key only fills within track range', () => {
    const config: AnimConfig = {
      keyframes: [
        { time: 1, changes: { box1: { x: 100 } } },
        { time: 2, changes: { box2: { y: 200 } } },
        { time: 3, changes: { box1: { x: 300 } } },
        { time: 4, changes: { box2: { y: 400 } } },
      ],
      chapters: [],
    };
    const tracks = buildTimeline(config);
    // box1.x range is [1, 3] — should NOT get holds at t=4
    const box1Times = tracks['box1.x'].map(kf => kf.time);
    expect(box1Times).not.toContain(4);
    // box2.y range is [2, 4] — should NOT get hold at t=1
    const box2Times = tracks['box2.y'].map(kf => kf.time);
    expect(box2Times).not.toContain(1);
  });
});
