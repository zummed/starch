import type { Node } from '../types/node';

const GEOMETRY_KEYS = ['rect', 'ellipse', 'text', 'path', 'image'] as const;

function collectIds(nodes: Node[], ids: Set<string>): void {
  for (const node of nodes) {
    if (ids.has(node.id)) {
      throw new Error(`Duplicate ID: "${node.id}"`);
    }
    ids.add(node.id);

    // Check at most one geometry field
    const geomCount = GEOMETRY_KEYS.filter(k => node[k] !== undefined).length;
    if (geomCount > 1) {
      throw new Error(`Node "${node.id}" has multiple geometry fields (max 1 allowed)`);
    }

    collectIds(node.children ?? [], ids);
  }
}

/** Node keys that carry no authored meaning on their own. */
const STRUCTURAL_KEYS = new Set([
  'id', 'visible', 'children', '_isStyle', '_ownKeys', '_styleKeys', '_textMaxWidth',
]);

/**
 * Find nodes that ended up with an id and nothing else.
 *
 * That is the shape every silent parse corruption takes: a misspelled
 * property, an unknown template name or a stray kwarg each leave their
 * leftover token behind as a bare node instead of failing, so a scene can
 * parse "successfully" while quietly dropping what the author wrote.
 * Reporting these turns that silent data loss into a warning.
 */
export function findEmptyNodes(roots: Node[]): string[] {
  const empty: string[] = [];

  function visit(nodes: Node[]): void {
    for (const node of nodes) {
      const children = node.children ?? [];
      const meaningful = Object.keys(node).filter(
        key => !STRUCTURAL_KEYS.has(key) && (node as unknown as Record<string, unknown>)[key] !== undefined,
      );
      if (meaningful.length === 0 && children.length === 0) {
        empty.push(node.id);
      }
      visit(children);
    }
  }

  visit(roots);
  return empty;
}

export function validateTree(
  roots: Node[],
  styles?: Record<string, unknown>,
): void {
  const ids = new Set<string>();
  collectIds(roots, ids);

  // Check style/node ID collisions
  if (styles) {
    for (const styleName of Object.keys(styles)) {
      if (ids.has(styleName)) {
        throw new Error(`Style/node ID collision: "${styleName}" is both a style name and a node ID`);
      }
    }
  }
}
