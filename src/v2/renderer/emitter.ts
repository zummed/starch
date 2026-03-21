/**
 * Command emitter: walks the evaluated node tree and issues draw commands to a RenderBackend.
 * This is the only code that bridges the node model and the renderer interface.
 */
import type { Node, PathGeom } from '../types/node';
import type { HslColor, Stroke } from '../types/properties';
import type { RenderBackend, RgbaColor, StrokeStyle } from './backend';
import type { ViewBox } from './camera';
import { hslToRgba } from './colorConvert';
import { resolveConnectionPath, resolveEndpoint } from './connections';

function hslFillToRgba(fill: HslColor | undefined): RgbaColor | null {
  return fill ? hslToRgba(fill) : null;
}

function strokeToStyle(stroke: Stroke | undefined, dash?: Node['dash']): StrokeStyle | null {
  if (!stroke) return null;
  const style: StrokeStyle = {
    color: hslToRgba({ h: stroke.h, s: stroke.s, l: stroke.l }),
    width: stroke.width,
  };
  if (dash) {
    style.dash = { length: dash.length, gap: dash.gap, pattern: dash.pattern };
  }
  return style;
}

function findNodeById(roots: Node[], id: string): Node | undefined {
  for (const root of roots) {
    if (root.id === id) return root;
    const found = findNodeById(root.children, id);
    if (found) return found;
  }
  return undefined;
}

function getNodeBounds(node: Node): { w: number; h: number } {
  if (node.rect) return { w: node.rect.w, h: node.rect.h };
  if (node.ellipse) return { w: node.ellipse.rx * 2, h: node.ellipse.ry * 2 };
  if (node.size) return { w: node.size.w, h: node.size.h };
  if (node.image) return { w: node.image.w, h: node.image.h };
  return { w: 0, h: 0 };
}

const NAMED_ANCHOR_OFFSETS: Record<string, [number, number]> = {
  center: [0, 0],
  N: [0, -0.5], top: [0, -0.5],
  NE: [0.5, -0.5], topright: [0.5, -0.5],
  E: [0.5, 0], right: [0.5, 0],
  SE: [0.5, 0.5], bottomright: [0.5, 0.5],
  S: [0, 0.5], bottom: [0, 0.5],
  SW: [-0.5, 0.5], bottomleft: [-0.5, 0.5],
  W: [-0.5, 0], left: [-0.5, 0],
  NW: [-0.5, -0.5], topleft: [-0.5, -0.5],
};

function resolveAnchorOffset(anchor: string | [number, number] | undefined, bounds: { w: number; h: number }): { dx: number; dy: number } {
  if (!anchor) return { dx: 0, dy: 0 };
  if (Array.isArray(anchor)) {
    // Float anchor [0-1, 0-1] → offset from center
    return { dx: (anchor[0] - 0.5) * bounds.w, dy: (anchor[1] - 0.5) * bounds.h };
  }
  const offsets = NAMED_ANCHOR_OFFSETS[anchor];
  if (offsets) {
    return { dx: offsets[0] * bounds.w, dy: offsets[1] * bounds.h };
  }
  return { dx: 0, dy: 0 };
}

function resolvePathPoints(path: PathGeom, allRoots: Node[]): [number, number][] | null {
  if (path.points && path.points.length > 0) return path.points;

  // Connection path — resolve from/to with anchors
  if (!path.from && !path.to) return null;

  const fromEp = path.from ? resolveEndpoint(path.from, allRoots) : null;
  const toEp = path.to ? resolveEndpoint(path.to, allRoots) : null;
  if (!fromEp || !toEp) return null;

  // Apply anchors
  if (path.fromAnchor && typeof path.from === 'string') {
    const fromNode = findNodeById(allRoots, path.from);
    if (fromNode) {
      const bounds = getNodeBounds(fromNode);
      const offset = resolveAnchorOffset(path.fromAnchor, bounds);
      fromEp.x += offset.dx;
      fromEp.y += offset.dy;
    }
  }
  if (path.toAnchor && typeof path.to === 'string') {
    const toNode = findNodeById(allRoots, path.to);
    if (toNode) {
      const bounds = getNodeBounds(toNode);
      const offset = resolveAnchorOffset(path.toAnchor, bounds);
      toEp.x += offset.dx;
      toEp.y += offset.dy;
    }
  }

  // Bend
  if (path.bend && path.bend !== 0) {
    const mx = (fromEp.x + toEp.x) / 2;
    const my = (fromEp.y + toEp.y) / 2;
    const dx = toEp.x - fromEp.x;
    const dy = toEp.y - fromEp.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    return [[fromEp.x, fromEp.y], [mx + nx * path.bend * 50, my + ny * path.bend * 50], [toEp.x, toEp.y]];
  }

  // Route waypoints
  if (path.route && path.route.length > 0) {
    return [[fromEp.x, fromEp.y], ...path.route, [toEp.x, toEp.y]];
  }

  return [[fromEp.x, fromEp.y], [toEp.x, toEp.y]];
}

function resolvePathFollowPosition(
  pathFollow: string,
  pathProgress: number,
  allRoots: Node[],
): { x: number; y: number; rotation: number } | null {
  const pathNode = findNodeById(allRoots, pathFollow);
  if (!pathNode?.path) return null;

  const points = resolvePathPoints(pathNode.path, allRoots);
  if (!points || points.length < 2) return null;

  // Compute arc-length parameterization
  const segments: number[] = [];
  let totalLen = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i-1][0];
    const dy = points[i][1] - points[i-1][1];
    const len = Math.sqrt(dx * dx + dy * dy);
    segments.push(len);
    totalLen += len;
  }
  if (totalLen === 0) return { x: points[0][0], y: points[0][1], rotation: 0 };

  const targetLen = pathProgress * totalLen;
  let accumulated = 0;
  for (let i = 0; i < segments.length; i++) {
    if (accumulated + segments[i] >= targetLen) {
      const segT = (targetLen - accumulated) / segments[i];
      const x = points[i][0] + (points[i+1][0] - points[i][0]) * segT;
      const y = points[i][1] + (points[i+1][1] - points[i][1]) * segT;
      const dx = points[i+1][0] - points[i][0];
      const dy = points[i+1][1] - points[i][1];
      const rotation = Math.atan2(dy, dx) * (180 / Math.PI);
      return { x, y, rotation };
    }
    accumulated += segments[i];
  }

  const last = points[points.length - 1];
  return { x: last[0], y: last[1], rotation: 0 };
}

function emitNode(
  backend: RenderBackend,
  node: Node,
  allRoots: Node[],
  parentFill: HslColor | undefined,
  parentStroke: Stroke | undefined,
  parentOpacity: number,
): void {
  if (!node.visible) return;

  // Style nodes don't render — they just exist in the tree for animation
  if (node._isStyle) return;

  // Resolve style: look up style node and use its properties as defaults
  let styleFill: HslColor | undefined;
  let styleStroke: Stroke | undefined;
  let styleOpacity: number | undefined;
  if (node.style) {
    const styleNode = findNodeById(allRoots, node.style);
    if (styleNode) {
      styleFill = styleNode.fill;
      styleStroke = styleNode.stroke;
      styleOpacity = styleNode.opacity;
    }
  }

  // Resolve transform
  let x = node.transform?.x ?? 0;
  let y = node.transform?.y ?? 0;
  let rotation = node.transform?.rotation ?? 0;
  const scale = node.transform?.scale ?? 1;

  // PathFollow resolution
  if (node.transform?.pathFollow) {
    const resolved = resolvePathFollowPosition(
      node.transform.pathFollow,
      node.transform.pathProgress ?? 0,
      allRoots,
    );
    if (resolved) {
      x = resolved.x;
      y = resolved.y;
      rotation = resolved.rotation + rotation;
    }
  }

  backend.pushTransform(x, y, rotation, scale);

  // Priority: own > style > parent (same for all visual properties including opacity)
  const opacity = node.opacity ?? styleOpacity ?? parentOpacity;
  backend.pushOpacity(opacity);

  const fill = node.fill ?? styleFill ?? parentFill;
  const stroke = node.stroke ?? styleStroke ?? parentStroke;
  const fillRgba = hslFillToRgba(fill);
  const strokeStyle = strokeToStyle(stroke, node.dash);

  // Emit geometry
  if (node.rect) {
    backend.drawRect(node.rect.w, node.rect.h, node.rect.radius ?? 0, fillRgba, strokeStyle);
  } else if (node.ellipse) {
    backend.drawEllipse(node.ellipse.rx, node.ellipse.ry, fillRgba, strokeStyle);
  } else if (node.text) {
    backend.drawText(
      node.text.content,
      node.text.size,
      fillRgba ?? { r: 200, g: 200, b: 200, a: 1 },
      node.text.align ?? 'middle',
      node.text.bold ?? false,
      node.text.mono ?? false,
    );
  } else if (node.path) {
    const points = resolvePathPoints(node.path, allRoots);
    if (points && points.length > 0) {
      backend.drawPath(
        points,
        node.path.closed ?? false,
        node.path.smooth ?? false,
        fillRgba,
        strokeStyle,
        node.path.drawProgress,
      );
    }
  } else if (node.image) {
    backend.drawImage(
      node.image.src,
      node.image.w,
      node.image.h,
      node.image.fit ?? 'contain',
    );
  }

  // Children sorted by depth
  const sorted = [...node.children].sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0));
  for (const child of sorted) {
    emitNode(backend, child, allRoots, fill, stroke, opacity);
  }

  backend.popOpacity();
  backend.popTransform();
}

export function emitFrame(
  backend: RenderBackend,
  nodes: Node[],
  allRoots: Node[],
  viewBox?: ViewBox,
): void {
  backend.beginFrame();

  if (viewBox) {
    backend.setViewBox(viewBox.x, viewBox.y, viewBox.w, viewBox.h);
  } else {
    backend.clearViewBox();
  }

  const sorted = [...nodes]
    .filter(n => !n.camera && !n._isStyle)
    .sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0));

  for (const root of sorted) {
    emitNode(backend, root, allRoots, undefined, undefined, 1);
  }

  backend.endFrame();
}
