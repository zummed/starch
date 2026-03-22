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

    collectIds(node.children, ids);
  }
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
