import type { z } from 'zod';

export type DslRole =
  | 'keyword' | 'value' | 'kwarg-key' | 'kwarg-value'
  | 'flag' | 'sigil' | 'separator' | 'compound'
  | 'document' | 'section';

export interface AstNode {
  schema?: z.ZodType;
  schemaPath: string;
  modelPath: string;
  from: number;
  to: number;
  value?: unknown;
  children: AstNode[];
  parent?: AstNode;
  dslRole: DslRole;
}

export function createAstNode(init: Partial<AstNode> & Pick<AstNode, 'dslRole' | 'from' | 'to' | 'schemaPath' | 'modelPath'>): AstNode {
  return {
    children: [],
    ...init,
  };
}

/** Find the deepest AST node containing the given position. */
export function nodeAt(root: AstNode, pos: number): AstNode | null {
  if (pos < root.from || pos >= root.to) return null;
  for (const child of root.children) {
    const found = nodeAt(child, pos);
    if (found) return found;
  }
  return root;
}

/** Walk up from a node to find the nearest compound ancestor (or self). */
export function findCompound(node: AstNode): AstNode | null {
  let current: AstNode | undefined = node;
  while (current) {
    if (current.dslRole === 'compound') return current;
    current = current.parent;
  }
  return null;
}

/** Flatten all leaf nodes (non-compound, non-document, non-section) sorted by position. */
export function flattenLeaves(root: AstNode): AstNode[] {
  const leaves: AstNode[] = [];
  const walk = (node: AstNode) => {
    if (node.children.length === 0 && node.dslRole !== 'document' && node.dslRole !== 'section') {
      leaves.push(node);
    }
    for (const child of node.children) walk(child);
  };
  walk(root);
  leaves.sort((a, b) => a.from - b.from);
  return leaves;
}
