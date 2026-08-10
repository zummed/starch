import type { Node } from '../types/node';
import type { ConstraintResult } from './solver';

/**
 * Absolute layout: no automatic placement. Returns no constraints and no
 * variables — children keep whatever transform they already have. Exists
 * so `layout type=absolute` is an explicit, valid no-op strategy rather
 * than an unregistered name that silently falls through.
 */
export const absoluteStrategy = (_container: Node, _children: Node[]): ConstraintResult => {
  return { constraints: [], variables: new Map() };
};
