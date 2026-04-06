import { describe, it, expect } from 'vitest';
import {
  colorToHsl, hslToName, getAllColorNames, resolveNamedColor,
  CSS_NAMED_COLOURS,
} from '../../types/color';

// These tests verify that the functions that replaced the old colorNames.ts
// module work correctly for the DSL parser/generator use cases.

describe('colorToHsl (replaces nameToHsl + hexToHsl)', () => {
  it('converts named color "white" to HSL', () => {
    const result = colorToHsl('white');
    expect(result).toEqual({ h: 0, s: 0, l: 100 });
  });

  it('converts named color "black" to HSL', () => {
    const result = colorToHsl('black');
    expect(result).toEqual({ h: 0, s: 0, l: 0 });
  });

  it('converts named color "red" to HSL', () => {
    const result = colorToHsl('red');
    expect(result.h).toBeCloseTo(0, 0);
    expect(result.s).toBeCloseTo(100, 0);
    expect(result.l).toBeCloseTo(50, 0);
  });

  it('converts named color "blue" to HSL', () => {
    const result = colorToHsl('blue');
    expect(result.h).toBeCloseTo(240, 0);
    expect(result.s).toBeCloseTo(100, 0);
    expect(result.l).toBeCloseTo(50, 0);
  });

  it('converts named color "cyan" to HSL', () => {
    const result = colorToHsl('cyan');
    expect(result.h).toBeCloseTo(180, 0);
    expect(result.s).toBeCloseTo(100, 0);
    expect(result.l).toBeCloseTo(50, 0);
  });

  it('throws for unknown color name', () => {
    expect(() => colorToHsl('notacolor')).toThrow();
  });

  it('converts 6-char hex #ff0000 to red HSL', () => {
    const result = colorToHsl('#ff0000');
    expect(result.h).toBeCloseTo(0, 0);
    expect(result.s).toBeCloseTo(100, 0);
    expect(result.l).toBeCloseTo(50, 0);
  });

  it('converts 6-char hex #3B82F6 (blue)', () => {
    const result = colorToHsl('#3B82F6');
    expect(result.h).toBeCloseTo(217, 0);
    expect(result.s).toBeCloseTo(91, 0);
    expect(result.l).toBeCloseTo(60, 0);
  });

  it('converts 6-char hex #ffffff to white HSL', () => {
    const result = colorToHsl('#ffffff');
    expect(result.s).toBe(0);
    expect(result.l).toBe(100);
  });

  it('converts 6-char hex #000000 to black HSL', () => {
    const result = colorToHsl('#000000');
    expect(result.s).toBe(0);
    expect(result.l).toBe(0);
  });

  it('converts 3-char hex #f00 to red HSL', () => {
    const result = colorToHsl('#f00');
    expect(result.h).toBeCloseTo(0, 0);
    expect(result.s).toBeCloseTo(100, 0);
    expect(result.l).toBeCloseTo(50, 0);
  });

  it('converts 3-char hex #fff to white HSL', () => {
    const result = colorToHsl('#fff');
    expect(result.s).toBe(0);
    expect(result.l).toBe(100);
  });

  it('converts 3-char hex #000 to black HSL', () => {
    const result = colorToHsl('#000');
    expect(result.s).toBe(0);
    expect(result.l).toBe(0);
  });
});

describe('resolveNamedColor (replaces nameToHsl for existence check)', () => {
  it('returns RGB for recognized name', () => {
    expect(resolveNamedColor('red')).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('returns null for unknown name', () => {
    expect(resolveNamedColor('notacolor')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(resolveNamedColor('')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(resolveNamedColor('RED')).toEqual({ r: 255, g: 0, b: 0 });
    expect(resolveNamedColor('Red')).toEqual({ r: 255, g: 0, b: 0 });
  });
});

describe('hslToName', () => {
  it('maps white HSL to "white"', () => {
    expect(hslToName({ h: 0, s: 0, l: 100 })).toBe('white');
  });

  it('maps black HSL to "black"', () => {
    expect(hslToName({ h: 0, s: 0, l: 0 })).toBe('black');
  });

  it('maps pure red HSL to "red"', () => {
    expect(hslToName({ h: 0, s: 100, l: 50 })).toBe('red');
  });

  it('maps pure blue HSL to "blue"', () => {
    expect(hslToName({ h: 240, s: 100, l: 50 })).toBe('blue');
  });

  it('returns undefined for non-named HSL', () => {
    expect(hslToName({ h: 123, s: 45, l: 67 })).toBeUndefined();
  });

  it('round-trips: colorToHsl then hslToName for basic colors', () => {
    // Note: cyan and aqua share the same hex (#00ffff), so cyan round-trips to aqua.
    // Similarly, magenta and fuchsia share #ff00ff, so magenta round-trips to fuchsia.
    const roundTripCases: [string, string][] = [
      ['red', 'red'],
      ['blue', 'blue'],
      ['white', 'white'],
      ['black', 'black'],
      ['yellow', 'yellow'],
      ['cyan', 'aqua'],       // aqua comes first in CSS_NAMED_COLOURS iteration
      ['magenta', 'fuchsia'], // fuchsia comes first in CSS_NAMED_COLOURS iteration
    ];
    for (const [input, expected] of roundTripCases) {
      const hsl = colorToHsl(input);
      expect(hslToName(hsl)).toBe(expected);
    }
  });
});

describe('getAllColorNames', () => {
  it('returns an array', () => {
    expect(Array.isArray(getAllColorNames())).toBe(true);
  });

  it('includes basic color names', () => {
    const names = getAllColorNames();
    for (const name of ['white', 'black', 'red', 'green', 'blue', 'yellow', 'cyan']) {
      expect(names).toContain(name);
    }
  });

  it('returns all CSS named colors', () => {
    const names = getAllColorNames();
    expect(names.length).toBe(Object.keys(CSS_NAMED_COLOURS).length);
  });

  it('includes extended CSS colors', () => {
    const names = getAllColorNames();
    expect(names).toContain('dodgerblue');
    expect(names).toContain('coral');
    expect(names).toContain('rebeccapurple');
  });
});
