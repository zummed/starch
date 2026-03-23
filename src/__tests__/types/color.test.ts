import { describe, it, expect } from 'vitest';
import { colorToHsl, colorToRgba, lerpHsl, isColor, resolveNamedColor, rgbToName } from '../../types/color';
import type { Color, HslColor, RgbColor } from '../../types/properties';

// ─── colorToHsl (replaces parseColor) ───────────────────────────

describe('colorToHsl', () => {
  it('passes through HSL objects unchanged', () => {
    const hsl: HslColor = { h: 210, s: 80, l: 50 };
    expect(colorToHsl(hsl)).toEqual(hsl);
  });

  it('passes through HSL with alpha unchanged', () => {
    const hsl: HslColor = { h: 210, s: 80, l: 50, a: 0.5 };
    expect(colorToHsl(hsl)).toEqual(hsl);
  });

  it('converts RGB object to HSL', () => {
    const result = colorToHsl({ r: 255, g: 0, b: 0 });
    expect(result.h).toBeCloseTo(0, 0);
    expect(result.s).toBeCloseTo(100, 0);
    expect(result.l).toBeCloseTo(50, 0);
    expect(result.a).toBeUndefined();
  });

  it('converts RGB object with alpha to HSL preserving alpha', () => {
    const result = colorToHsl({ r: 255, g: 0, b: 0, a: 0.7 });
    expect(result.h).toBeCloseTo(0, 0);
    expect(result.s).toBeCloseTo(100, 0);
    expect(result.l).toBeCloseTo(50, 0);
    expect(result.a).toBeCloseTo(0.7);
  });

  it('converts hex string to HSL', () => {
    const result = colorToHsl('#ff0000');
    expect(result.h).toBeCloseTo(0, 0);
    expect(result.s).toBeCloseTo(100, 0);
    expect(result.l).toBeCloseTo(50, 0);
  });

  it('converts 3-digit hex to HSL', () => {
    const result = colorToHsl('#f00');
    expect(result.h).toBeCloseTo(0, 0);
    expect(result.s).toBeCloseTo(100, 0);
    expect(result.l).toBeCloseTo(50, 0);
  });

  it('converts named color string to HSL', () => {
    const result = colorToHsl('red');
    expect(result.h).toBeCloseTo(0, 0);
    expect(result.s).toBeCloseTo(100, 0);
    expect(result.l).toBeCloseTo(50, 0);
  });

  it('converts dodgerblue string to HSL', () => {
    const result = colorToHsl('dodgerblue');
    expect(result.h).toBeCloseTo(210, 0);
    expect(result.s).toBeCloseTo(100, 0);
    expect(result.l).toBeCloseTo(56, 0);
  });

  it('converts { name, a } to HSL with alpha', () => {
    const result = colorToHsl({ name: 'red', a: 0.3 });
    expect(result.h).toBeCloseTo(0, 0);
    expect(result.s).toBeCloseTo(100, 0);
    expect(result.l).toBeCloseTo(50, 0);
    expect(result.a).toBeCloseTo(0.3);
  });

  it('converts { hex, a } to HSL with alpha', () => {
    const result = colorToHsl({ hex: '#ff0000', a: 0.4 });
    expect(result.h).toBeCloseTo(0, 0);
    expect(result.s).toBeCloseTo(100, 0);
    expect(result.l).toBeCloseTo(50, 0);
    expect(result.a).toBeCloseTo(0.4);
  });

  it('converts { hex, a } with 3-digit hex to HSL with alpha', () => {
    const result = colorToHsl({ hex: '#f00', a: 0.9 });
    expect(result.h).toBeCloseTo(0, 0);
    expect(result.s).toBeCloseTo(100, 0);
    expect(result.l).toBeCloseTo(50, 0);
    expect(result.a).toBeCloseTo(0.9);
  });

  it('throws on unrecognized named color string', () => {
    expect(() => colorToHsl('notacolor')).toThrow();
  });

  it('throws on invalid input', () => {
    expect(() => colorToHsl(42 as unknown as Color)).toThrow();
  });
});

// ─── isColor ────────────────────────────────────────────────────

describe('isColor', () => {
  it('accepts named color string', () => {
    expect(isColor('red')).toBe(true);
  });

  it('accepts hex color string', () => {
    expect(isColor('#ff0000')).toBe(true);
  });

  it('accepts any string (permissive for strings)', () => {
    expect(isColor('whatever')).toBe(true);
  });

  it('accepts RGB object', () => {
    expect(isColor({ r: 255, g: 0, b: 0 })).toBe(true);
  });

  it('accepts RGB object with alpha', () => {
    expect(isColor({ r: 255, g: 0, b: 0, a: 0.5 })).toBe(true);
  });

  it('accepts HSL object', () => {
    expect(isColor({ h: 0, s: 100, l: 50 })).toBe(true);
  });

  it('accepts HSL object with alpha', () => {
    expect(isColor({ h: 0, s: 100, l: 50, a: 0.5 })).toBe(true);
  });

  it('accepts { name, a } object', () => {
    expect(isColor({ name: 'red', a: 0.5 })).toBe(true);
  });

  it('accepts { hex, a } object', () => {
    expect(isColor({ hex: '#ff0000', a: 0.5 })).toBe(true);
  });

  it('rejects numbers', () => {
    expect(isColor(42)).toBe(false);
  });

  it('rejects null', () => {
    expect(isColor(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isColor(undefined)).toBe(false);
  });

  it('rejects unrelated objects', () => {
    expect(isColor({ x: 1, y: 2 })).toBe(false);
  });

  it('rejects arrays', () => {
    expect(isColor([1, 2, 3])).toBe(false);
  });
});

// ─── resolveNamedColor ──────────────────────────────────────────

describe('resolveNamedColor', () => {
  it('resolves "red" to RGB', () => {
    const result = resolveNamedColor('red');
    expect(result).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('resolves case-insensitively', () => {
    const result = resolveNamedColor('DodgerBlue');
    expect(result).not.toBeNull();
    expect(result!.r).toBe(30);
    expect(result!.g).toBe(144);
    expect(result!.b).toBe(255);
  });

  it('returns null for unknown name', () => {
    expect(resolveNamedColor('notacolor')).toBeNull();
  });
});

// ─── rgbToName ──────────────────────────────────────────────────

describe('rgbToName', () => {
  it('looks up red', () => {
    expect(rgbToName({ r: 255, g: 0, b: 0 })).toBe('red');
  });

  it('looks up white', () => {
    expect(rgbToName({ r: 255, g: 255, b: 255 })).toBe('white');
  });

  it('returns null for unknown RGB', () => {
    expect(rgbToName({ r: 1, g: 2, b: 3 })).toBeNull();
  });
});

// ─── colorToRgba ────────────────────────────────────────────────

describe('colorToRgba', () => {
  it('converts named string to RGBA', () => {
    const result = colorToRgba('red');
    expect(result.r).toBe(255);
    expect(result.g).toBe(0);
    expect(result.b).toBe(0);
    expect(result.a).toBe(1);
  });

  it('converts hex string to RGBA', () => {
    const result = colorToRgba('#00ff00');
    expect(result.r).toBe(0);
    expect(result.g).toBe(255);
    expect(result.b).toBe(0);
    expect(result.a).toBe(1);
  });

  it('converts RGB object to RGBA (defaults a to 1)', () => {
    const result = colorToRgba({ r: 0, g: 0, b: 255 });
    expect(result).toEqual({ r: 0, g: 0, b: 255, a: 1 });
  });

  it('converts RGB object with alpha', () => {
    const result = colorToRgba({ r: 0, g: 0, b: 255, a: 0.5 });
    expect(result).toEqual({ r: 0, g: 0, b: 255, a: 0.5 });
  });

  it('converts HSL object to RGBA', () => {
    // Pure red in HSL → { r: 255, g: 0, b: 0, a: 1 }
    const result = colorToRgba({ h: 0, s: 100, l: 50 });
    expect(result.r).toBe(255);
    expect(result.g).toBe(0);
    expect(result.b).toBe(0);
    expect(result.a).toBe(1);
  });

  it('converts HSL with alpha', () => {
    const result = colorToRgba({ h: 0, s: 100, l: 50, a: 0.5 });
    expect(result.r).toBe(255);
    expect(result.g).toBe(0);
    expect(result.b).toBe(0);
    expect(result.a).toBe(0.5);
  });

  it('converts { name, a } to RGBA', () => {
    const result = colorToRgba({ name: 'red', a: 0.3 });
    expect(result.r).toBe(255);
    expect(result.g).toBe(0);
    expect(result.b).toBe(0);
    expect(result.a).toBe(0.3);
  });

  it('converts { hex, a } to RGBA', () => {
    const result = colorToRgba({ hex: '#0000ff', a: 0.8 });
    expect(result.r).toBe(0);
    expect(result.g).toBe(0);
    expect(result.b).toBe(255);
    expect(result.a).toBe(0.8);
  });
});

// ─── lerpHsl with alpha ─────────────────────────────────────────

describe('lerpHsl', () => {
  it('interpolates at t=0 returns start', () => {
    const a: HslColor = { h: 0, s: 100, l: 50 };
    const b: HslColor = { h: 120, s: 50, l: 80 };
    expect(lerpHsl(a, b, 0)).toEqual(a);
  });

  it('interpolates at t=1 returns end', () => {
    const a: HslColor = { h: 0, s: 100, l: 50 };
    const b: HslColor = { h: 120, s: 50, l: 80 };
    expect(lerpHsl(a, b, 1)).toEqual(b);
  });

  it('interpolates at t=0.5 midpoint', () => {
    const a: HslColor = { h: 0, s: 100, l: 50 };
    const b: HslColor = { h: 120, s: 50, l: 80 };
    const mid = lerpHsl(a, b, 0.5);
    expect(mid.h).toBeCloseTo(60, 0);
    expect(mid.s).toBeCloseTo(75, 0);
    expect(mid.l).toBeCloseTo(65, 0);
  });

  it('takes shortest arc for hue (wrapping through 0)', () => {
    const a: HslColor = { h: 350, s: 100, l: 50 };
    const b: HslColor = { h: 10, s: 100, l: 50 };
    const mid = lerpHsl(a, b, 0.5);
    expect(mid.h).toBeCloseTo(0, 0);
  });

  it('takes shortest arc for hue (other direction)', () => {
    const a: HslColor = { h: 10, s: 100, l: 50 };
    const b: HslColor = { h: 350, s: 100, l: 50 };
    const mid = lerpHsl(a, b, 0.5);
    expect(mid.h).toBeCloseTo(0, 0);
  });

  it('interpolates alpha when both have it', () => {
    const a: HslColor = { h: 0, s: 100, l: 50, a: 0.2 };
    const b: HslColor = { h: 0, s: 100, l: 50, a: 0.8 };
    const mid = lerpHsl(a, b, 0.5);
    expect(mid.a).toBeCloseTo(0.5);
  });

  it('defaults missing alpha to 1 when other has alpha', () => {
    const a: HslColor = { h: 0, s: 100, l: 50 };
    const b: HslColor = { h: 0, s: 100, l: 50, a: 0.5 };
    const mid = lerpHsl(a, b, 0.5);
    expect(mid.a).toBeCloseTo(0.75); // lerp(1.0, 0.5, 0.5) = 0.75
  });

  it('defaults missing alpha on the other side to 1', () => {
    const a: HslColor = { h: 0, s: 100, l: 50, a: 0.5 };
    const b: HslColor = { h: 0, s: 100, l: 50 };
    const mid = lerpHsl(a, b, 0.5);
    expect(mid.a).toBeCloseTo(0.75); // lerp(0.5, 1.0, 0.5) = 0.75
  });

  it('omits alpha from result when neither has it', () => {
    const a: HslColor = { h: 0, s: 100, l: 50 };
    const b: HslColor = { h: 120, s: 50, l: 80 };
    const mid = lerpHsl(a, b, 0.5);
    expect(mid.a).toBeUndefined();
  });

  it('preserves alpha at t=0 boundary', () => {
    const a: HslColor = { h: 0, s: 100, l: 50, a: 0.3 };
    const b: HslColor = { h: 0, s: 100, l: 50, a: 0.9 };
    const result = lerpHsl(a, b, 0);
    expect(result.a).toBeCloseTo(0.3);
  });

  it('preserves alpha at t=1 boundary', () => {
    const a: HslColor = { h: 0, s: 100, l: 50, a: 0.3 };
    const b: HslColor = { h: 0, s: 100, l: 50, a: 0.9 };
    const result = lerpHsl(a, b, 1);
    expect(result.a).toBeCloseTo(0.9);
  });
});
