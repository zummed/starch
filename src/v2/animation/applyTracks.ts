import type { Node } from '../types/node';

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
    children: node.children.map(cloneNode),
  };
}

export function applyTrackValues(
  roots: Node[],
  values: Map<string, unknown>,
): Node[] {
  const cloned = roots.map(cloneNode);

  for (const [trackPath, value] of values) {
    const segments = trackPath.split('.');

    // Walk the tree: greedily match child IDs from the root
    let current: Node | undefined;
    let propStart = 0;

    for (let i = 0; i < segments.length; i++) {
      if (i === 0) {
        current = cloned.find(n => n.id === segments[0]);
        propStart = 1;
        continue;
      }
      if (current) {
        const child = current.children.find(c => c.id === segments[i]);
        if (child) {
          current = child;
          propStart = i + 1;
        } else {
          break;
        }
      }
    }

    if (!current) continue;

    const propPath = segments.slice(propStart);
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

  return cloned;
}
