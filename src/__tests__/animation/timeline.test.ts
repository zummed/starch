import { describe, it, expect } from 'vitest';
import { buildTimeline } from '../../animation/timeline';
import { parseScene } from '../../parser/parser';
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

  // ── 3a: keyframe assembly order ────────────────────────────

  it('holds initial value through an earlier block instead of drifting from t=0 (cross-strategy-slot shape)', () => {
    // A track first authored at t=4, with an unrelated block at t=2 (so
    // autoKey has a chance to insert a hold there): before the reorder,
    // the hold couldn't see the not-yet-prepended t=0 value and got
    // dropped, so the track drifted smoothly from t=0 straight to t=4
    // instead of holding until t=2.
    const nodes = [{ id: 'a', transform: { x: 10 }, children: [] }] as any[];
    const config = makeConfig({
      keyframes: [
        { time: 2, changes: { 'other.opacity': 1 } },
        { time: 4, changes: { 'a.transform.x': 200 } },
      ],
    });
    const { tracks } = buildTimeline(config, nodes);
    const kfs = tracks.get('a.transform.x')!;
    expect(kfs).toEqual([
      { time: 0, value: 10, easing: 'linear' },
      { time: 2, value: 10, easing: 'linear' },
      { time: 4, value: 200, easing: 'linear' },
    ]);
  });

  // ── 3b/3c: track path resolution and unresolvable-path warnings ──

  it('does not fall back to a schema default for a bare nested-id path (unresolvable node prefix)', () => {
    // "n1" is only a valid id when addressed through its parent
    // ("ring.n1") — the bare form must not resolve, and must not borrow
    // NodeSchema's top-level "opacity" default just because the tail
    // segment happens to match a real field name.
    const nodes = [{
      id: 'ring', children: [{ id: 'n1', opacity: 0, children: [] }],
    }] as any[];
    const config = makeConfig({
      keyframes: [{ time: 2, changes: { 'n1.opacity': 1 } }],
    });
    const { tracks, warnings } = buildTimeline(config, nodes);
    const kfs = tracks.get('n1.opacity')!;
    expect(kfs).toEqual([{ time: 2, value: 1, easing: 'linear' }]);
    expect(warnings).toEqual(['Unknown animation target "n1.opacity"']);
  });

  it('resolves the same property correctly when addressed through its actual parent chain', () => {
    const nodes = [{
      id: 'ring', children: [{ id: 'n1', opacity: 0, children: [] }],
    }] as any[];
    const config = makeConfig({
      keyframes: [{ time: 2, changes: { 'ring.n1.opacity': 1 } }],
    });
    const { tracks, warnings } = buildTimeline(config, nodes);
    const kfs = tracks.get('ring.n1.opacity')!;
    expect(kfs).toEqual([
      { time: 0, value: 0, easing: 'linear' },
      { time: 2, value: 1, easing: 'linear' },
    ]);
    expect(warnings).toEqual([]);
  });

  it('does not warn about a resolvable path', () => {
    const nodes = [{ id: 'box', transform: { x: 0 }, children: [] }] as any[];
    const config = makeConfig({
      keyframes: [{ time: 2, changes: { 'box.transform.x': 100 } }],
    });
    const { warnings } = buildTimeline(config, nodes);
    expect(warnings).toEqual([]);
  });

  it('does not warn about a style track — styles are first-class nodes in the tree', () => {
    const scene = parseScene(`\
style primary
  fill hsl 210 70 45

n1: rect 100x60 @primary`);
    const config = makeConfig({
      keyframes: [{ time: 2, changes: { 'primary.fill': { h: 0, s: 100, l: 50 } } }],
    });
    const { warnings } = buildTimeline(config, scene.nodes);
    expect(warnings).toEqual([]);
  });

  // ── 3e: block.delay hold fix ────────────────────────────────

  it('holds the node initial value during the delay when a track is first mentioned in a delayed block', () => {
    const nodes = [{ id: 'a', opacity: 1, children: [] }] as any[];
    const config = makeConfig({
      keyframes: [{ time: 2, delay: 0.5, changes: { 'a.opacity': 0 } }],
    });
    const { tracks } = buildTimeline(config, nodes);
    const kfs = tracks.get('a.opacity')!;
    // Holds the node's real initial value (1) at baseTime, not the
    // delayed block's own target value (0) — the transition only
    // happens across the delay window, not before it.
    expect(kfs).toEqual([
      { time: 0, value: 1, easing: 'linear' },
      { time: 2, value: 1, easing: 'linear' },
      { time: 2.5, value: 0, easing: 'linear' },
    ]);
  });
});
