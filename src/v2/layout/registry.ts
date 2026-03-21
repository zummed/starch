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

export function runLayout(roots: Node[]): void {
  // First pass: collect all containers (nodes with layout)
  // and their members (children + slot references)
  function processNode(node: Node, allRoots: Node[]): void {
    if (node.layout) {
      const strategy = getStrategy(node.layout.type);
      if (strategy) {
        // Gather layout members: direct children + slot references from anywhere in the tree
        const slotMembers = collectSlotMembers(allRoots, node.id);
        const allMembers = [...node.children, ...slotMembers];

        const placements = strategy(node, allMembers);
        for (const placement of placements) {
          // Find the node — could be a direct child or a slot member
          let target = node.children.find(c => c.id === placement.id);
          if (!target) target = slotMembers.find(c => c.id === placement.id);
          if (target) {
            if (!target.transform) {
              (target as any).transform = {};
            }
            // For slot members, position is in world space (container transform + offset)
            if (target.slot === node.id) {
              // Slot member: add container's position to the placement
              const cx = node.transform?.x ?? 0;
              const cy = node.transform?.y ?? 0;
              target.transform!.x = cx + placement.x;
              target.transform!.y = cy + placement.y;
            } else {
              // Direct child: position is relative to parent
              target.transform!.x = placement.x;
              target.transform!.y = placement.y;
            }
            if (placement.w !== undefined && target.rect) {
              target.rect.w = placement.w;
            }
            if (placement.h !== undefined && target.rect) {
              target.rect.h = placement.h;
            }
          }
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
}
