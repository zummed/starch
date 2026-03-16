import type { SceneObject } from '../core/types';

export function computeRenderOrder(
  objects: Record<string, SceneObject>,
): Array<[string, SceneObject]> {
  const entries = Object.entries(objects).filter(([, o]) => !o.groupId);

  // Compute group nesting depth for each object
  const groupDepth: Record<string, number> = {};
  const computeDepth = (id: string): number => {
    if (groupDepth[id] !== undefined) return groupDepth[id];
    const obj = objects[id];
    if (!obj) return 0;
    const p = obj.props as Record<string, unknown>;
    const children = p.children as string[] | undefined;
    if (children && children.length > 0) {
      const maxChild = Math.max(0, ...children.map(computeDepth));
      groupDepth[id] = maxChild + 1;
    } else {
      groupDepth[id] = 0;
    }
    return groupDepth[id];
  };
  for (const id of Object.keys(objects)) computeDepth(id);

  const effectiveDepth = ([id, obj]: [string, SceneObject]): number => {
    const p = obj.props as Record<string, unknown>;
    if (typeof p.depth === 'number') return p.depth;
    if (obj.type === 'line') {
      const from = p.from as string | undefined;
      const to = p.to as string | undefined;
      let d = 0;
      if (from && objects[from]) {
        const gid = objects[from].groupId;
        d = Math.max(d, gid ? (groupDepth[gid] ?? 0) : 0);
      }
      if (to && objects[to]) {
        const gid = objects[to].groupId;
        d = Math.max(d, gid ? (groupDepth[gid] ?? 0) : 0);
      }
      return d;
    }
    return groupDepth[id] ?? 0;
  };

  const typeOrder = (o: SceneObject): number => {
    const p = o.props as Record<string, unknown>;
    const hasKids = Array.isArray(p.children) && (p.children as string[]).length > 0;
    if (o.type === 'path') return 0;
    if (o.type === 'label') return 1;
    if (o.type === 'group' || hasKids) return 2;
    if (o.type === 'line') return 4;
    return 3; // box, circle, table
  };

  return entries.sort((a, b) => {
    const da = effectiveDepth(a);
    const db = effectiveDepth(b);
    if (da !== db) return da - db;
    return typeOrder(a[1]) - typeOrder(b[1]);
  });
}
