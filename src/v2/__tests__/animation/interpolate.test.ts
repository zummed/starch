import { describe, it, expect } from 'vitest';
import { interpolateValue } from '../../animation/interpolate';

describe('interpolateValue', () => {
  it('linearly interpolates numbers', () => {
    expect(interpolateValue(0, 100, 0.5)).toBe(50);
    expect(interpolateValue(0, 100, 0)).toBe(0);
    expect(interpolateValue(0, 100, 1)).toBe(100);
  });

  it('interpolates negative numbers', () => {
    expect(interpolateValue(-50, 50, 0.5)).toBe(0);
  });

  it('step-interpolates strings (snaps at t >= 1)', () => {
    expect(interpolateValue('hello', 'world', 0)).toBe('hello');
    expect(interpolateValue('hello', 'world', 0.5)).toBe('hello');
    expect(interpolateValue('hello', 'world', 0.99)).toBe('hello');
    expect(interpolateValue('hello', 'world', 1)).toBe('world');
  });

  it('step-interpolates booleans', () => {
    expect(interpolateValue(true, false, 0)).toBe(true);
    expect(interpolateValue(true, false, 0.99)).toBe(true);
    expect(interpolateValue(true, false, 1)).toBe(false);
  });

  it('interpolates HSL color objects', () => {
    const a = { h: 0, s: 100, l: 50 };
    const b = { h: 120, s: 50, l: 80 };
    const mid = interpolateValue(a, b, 0.5) as { h: number; s: number; l: number };
    expect(mid.h).toBeCloseTo(60, 0);
    expect(mid.s).toBeCloseTo(75, 0);
    expect(mid.l).toBeCloseTo(65, 0);
  });

  it('uses shortest-arc for HSL hue via color interpolation', () => {
    const a = { h: 350, s: 100, l: 50 };
    const b = { h: 10, s: 100, l: 50 };
    const mid = interpolateValue(a, b, 0.5) as { h: number; s: number; l: number };
    expect(mid.h).toBeCloseTo(0, 0);
  });

  it('returns start value for unknown types', () => {
    expect(interpolateValue([1, 2], [3, 4], 0.5)).toEqual([1, 2]);
  });
});
