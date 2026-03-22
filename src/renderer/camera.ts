import type { Node } from '../types/node';

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
}

/**
 * Find the first active camera node in the root-level node list.
 * Camera nodes must be at root level (not nested).
 * A camera is active if `camera.active` is not explicitly `false`.
 */
export function findActiveCamera(roots: Node[]): Node | undefined {
  return roots.find(n => n.camera && n.camera.active !== false);
}

/**
 * Read the active camera's rect + transform as the viewbox.
 * After track expansion, camera settings have been resolved into
 * concrete rect (w, h) and transform (x, y, rotation) values.
 */
export function computeViewBox(
  cameraNode: Node | undefined,
  defaultViewBox: ViewBox,
): ViewBox {
  if (!cameraNode?.camera) return defaultViewBox;
  if (!cameraNode.rect || cameraNode.rect.w === 0 || cameraNode.rect.h === 0) return defaultViewBox;

  const tx = cameraNode.transform?.x ?? 0;
  const ty = cameraNode.transform?.y ?? 0;
  const w = cameraNode.rect.w;
  const h = cameraNode.rect.h;
  const rotation = cameraNode.transform?.rotation ?? 0;

  return {
    x: tx - w / 2,
    y: ty - h / 2,
    w,
    h,
    rotation: rotation !== 0 ? rotation : undefined,
  };
}
