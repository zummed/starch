import { lerpHsl } from '../types/color';
import type { HslColor } from '../types/properties';

function isHslObject(value: unknown): value is HslColor {
  return typeof value === 'object' && value !== null && 'h' in value && 's' in value && 'l' in value;
}

export function interpolateValue(a: unknown, b: unknown, t: number): unknown {
  // Numeric lerp
  if (typeof a === 'number' && typeof b === 'number') {
    return a + (b - a) * t;
  }

  // HSL color objects
  if (isHslObject(a) && isHslObject(b)) {
    return lerpHsl(a, b, t);
  }

  // Strings, booleans, arrays, etc. — step interpolation
  return t >= 1 ? b : a;
}
