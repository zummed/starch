/**
 * Command emitter: walks the evaluated node tree and issues draw commands to a RenderBackend.
 * This is the only code that bridges the node model and the renderer interface.
 */
import type { Node, PathGeom } from '../types/node';
import type { HslColor, Stroke } from '../types/properties';
import type { RenderBackend, RgbaColor, StrokeStyle, PathSegment } from './backend';
import type { ViewBox } from './camera';
import { hslToRgba } from './colorConvert';
import { resolvePathGeometry } from './pathGeometry';

function hslFillToRgba(fill: HslColor | undefined): RgbaColor | null {
  if (!fill) return null;
  const rgba = hslToRgba(fill);
  if (fill.a !== undefined) rgba.a = fill.a;
  return rgba;
}

function strokeToStyle(stroke: Stroke | undefined, dash?: Node['dash']): StrokeStyle | null {
  if (!stroke) return null;
  const color = hslToRgba({ h: stroke.h, s: stroke.s, l: stroke.l });
  if (stroke.a !== undefined) color.a = stroke.a;
  const style: StrokeStyle = {
    color,
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
