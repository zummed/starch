/**
 * Command emitter: walks the evaluated node tree and issues draw commands to a RenderBackend.
 * This is the only code that bridges the node model and the renderer interface.
 */
import type { Node, PathGeom } from '../types/node';
import type { Color, Stroke } from '../types/properties';
import type { AnchorPoint } from '../types/anchor';
import type { RenderBackend, RgbaColor, StrokeStyle, PathSegment } from './backend';
import type { ViewBox } from './camera';
import { colorToRgba } from '../types/color';
import { resolvePathGeometry } from './pathGeometry';
import { isNamedAnchor } from '../types/anchor';

const NAMED_ANCHOR_XY: Record<string, [number, number]> = {
  center: [0, 0],
  N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1],
  S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1],
};

/** Resolve an anchor to pixel offsets relative to the node's geometry center. */
function resolveAnchorPixels(anchor: AnchorPoint | undefined, node: Node): [number, number] {
  if (!anchor) return [0, 0];
  let ax: number, ay: number;
  if (Array.isArray(anchor)) {
    ax = anchor[0]; ay = anchor[1];
  } else if (isNamedAnchor(anchor)) {
    const pos = NAMED_ANCHOR_XY[anchor];
    if (!pos) return [0, 0];
    ax = pos[0]; ay = pos[1];
  } else {
    return [0, 0];
  }
  // Get geometry half-extents
  let hw = 0, hh = 0;
  if (node.rect) { hw = node.rect.w / 2; hh = node.rect.h / 2; }
  else if (node.ellipse) { hw = node.ellipse.rx; hh = node.ellipse.ry; }
  else if (node.image) { hw = node.image.w / 2; hh = node.image.h / 2; }
  return [ax * hw, ay * hh];
}

function fillToRgba(fill: Color | undefined): RgbaColor | null {
  if (fill === undefined || fill === null) return null;
  try {
    return colorToRgba(fill);
  } catch {
    return null;
  }
}

function resolveDashDefaults(dash: Node['dash']): { length: number; gap: number; pattern: string } | undefined {
  if (!dash) return undefined;
  const pattern = dash.pattern;
  if (pattern === 'dotted') {
    return { length: dash.length ?? 2, gap: dash.gap ?? 4, pattern };
  }
  if (pattern === 'dashed') {
    return { length: dash.length ?? 8, gap: dash.gap ?? 4, pattern };
  }
  // Custom SVG dasharray or other patterns
  return { length: dash.length ?? 8, gap: dash.gap ?? 4, pattern };
}

function strokeToStyle(stroke: Stroke | undefined, dash?: Node['dash']): StrokeStyle | null {
  if (!stroke || !stroke.color) return null;
  let color: RgbaColor;
  try {
    color = colorToRgba(stroke.color);
  } catch {
    return null;
  }
  const style: StrokeStyle = {
    color,
    width: stroke.width ?? 1,
  };
  const resolvedDash = resolveDashDefaults(dash);
  if (resolvedDash) {
    style.dash = resolvedDash;
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

function resolvePathFollowPosition(
  pathFollow: string,
  pathProgress: number,
  allRoots: Node[],
): { x: number; y: number; rotation: number } | null {
  const pathNode = findNodeById(allRoots, pathFollow);
  if (!pathNode?.path) return null;

  const resolved = resolvePathGeometry(pathNode.path, allRoots);
  if (!resolved.startPoint || !resolved.endPoint) return null;

  // For progress 0 and 1, use the exact endpoints + tangents
  if (pathProgress <= 0 && resolved.startTangent) {
    const angle = Math.atan2(resolved.startTangent[1], resolved.startTangent[0]) * (180 / Math.PI);
    return { x: resolved.startPoint[0], y: resolved.startPoint[1], rotation: angle };
  }
  if (pathProgress >= 1 && resolved.endTangent) {
    const angle = Math.atan2(resolved.endTangent[1], resolved.endTangent[0]) * (180 / Math.PI);
    return { x: resolved.endPoint[0], y: resolved.endPoint[1], rotation: angle };
  }

  // For intermediate progress, sample points from segments
  // Extract vertex positions from segments for arc-length parameterization
  const pts: [number, number][] = [];
  for (const seg of resolved.segments) {
    if (seg.type === 'moveTo' || seg.type === 'lineTo') {
      pts.push([seg.x, seg.y]);
    } else if (seg.type === 'quadTo') {
      pts.push([seg.x, seg.y]);
    } else if (seg.type === 'cubicTo') {
      pts.push([seg.x, seg.y]);
    }
  }
  if (pts.length < 2) return null;

  // Arc-length interpolation
  const segLens: number[] = [];
  let totalLen = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i-1][0];
    const dy = pts[i][1] - pts[i-1][1];
    const len = Math.sqrt(dx * dx + dy * dy);
    segLens.push(len);
    totalLen += len;
  }
  if (totalLen === 0) return { x: pts[0][0], y: pts[0][1], rotation: 0 };

  const targetLen = pathProgress * totalLen;
  let acc = 0;
  for (let i = 0; i < segLens.length; i++) {
    if (acc + segLens[i] >= targetLen) {
      const t = (targetLen - acc) / segLens[i];
      const x = pts[i][0] + (pts[i+1][0] - pts[i][0]) * t;
      const y = pts[i][1] + (pts[i+1][1] - pts[i][1]) * t;
      const dx = pts[i+1][0] - pts[i][0];
      const dy = pts[i+1][1] - pts[i][1];
      return { x, y, rotation: Math.atan2(dy, dx) * (180 / Math.PI) };
    }
    acc += segLens[i];
  }

  const last = pts[pts.length - 1];
  return { x: last[0], y: last[1], rotation: 0 };
}

function emitNode(
  backend: RenderBackend,
  node: Node,
  allRoots: Node[],
  parentFill: Color | undefined,
  parentStroke: Stroke | undefined,
  parentOpacity: number,
): void {
  if (!node.visible) return;

  // Style nodes don't render — they just exist in the tree for animation
  if (node._isStyle) return;

  // Resolve style: look up style node and use its properties as defaults
  let styleFill: Color | undefined;
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

  // Resolve transform — ?? fallbacks handle the case when node has no transform at all.
  // Within a transform object, Zod defaults guarantee x/y/rotation/scale are present.
  const t = node.transform;
  let x = t?.x ?? 0;
  let y = t?.y ?? 0;
  let rotation = t?.rotation ?? 0;
  const scale = t?.scale ?? 1;

  // PathFollow resolution
  if (t?.pathFollow) {
    const resolved = resolvePathFollowPosition(
      t.pathFollow,
      t.pathProgress ?? 0,
      allRoots,
    );
    if (resolved) {
      x = resolved.x;
      y = resolved.y;
      rotation = resolved.rotation + rotation;
    }
  }

  // Resolve anchor pivot for rotation/scale
  const [anchorX, anchorY] = resolveAnchorPixels(t?.anchor as AnchorPoint | undefined, node);
  backend.pushTransform(x, y, rotation, scale, anchorX, anchorY);

  // Priority: own > style > parent (same for all visual properties including opacity)
  const opacity = node.opacity ?? styleOpacity ?? parentOpacity;
  backend.pushOpacity(opacity);

  const fill = node.fill ?? styleFill ?? parentFill;
  const stroke = node.stroke ?? styleStroke ?? parentStroke;
  const fillRgba = fillToRgba(fill);
  const strokeStyle = strokeToStyle(stroke, node.dash);

  // Emit geometry
  if (node.rect) {
    backend.drawRect(node.rect.w, node.rect.h, node.rect.radius ?? 0, fillRgba, strokeStyle);
  } else if (node.ellipse) {
    backend.drawEllipse(node.ellipse.rx, node.ellipse.ry, fillRgba, strokeStyle);
  } else if (node.text) {
    backend.drawText(
      node.text.content,
      node.text.size ?? 14,
      fillRgba ?? { r: 200, g: 200, b: 200, a: 1 },
      node.text.align ?? 'middle',
      node.text.bold ?? false,
      node.text.mono ?? false,
      node._measured?.lines,
      node.text.lineHeight,
    );
  } else if (node.path) {
    const resolved = resolvePathGeometry(node.path, allRoots);
    if (resolved.segments.length > 0) {
      backend.drawPath(
        resolved.segments,
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
    backend.setViewBox(viewBox.x, viewBox.y, viewBox.w, viewBox.h, viewBox.rotation);
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
