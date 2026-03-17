import type { SceneObject } from '../core/types';

function computeGroupDepths(
  objects: Record<string, SceneObject>,
  allProps: Record<string, Record<string, unknown>>,
): Record<string, number> {
  const depths: Record<string, number> = {};

  function getDepth(id: string, visited: Set<string>): number {
    if (depths[id] !== undefined) return depths[id];
    if (visited.has(id)) return 0;
    visited.add(id);

    const props = allProps[id];
    const groupId = props?.group as string | undefined;
    if (groupId && objects[groupId]) {
      depths[id] = getDepth(groupId, visited) + 1;
    } else {
      depths[id] = 0;
    }
    return depths[id];
  }

  for (const id of Object.keys(objects)) {
    getDepth(id, new Set());
  }

  return depths;
}

export function computeRenderOrder(
  objects: Record<string, SceneObject>,
  allProps?: Record<string, Record<string, unknown>>,
): Array<[string, SceneObject]> {
  const entries = Object.entries(objects);
  const props = allProps || {};

  const groupDepths = allProps
    ? computeGroupDepths(objects, allProps)
    : {};

  const effectiveDepth = ([id, obj]: [string, SceneObject]): number => {
    const p = (props[id] || obj.props) as Record<string, unknown>;
    if (typeof p.depth === 'number') return p.depth;
    return groupDepths[id] ?? 0;
  };

  const isContainer = (id: string): boolean => {
    const p = (props[id] || objects[id]?.props) as Record<string, unknown>;
    return !!p?.direction;
  };

  const typeOrder = (id: string, o: SceneObject): number => {
    if (o.type === 'path') return 0;
    if (o.type === 'label') return 1;
    if (isContainer(id)) return 2;
    if (o.type === 'line') return 4;
    return 3;
  };

  return entries.sort((a, b) => {
    const da = effectiveDepth(a);
    const db = effectiveDepth(b);
    if (da !== db) return da - db;
    return typeOrder(a[0], a[1]) - typeOrder(b[0], b[1]);
  });
}
