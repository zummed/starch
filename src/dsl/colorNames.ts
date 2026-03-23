interface HslColor { h: number; s: number; l: number; }

const NAMED_COLORS: Record<string, HslColor> = {
  white:   { h: 0, s: 0, l: 100 },
  black:   { h: 0, s: 0, l: 0 },
  red:     { h: 0, s: 100, l: 50 },
  green:   { h: 120, s: 100, l: 25 },
  blue:    { h: 240, s: 100, l: 50 },
  yellow:  { h: 60, s: 100, l: 50 },
  cyan:    { h: 180, s: 100, l: 50 },
  magenta: { h: 300, s: 100, l: 50 },
  orange:  { h: 30, s: 100, l: 50 },
  purple:  { h: 270, s: 100, l: 50 },
  gray:    { h: 0, s: 0, l: 50 },
  grey:    { h: 0, s: 0, l: 50 },
};

export function nameToHsl(name: string): HslColor | undefined {
  return NAMED_COLORS[name.toLowerCase()];
}

export function hslToName(hsl: HslColor): string | undefined {
  for (const [name, color] of Object.entries(NAMED_COLORS)) {
    if (name === 'grey') continue; // prefer 'gray'
    if (color.h === hsl.h && color.s === hsl.s && color.l === hsl.l) return name;
  }
  return undefined;
}

export function hexToHsl(hex: string): HslColor {
  // Normalize: strip '#' and expand 3-char to 6-char
  let h = hex.replace(/^#/, '');
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }

  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === r) {
      hue = ((g - b) / delta) % 6;
    } else if (max === g) {
      hue = (b - r) / delta + 2;
    } else {
      hue = (r - g) / delta + 4;
    }
    hue = Math.round(hue * 60);
    if (hue < 0) hue += 360;
  }

  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  return {
    h: hue,
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100),
  };
}

export function getAllColorNames(): string[] {
  return Object.keys(NAMED_COLORS);
}
