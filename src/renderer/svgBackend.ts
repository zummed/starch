/**
 * SVG RenderBackend implementation.
 * Maps draw commands to SVG DOM elements.
 *
 * Uses cursor-based DOM recycling: existing elements are reused in-place
 * each frame and only their attributes are updated, avoiding the cost of
 * creating and removing DOM nodes every frame.
 */
import type { RenderBackend, RendererInfo, RgbaColor, StrokeStyle, PathSegment } from './backend';
import { rgbaToCSS } from './colorConvert';

const SVG_NS = 'http://www.w3.org/2000/svg';

function setAttrs(el: SVGElement, attrs: Record<string, string | number>): void {
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
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
    // Paint stroke behind fill to avoid double-tone with semi-transparent strokes
    el.setAttribute('paint-order', 'stroke');
    if (stroke.dash) {
      el.setAttribute('stroke-dasharray', `${stroke.dash.length} ${stroke.dash.gap}`);
      if (stroke.dash.pattern === 'dotted') {
        el.setAttribute('stroke-linecap', 'round');
      } else {
        el.removeAttribute('stroke-linecap');
      }
    } else {
      el.removeAttribute('stroke-dasharray');
      el.removeAttribute('stroke-linecap');
    }
  } else {
    el.removeAttribute('stroke');
    el.removeAttribute('stroke-width');
    el.removeAttribute('paint-order');
    el.removeAttribute('stroke-dasharray');
    el.removeAttribute('stroke-linecap');
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

/**
 * Obtain or create a child SVG element at the given cursor position within a
 * parent group.  If an existing child at that index has the correct tag name
 * it is reused; otherwise a new element is created and inserted.
 */
function obtainChild(parent: SVGGElement, cursor: number, tag: string): SVGElement {
  const existing = parent.children[cursor] as SVGElement | undefined;
  if (existing && existing.localName === tag) {
    return existing;
  }
  const el = document.createElementNS(SVG_NS, tag);
  if (existing) {
    parent.replaceChild(el, existing);
  } else {
    parent.appendChild(el);
  }
  return el;
}

/** Remove all children from index `start` onwards. */
function trimChildren(parent: SVGElement, start: number): void {
  while (parent.children.length > start) {
    parent.removeChild(parent.lastElementChild!);
  }
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
  private _opacityStack: number[] = [1];
  /** Per-group cursor tracking how many children have been emitted this frame. */
  private _cursorStack: number[] = [];

  mount(container: HTMLElement): void {
    this._svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    this._svg.setAttribute('width', '100%');
    this._svg.setAttribute('height', '100%');
    this._svg.style.display = 'block';

    this._bg = document.createElementNS(SVG_NS, 'rect') as SVGRectElement;
    setAttrs(this._bg, { width: '100%', height: '100%', fill: '#0e1117' });
    this._svg.appendChild(this._bg);

    this._content = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    this._svg.appendChild(this._content);

    container.appendChild(this._svg);
  }

  destroy(): void {
    this._svg?.remove();
    this._svg = null;
    this._bg = null;
    this._content = null;
    this._groupStack = [];
    this._cursorStack = [];
  }

  beginFrame(): void {
    if (!this._content) return;
    // Reset stacks — children are preserved for recycling
    this._groupStack = [this._content];
    this._cursorStack = [0];
    this._opacityStack = [1];
  }

  endFrame(): void {
    // Trim any leftover children that were not visited this frame.
    // The content group is always at stack index 0.
    if (this._content) {
      trimChildren(this._content, this._cursorStack[0]);
    }
  }

  setViewBox(x: number, y: number, w: number, h: number, rotation?: number): void {
    if (!this._svg || !this._bg || !this._content) return;
    this._svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
    this._svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this._bg.setAttribute('x', String(x));
    this._bg.setAttribute('y', String(y));
    this._bg.setAttribute('width', String(w));
    this._bg.setAttribute('height', String(h));
    if (rotation) {
      const cx = x + w / 2;
      const cy = y + h / 2;
      this._content.setAttribute('transform', `rotate(${-rotation}, ${cx}, ${cy})`);
    } else {
      this._content.removeAttribute('transform');
    }
  }

  clearViewBox(): void {
    if (!this._svg || !this._bg) return;
    this._svg.removeAttribute('viewBox');
    this._svg.removeAttribute('preserveAspectRatio');
    this._bg.setAttribute('x', '0');
    this._bg.setAttribute('y', '0');
    this._bg.setAttribute('width', '100%');
    this._bg.setAttribute('height', '100%');
    this._content?.removeAttribute('transform');
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

  pushTransform(x: number, y: number, rotation: number, scale: number, anchorX?: number, anchorY?: number): void {
    const parent = this._currentGroup();
    const cursor = this._currentCursor();
    const g = obtainChild(parent, cursor, 'g') as SVGGElement;

    const parts: string[] = [];
    if (x !== 0 || y !== 0) parts.push(`translate(${x}, ${y})`);
    if (rotation !== 0) parts.push(`rotate(${rotation})`);
    if (scale !== 1) parts.push(`scale(${scale})`);
    const ax = anchorX ?? 0;
    const ay = anchorY ?? 0;
    if (ax !== 0 || ay !== 0) parts.push(`translate(${-ax}, ${-ay})`);
    if (parts.length > 0) {
      g.setAttribute('transform', parts.join(' '));
    } else {
      g.removeAttribute('transform');
    }

    // Advance parent cursor past this group
    this._cursorStack[this._cursorStack.length - 1] = cursor + 1;
    // Push new group with its own cursor starting at 0
    this._groupStack.push(g);
    this._cursorStack.push(0);
  }

  popTransform(): void {
    if (this._groupStack.length > 1) {
      // Trim unused children in the group we're leaving
      const group = this._groupStack.pop()!;
      const cursor = this._cursorStack.pop()!;
      trimChildren(group, cursor);
    }
  }

  pushOpacity(opacity: number): void {
    // Store the resolved opacity — applied to geometry elements, not <g> groups
    this._opacityStack.push(opacity);
  }

  popOpacity(): void {
    if (this._opacityStack.length > 1) {
      this._opacityStack.pop();
    }
  }

  private _currentOpacity(): number {
    return this._opacityStack[this._opacityStack.length - 1];
  }

  drawRect(w: number, h: number, radius: number, fill: RgbaColor | null, stroke: StrokeStyle | null): void {
    const parent = this._currentGroup();
    const cursor = this._currentCursor();
    const el = obtainChild(parent, cursor, 'rect');

    el.setAttribute('x', String(-(w / 2)));
    el.setAttribute('y', String(-(h / 2)));
    el.setAttribute('width', String(w));
    el.setAttribute('height', String(h));
    if (radius > 0) {
      el.setAttribute('rx', String(radius));
      el.setAttribute('ry', String(radius));
    } else {
      el.removeAttribute('rx');
      el.removeAttribute('ry');
    }
    applyFillStroke(el, fill, stroke);
    this._applyOpacity(el);
    this._advanceCursor();
  }

  drawEllipse(rx: number, ry: number, fill: RgbaColor | null, stroke: StrokeStyle | null): void {
    const parent = this._currentGroup();
    const cursor = this._currentCursor();
    const el = obtainChild(parent, cursor, 'ellipse');

    el.setAttribute('cx', '0');
    el.setAttribute('cy', '0');
    el.setAttribute('rx', String(rx));
    el.setAttribute('ry', String(ry));
    applyFillStroke(el, fill, stroke);
    this._applyOpacity(el);
    this._advanceCursor();
  }

  drawText(content: string, size: number, fill: RgbaColor, align: 'start' | 'middle' | 'end', bold: boolean, mono: boolean, lines?: Array<{ text: string; width: number }>, lineHeight?: number): void {
    const parent = this._currentGroup();
    const cursor = this._currentCursor();
    const el = obtainChild(parent, cursor, 'text');

    el.setAttribute('text-anchor', align);
    el.setAttribute('font-size', String(size));
    if (bold) {
      el.setAttribute('font-weight', 'bold');
    } else {
      el.removeAttribute('font-weight');
    }
    el.setAttribute('font-family', mono ? 'monospace' : 'sans-serif');
    el.setAttribute('fill', rgbaToCSS(fill));

    if (lines && lines.length > 1) {
      const lh = lineHeight ?? size * 1.4;
      const totalHeight = lines.length * lh;
      const startY = -totalHeight / 2 + lh / 2;

      // Reuse or create tspan children
      for (let i = 0; i < lines.length; i++) {
        let tspan: SVGTSpanElement;
        if (i < el.children.length && el.children[i].localName === 'tspan') {
          tspan = el.children[i] as SVGTSpanElement;
        } else {
          tspan = document.createElementNS(SVG_NS, 'tspan');
          if (i < el.children.length) {
            el.replaceChild(tspan, el.children[i]);
          } else {
            el.appendChild(tspan);
          }
        }
        tspan.setAttribute('x', '0');
        tspan.setAttribute('dy', i === 0 ? String(startY) : String(lh));
        tspan.setAttribute('dominant-baseline', 'central');
        tspan.textContent = lines[i].text;
      }
      // Remove extra tspans
      while (el.children.length > lines.length) {
        el.removeChild(el.lastElementChild!);
      }
      el.removeAttribute('dominant-baseline');
    } else {
      el.setAttribute('dominant-baseline', 'central');
      el.textContent = content;
      // Remove any leftover tspans from a previous frame with multiline
      while (el.children.length > 0) {
        el.removeChild(el.lastElementChild!);
      }
    }

    this._applyOpacity(el);
    this._advanceCursor();
  }

  drawPath(segments: PathSegment[], fill: RgbaColor | null, stroke: StrokeStyle | null, drawProgress?: number): void {
    if (segments.length === 0) return;

    const d = segments.map(seg => {
      switch (seg.type) {
        case 'moveTo': return `M${seg.x},${seg.y}`;
        case 'lineTo': return `L${seg.x},${seg.y}`;
        case 'cubicTo': return `C${seg.cx1},${seg.cy1} ${seg.cx2},${seg.cy2} ${seg.x},${seg.y}`;
        case 'quadTo': return `Q${seg.cx},${seg.cy} ${seg.x},${seg.y}`;
        case 'close': return 'Z';
      }
    }).join(' ');

    const parent = this._currentGroup();
    const cursor = this._currentCursor();
    const el = obtainChild(parent, cursor, 'path');

    el.setAttribute('d', d);
    const hasFill = segments.some(s => s.type === 'close');
    applyFillStroke(el, hasFill ? fill : null, stroke);

    if (drawProgress !== undefined && drawProgress < 1) {
      const totalLen = 10000;
      el.setAttribute('stroke-dasharray', String(totalLen));
      el.setAttribute('stroke-dashoffset', String(totalLen * (1 - drawProgress)));
    } else {
      el.removeAttribute('stroke-dasharray');
      el.removeAttribute('stroke-dashoffset');
    }

    this._applyOpacity(el);
    this._advanceCursor();
  }

  drawImage(src: string, w: number, h: number, fit: 'contain' | 'cover' | 'fill'): void {
    const parent = this._currentGroup();
    const cursor = this._currentCursor();
    const el = obtainChild(parent, cursor, 'image');

    el.setAttribute('x', String(-(w / 2)));
    el.setAttribute('y', String(-(h / 2)));
    el.setAttribute('width', String(w));
    el.setAttribute('height', String(h));
    el.setAttribute('href', src);
    el.setAttribute('preserveAspectRatio',
      fit === 'cover' ? 'xMidYMid slice' :
      fit === 'fill' ? 'none' : 'xMidYMid meet',
    );
    this._applyOpacity(el);
    this._advanceCursor();
  }

  private _currentGroup(): SVGGElement {
    return this._groupStack[this._groupStack.length - 1] ?? this._content!;
  }

  private _currentCursor(): number {
    return this._cursorStack[this._cursorStack.length - 1];
  }

  private _advanceCursor(): void {
    this._cursorStack[this._cursorStack.length - 1]++;
  }

  private _applyOpacity(el: SVGElement): void {
    const opacity = this._currentOpacity();
    if (opacity < 1) {
      el.setAttribute('opacity', String(opacity));
    } else {
      el.removeAttribute('opacity');
    }
  }
}
