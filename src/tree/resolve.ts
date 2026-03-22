import type { Node } from '../types/node';

type StyleDef = Record<string, unknown> & { style?: string };

export function topoSortStyles(styles: Record<string, StyleDef>): string[] {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const order: string[] = [];

  function visit(name: string): void {
    if (visited.has(name)) return;
    if (visiting.has(name)) throw new Error(`Circular style reference involving "${name}"`);
    visiting.add(name);
    const def = styles[name];
    if (def?.style && styles[def.style]) {
      visit(def.style);
    }
    visiting.delete(name);
    visited.add(name);
    order.push(name);
  }

  for (const name of Object.keys(styles)) {
    visit(name);
  }
  return order;
}

function resolveStyleDef(
  name: string,
  styles: Record<string, StyleDef>,
  resolved: Map<string, Record<string, unknown>>,
): Record<string, unknown> {
  if (resolved.has(name)) return resolved.get(name)!;
  const def = { ...styles[name] };
  if (def.style) {
    const base = resolveStyleDef(def.style, styles, resolved);
    const merged = { ...base, ...def };
    delete merged.style;
    resolved.set(name, merged);
    return merged;
  }
  delete def.style;
  resolved.set(name, def);
  return def;
}

const MERGEABLE_KEYS = ['fill', 'stroke', 'opacity', 'transform', 'dash', 'depth', 'visible', 'size'] as const;

function mergeStyleOntoNode(node: Node, styleDef: Record<string, unknown>): Node {
  const result = { ...node };
  const ownKeys = node._ownKeys ?? new Set();
  const styleKeys = new Set<string>();
  for (const key of MERGEABLE_KEYS) {
    if (!ownKeys.has(key) && key in styleDef) {
      (result as any)[key] = styleDef[key];
      styleKeys.add(key);
    }
  }
  result._styleKeys = styleKeys;
  return result;
}

function resolveNode(
  node: Node,
  styles: Record<string, StyleDef>,
  resolvedDefs: Map<string, Record<string, unknown>>,
): Node {
  let result = node;
  if (node.style && styles[node.style]) {
    const def = resolveStyleDef(node.style, styles, resolvedDefs);
    result = mergeStyleOntoNode(node, def);
  }
  if (node.children.length > 0) {
    result = {
      ...result,
      children: node.children.map(child => resolveNode(child, styles, resolvedDefs)),
    };
  }
  return result;
}

export function resolveStyles(
  roots: Node[],
  styles: Record<string, StyleDef>,
): Node[] {
  topoSortStyles(styles);
  const resolvedDefs = new Map<string, Record<string, unknown>>();
  return roots.map(root => resolveNode(root, styles, resolvedDefs));
}
