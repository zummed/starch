import type { Node } from '../types/node';
import type { Color, Stroke } from '../types/properties';
import { colorToCSS, strokeToCSS } from './hslToCSS';

export interface SvgAttrs {
  tag: string;
  attrs: Record<string, string | number>;
}

/**
 * A node's own content bounding box (full width/height, local frame).
 * Nodes with explicit geometry report it directly. A node with no geometry
 * of its own but with children (e.g. a template wrapper like `box` — a bare
 * id node whose `.bg`/`.label` children carry the real geometry) reports
 * the union bounding box of its children, each offset by that child's own
 * transform.
 */
export function getNodeContentBounds(node: Node): { w: number; h: number } {
  if (node.rect) return { w: node.rect.w, h: node.rect.h };
  if (node.ellipse) return { w: node.ellipse.rx * 2, h: node.ellipse.ry * 2 };
  if (node.image) return { w: node.image.w, h: node.image.h };
  if (node.text && node._measured) return { w: node._measured.width, h: node._measured.height };
  if (node.text) return { w: (node.text.content?.length ?? 0) * (node.text.size ?? 14) * 0.6, h: node.text.size ?? 14 };

  if (node.children.length > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const child of node.children) {
      const b = getNodeContentBounds(child);
      if (b.w === 0 && b.h === 0) continue;
      const cx = child.transform?.x ?? 0;
      const cy = child.transform?.y ?? 0;
      minX = Math.min(minX, cx - b.w / 2);
      minY = Math.min(minY, cy - b.h / 2);
      maxX = Math.max(maxX, cx + b.w / 2);
      maxY = Math.max(maxY, cy + b.h / 2);
    }
    if (minX !== Infinity) return { w: maxX - minX, h: maxY - minY };
  }

  return { w: 0, h: 0 };
}

export interface WorldBounds { minX: number; minY: number; maxX: number; maxY: number }

/** Find a node anywhere in the tree, accumulating ancestor transforms into its world position. */
function findWorldPosition(nodes: Node[], id: string, accX: number, accY: number): { node: Node; x: number; y: number } | undefined {
  for (const node of nodes) {
    const x = accX + (node.transform?.x ?? 0);
    const y = accY + (node.transform?.y ?? 0);
    if (node.id === id) return { node, x, y };
    const found = findWorldPosition(node.children, id, x, y);
    if (found) return found;
  }
  return undefined;
}

/**
 * A node's position in world space — accumulated ancestor transforms
 * (translation only), starting from the document roots. Undefined if the
 * id isn't found anywhere in the tree.
 */
export function getWorldPosition(roots: Node[], id: string): { x: number; y: number } | undefined {
  const found = findWorldPosition(roots, id, 0, 0);
  return found ? { x: found.x, y: found.y } : undefined;
}

/**
 * Fold one node's own geometry (rect, ellipse, measured text — with the
 * same estimate as unmeasured text, path points) into `bounds`, then
 * recurse into its children at their own world positions. Camera nodes
 * (and their subtrees) never contribute — they're viewports, not content.
 *
 * Path-following nodes (arrowheads, connector labels) are skipped too:
 * their real position is resolved from the routed path at render time, so
 * their transform still reads as the origin here — counting them would
 * stretch every auto-fit box out to 0,0.
 */
function accumulateNodeBounds(node: Node, worldX: number, worldY: number, bounds: WorldBounds): void {
  if (node.camera) return;
  if (node.transform?.pathFollow) return;

  let w = 0, h = 0;
  if (node.rect) { w = node.rect.w; h = node.rect.h; }
  else if (node.ellipse) { w = node.ellipse.rx * 2; h = node.ellipse.ry * 2; }
  else if (node.text && node._measured) { w = node._measured.width; h = node._measured.height; }
  else if (node.text) { w = (node.text.content?.length ?? 0) * (node.text.size ?? 14) * 0.6; h = (node.text.size ?? 14); }

  if (node.path?.points?.length) {
    for (const [ptx, pty] of node.path.points) {
      bounds.minX = Math.min(bounds.minX, worldX + ptx);
      bounds.minY = Math.min(bounds.minY, worldY + pty);
      bounds.maxX = Math.max(bounds.maxX, worldX + ptx);
      bounds.maxY = Math.max(bounds.maxY, worldY + pty);
    }
  }
  if (w > 0 || h > 0) {
    // Text is anchored the way the renderer anchors it (SVG text-anchor
    // start/middle/end), so an aligned label grows to one side only.
    // Centring its box regardless clipped the end it actually grew towards
    // and padded the frame with empty space on the other.
    const extendsLeft = node.text?.align === 'start' ? 0
      : node.text?.align === 'end' ? w
      : w / 2;
    bounds.minX = Math.min(bounds.minX, worldX - extendsLeft);
    bounds.maxX = Math.max(bounds.maxX, worldX - extendsLeft + w);
    bounds.minY = Math.min(bounds.minY, worldY - h / 2);
    bounds.maxY = Math.max(bounds.maxY, worldY + h / 2);
  }

  for (const child of node.children) {
    accumulateNodeBounds(child, worldX + (child.transform?.x ?? 0), worldY + (child.transform?.y ?? 0), bounds);
  }
}

/** Recursive world-space bounds of an entire node list (e.g. the document roots). */
export function computeSceneWorldBounds(nodes: Node[]): WorldBounds | undefined {
  const bounds: WorldBounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const node of nodes) {
    accumulateNodeBounds(node, node.transform?.x ?? 0, node.transform?.y ?? 0, bounds);
  }
  return bounds.minX === Infinity ? undefined : bounds;
}

/** World-space bounds of one node's subtree — its world position plus its own and descendants' geometry. */
export function computeSubtreeWorldBounds(roots: Node[], id: string): WorldBounds | undefined {
  const found = findWorldPosition(roots, id, 0, 0);
  if (!found) return undefined;
  const bounds: WorldBounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  accumulateNodeBounds(found.node, found.x, found.y, bounds);
  return bounds.minX === Infinity ? undefined : bounds;
}

function resolveColor(fill: Color | undefined, parentFill: Color | undefined): string | undefined {
  const color = fill ?? parentFill;
  return color !== undefined ? colorToCSS(color) : undefined;
}

function resolveStroke(stroke: Stroke | undefined, parentStroke: Stroke | undefined): { color?: string; width?: number } {
  const s = stroke ?? parentStroke;
  if (!s) return {};
  const { color, width } = strokeToCSS(s);
  return { color, width };
}

export function geometryToSvg(
  node: Node,
  inheritedFill?: Color,
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
        'font-size': node.text.size ?? 14,
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
