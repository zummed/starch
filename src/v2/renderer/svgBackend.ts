/**
 * SVG RenderBackend implementation.
 * Maps draw commands to SVG DOM elements.
 */
import type { RenderBackend, RendererInfo, RgbaColor, StrokeStyle } from './backend';
import { rgbaToCSS } from './colorConvert';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag: string, attrs?: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, String(v));
    }
  }
  return el;
}

function applyFillStroke(el: SVGElement, fill: RgbaColor | null, stroke: StrokeStyle | null): void {
  if (fill) {
    el.setAttribute('fill', rgbaToCSS(fill));
  } else {
    el.setAttribute('fill', 'none');
  }
  if (stroke) {
    el.setAttribute('stroke', rgbaToCSS(stroke.color));
    el.setAttribute('stroke-width', String(stroke.width));
    if (stroke.dash) {
      el.setAttribute('stroke-dasharray', `${stroke.dash.length} ${stroke.dash.gap}`);
      if (stroke.dash.pattern === 'dotted') {
        el.setAttribute('stroke-linecap', 'round');
      }
    }
  }
}

/**
 * Convert Catmull-Rom control points to SVG cubic bezier path commands.
 */
function catmullRomToSvgPath(points: [number, number][], closed: boolean): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M${points[0][0]},${points[0][1]} L${points[1][0]},${points[1][1]}`;
  }

  const tension = 0.5;
  let d = `M${points[0][0]},${points[0][1]}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1[0] + (p2[0] - p0[0]) * tension / 3;
    const cp1y = p1[1] + (p2[1] - p0[1]) * tension / 3;
    const cp2x = p2[0] - (p3[0] - p1[0]) * tension / 3;
    const cp2y = p2[1] - (p3[1] - p1[1]) * tension / 3;

    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
  }

  if (closed) d += ' Z';
  return d;
}

export class SvgRenderBackend implements RenderBackend {
  readonly info: RendererInfo = {
    name: 'svg',
    supports2D: true,
    supports3D: false,
    supportsInteraction: true,
  };

  private _svg: SVGSVGElement | null = null;
  private _bg: SVGRectElement | null = null;
  private _content: SVGGElement | null = null;
  private _groupStack: SVGGElement[] = [];

  mount(container: HTMLElement): void {
    this._svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    this._svg.setAttribute('width', '100%');
    this._svg.setAttribute('height', '100%');
    this._svg.style.display = 'block';

    this._bg = svgEl('rect', { width: '100%', height: '100%', fill: '#0e1117' }) as SVGRectElement;
    this._svg.appendChild(this._bg);

    this._content = svgEl('g') as SVGGElement;
    this._svg.appendChild(this._content);

    container.appendChild(this._svg);
  }

  destroy(): void {
    this._svg?.remove();
    this._svg = null;
    this._bg = null;
    this._content = null;
    this._groupStack = [];
  }

  beginFrame(): void {
    if (!this._content) return;
    while (this._content.lastChild) {
      this._content.removeChild(this._content.lastChild);
    }
    this._groupStack = [this._content];
  }

  endFrame(): void {
    // No-op for SVG — DOM is already live
  }

  setViewBox(x: number, y: number, w: number, h: number): void {
    if (!this._svg || !this._bg) return;
    this._svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
    this._svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this._bg.setAttribute('x', String(x));
    this._bg.setAttribute('y', String(y));
    this._bg.setAttribute('width', String(w));
    this._bg.setAttribute('height', String(h));
  }

  clearViewBox(): void {
    if (!this._svg || !this._bg) return;
    this._svg.removeAttribute('viewBox');
    this._svg.removeAttribute('preserveAspectRatio');
    this._bg.setAttribute('x', '0');
    this._bg.setAttribute('y', '0');
    this._bg.setAttribute('width', '100%');
    this._bg.setAttribute('height', '100%');
  }

  setBackground(color: RgbaColor | 'transparent'): void {
    if (!this._svg) return;
    if (color === 'transparent') {
      this._svg.style.background = 'transparent';
      this._bg?.setAttribute('fill', 'none');
    } else {
      const css = rgbaToCSS(color);
      this._svg.style.background = css;
      this._bg?.setAttribute('fill', 'none');
    }
  }

  pushTransform(x: number, y: number, rotation: number, scale: number): void {
    const g = svgEl('g') as SVGGElement;
    const parts: string[] = [];
    if (x !== 0 || y !== 0) parts.push(`translate(${x}, ${y})`);
    if (rotation !== 0) parts.push(`rotate(${rotation})`);
    if (scale !== 1) parts.push(`scale(${scale})`);
    if (parts.length > 0) g.setAttribute('transform', parts.join(' '));

    this._currentGroup().appendChild(g);
    this._groupStack.push(g);
  }

  popTransform(): void {
    if (this._groupStack.length > 1) {
      this._groupStack.pop();
    }
  }

  pushOpacity(opacity: number): void {
    if (opacity < 1) {
      const g = this._currentGroup();
      g.setAttribute('opacity', String(opacity));
    }
  }

  popOpacity(): void {
    // No-op for SVG — opacity is on the <g> element managed by pushTransform/popTransform
  }

  drawRect(w: number, h: number, radius: number, fill: RgbaColor | null, stroke: StrokeStyle | null): void {
    const el = svgEl('rect', {
      x: -(w / 2),
      y: -(h / 2),
      width: w,
      height: h,
      ...(radius > 0 ? { rx: radius, ry: radius } : {}),
    });
    applyFillStroke(el, fill, stroke);
    this._currentGroup().appendChild(el);
  }

  drawEllipse(rx: number, ry: number, fill: RgbaColor | null, stroke: StrokeStyle | null): void {
    const el = svgEl('ellipse', { cx: 0, cy: 0, rx, ry });
    applyFillStroke(el, fill, stroke);
    this._currentGroup().appendChild(el);
  }

  drawText(content: string, size: number, fill: RgbaColor, align: 'start' | 'middle' | 'end', bold: boolean, mono: boolean): void {
    const el = svgEl('text', {
      'text-anchor': align,
      'dominant-baseline': 'central',
      'font-size': size,
    });
    if (bold) el.setAttribute('font-weight', 'bold');
    if (mono) el.setAttribute('font-family', 'monospace');
    el.setAttribute('fill', rgbaToCSS(fill));
    el.textContent = content;
    this._currentGroup().appendChild(el);
  }

  drawPath(points: [number, number][], closed: boolean, smooth: boolean, fill: RgbaColor | null, stroke: StrokeStyle | null, drawProgress?: number): void {
    let d: string;
    if (smooth && points.length > 2) {
      d = catmullRomToSvgPath(points, closed);
    } else {
      d = points.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt[0]},${pt[1]}`).join(' ');
      if (closed) d += ' Z';
    }

    const el = svgEl('path', { d });
    applyFillStroke(el, closed ? fill : null, stroke);

    if (drawProgress !== undefined && drawProgress < 1) {
      // Use a large dasharray to clip the path
      const totalLen = 10000;
      el.setAttribute('stroke-dasharray', String(totalLen));
      el.setAttribute('stroke-dashoffset', String(totalLen * (1 - drawProgress)));
    }

    this._currentGroup().appendChild(el);
  }

  drawImage(src: string, w: number, h: number, fit: 'contain' | 'cover' | 'fill'): void {
    const el = svgEl('image', {
      x: -(w / 2),
      y: -(h / 2),
      width: w,
      height: h,
    });
    el.setAttribute('href', src);
    el.setAttribute('preserveAspectRatio',
      fit === 'cover' ? 'xMidYMid slice' :
      fit === 'fill' ? 'none' : 'xMidYMid meet',
    );
    this._currentGroup().appendChild(el);
  }

  private _currentGroup(): SVGGElement {
    return this._groupStack[this._groupStack.length - 1] ?? this._content!;
  }
}
