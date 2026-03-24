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
    const { tracks } = buildTimeline(config);
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
    const { tracks } = buildTimeline(config);
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
    const { tracks } = buildTimeline(config);
    const kfs = tracks.get('a.opacity')!;
    expect(kfs[1].easing).toBe('bounce');
  });

  it('applies global default easing', () => {
    const config = makeConfig({
      easing: 'easeInOut',
      keyframes: [
        { time: 0, changes: { 'x.fill': { h: 0, s: 100, l: 50 } } },
        { time: 2, changes: { 'x.fill': { h: 180, s: 100, l: 50 } } },
      ],
    });
    const { tracks } = buildTimeline(config);
    const kfs = tracks.get('x.fill')!;
    expect(kfs[1].easing).toBe('easeInOut');
  });

  it('resolves relative time with plus', () => {
    const config = makeConfig({
      keyframes: [
        { time: 0, changes: { 'a.opacity': 1 } },
        { time: 0, plus: 1.5, changes: { 'a.opacity': 0.5 } },
      ],
    });
    const { tracks } = buildTimeline(config);
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
    const { tracks } = buildTimeline(config);
    const bKfs = tracks.get('b.opacity')!;
    expect(bKfs.some(kf => kf.time === 2 && kf.value === 1)).toBe(true);
  });

  it('keeps HSL color objects as atomic track values', () => {
    const config = makeConfig({
      keyframes: [
        { time: 0, changes: { 'box.fill': { h: 0, s: 100, l: 50 } } },
        { time: 2, changes: { 'box.fill': { h: 120, s: 80, l: 60 } } },
      ],
    });
    const { tracks } = buildTimeline(config);
    // HSL objects should NOT be expanded into sub-tracks
    expect(tracks.has('box.fill')).toBe(true);
    expect(tracks.has('box.fill.h')).toBe(false);
    const kfs = tracks.get('box.fill')!;
    expect(kfs[0].value).toEqual({ h: 0, s: 100, l: 50 });
    expect(kfs[1].value).toEqual({ h: 120, s: 80, l: 60 });
  });

  it('keeps string color values as atomic track values', () => {
    const config = makeConfig({
      keyframes: [
        { time: 0, changes: { 'box.fill': 'red' } },
        { time: 2, changes: { 'box.fill': 'blue' } },
      ],
    });
    const { tracks } = buildTimeline(config);
    expect(tracks.has('box.fill')).toBe(true);
    const kfs = tracks.get('box.fill')!;
    expect(kfs[0].value).toBe('red');
    expect(kfs[1].value).toBe('blue');
  });

  it('keeps RGB color objects as atomic track values', () => {
    const config = makeConfig({
      keyframes: [
        { time: 0, changes: { 'box.fill': { r: 255, g: 0, b: 0 } } },
        { time: 2, changes: { 'box.fill': { r: 0, g: 0, b: 255 } } },
      ],
    });
    const { tracks } = buildTimeline(config);
    expect(tracks.has('box.fill')).toBe(true);
    expect(tracks.has('box.fill.r')).toBe(false);
    const kfs = tracks.get('box.fill')!;
    expect(kfs[0].value).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('still expands non-Color sub-object shorthand', () => {
    const config = makeConfig({
      keyframes: [
        { time: 0, changes: { 'box.transform': { x: 0, y: 0 } } },
        { time: 2, changes: { 'box.transform': { x: 100, y: 200 } } },
      ],
    });
    const { tracks } = buildTimeline(config);
    expect(tracks.has('box.transform.x')).toBe(true);
    expect(tracks.has('box.transform.y')).toBe(true);
    expect(tracks.get('box.transform.x')![1].value).toBe(100);
  });

  it('handles delay by inserting hold keyframe', () => {
    const config = makeConfig({
      keyframes: [
        { time: 0, changes: { 'a.opacity': 1 } },
        { time: 0, plus: 2, delay: 0.5, changes: { 'a.opacity': 0 } },
      ],
    });
    const { tracks } = buildTimeline(config);
    const kfs = tracks.get('a.opacity')!;
    expect(kfs.some(kf => kf.time === 2 && kf.value === 1)).toBe(true);
    expect(kfs.some(kf => kf.time === 2.5 && kf.value === 0)).toBe(true);
  });

  // ── Auto keyframe at time 0 from initial values ────────────

  it('prepends time-0 keyframe from initial node value', () => {
    const nodes = [{ id: 'box', transform: { x: 100 }, children: [] }] as any[];
    const config = makeConfig({
      keyframes: [{ time: 2, changes: { 'box.transform.x': 400 } }],
    });
    const { tracks } = buildTimeline(config, nodes);
    const kfs = tracks.get('box.transform.x')!;
    expect(kfs).toHaveLength(2);
    expect(kfs[0]).toEqual({ time: 0, value: 100, easing: 'linear' });
    expect(kfs[1]).toEqual({ time: 2, value: 400, easing: 'linear' });
  });

  it('does not prepend when first keyframe is at time 0', () => {
    const nodes = [{ id: 'box', transform: { x: 100 }, children: [] }] as any[];
    const config = makeConfig({
      keyframes: [
        { time: 0, changes: { 'box.transform.x': 0 } },
        { time: 2, changes: { 'box.transform.x': 400 } },
      ],
    });
    const { tracks } = buildTimeline(config, nodes);
    const kfs = tracks.get('box.transform.x')!;
    expect(kfs[0].value).toBe(0);
  });

  it('prepends initial color value', () => {
    const nodes = [{ id: 'box', fill: 'red', children: [] }] as any[];
    const config = makeConfig({
      keyframes: [{ time: 2, changes: { 'box.fill': 'blue' } }],
    });
    const { tracks } = buildTimeline(config, nodes);
    const kfs = tracks.get('box.fill')!;
    expect(kfs).toHaveLength(2);
    expect(kfs[0]).toEqual({ time: 0, value: 'red', easing: 'linear' });
  });

  it('uses Zod schema default for numeric properties when node property is missing', () => {
    const nodes = [{ id: 'a', children: [] }] as any[];
    const config = makeConfig({
      keyframes: [{ time: 2, changes: { 'a.transform.rotation': 10 } }],
    });
    const { tracks } = buildTimeline(config, nodes);
    const kfs = tracks.get('a.transform.rotation')!;
    expect(kfs).toHaveLength(2);
    expect(kfs[0]).toEqual({ time: 0, value: 0, easing: 'linear' });
    expect(kfs[1]).toEqual({ time: 2, value: 10, easing: 'linear' });
  });

  it('uses Zod schema default of 1 for scale when node property is missing', () => {
    const nodes = [{ id: 'a', children: [] }] as any[];
    const config = makeConfig({
      keyframes: [{ time: 2, changes: { 'a.transform.scale': 2 } }],
    });
    const { tracks } = buildTimeline(config, nodes);
    const kfs = tracks.get('a.transform.scale')!;
    expect(kfs).toHaveLength(2);
    expect(kfs[0]).toEqual({ time: 0, value: 1, easing: 'linear' });
    expect(kfs[1]).toEqual({ time: 2, value: 2, easing: 'linear' });
  });

  it('uses Zod schema default of 1 for opacity when node property is missing', () => {
    const nodes = [{ id: 'a', children: [] }] as any[];
    const config = makeConfig({
      keyframes: [{ time: 2, changes: { 'a.opacity': 0 } }],
    });
    const { tracks } = buildTimeline(config, nodes);
    const kfs = tracks.get('a.opacity')!;
    expect(kfs).toHaveLength(2);
    expect(kfs[0]).toEqual({ time: 0, value: 1, easing: 'linear' });
    expect(kfs[1]).toEqual({ time: 2, value: 0, easing: 'linear' });
  });

  it('does not prepend when nodes are not provided', () => {
    const config = makeConfig({
      keyframes: [{ time: 2, changes: { 'box.transform.x': 400 } }],
    });
    const { tracks } = buildTimeline(config);
    const kfs = tracks.get('box.transform.x')!;
    expect(kfs).toHaveLength(1);
    expect(kfs[0].time).toBe(2);
  });
});
