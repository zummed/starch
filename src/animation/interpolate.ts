import { isColor, colorToHsl, lerpHsl } from '../types/color';

/**
 * @param t Eased progress — used for numeric and color interpolation.
 * @param rawT Raw (un-eased) segment progress — used to decide the step
 *   for non-interpolable values. Overshooting/oscillating easings (e.g.
 *   easeOutBack) can push the eased t past 1 well before the segment has
 *   actually finished; gating the step on raw progress means those easings
 *   can no longer flip a step value mid-flight. Defaults to `t` for callers
 *   that don't distinguish the two.
 */
export function interpolateValue(a: unknown, b: unknown, t: number, rawT: number = t): unknown {
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

  // Strings, booleans, arrays, etc. — step interpolation, gated on raw
  // progress so it only steps once the segment has actually arrived.
  return rawT >= 1 ? b : a;
}
