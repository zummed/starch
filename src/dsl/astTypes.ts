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

/**
 * Returns the 0-based line index for a character position in text.
 * Counts newlines strictly before `pos` — a position immediately after
 * a newline is on the next line.
 */
export function lineOf(pos: number, text: string): number {
  let line = 0;
  const end = Math.min(pos, text.length);
  for (let i = 0; i < end; i++) {
    if (text.charCodeAt(i) === 10) line++; // '\n'
  }
  return line;
}

/**
 * Returns the number of leading whitespace characters on the line
 * containing `pos`. Counts any whitespace character (space, tab) as 1.
 */
export function indentOf(pos: number, text: string): number {
  // Find line start
  let lineStart = Math.min(pos, text.length);
  while (lineStart > 0 && text.charCodeAt(lineStart - 1) !== 10) {
    lineStart--;
  }
  // Count whitespace forward from lineStart
  let indent = 0;
  for (let i = lineStart; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (ch === 32 || ch === 9) indent++; // space or tab
    else break;
  }
  return indent;
}
