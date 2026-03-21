import type { HslColor } from './properties';
import { resolveColour } from '../../core/colours';

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

function isHsl(value: unknown): value is HslColor {
  return typeof value === 'object' && value !== null && 'h' in value && 's' in value && 'l' in value;
}

function isRgb(value: unknown): value is RgbColor {
  return typeof value === 'object' && value !== null && 'r' in value && 'g' in value && 'b' in value;
}

function rgbToHsl(r: number, g: number, b: number): HslColor {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hexToRgb(hex: string): [number, number, number] {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function parseColor(input: unknown): HslColor {
  if (isHsl(input)) return input;
  if (isRgb(input)) return rgbToHsl(input.r, input.g, input.b);
  if (typeof input === 'string') {
    const resolved = resolveColour(input);
    if (!resolved.startsWith('#')) {
      throw new Error(`Unrecognized color: ${input}`);
    }
    const [r, g, b] = hexToRgb(resolved);
    return rgbToHsl(r, g, b);
  }
  throw new Error(`Invalid color input: ${JSON.stringify(input)}`);
}

export function lerpHsl(a: HslColor, b: HslColor, t: number): HslColor {
  if (t <= 0) return { ...a };
  if (t >= 1) return { ...b };

  // Shortest arc for hue
  let dh = b.h - a.h;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  let h = a.h + dh * t;
  if (h < 0) h += 360;
  if (h >= 360) h -= 360;

  return {
    h: Math.round(h),
    s: Math.round(a.s + (b.s - a.s) * t),
    l: Math.round(a.l + (b.l - a.l) * t),
  };
}
