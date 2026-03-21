import type { Node } from '../types/node';
import type { HslColor, Stroke } from '../types/properties';
import { hslToCSS, strokeToCSS } from './hslToCSS';

export interface SvgAttrs {
  tag: string;
  attrs: Record<string, string | number>;
}

function resolveColor(fill: HslColor | undefined, parentFill: HslColor | undefined): string | undefined {
  const color = fill ?? parentFill;
  return color ? hslToCSS(color) : undefined;
}

function resolveStroke(stroke: Stroke | undefined, parentStroke: Stroke | undefined): { color?: string; width?: number } {
  const s = stroke ?? parentStroke;
  if (!s) return {};
  const { color, width } = strokeToCSS(s);
  return { color, width };
}

export function geometryToSvg(
  node: Node,
  inheritedFill?: HslColor,
  inheritedStroke?: Stroke,
): SvgAttrs | null {
  const fill = resolveColor(node.fill, inheritedFill);
  const stroke = resolveStroke(node.stroke, inheritedStroke);

  if (node.rect) {
    return {
      tag: 'rect',
      attrs: {
        x: -(node.rect.w / 2),
        y: -(node.rect.h / 2),
        width: node.rect.w,
        height: node.rect.h,
        ...(node.rect.radius ? { rx: node.rect.radius, ry: node.rect.radius } : {}),
        ...(fill ? { fill } : {}),
        ...(stroke.color ? { stroke: stroke.color } : {}),
        ...(stroke.width ? { 'stroke-width': stroke.width } : {}),
      },
    };
  }

  if (node.ellipse) {
    return {
      tag: 'ellipse',
      attrs: {
        cx: 0,
        cy: 0,
        rx: node.ellipse.rx,
        ry: node.ellipse.ry,
        ...(fill ? { fill } : {}),
        ...(stroke.color ? { stroke: stroke.color } : {}),
        ...(stroke.width ? { 'stroke-width': stroke.width } : {}),
      },
    };
  }

  if (node.text) {
    return {
      tag: 'text',
      attrs: {
        'text-anchor': node.text.align === 'end' ? 'end' : node.text.align === 'start' ? 'start' : 'middle',
        'dominant-baseline': 'central',
        'font-size': node.text.size,
        ...(node.text.bold ? { 'font-weight': 'bold' } : {}),
        ...(node.text.mono ? { 'font-family': 'monospace' } : {}),
        ...(fill ? { fill } : {}),
      },
    };
  }

  if (node.path) {
    const p = node.path;
    if (p.points && p.points.length > 0) {
      const d = p.points.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt[0]},${pt[1]}`).join(' ')
        + (p.closed ? ' Z' : '');
      return {
        tag: 'path',
        attrs: {
          d,
          fill: p.closed && fill ? fill : 'none',
          ...(stroke.color ? { stroke: stroke.color } : {}),
          ...(stroke.width ? { 'stroke-width': stroke.width } : {}),
        },
      };
    }
    // Connection paths (from/to) are resolved separately in connections.ts
    return null;
  }

  if (node.image) {
    return {
      tag: 'image',
      attrs: {
        x: -(node.image.w / 2),
        y: -(node.image.h / 2),
        width: node.image.w,
        height: node.image.h,
        href: node.image.src,
        preserveAspectRatio: node.image.fit === 'cover' ? 'xMidYMid slice' :
          node.image.fit === 'fill' ? 'none' : 'xMidYMid meet',
      },
    };
  }

  return null;
}
