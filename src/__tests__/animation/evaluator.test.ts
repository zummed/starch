import { describe, it, expect } from 'vitest';
import { evaluateTrack, evaluateAllTracks } from '../../animation/evaluator';
import type { TrackKeyframe, Tracks } from '../../types/animation';

describe('evaluateTrack', () => {
  const kfs: TrackKeyframe[] = [
    { time: 0, value: 0, easing: 'linear' },
    { time: 2, value: 100, easing: 'linear' },
  ];

  it('returns start value before first keyframe', () => {
    expect(evaluateTrack(kfs, -1)).toBe(0);
  });

  it('returns start value at first keyframe', () => {
    expect(evaluateTrack(kfs, 0)).toBe(0);
  });

  it('returns end value at last keyframe', () => {
    expect(evaluateTrack(kfs, 2)).toBe(100);
  });

  it('returns end value after last keyframe', () => {
    expect(evaluateTrack(kfs, 5)).toBe(100);
  });

  it('interpolates linearly at midpoint', () => {
    expect(evaluateTrack(kfs, 1)).toBe(50);
  });

  it('interpolates at quarter point', () => {
    expect(evaluateTrack(kfs, 0.5)).toBe(25);
  });

  it('handles single keyframe', () => {
    const single: TrackKeyframe[] = [{ time: 1, value: 42, easing: 'linear' }];
    expect(evaluateTrack(single, 0)).toBe(42);
    expect(evaluateTrack(single, 5)).toBe(42);
  });

  it('handles step easing (snap at end)', () => {
    const stepKfs: TrackKeyframe[] = [
      { time: 0, value: 0, easing: 'linear' },
      { time: 2, value: 100, easing: 'step' },
    ];
    expect(evaluateTrack(stepKfs, 0)).toBe(0);
    expect(evaluateTrack(stepKfs, 1)).toBe(0);
    expect(evaluateTrack(stepKfs, 1.99)).toBe(0);
    expect(evaluateTrack(stepKfs, 2)).toBe(100);
  });

  it('handles snap easing (instant jump)', () => {
    const snapKfs: TrackKeyframe[] = [
      { time: 0, value: 0, easing: 'linear' },
      { time: 2, value: 100, easing: 'snap' },
    ];
    expect(evaluateTrack(snapKfs, 0)).toBe(0);
    expect(evaluateTrack(snapKfs, 0.01)).toBe(100);
    expect(evaluateTrack(snapKfs, 2)).toBe(100);
  });
});

describe('evaluateAllTracks', () => {
  it('evaluates all tracks at a given time', () => {
    const tracks: Tracks = new Map([
      ['a.x', [
        { time: 0, value: 0, easing: 'linear' as const },
        { time: 2, value: 100, easing: 'linear' as const },
      ]],
      ['a.y', [
        { time: 0, value: 50, easing: 'linear' as const },
        { time: 2, value: 150, easing: 'linear' as const },
      ]],
    ]);
    const result = evaluateAllTracks(tracks, 1);
    expect(result.get('a.x')).toBe(50);
    expect(result.get('a.y')).toBe(100);
  });
});
