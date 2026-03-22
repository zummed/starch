import { describe, it, expect } from 'vitest';
import { parseColor, lerpHsl } from '../../types/color';

describe('parseColor', () => {
  it('passes through HSL objects unchanged', () => {
    const hsl = { h: 210, s: 80, l: 50 };
    expect(parseColor(hsl)).toEqual(hsl);
  });

  it('converts RGB object to HSL', () => {
    const result = parseColor({ r: 255, g: 0, b: 0 });
    expect(result.h).toBeCloseTo(0, 0);
    expect(result.s).toBeCloseTo(100, 0);
    expect(result.l).toBeCloseTo(50, 0);
  });

  it('converts hex string to HSL', () => {
    const result = parseColor('#ff0000');
    expect(result.h).toBeCloseTo(0, 0);
    expect(result.s).toBeCloseTo(100, 0);
    expect(result.l).toBeCloseTo(50, 0);
  });

  it('converts 3-digit hex to HSL', () => {
    const result = parseColor('#f00');
    expect(result.h).toBeCloseTo(0, 0);
    expect(result.s).toBeCloseTo(100, 0);
    expect(result.l).toBeCloseTo(50, 0);
  });

  it('converts named color to HSL', () => {
    const result = parseColor('red');
    expect(result.h).toBeCloseTo(0, 0);
    expect(result.s).toBeCloseTo(100, 0);
    expect(result.l).toBeCloseTo(50, 0);
  });

  it('converts dodgerblue to HSL', () => {
    const result = parseColor('dodgerblue');
    expect(result.h).toBeCloseTo(210, 0);
    expect(result.s).toBeCloseTo(100, 0);
    expect(result.l).toBeCloseTo(56, 0);
  });

  it('throws on unrecognized color', () => {
    expect(() => parseColor('notacolor')).toThrow();
  });
});

describe('lerpHsl', () => {
  it('interpolates at t=0 returns start', () => {
    const a = { h: 0, s: 100, l: 50 };
    const b = { h: 120, s: 50, l: 80 };
    expect(lerpHsl(a, b, 0)).toEqual(a);
  });

  it('interpolates at t=1 returns end', () => {
    const a = { h: 0, s: 100, l: 50 };
    const b = { h: 120, s: 50, l: 80 };
    expect(lerpHsl(a, b, 1)).toEqual(b);
  });

  it('interpolates at t=0.5 midpoint', () => {
    const a = { h: 0, s: 100, l: 50 };
    const b = { h: 120, s: 50, l: 80 };
    const mid = lerpHsl(a, b, 0.5);
    expect(mid.h).toBeCloseTo(60, 0);
    expect(mid.s).toBeCloseTo(75, 0);
    expect(mid.l).toBeCloseTo(65, 0);
  });

  it('takes shortest arc for hue (wrapping through 0)', () => {
    const a = { h: 350, s: 100, l: 50 };
    const b = { h: 10, s: 100, l: 50 };
    const mid = lerpHsl(a, b, 0.5);
    expect(mid.h).toBeCloseTo(0, 0);
  });

  it('takes shortest arc for hue (other direction)', () => {
    const a = { h: 10, s: 100, l: 50 };
    const b = { h: 350, s: 100, l: 50 };
    const mid = lerpHsl(a, b, 0.5);
    expect(mid.h).toBeCloseTo(0, 0);
  });
});
