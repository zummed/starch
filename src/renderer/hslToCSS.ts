import type { HslColor, Color, Stroke } from '../types/properties';
import { colorToRgba } from '../types/color';
import { rgbaToCSS } from './colorConvert';

export function hslToCSS(color: HslColor): string {
  return `hsl(${color.h}, ${color.s}%, ${color.l}%)`;
}

export function colorToCSS(color: Color): string {
  return rgbaToCSS(colorToRgba(color));
}

export function strokeToCSS(stroke: Stroke): { color: string; width: number } {
  return {
    color: colorToCSS(stroke.color),
    width: stroke.width ?? 1,
  };
}
