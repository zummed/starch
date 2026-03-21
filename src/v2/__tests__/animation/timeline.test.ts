import { describe, it, expect } from 'vitest';
import { buildTimeline } from '../../animation/timeline';
import type { AnimConfig } from '../../types/animation';

function makeConfig(overrides: Partial<AnimConfig> = {}): AnimConfig {
  return {
    duration: 4,
    keyframes: [],
    ...overrides,
  };
}

describe('buildTimeline', () => {
  it('creates tracks from keyframe block changes', () => {
    const config = makeConfig({
      keyframes: [
        { time: 0, changes: { 'box.transform.x': 0 } },
        { time: 2, changes: { 'box.transform.x': 100 } },
      ],
    });
    const tracks = buildTimeline(config);
    expect(tracks.has('box.transform.x')).toBe(true);
    const kfs = tracks.get('box.transform.x')!;
    expect(kfs).toHaveLength(2);
    expect(kfs[0]).toEqual({ time: 0, value: 0, easing: 'linear' });
    expect(kfs[1]).toEqual({ time: 2, value: 100, easing: 'linear' });
  });

  it('applies block-level easing', () => {
    const config = makeConfig({
      keyframes: [
        { time: 0, changes: { 'a.opacity': 1 } },
        { time: 2, easing: 'easeOut', changes: { 'a.opacity': 0 } },
      ],
    });
    const tracks = buildTimeline(config);
    const kfs = tracks.get('a.opacity')!;
    expect(kfs[1].easing).toBe('easeOut');
  });

  it('applies per-property easing override', () => {
    const config = makeConfig({
      keyframes: [
        { time: 0, changes: { 'a.opacity': 1 } },
        {
          time: 2,
          easing: 'easeOut',
          changes: { 'a.opacity': { value: 0, easing: 'bounce' } },
        },
      ],
    });
    const tracks = buildTimeline(config);
    const kfs = tracks.get('a.opacity')!;
    expect(kfs[1].easing).toBe('bounce');
  });

  it('applies global default easing', () => {
    const config = makeConfig({
      easing: 'easeInOut',
      keyframes: [
        { time: 0, changes: { 'x.fill.h': 0 } },
        { time: 2, changes: { 'x.fill.h': 180 } },
      ],
    });
    const tracks = buildTimeline(config);
    const kfs = tracks.get('x.fill.h')!;
    expect(kfs[1].easing).toBe('easeInOut');
  });

  it('resolves relative time with plus', () => {
    const config = makeConfig({
      keyframes: [
        { time: 0, changes: { 'a.opacity': 1 } },
        { time: 0, plus: 1.5, changes: { 'a.opacity': 0.5 } },
      ],
    });
    const tracks = buildTimeline(config);
    const kfs = tracks.get('a.opacity')!;
    expect(kfs[1].time).toBe(1.5);
  });

  it('inserts hold keyframes when autoKey is true', () => {
    const config = makeConfig({
      autoKey: true,
      keyframes: [
        { time: 0, changes: { 'a.opacity': 1, 'b.opacity': 1 } },
        { time: 2, changes: { 'a.opacity': 0 } },
      ],
    });
    const tracks = buildTimeline(config);
    const bKfs = tracks.get('b.opacity')!;
    expect(bKfs.some(kf => kf.time === 2 && kf.value === 1)).toBe(true);
  });

  it('expands shorthand sub-object targets', () => {
    const config = makeConfig({
      keyframes: [
        { time: 0, changes: { 'box.fill': { h: 0, s: 100, l: 50 } } },
        { time: 2, changes: { 'box.fill': { h: 120, s: 80, l: 60 } } },
      ],
    });
    const tracks = buildTimeline(config);
    expect(tracks.has('box.fill.h')).toBe(true);
    expect(tracks.has('box.fill.s')).toBe(true);
    expect(tracks.has('box.fill.l')).toBe(true);
    expect(tracks.get('box.fill.h')![0].value).toBe(0);
    expect(tracks.get('box.fill.h')![1].value).toBe(120);
  });

  it('handles delay by inserting hold keyframe', () => {
    const config = makeConfig({
      keyframes: [
        { time: 0, changes: { 'a.opacity': 1 } },
        { time: 0, plus: 2, delay: 0.5, changes: { 'a.opacity': 0 } },
      ],
    });
    const tracks = buildTimeline(config);
    const kfs = tracks.get('a.opacity')!;
    expect(kfs.some(kf => kf.time === 2 && kf.value === 1)).toBe(true);
    expect(kfs.some(kf => kf.time === 2.5 && kf.value === 0)).toBe(true);
  });
});
