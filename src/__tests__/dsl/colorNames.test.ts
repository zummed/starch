import { describe, it, expect } from 'vitest';
import { nameToHsl, hslToName, hexToHsl, getAllColorNames } from '../../dsl/colorNames';

describe('nameToHsl', () => {
  it('converts white', () => {
    expect(nameToHsl('white')).toEqual({ h: 0, s: 0, l: 100 });
  });

  it('converts black', () => {
    expect(nameToHsl('black')).toEqual({ h: 0, s: 0, l: 0 });
  });

  it('converts red', () => {
    expect(nameToHsl('red')).toEqual({ h: 0, s: 100, l: 50 });
  });

  it('converts green', () => {
    expect(nameToHsl('green')).toEqual({ h: 120, s: 100, l: 25 });
  });

  it('converts blue', () => {
    expect(nameToHsl('blue')).toEqual({ h: 240, s: 100, l: 50 });
  });

  it('converts yellow', () => {
    expect(nameToHsl('yellow')).toEqual({ h: 60, s: 100, l: 50 });
  });

  it('converts cyan', () => {
    expect(nameToHsl('cyan')).toEqual({ h: 180, s: 100, l: 50 });
  });

  it('converts magenta', () => {
    expect(nameToHsl('magenta')).toEqual({ h: 300, s: 100, l: 50 });
  });

  it('converts orange', () => {
    expect(nameToHsl('orange')).toEqual({ h: 30, s: 100, l: 50 });
  });

  it('converts purple', () => {
    expect(nameToHsl('purple')).toEqual({ h: 270, s: 100, l: 50 });
  });

  it('converts gray', () => {
    expect(nameToHsl('gray')).toEqual({ h: 0, s: 0, l: 50 });
  });

  it('converts grey', () => {
    expect(nameToHsl('grey')).toEqual({ h: 0, s: 0, l: 50 });
  });

  it('returns undefined for unknown color', () => {
    expect(nameToHsl('notacolor')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(nameToHsl('')).toBeUndefined();
  });

  it('is case-insensitive (uppercase)', () => {
    expect(nameToHsl('WHITE')).toEqual({ h: 0, s: 0, l: 100 });
  });

  it('is case-insensitive (mixed case)', () => {
    expect(nameToHsl('Red')).toEqual({ h: 0, s: 100, l: 50 });
  });

  it('is case-insensitive (all caps)', () => {
    expect(nameToHsl('BLUE')).toEqual({ h: 240, s: 100, l: 50 });
  });
});

describe('hslToName', () => {
  it('maps white HSL to "white"', () => {
    expect(hslToName({ h: 0, s: 0, l: 100 })).toBe('white');
  });

  it('maps black HSL to "black"', () => {
    expect(hslToName({ h: 0, s: 0, l: 0 })).toBe('black');
  });

  it('maps red HSL to "red"', () => {
    expect(hslToName({ h: 0, s: 100, l: 50 })).toBe('red');
  });

  it('maps green HSL to "green"', () => {
    expect(hslToName({ h: 120, s: 100, l: 25 })).toBe('green');
  });

  it('maps blue HSL to "blue"', () => {
    expect(hslToName({ h: 240, s: 100, l: 50 })).toBe('blue');
  });

  it('maps gray HSL to "gray" (not "grey")', () => {
    expect(hslToName({ h: 0, s: 0, l: 50 })).toBe('gray');
  });

  it('returns undefined for non-named HSL', () => {
    expect(hslToName({ h: 123, s: 45, l: 67 })).toBeUndefined();
  });

  it('returns undefined for HSL with no match', () => {
    expect(hslToName({ h: 0, s: 50, l: 50 })).toBeUndefined();
  });
});

describe('hexToHsl', () => {
  it('converts 6-char hex #ff0000 to red', () => {
    const result = hexToHsl('#ff0000');
    expect(result.h).toBeCloseTo(0, 0);
    expect(result.s).toBeCloseTo(100, 0);
    expect(result.l).toBeCloseTo(50, 0);
  });

  it('converts 6-char hex #3B82F6 (blue)', () => {
    const result = hexToHsl('#3B82F6');
    expect(result.h).toBeCloseTo(217, 0);
    expect(result.s).toBeCloseTo(91, 0);
    expect(result.l).toBeCloseTo(60, 0);
  });

  it('converts 6-char hex #ffffff to white', () => {
    const result = hexToHsl('#ffffff');
    expect(result.s).toBe(0);
    expect(result.l).toBe(100);
  });

  it('converts 6-char hex #000000 to black', () => {
    const result = hexToHsl('#000000');
    expect(result.s).toBe(0);
    expect(result.l).toBe(0);
  });

  it('converts 3-char hex #f00 to red', () => {
    const result = hexToHsl('#f00');
    expect(result.h).toBeCloseTo(0, 0);
    expect(result.s).toBeCloseTo(100, 0);
    expect(result.l).toBeCloseTo(50, 0);
  });

  it('converts 3-char hex #fff to white', () => {
    const result = hexToHsl('#fff');
    expect(result.s).toBe(0);
    expect(result.l).toBe(100);
  });

  it('converts 3-char hex #000 to black', () => {
    const result = hexToHsl('#000');
    expect(result.s).toBe(0);
    expect(result.l).toBe(0);
  });

  it('handles uppercase hex', () => {
    const result = hexToHsl('#FF0000');
    expect(result.h).toBeCloseTo(0, 0);
    expect(result.s).toBeCloseTo(100, 0);
    expect(result.l).toBeCloseTo(50, 0);
  });

  it('handles lowercase hex', () => {
    const result = hexToHsl('#00ff00');
    expect(result.h).toBeCloseTo(120, 0);
    expect(result.s).toBeCloseTo(100, 0);
    expect(result.l).toBeCloseTo(50, 0);
  });
});

describe('getAllColorNames', () => {
  it('returns an array', () => {
    expect(Array.isArray(getAllColorNames())).toBe(true);
  });

  it('includes all expected color names', () => {
    const names = getAllColorNames();
    const expected = ['white', 'black', 'red', 'green', 'blue', 'yellow', 'cyan', 'magenta', 'orange', 'purple', 'gray', 'grey'];
    for (const name of expected) {
      expect(names).toContain(name);
    }
  });

  it('returns 12 colors', () => {
    expect(getAllColorNames()).toHaveLength(12);
  });
});
