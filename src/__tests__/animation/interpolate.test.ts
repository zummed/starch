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

  it('interpolates named color strings via HSL', () => {
    const mid = interpolateValue('red', 'blue', 0) as { h: number; s: number; l: number };
    // t=0 should return the first color converted to HSL
    expect(mid.h).toBe(0);
    expect(mid.s).toBe(100);
    expect(mid.l).toBe(50);
  });

  it('interpolates named color strings at t=1', () => {
    const end = interpolateValue('red', 'blue', 1) as { h: number; s: number; l: number };
    expect(end.h).toBe(240);
    expect(end.s).toBe(100);
    expect(end.l).toBe(50);
  });

  it('interpolates RGB color objects', () => {
    const a = { r: 255, g: 0, b: 0 };  // red
    const b = { r: 0, g: 0, b: 255 };  // blue
    const mid = interpolateValue(a, b, 0.5) as { h: number; s: number; l: number };
    // Red (h=0) to blue (h=240): shortest arc goes through h=300 (magenta)
    // midpoint at t=0.5: h = 0 + (-120)*0.5 = -60 → 300
    expect(mid.h).toBeCloseTo(300, 0);
  });

  it('interpolates mixed formats: HSL object and string', () => {
    const a = { h: 0, s: 100, l: 50 };  // red
    const result = interpolateValue(a, 'blue', 0.5) as { h: number; s: number; l: number };
    expect(result).toHaveProperty('h');
    expect(result).toHaveProperty('s');
    expect(result).toHaveProperty('l');
  });

  it('returns start value for unknown types', () => {
    expect(interpolateValue([1, 2], [3, 4], 0.5)).toEqual([1, 2]);
  });
});
