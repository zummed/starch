import type { Node } from '../types/node';

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function findNodeById(roots: Node[], id: string): Node | undefined {
  for (const root of roots) {
    if (root.id === id) return root;
    const found = findNodeById(root.children, id);
    if (found) return found;
  }
  return undefined;
}

function getNodeWorldPosition(node: Node): { x: number; y: number } {
  return { x: node.transform?.x ?? 0, y: node.transform?.y ?? 0 };
}

function getNodeBounds(node: Node): { x: number; y: number; w: number; h: number } {
  const pos = getNodeWorldPosition(node);
  let w = 100, h = 50;
  if (node.rect) { w = node.rect.w; h = node.rect.h; }
  else if (node.ellipse) { w = node.ellipse.rx * 2; h = node.ellipse.ry * 2; }
  else if (node.size) { w = node.size.w; h = node.size.h; }
  return { x: pos.x - w / 2, y: pos.y - h / 2, w, h };
}

export function computeViewBox(
  cameraNode: Node | undefined,
  roots: Node[],
  defaultViewBox: ViewBox,
): ViewBox {
  if (!cameraNode?.camera) return defaultViewBox;

  const cam = cameraNode.camera;
  const zoom = cam.zoom ?? 1;

  if (cam.fit && cam.fit.length > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of cam.fit) {
      const node = findNodeById(roots, id);
      if (!node) continue;
      const b = getNodeBounds(node);
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    }
    if (minX === Infinity) return defaultViewBox;
    const margin = 20;
    const w = (maxX - minX + margin * 2) / zoom;
    const h = (maxY - minY + margin * 2) / zoom;
    return { x: minX - margin, y: minY - margin, w, h };
  }

  if (cam.target) {
    let cx = defaultViewBox.x + defaultViewBox.w / 2;
    let cy = defaultViewBox.y + defaultViewBox.h / 2;

    if (typeof cam.target === 'string') {
      const target = findNodeById(roots, cam.target);
      if (target) {
        const pos = getNodeWorldPosition(target);
        cx = pos.x;
        cy = pos.y;
      }
    } else if (Array.isArray(cam.target) && cam.target.length === 2) {
      cx = cam.target[0] as number;
      cy = cam.target[1] as number;
    }

    const w = defaultViewBox.w / zoom;
    const h = defaultViewBox.h / zoom;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }

  // Just zoom around center
  const w = defaultViewBox.w / zoom;
  const h = defaultViewBox.h / zoom;
  const cx = defaultViewBox.x + defaultViewBox.w / 2;
  const cy = defaultViewBox.y + defaultViewBox.h / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export function lerpViewBox(a: ViewBox, b: ViewBox, t: number): ViewBox {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    w: a.w + (b.w - a.w) * t,
    h: a.h + (b.h - a.h) * t,
  };
}
