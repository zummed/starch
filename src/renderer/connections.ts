import type { Node, PathGeom, PointRef } from '../types/node';

export interface ResolvedEndpoint {
  x: number;
  y: number;
}

function findNodeById(roots: Node[], id: string): Node | undefined {
  for (const root of roots) {
    if (root.id === id) return root;
    const found = findNodeById(root.children, id);
    if (found) return found;
  }
  return undefined;
}

function getNodeCenter(node: Node): { x: number; y: number } {
  return {
    x: node.transform?.x ?? 0,
    y: node.transform?.y ?? 0,
  };
}

export function resolveEndpoint(
  ref: PointRef,
  roots: Node[],
): ResolvedEndpoint | null {
  if (typeof ref === 'string') {
    const target = findNodeById(roots, ref);
    if (!target) return null;
    return getNodeCenter(target);
  }
  if (Array.isArray(ref)) {
    if (ref.length === 2 && typeof ref[0] === 'number') {
      return { x: ref[0] as number, y: ref[1] as number };
    }
    if (ref.length === 3 && typeof ref[0] === 'string') {
      const target = findNodeById(roots, ref[0] as string);
      if (!target) return null;
      const center = getNodeCenter(target);
      return { x: center.x + (ref[1] as number), y: center.y + (ref[2] as number) };
    }
  }
  return null;
}

export function resolveConnectionPath(
  path: PathGeom,
  roots: Node[],
): [number, number][] | null {
  // Determine from/to: prefer explicit from/to, fall back to route[0]/route[last]
  const fromRef = path.from ?? (path.route && path.route.length >= 2 ? path.route[0] : undefined);
  const toRef = path.to ?? (path.route && path.route.length >= 2 ? path.route[path.route.length - 1] : undefined);

  if (!fromRef && !toRef) return null;

  const from = fromRef ? resolveEndpoint(fromRef, roots) : null;
  const to = toRef ? resolveEndpoint(toRef, roots) : null;

  if (!from || !to) return null;

  if (path.bend && path.bend !== 0) {
    // Simple quadratic bend: midpoint offset perpendicular to the line
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const cpx = mx + nx * path.bend * 50;
    const cpy = my + ny * path.bend * 50;
    return [[from.x, from.y], [cpx, cpy], [to.x, to.y]];
  }

  if (path.route && path.route.length > 0) {
    // Resolve intermediate waypoints (skip first/last if they served as from/to)
    const hasExplicitFrom = path.from !== undefined;
    const hasExplicitTo = path.to !== undefined;
    const startIdx = hasExplicitFrom ? 0 : 1;
    const endIdx = hasExplicitTo ? path.route.length : path.route.length - 1;
    const resolvedWaypoints = path.route
      .slice(startIdx, endIdx)
      .map(wp => resolveEndpoint(wp, roots))
      .filter((ep): ep is { x: number; y: number } => ep !== null)
      .map((ep): [number, number] => [ep.x, ep.y]);
    return [[from.x, from.y], ...resolvedWaypoints, [to.x, to.y]];
  }

  return [[from.x, from.y], [to.x, to.y]];
}
