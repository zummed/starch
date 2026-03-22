/**
 * Pluggable renderer backend interface.
 * Each renderer (SVG, Canvas2D, Three.js, ASCII) implements this.
 */

export interface RendererInfo {
  name: string;
  supports2D: boolean;
  supports3D: boolean;
  supportsInteraction: boolean;
}

export interface RgbaColor {
  r: number;  // 0-255
  g: number;  // 0-255
  b: number;  // 0-255
  a: number;  // 0-1
}

export interface StrokeStyle {
  color: RgbaColor;
  width: number;
  dash?: { length: number; gap: number; pattern?: string };
}

export type PathSegment =
  | { type: 'moveTo'; x: number; y: number }
  | { type: 'lineTo'; x: number; y: number }
  | { type: 'cubicTo'; cx1: number; cy1: number; cx2: number; cy2: number; x: number; y: number }
  | { type: 'quadTo'; cx: number; cy: number; x: number; y: number }
  | { type: 'close' };

export interface RenderBackend {
  readonly info: RendererInfo;

  // Lifecycle
  mount(container: HTMLElement): void;
  destroy(): void;
  beginFrame(): void;
  endFrame(): void;

  // Viewport
  setViewBox(x: number, y: number, w: number, h: number, rotation?: number): void;
  clearViewBox(): void;
  setBackground(color: RgbaColor | 'transparent'): void;

  // Transform stack
  pushTransform(x: number, y: number, rotation: number, scale: number): void;
  popTransform(): void;

  // Opacity stack (multiplicative — implementations must maintain internal composed product)
  pushOpacity(opacity: number): void;
  popOpacity(): void;

  // Draw commands
  drawRect(w: number, h: number, radius: number, fill: RgbaColor | null, stroke: StrokeStyle | null): void;
  drawEllipse(rx: number, ry: number, fill: RgbaColor | null, stroke: StrokeStyle | null): void;
  drawText(content: string, size: number, fill: RgbaColor, align: 'start' | 'middle' | 'end', bold: boolean, mono: boolean): void;
  drawPath(segments: PathSegment[], fill: RgbaColor | null, stroke: StrokeStyle | null, drawProgress?: number): void;
  drawImage(src: string, w: number, h: number, fit: 'contain' | 'cover' | 'fill'): void;
}
