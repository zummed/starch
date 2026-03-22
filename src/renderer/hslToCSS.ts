import type { HslColor, Stroke } from '../types/properties';

export function hslToCSS(color: HslColor): string {
  return `hsl(${color.h}, ${color.s}%, ${color.l}%)`;
}

export function strokeToCSS(stroke: Stroke): { color: string; width: number } {
  return {
    color: hslToCSS({ h: stroke.h, s: stroke.s, l: stroke.l }),
    width: stroke.width,
  };
}
