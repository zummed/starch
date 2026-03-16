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
});
