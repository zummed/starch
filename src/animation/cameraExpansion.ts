import type { Node } from '../types/node';
import type { ViewBox } from '../renderer/camera';

export interface CameraViewResult {
  x: number;  // center x
  y: number;  // center y
  w: number;  // view width
  h: number;  // view height
}

function findNodeById(roots: Node[], id: string): Node | undefined {
  for (const root of roots) {
    if (root.id === id) return root;
    const found = findNodeById(root.children, id);
    if (found) return found;
  }
  return undefined;
}

function getNodeBounds(node: Node): { x: number; y: number; w: number; h: number } {
  const px = node.transform?.x ?? 0;
  const py = node.transform?.y ?? 0;
  let w = 0, h = 0;
  if (node.rect) { w = node.rect.w; h = node.rect.h; }
  else if (node.ellipse) { w = node.ellipse.rx * 2; h = node.ellipse.ry * 2; }
  return { x: px - w / 2, y: py - h / 2, w, h };
}

/**
 * Resolve camera settings into a view rect (center + dimensions).
 * Used by track expansion to compute concrete rect/transform values at keyframe times.
 */
export function resolveCameraView(
  cameraNode: Node,
  allNodes: Node[],
  defaultViewBox: ViewBox,
): CameraViewResult {
  const cam = cameraNode.camera;
  if (!cam) {
    return {
      x: defaultViewBox.x + defaultViewBox.w / 2,
      y: defaultViewBox.y + defaultViewBox.h / 2,
      w: defaultViewBox.w,
      h: defaultViewBox.h,
    };
  }

  const zoom = cam.zoom ?? 1;
  let cx = defaultViewBox.x + defaultViewBox.w / 2;
  let cy = defaultViewBox.y + defaultViewBox.h / 2;
  let vw = defaultViewBox.w;
  let vh = defaultViewBox.h;

  // Resolve look: unified camera target/fit
  const look = cam.look;
  if (look) {
    if (look === 'all' || (Array.isArray(look) && look.length > 0 && look.every(v => typeof v === 'string'))) {
      // Fit mode: "all" or array of node IDs
      const ids = look === 'all'
        ? allNodes.filter(n => !n.camera).map(n => n.id)
        : look as string[];

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const id of ids) {
        const node = findNodeById(allNodes, id);
        if (!node) continue;
        const b = getNodeBounds(node);
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.w);
        maxY = Math.max(maxY, b.y + b.h);
      }

      if (minX !== Infinity) {
        const margin = 20;
        cx = (minX + maxX) / 2;
        cy = (minY + maxY) / 2;
        vw = (maxX - minX) + margin * 2;
        vh = (maxY - minY) + margin * 2;
      }
    } else if (typeof look === 'string') {
      // Target mode: single node ID
      const node = findNodeById(allNodes, look);
      if (node) {
        cx = node.transform?.x ?? 0;
        cy = node.transform?.y ?? 0;
      }
    } else if (Array.isArray(look)) {
      if (typeof look[0] === 'number') {
        // Target mode: [x, y] coordinates
        cx = look[0] as number;
        cy = look[1] as number;
      } else if (typeof look[0] === 'string') {
        // Target mode: ["nodeId", dx, dy] offset
        const node = findNodeById(allNodes, look[0] as string);
        if (node) {
          cx = (node.transform?.x ?? 0) + (look[1] as number);
          cy = (node.transform?.y ?? 0) + (look[2] as number);
        }
      }
    }
  }

  // Apply zoom
  vw /= zoom;
  vh /= zoom;

  // Apply ratio: expand smaller dimension, never clip
  if (cam.ratio && cam.ratio > 0) {
    const currentRatio = vw / vh;
    if (currentRatio < cam.ratio) {
      vw = vh * cam.ratio;
    } else if (currentRatio > cam.ratio) {
      vh = vw / cam.ratio;
    }
  }

  return { x: cx, y: cy, w: vw, h: vh };
}
