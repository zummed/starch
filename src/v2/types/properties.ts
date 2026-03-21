export interface HslColor {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

export interface Stroke {
  h: number;
  s: number;
  l: number;
  width: number;
}

export interface Transform {
  x?: number;
  y?: number;
  rotation?: number;
  scale?: number;
  anchor?: string | [number, number];
  pathFollow?: string;
  pathProgress?: number;
}

export interface Dash {
  pattern: string; // "solid", "dashed", "dotted", or SVG dasharray
  length: number;
  gap: number;
}

export interface Layout {
  type: string;
  direction?: string;
  gap?: number;
  justify?: string;
  align?: string;
  wrap?: boolean;
  padding?: number;
}

export type LayoutHint = Record<string, number | string | boolean>;

export interface Size {
  w: number;
  h: number;
}
