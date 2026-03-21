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

/** Position cache for smooth slot transitions */
const positionCache = new Map<string, { x: number; y: number }>();
const LERP_SPEED = 0.15; // per frame — reaches ~95% in ~20 frames (~0.33s at 60fps)

function lerpTo(current: number, target: number, speed: number): number {
  return current + (target - current) * speed;
}

export function runLayout(roots: Node[]): void {
  function processNode(node: Node, allRoots: Node[]): void {
    if (node.layout) {
      const strategy = getStrategy(node.layout.type);
      if (strategy) {
        const slotMembers = collectSlotMembers(allRoots, node.id);
        const allMembers = [...node.children, ...slotMembers];

        const placements = strategy(node, allMembers);
        for (const placement of placements) {
          let target = node.children.find(c => c.id === placement.id);
          if (!target) target = slotMembers.find(c => c.id === placement.id);
          if (target) {
            if (!target.transform) {
              (target as any).transform = {};
            }

            let targetX: number;
            let targetY: number;

            if (target.slot === node.id) {
              // Slot member: position in world space
              const cx = node.transform?.x ?? 0;
              const cy = node.transform?.y ?? 0;
              targetX = cx + placement.x;
              targetY = cy + placement.y;
            } else {
              // Direct child: position relative to parent
              targetX = placement.x;
              targetY = placement.y;
            }

            // Smooth transition for slot members
            if (target.slot) {
              const cached = positionCache.get(target.id);
              if (cached) {
                const smoothX = lerpTo(cached.x, targetX, LERP_SPEED);
                const smoothY = lerpTo(cached.y, targetY, LERP_SPEED);
                target.transform!.x = smoothX;
                target.transform!.y = smoothY;
                positionCache.set(target.id, { x: smoothX, y: smoothY });
              } else {
                // First frame — no cache, set directly
                target.transform!.x = targetX;
                target.transform!.y = targetY;
                positionCache.set(target.id, { x: targetX, y: targetY });
              }
            } else {
              target.transform!.x = targetX;
              target.transform!.y = targetY;
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
