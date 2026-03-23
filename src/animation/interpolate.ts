import { isColor, colorToHsl, lerpHsl } from '../types/color';

export function interpolateValue(a: unknown, b: unknown, t: number): unknown {
  // Numeric lerp
  if (typeof a === 'number' && typeof b === 'number') {
    return a + (b - a) * t;
  }

  // Color values (HSL objects, RGB objects, named/hex strings)
  if (isColor(a) && isColor(b)) {
    try {
      return lerpHsl(colorToHsl(a as any), colorToHsl(b as any), t);
    } catch {
      // If color conversion fails (e.g. unrecognized string), fall through to step interpolation
    }
  }

  // Strings, booleans, arrays, etc. — step interpolation
  return t >= 1 ? b : a;
}
