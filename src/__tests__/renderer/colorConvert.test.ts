import { describe, it, expect } from 'vitest';
import { hslToRgba, rgbaToCSS } from '../../renderer/colorConvert';

describe('hslToRgba', () => {
  it('converts pure red', () => {
    const c = hslToRgba({ h: 0, s: 100, l: 50 });
    expect(c.r).toBe(255);
    expect(c.g).toBe(0);
    expect(c.b).toBe(0);
    expect(c.a).toBe(1.0);
  });

  it('converts pure green', () => {
    const c = hslToRgba({ h: 120, s: 100, l: 50 });
    expect(c.r).toBe(0);
    expect(c.g).toBe(255);
    expect(c.b).toBe(0);
  });

  it('converts pure blue', () => {
    const c = hslToRgba({ h: 240, s: 100, l: 50 });
    expect(c.r).toBe(0);
    expect(c.g).toBe(0);
    expect(c.b).toBe(255);
  });

  it('converts white', () => {
    const c = hslToRgba({ h: 0, s: 0, l: 100 });
    expect(c.r).toBe(255);
    expect(c.g).toBe(255);
    expect(c.b).toBe(255);
  });

  it('converts black', () => {
    const c = hslToRgba({ h: 0, s: 0, l: 0 });
    expect(c.r).toBe(0);
    expect(c.g).toBe(0);
    expect(c.b).toBe(0);
  });

  it('converts grey (50% lightness, 0 saturation)', () => {
    const c = hslToRgba({ h: 0, s: 0, l: 50 });
    expect(c.r).toBe(128);
    expect(c.g).toBe(128);
    expect(c.b).toBe(128);
  });

  it('always returns a=1.0', () => {
    const c = hslToRgba({ h: 210, s: 80, l: 50 });
    expect(c.a).toBe(1.0);
  });

  it('converts dodgerblue-ish hue', () => {
    const c = hslToRgba({ h: 210, s: 100, l: 56 });
    // Should be close to dodgerblue (#1e90ff = 30, 144, 255)
    expect(c.r).toBeGreaterThan(20);
    expect(c.r).toBeLessThan(50);
    expect(c.g).toBeGreaterThan(130);
    expect(c.g).toBeLessThan(160);
    expect(c.b).toBe(255);
  });
});

describe('rgbaToCSS', () => {
  it('produces rgba() string', () => {
    expect(rgbaToCSS({ r: 255, g: 0, b: 0, a: 1 })).toBe('rgba(255, 0, 0, 1)');
  });

  it('handles fractional alpha', () => {
    expect(rgbaToCSS({ r: 0, g: 128, b: 255, a: 0.5 })).toBe('rgba(0, 128, 255, 0.5)');
  });
});
