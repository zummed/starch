import type { Node } from '../types/node';

export interface ResolvedTrackPath {
  node: Node;
  propPath: string[];
}

/**
 * Resolve a dot-separated animation track path against a node tree: walk
 * root → child → child, greedily matching each segment to a node id; the
 * segments left over once the id chain stops matching are the property
 * path on the last-matched node. The first segment must match a ROOT id —
 * a nested node can't be addressed by its bare id (e.g. "n1.opacity" for a
 * node nested under "ring" doesn't resolve; "ring.n1.opacity" does).
 *
 * The one path-walking implementation shared by track application and
 * initial-value lookup, so both agree on what a track path means.
 */
export function resolveTrackPath(roots: Node[], path: string): ResolvedTrackPath | undefined {
  const segments = path.split('.');
  let current: Node | undefined;
  let propStart = 0;

  for (let i = 0; i < segments.length; i++) {
    if (i === 0) {
      current = roots.find(n => n.id === segments[0]);
      propStart = 1;
      continue;
    }
    if (!current) break;
    const child = current.children.find(c => c.id === segments[i]);
    if (!child) break;
    current = child;
    propStart = i + 1;
  }

  if (!current) return undefined;
  return { node: current, propPath: segments.slice(propStart) };
}

/** Read a value at a resolved property path (already split into segments). */
export function getAtPropPath(node: Node, propPath: string[]): unknown {
  let value: unknown = node;
  for (const seg of propPath) {
    if (value && typeof value === 'object') {
      value = (value as any)[seg];
    } else {
      return undefined;
    }
  }
  return value;
}

function setNestedValue(obj: Record<string, unknown>, keys: string[], value: unknown): Record<string, unknown> {
  if (keys.length === 0) return obj;
  if (keys.length === 1) {
    return { ...obj, [keys[0]]: value };
  }
  const [head, ...rest] = keys;
  const child = (obj[head] ?? {}) as Record<string, unknown>;
  return { ...obj, [head]: setNestedValue(child, rest, value) };
}

function cloneNode(node: Node): Node {
  return {
    ...node,
    rect: node.rect ? { ...node.rect } : node.rect,
    ellipse: node.ellipse ? { ...node.ellipse } : node.ellipse,
    transform: node.transform ? { ...node.transform } : node.transform,
    layout: node.layout ? { ...node.layout } : node.layout,
    children: node.children.map(cloneNode),
  };
}

/** Deep-clone a node tree. Useful for creating a persistent animated copy. */
export function cloneNodeTree(roots: Node[]): Node[] {
  return roots.map(cloneNode);
}

/**
 * Apply track values to a node tree, returning a new cloned tree.
 * Original nodes are not mutated.
 */
export function applyTrackValues(
  roots: Node[],
  values: Map<string, unknown>,
): Node[] {
  const cloned = roots.map(cloneNode);
  applyToNodes(cloned, values);
  return cloned;
}

/**
 * Apply track values by mutating nodes in place — no cloning.
 * Use with a persistent animated tree to avoid per-frame allocations.
 */
export function applyTrackValuesMut(
  roots: Node[],
  values: Map<string, unknown>,
): void {
  applyToNodes(roots, values);
}

function applyToNodes(
  cloned: Node[],
  values: Map<string, unknown>,
): void {
  for (const [trackPath, value] of values) {
    const resolved = resolveTrackPath(cloned, trackPath);
    if (!resolved) continue;
    const { node: current, propPath } = resolved;
    if (propPath.length === 0) continue;

    if (propPath.length === 1) {
      (current as any)[propPath[0]] = value;
    } else {
      const [propKey, ...leafPath] = propPath;
      const existing = (current as any)[propKey];
      if (existing && typeof existing === 'object') {
        (current as any)[propKey] = setNestedValue(
          existing as Record<string, unknown>,
          leafPath,
          value,
        );
      } else {
        // Create the sub-object if it doesn't exist
        (current as any)[propKey] = setNestedValue({}, leafPath, value);
      }
    }
  }
}
