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

export function runLayout(roots: Node[]): void {
  function processNode(node: Node): void {
    if (node.layout) {
      const strategy = getStrategy(node.layout.type);
      if (strategy) {
        const placements = strategy(node, node.children);
        for (const placement of placements) {
          const child = node.children.find(c => c.id === placement.id);
          if (child) {
            if (!child.transform) {
              (child as any).transform = {};
            }
            child.transform!.x = placement.x;
            child.transform!.y = placement.y;
            // If layout provides sizing, override geometry dimensions
            if (placement.w !== undefined && child.rect) {
              child.rect.w = placement.w;
            }
            if (placement.h !== undefined && child.rect) {
              child.rect.h = placement.h;
            }
          }
        }
      }
    }
    for (const child of node.children) {
      processNode(child);
    }
  }
  for (const root of roots) {
    processNode(root);
  }
}
