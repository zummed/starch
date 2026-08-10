import type { Node } from '../types/node';
import { LAYOUT_STRATEGY_SCHEMAS, LayoutUniversalSchema, type LayoutStrategyName } from '../types/properties';
import { findNode } from './registry';

const UNIVERSAL_KEYS = new Set<string>(['type', ...Object.keys(LayoutUniversalSchema.shape)]);

/** For a key, every strategy that declares it as a container property. */
const CONTAINER_KEY_STRATEGIES = new Map<string, LayoutStrategyName[]>();
/** For a key, every strategy that declares it as a child hint. */
const CHILD_HINT_KEY_STRATEGIES = new Map<string, LayoutStrategyName[]>();

for (const name of Object.keys(LAYOUT_STRATEGY_SCHEMAS) as LayoutStrategyName[]) {
  const { container, childHints } = LAYOUT_STRATEGY_SCHEMAS[name];
  for (const key of Object.keys(container.shape)) {
    const list = CONTAINER_KEY_STRATEGIES.get(key) ?? [];
    list.push(name);
    CONTAINER_KEY_STRATEGIES.set(key, list);
  }
  for (const key of Object.keys(childHints.shape)) {
    const list = CHILD_HINT_KEY_STRATEGIES.get(key) ?? [];
    list.push(name);
    CHILD_HINT_KEY_STRATEGIES.set(key, list);
  }
}

function containerKeysOf(strategy: LayoutStrategyName): string[] {
  return Object.keys(LAYOUT_STRATEGY_SCHEMAS[strategy].container.shape);
}

function childHintKeysOf(strategy: LayoutStrategyName): string[] {
  return Object.keys(LAYOUT_STRATEGY_SCHEMAS[strategy].childHints.shape);
}

/** Build the parent-id lookup for every node reachable from roots. */
function buildParentIndex(roots: Node[]): Map<string, Node> {
  const parentOf = new Map<string, Node>();
  function walk(nodes: Node[], parent: Node | undefined): void {
    for (const node of nodes) {
      if (parent) parentOf.set(node.id, parent);
      walk(node.children, node);
    }
  }
  walk(roots, undefined);
  return parentOf;
}

function buildWarning(node: Node, key: string, layout: NonNullable<Node['layout']>, parent: Node | undefined): string {
  const containerStrategies = CONTAINER_KEY_STRATEGIES.get(key);
  if (containerStrategies) {
    if (!layout.type) {
      return `layout.${key} on "${node.id}" has no effect — "${node.id}" has no layout type`;
    }
    const label = containerStrategies.length === 1 ? containerStrategies[0] : containerStrategies.join(' or ');
    return `layout.${key} on "${node.id}" has no effect — "${node.id}" is not a ${label} container (type is ${layout.type})`;
  }

  const childHintStrategies = CHILD_HINT_KEY_STRATEGIES.get(key);
  if (childHintStrategies) {
    if (!parent) {
      return `layout.${key} on "${node.id}" has no effect — "${node.id}" has no parent layout container`;
    }
    if (!parent.layout?.type) {
      return `layout.${key} on "${node.id}" has no effect — parent "${parent.id}" is not a layout container`;
    }
    return `layout.${key} on "${node.id}" has no effect — parent "${parent.id}" is a ${parent.layout.type} container`;
  }

  // LayoutSchema's key space is exhaustively universal | container | child
  // hint — reachable only if a key is added to the schema without a home.
  return `layout.${key} on "${node.id}" has no effect`;
}

/**
 * Walk the tree and warn on every authored `layout.*` key that has no
 * effect given its node's context. A key is allowed when it's universal
 * (slot, skip, type), a container key of the node's own `layout.type`, a
 * child hint of the node's structural parent's strategy, or — when the node
 * declares `layout.slot` — a child hint of the slot target container's
 * strategy.
 */
export function validateLayoutUsage(roots: Node[]): string[] {
  const warnings: string[] = [];
  const parentOf = buildParentIndex(roots);

  function visit(node: Node): void {
    const layout = node.layout;
    if (layout) {
      const allowed = new Set<string>(UNIVERSAL_KEYS);

      const ownType = layout.type;
      if (ownType && LAYOUT_STRATEGY_SCHEMAS[ownType]) {
        for (const key of containerKeysOf(ownType)) allowed.add(key);
      }

      const parent = parentOf.get(node.id);
      const parentType = parent?.layout?.type;
      if (parentType && LAYOUT_STRATEGY_SCHEMAS[parentType]) {
        for (const key of childHintKeysOf(parentType)) allowed.add(key);
      }

      if (layout.slot !== undefined) {
        const target = findNode(roots, layout.slot);
        const targetType = target?.layout?.type;
        if (targetType && LAYOUT_STRATEGY_SCHEMAS[targetType]) {
          for (const key of childHintKeysOf(targetType)) allowed.add(key);
        }
      }

      for (const key of Object.keys(layout)) {
        if (allowed.has(key)) continue;
        warnings.push(buildWarning(node, key, layout, parent));
      }
    }
    for (const child of node.children) visit(child);
  }

  for (const root of roots) visit(root);
  return warnings;
}
