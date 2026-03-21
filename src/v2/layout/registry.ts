import type { Node } from '../types/node';

export interface ChildPlacement {
  id: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
}

export type LayoutStrategy = (node: Node, children: Node[]) => ChildPlacement[];

const strategies = new Map<string, LayoutStrategy>();

export function registerStrategy(name: string, strategy: LayoutStrategy): void {
  strategies.set(name, strategy);
}

export function getStrategy(name: string): LayoutStrategy | undefined {
  return strategies.get(name);
}

/**
 * Collect all nodes in the tree that have slot === containerId.
 */
function collectSlotMembers(roots: Node[], containerId: string): Node[] {
  const members: Node[] = [];
  function walk(nodes: Node[]): void {
    for (const node of nodes) {
      if (node.slot === containerId) {
        members.push(node);
      }
      walk(node.children);
    }
  }
  walk(roots);
  return members;
}

/**
 * Run layout and return the computed placements for all layout containers.
 * Does NOT apply positions — the caller decides how to use them.
 */
export interface LayoutResult {
  nodeId: string;
  targetX: number;
  targetY: number;
  targetW?: number;
  targetH?: number;
  isSlotMember: boolean;
}

export function computeLayoutPlacements(roots: Node[]): LayoutResult[] {
  const results: LayoutResult[] = [];

  function processNode(node: Node, allRoots: Node[]): void {
    if (node.layout) {
      const strategy = getStrategy(node.layout.type);
      if (strategy) {
        const slotMembers = collectSlotMembers(allRoots, node.id);
        const allMembers = [...node.children, ...slotMembers];

        const placements = strategy(node, allMembers);
        for (const placement of placements) {
          const isSlot = slotMembers.some(m => m.id === placement.id);

          let targetX = placement.x;
          let targetY = placement.y;

          if (isSlot) {
            // Slot members need world-space position
            targetX += node.transform?.x ?? 0;
            targetY += node.transform?.y ?? 0;
          }

          results.push({
            nodeId: placement.id,
            targetX,
            targetY,
            targetW: placement.w,
            targetH: placement.h,
            isSlotMember: isSlot,
          });
        }
      }
    }
    for (const child of node.children) {
      processNode(child, allRoots);
    }
  }

  for (const root of roots) {
    processNode(root, roots);
  }
  return results;
}

/**
 * Apply layout placements directly to nodes.
 * Used for simple cases (direct children, no animation needed).
 */
export function applyLayoutPlacements(roots: Node[], placements: LayoutResult[], animatedSlotNodeIds?: Set<string>): void {
  function findNode(nodes: Node[], id: string): Node | undefined {
    for (const n of nodes) {
      if (n.id === id) return n;
      const found = findNode(n.children, id);
      if (found) return found;
    }
    return undefined;
  }

  for (const p of placements) {
    // Skip slot members whose positions are driven by animation tracks
    if (p.isSlotMember && animatedSlotNodeIds?.has(p.nodeId)) continue;

    const node = findNode(roots, p.nodeId);
    if (!node) continue;
    if (!node.transform) (node as any).transform = {};
    node.transform!.x = p.targetX;
    node.transform!.y = p.targetY;
    if (p.targetW !== undefined && node.rect) node.rect.w = p.targetW;
    if (p.targetH !== undefined && node.rect) node.rect.h = p.targetH;
  }
}

/** Convenience: compute and apply in one step */
export function runLayout(roots: Node[], animatedSlotNodeIds?: Set<string>): void {
  const placements = computeLayoutPlacements(roots);
  applyLayoutPlacements(roots, placements, animatedSlotNodeIds);
}
