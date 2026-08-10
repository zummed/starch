import type { Node } from '../types/node';
import type { ViewBox } from '../renderer/camera';
import { getWorldPosition, computeSceneWorldBounds, computeSubtreeWorldBounds, type WorldBounds } from '../renderer/geometry';

export interface CameraViewResult {
  x: number;  // center x
  y: number;  // center y
  w: number;  // view width
  h: number;  // view height
  /** Set when `look` targeted a node id that doesn't resolve in `allNodes`. */
  unresolvedLookId?: string;
}

function unionBounds(list: Array<WorldBounds | undefined>): WorldBounds | undefined {
  let result: WorldBounds | undefined;
  for (const b of list) {
    if (!b) continue;
    if (!result) { result = { ...b }; continue; }
    result.minX = Math.min(result.minX, b.minX);
    result.minY = Math.min(result.minY, b.minY);
    result.maxX = Math.max(result.maxX, b.maxX);
    result.maxY = Math.max(result.maxY, b.maxY);
  }
  return result;
}

/**
 * Resolve camera settings into a view rect (center + dimensions).
 * Used by track expansion to compute concrete rect/transform values at keyframe times.
 * `allNodes` is world-space aware: look targets, fits, and 'all' account for
 * ancestor transforms and (for fits) descendant geometry, not just the
 * target node's own local rect.
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
  let unresolvedLookId: string | undefined;

  // Resolve look: unified camera target/fit
  const look = cam.look;
  if (look) {
    if (look === 'all' || (Array.isArray(look) && look.length > 0 && look.every(v => typeof v === 'string'))) {
      // Fit mode: "all" or array of node IDs — world-space bounds of each
      // target's subtree, so fitting a container includes its children.
      const bounds = look === 'all'
        ? computeSceneWorldBounds(allNodes)
        : unionBounds((look as string[]).map(id => computeSubtreeWorldBounds(allNodes, id)));

      if (bounds) {
        const margin = 20;
        cx = (bounds.minX + bounds.maxX) / 2;
        cy = (bounds.minY + bounds.maxY) / 2;
        vw = (bounds.maxX - bounds.minX) + margin * 2;
        vh = (bounds.maxY - bounds.minY) + margin * 2;
      }
    } else if (typeof look === 'string') {
      // Target mode: single node ID
      const pos = getWorldPosition(allNodes, look);
      if (pos) {
        cx = pos.x;
        cy = pos.y;
      } else {
        unresolvedLookId = look;
      }
    } else if (Array.isArray(look)) {
      if (typeof look[0] === 'number') {
        // Target mode: [x, y] coordinates
        cx = look[0] as number;
        cy = look[1] as number;
      } else if (typeof look[0] === 'string') {
        // Target mode: ["nodeId", dx, dy] offset
        const pos = getWorldPosition(allNodes, look[0] as string);
        if (pos) {
          cx = pos.x + (look[1] as number);
          cy = pos.y + (look[2] as number);
        } else {
          unresolvedLookId = look[0] as string;
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

  return { x: cx, y: cy, w: vw, h: vh, unresolvedLookId };
}
