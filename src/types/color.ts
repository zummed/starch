import type { HslColor, RgbColor, Color } from './properties';

// ─── CSS Named Colours ──────────────────────────────────────────

export const CSS_NAMED_COLOURS: Record<string, string> = {
  aliceblue: '#f0f8ff', antiquewhite: '#faebd7', aqua: '#00ffff', aquamarine: '#7fffd4',
  azure: '#f0ffff', beige: '#f5f5dc', bisque: '#ffe4c4', black: '#000000',
  blanchedalmond: '#ffebcd', blue: '#0000ff', blueviolet: '#8a2be2', brown: '#a52a2a',
  burlywood: '#deb887', cadetblue: '#5f9ea0', chartreuse: '#7fff00', chocolate: '#d2691e',
  coral: '#ff7f50', cornflowerblue: '#6495ed', cornsilk: '#fff8dc', crimson: '#dc143c',
  cyan: '#00ffff', darkblue: '#00008b', darkcyan: '#008b8b', darkgoldenrod: '#b8860b',
  darkgray: '#a9a9a9', darkgreen: '#006400', darkgrey: '#a9a9a9', darkkhaki: '#bdb76b',
  darkmagenta: '#8b008b', darkolivegreen: '#556b2f', darkorange: '#ff8c00',
  darkorchid: '#9932cc', darkred: '#8b0000', darksalmon: '#e9967a', darkseagreen: '#8fbc8f',
  darkslateblue: '#483d8b', darkslategray: '#2f4f4f', darkslategrey: '#2f4f4f',
  darkturquoise: '#00ced1', darkviolet: '#9400d3', deeppink: '#ff1493',
  deepskyblue: '#00bfff', dimgray: '#696969', dimgrey: '#696969', dodgerblue: '#1e90ff',
  firebrick: '#b22222', floralwhite: '#fffaf0', forestgreen: '#228b22', fuchsia: '#ff00ff',
  gainsboro: '#dcdcdc', ghostwhite: '#f8f8ff', gold: '#ffd700', goldenrod: '#daa520',
  gray: '#808080', green: '#008000', greenyellow: '#adff2f', grey: '#808080',
  honeydew: '#f0fff0', hotpink: '#ff69b4', indianred: '#cd5c5c', indigo: '#4b0082',
  ivory: '#fffff0', khaki: '#f0e68c', lavender: '#e6e6fa', lavenderblush: '#fff0f5',
  lawngreen: '#7cfc00', lemonchiffon: '#fffacd', lightblue: '#add8e6', lightcoral: '#f08080',
  lightcyan: '#e0ffff', lightgoldenrodyellow: '#fafad2', lightgray: '#d3d3d3',
  lightgreen: '#90ee90', lightgrey: '#d3d3d3', lightpink: '#ffb6c1', lightsalmon: '#ffa07a',
  lightseagreen: '#20b2aa', lightskyblue: '#87cefa', lightslategray: '#778899',
  lightslategrey: '#778899', lightsteelblue: '#b0c4de', lightyellow: '#ffffe0',
  lime: '#00ff00', limegreen: '#32cd32', linen: '#faf0e6', magenta: '#ff00ff',
  maroon: '#800000', mediumaquamarine: '#66cdaa', mediumblue: '#0000cd',
  mediumorchid: '#ba55d3', mediumpurple: '#9370db', mediumseagreen: '#3cb371',
  mediumslateblue: '#7b68ee', mediumspringgreen: '#00fa9a', mediumturquoise: '#48d1cc',
  mediumvioletred: '#c71585', midnightblue: '#191970', mintcream: '#f5fffa',
  mistyrose: '#ffe4e1', moccasin: '#ffe4b5', navajowhite: '#ffdead', navy: '#000080',
  oldlace: '#fdf5e6', olive: '#808000', olivedrab: '#6b8e23', orange: '#ffa500',
  orangered: '#ff4500', orchid: '#da70d6', palegoldenrod: '#eee8aa', palegreen: '#98fb98',
  paleturquoise: '#afeeee', palevioletred: '#db7093', papayawhip: '#ffefd5',
  peachpuff: '#ffdab9', peru: '#cd853f', pink: '#ffc0cb', plum: '#dda0dd',
  powderblue: '#b0e0e6', purple: '#800080', rebeccapurple: '#663399', red: '#ff0000',
  rosybrown: '#bc8f8f', royalblue: '#4169e1', saddlebrown: '#8b4513', salmon: '#fa8072',
  sandybrown: '#f4a460', seagreen: '#2e8b57', seashell: '#fff5ee', sienna: '#a0522d',
  silver: '#c0c0c0', skyblue: '#87ceeb', slateblue: '#6a5acd', slategray: '#708090',
  slategrey: '#708090', snow: '#fffafa', springgreen: '#00ff7f', steelblue: '#4682b4',
  tan: '#d2b48c', teal: '#008080', thistle: '#d8bfd8', tomato: '#ff6347',
  turquoise: '#40e0d0', violet: '#ee82ee', wheat: '#f5deb3', white: '#ffffff',
  whitesmoke: '#f5f5f5', yellow: '#ffff00', yellowgreen: '#9acd32',
};

// ─── Low-level Converters ───────────────────────────────────────

export function rgbToHsl(r: number, g: number, b: number): HslColor {
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

export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h /= 360; s /= 100; l /= 100;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1/3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1/3) * 255),
  };
}

export function hexToRgb(hex: string): [number, number, number] {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ─── Named Color Utilities ──────────────────────────────────────

/**
 * Resolve a CSS named color to an RGB object.
 * Returns null if the name is not recognized.
 */
export function resolveNamedColor(name: string): RgbColor | null {
  const hex = CSS_NAMED_COLOURS[name.toLowerCase().trim()];
  if (!hex) return null;
  const [r, g, b] = hexToRgb(hex);
  return { r, g, b };
}

/**
 * Reverse lookup: find a CSS color name for an RGB value.
 * Returns null if no exact match.
 */
export function rgbToName(color: RgbColor): string | null {
  // Build hex string from RGB
  const hex = '#' + [color.r, color.g, color.b]
    .map(c => c.toString(16).padStart(2, '0'))
    .join('');
  for (const [name, value] of Object.entries(CSS_NAMED_COLOURS)) {
    // CSS_NAMED_COLOURS stores as lowercase 6-digit hex
    if (value === hex) return name;
  }
  return null;
}

/**
 * Reverse lookup: find a CSS color name for an HSL value.
 * Converts HSL to RGB first, then looks up the name.
 * Returns undefined if no exact match.
 */
export function hslToName(hsl: { h: number; s: number; l: number }): string | undefined {
  const { r, g, b } = hslToRgb(hsl.h, hsl.s, hsl.l);
  return rgbToName({ r, g, b }) ?? undefined;
}

/**
 * Return all CSS named color names.
 */
export function getAllColorNames(): string[] {
  return Object.keys(CSS_NAMED_COLOURS);
}

// ─── Type Guard ─────────────────────────────────────────────────

/**
 * Runtime type guard for the Color union type.
 */
export function isColor(value: unknown): value is Color {
  if (typeof value === 'string') return true;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  // RGB
  if ('r' in obj && 'g' in obj && 'b' in obj) return true;
  // HSL
  if ('h' in obj && 's' in obj && 'l' in obj) return true;
  // Named + alpha
  if ('name' in obj && 'a' in obj) return true;
  // Hex + alpha
  if ('hex' in obj && 'a' in obj) return true;
  return false;
}

// ─── Color Converters ───────────────────────────────────────────

/**
 * Convert any Color to HSL.
 */
export function colorToHsl(color: Color): HslColor {
  if (typeof color === 'string') {
    if (color.startsWith('#')) {
      const [r, g, b] = hexToRgb(color);
      return rgbToHsl(r, g, b);
    }
    const rgb = resolveNamedColor(color);
    if (!rgb) throw new Error(`Unrecognized color: ${color}`);
    return rgbToHsl(rgb.r, rgb.g, rgb.b);
  }

  if (typeof color !== 'object' || color === null) {
    throw new Error(`Invalid color input: ${JSON.stringify(color)}`);
  }

  // HSL passthrough
  if ('h' in color && 's' in color && 'l' in color) {
    const hsl = color as HslColor;
    const result: HslColor = { h: hsl.h, s: hsl.s, l: hsl.l };
    if (hsl.a !== undefined) result.a = hsl.a;
    return result;
  }

  // RGB
  if ('r' in color && 'g' in color && 'b' in color) {
    const rgb = color as RgbColor;
    const result = rgbToHsl(rgb.r, rgb.g, rgb.b);
    if (rgb.a !== undefined) result.a = rgb.a;
    return result;
  }

  // Named + alpha
  if ('name' in color && 'a' in color) {
    const named = color as { name: string; a: number };
    const rgb = resolveNamedColor(named.name);
    if (!rgb) throw new Error(`Unrecognized color name: ${named.name}`);
    const result = rgbToHsl(rgb.r, rgb.g, rgb.b);
    result.a = named.a;
    return result;
  }

  // Hex + alpha
  if ('hex' in color && 'a' in color) {
    const hexAlpha = color as { hex: string; a: number };
    const [r, g, b] = hexToRgb(hexAlpha.hex);
    const result = rgbToHsl(r, g, b);
    result.a = hexAlpha.a;
    return result;
  }

  throw new Error(`Invalid color input: ${JSON.stringify(color)}`);
}

/**
 * Convert any Color to RGBA for rendering.
 */
export function colorToRgba(color: Color): { r: number; g: number; b: number; a: number } {
  if (typeof color === 'string') {
    if (color.startsWith('#')) {
      const [r, g, b] = hexToRgb(color);
      return { r, g, b, a: 1 };
    }
    const rgb = resolveNamedColor(color);
    if (!rgb) throw new Error(`Unrecognized color: ${color}`);
    return { r: rgb.r, g: rgb.g, b: rgb.b, a: 1 };
  }

  if (typeof color !== 'object' || color === null) {
    throw new Error(`Invalid color input: ${JSON.stringify(color)}`);
  }

  // RGB
  if ('r' in color && 'g' in color && 'b' in color) {
    const rgb = color as RgbColor;
    return { r: rgb.r, g: rgb.g, b: rgb.b, a: rgb.a ?? 1 };
  }

  // HSL
  if ('h' in color && 's' in color && 'l' in color) {
    const hsl = color as HslColor;
    const { r, g, b } = hslToRgb(hsl.h, hsl.s, hsl.l);
    return { r, g, b, a: hsl.a ?? 1 };
  }

  // Named + alpha
  if ('name' in color && 'a' in color) {
    const named = color as { name: string; a: number };
    const rgb = resolveNamedColor(named.name);
    if (!rgb) throw new Error(`Unrecognized color name: ${named.name}`);
    return { r: rgb.r, g: rgb.g, b: rgb.b, a: named.a };
  }

  // Hex + alpha
  if ('hex' in color && 'a' in color) {
    const hexAlpha = color as { hex: string; a: number };
    const [r, g, b] = hexToRgb(hexAlpha.hex);
    return { r, g, b, a: hexAlpha.a };
  }

  throw new Error(`Invalid color input: ${JSON.stringify(color)}`);
}

// ─── Backward Compatibility ─────────────────────────────────────

/**
 * @deprecated Use colorToHsl instead
 */
export function parseColor(input: unknown): HslColor {
  return colorToHsl(input as Color);
}

// ─── Interpolation ──────────────────────────────────────────────

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

  const result: HslColor = {
    h: Math.round(h),
    s: Math.round(a.s + (b.s - a.s) * t),
    l: Math.round(a.l + (b.l - a.l) * t),
  };

  // Alpha interpolation
  const hasAlphaA = a.a !== undefined;
  const hasAlphaB = b.a !== undefined;
  if (hasAlphaA || hasAlphaB) {
    const alphaA = a.a ?? 1;
    const alphaB = b.a ?? 1;
    result.a = alphaA + (alphaB - alphaA) * t;
  }

  return result;
}
