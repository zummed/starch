import type { LayoutStrategy, ChildPlacement } from './registry';
import type { Node } from '../types/node';

/** Absolute layout: children use their own transform, no automatic placement */
export const absoluteStrategy: LayoutStrategy = (_node: Node, _children: Node[]): ChildPlacement[] => {
  // No-op — children keep their own transform values
  return [];
};
