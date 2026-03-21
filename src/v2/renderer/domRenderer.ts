/**
 * V2 DOM renderer: takes evaluated Node[] tree and renders to SVG DOM elements.
 * Replaces the v1 RenderDispatcher.
 */
import type { Node } from '../types/node';
import type { HslColor, Stroke } from '../types/properties';
import { hslToCSS, strokeToCSS } from './hslToCSS';
import { resolveConnectionPath } from './connections';

const SVG_NS = 'http://www.w3.org/2000/svg';

function createSvgEl(tag: string, attrs?: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, String(v));
    }
  }
  return el;
}

function resolveFill(node: Node, parentFill?: HslColor): string | undefined {
  const fill = node.fill ?? parentFill;
  return fill ? hslToCSS(fill) : undefined;
}

function resolveStrokeAttrs(node: Node, parentStroke?: Stroke): { color?: string; width?: number } {
  const s = node.stroke ?? parentStroke;
  if (!s) return {};
  return strokeToCSS(s);
}

function resolveOpacity(nodeOpacity: number | undefined, parentOpacity: number): number {
  return parentOpacity * (nodeOpacity ?? 1);
}

function buildTransformStr(node: Node): string {
  const t = node.transform;
  if (!t) return '';
  const parts: string[] = [];
  if (t.x !== undefined || t.y !== undefined) {
    parts.push(`translate(${t.x ?? 0}, ${t.y ?? 0})`);
  }
  if (t.rotation !== undefined && t.rotation !== 0) {
    parts.push(`rotate(${t.rotation})`);
  }
  if (t.scale !== undefined && t.scale !== 1) {
    parts.push(`scale(${t.scale})`);
  }
  return parts.join(' ');
}

function renderGeometry(
  node: Node,
  fill: string | undefined,
  stroke: { color?: string; width?: number },
  allRoots: Node[],
): SVGElement | null {
  if (node.rect) {
    const r = node.rect;
    const el = createSvgEl('rect', {
      x: -(r.w / 2),
      y: -(r.h / 2),
      width: r.w,
      height: r.h,
      ...(r.radius ? { rx: r.radius, ry: r.radius } : {}),
    });
    if (fill) el.setAttribute('fill', fill);
    if (stroke.color) el.setAttribute('stroke', stroke.color);
    if (stroke.width) el.setAttribute('stroke-width', String(stroke.width));
    return el;
  }

  if (node.ellipse) {
    const el = createSvgEl('ellipse', {
      cx: 0, cy: 0,
      rx: node.ellipse.rx,
      ry: node.ellipse.ry,
    });
    if (fill) el.setAttribute('fill', fill);
    if (stroke.color) el.setAttribute('stroke', stroke.color);
    if (stroke.width) el.setAttribute('stroke-width', String(stroke.width));
    return el;
  }

  if (node.text) {
    const el = createSvgEl('text', {
      'text-anchor': node.text.align === 'end' ? 'end' : node.text.align === 'start' ? 'start' : 'middle',
      'dominant-baseline': 'central',
      'font-size': node.text.size,
    });
    if (node.text.bold) el.setAttribute('font-weight', 'bold');
    if (node.text.mono) el.setAttribute('font-family', 'monospace');
    if (fill) el.setAttribute('fill', fill);
    el.textContent = node.text.content;
    return el;
  }

  if (node.path) {
    const p = node.path;
    let d: string | null = null;

    if (p.points && p.points.length > 0) {
      d = p.points.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt[0]},${pt[1]}`).join(' ')
        + (p.closed ? ' Z' : '');
    } else if (p.from || p.to) {
      // Connection path — resolve endpoints
      const resolved = resolveConnectionPath(p, allRoots);
      if (resolved && resolved.length > 0) {
        d = resolved.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt[0]},${pt[1]}`).join(' ');
      }
    }

    if (!d) return null;

    const el = createSvgEl('path', { d });
    el.setAttribute('fill', p.closed && fill ? fill : 'none');
    if (stroke.color) el.setAttribute('stroke', stroke.color);
    if (stroke.width) el.setAttribute('stroke-width', String(stroke.width));

    // Dash pattern
    if (node.dash) {
      if (node.dash.pattern === 'dashed') {
        el.setAttribute('stroke-dasharray', `${node.dash.length} ${node.dash.gap}`);
      } else if (node.dash.pattern === 'dotted') {
        el.setAttribute('stroke-dasharray', `${node.dash.length} ${node.dash.gap}`);
        el.setAttribute('stroke-linecap', 'round');
      }
    }

    // Draw progress
    if (p.drawProgress !== undefined && p.drawProgress < 1) {
      // Approximate: use stroke-dashoffset
      const totalLen = 1000; // Will be refined after mount
      el.setAttribute('stroke-dasharray', String(totalLen));
      el.setAttribute('stroke-dashoffset', String(totalLen * (1 - p.drawProgress)));
    }

    return el;
  }

  if (node.image) {
    const img = node.image;
    const el = createSvgEl('image', {
      x: -(img.w / 2),
      y: -(img.h / 2),
      width: img.w,
      height: img.h,
    });
    el.setAttribute('href', img.src);
    el.setAttribute('preserveAspectRatio',
      img.fit === 'cover' ? 'xMidYMid slice' :
      img.fit === 'fill' ? 'none' : 'xMidYMid meet',
    );
    return el;
  }

  return null;
}

function renderNodeToDOM(
  node: Node,
  parentOpacity: number,
  parentFill: HslColor | undefined,
  parentStroke: Stroke | undefined,
  allRoots: Node[],
): SVGGElement | null {
  if (!node.visible) return null;

  const g = createSvgEl('g') as SVGGElement;
  g.setAttribute('data-id', node.id);

  const transformStr = buildTransformStr(node);
  if (transformStr) g.setAttribute('transform', transformStr);

  const opacity = resolveOpacity(node.opacity, parentOpacity);
  if (opacity < 1) g.setAttribute('opacity', String(opacity));

  const fill = node.fill ?? parentFill;
  const stroke = node.stroke ?? parentStroke;
  const fillCSS = resolveFill(node, parentFill);
  const strokeAttrs = resolveStrokeAttrs(node, parentStroke);

  // Render geometry
  const geomEl = renderGeometry(node, fillCSS, strokeAttrs, allRoots);
  if (geomEl) g.appendChild(geomEl);

  // Sort children by depth, then render recursively
  const sorted = [...node.children].sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0));
  for (const child of sorted) {
    const childEl = renderNodeToDOM(child, opacity, fill, stroke, allRoots);
    if (childEl) g.appendChild(childEl);
  }

  return g;
}

export class V2DomRenderer {
  private _container: SVGGElement;
  private _roots: Node[] = [];

  constructor(container: SVGGElement) {
    this._container = container;
  }

  update(roots: Node[]): void {
    this._roots = roots;
    // Clear and re-render (simple approach — could diff later)
    while (this._container.lastChild) {
      this._container.removeChild(this._container.lastChild);
    }

    const sorted = [...roots].filter(n => !n.camera).sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0));
    for (const root of sorted) {
      const el = renderNodeToDOM(root, 1, undefined, undefined, roots);
      if (el) this._container.appendChild(el);
    }
  }

  clear(): void {
    while (this._container.lastChild) {
      this._container.removeChild(this._container.lastChild);
    }
  }
}
