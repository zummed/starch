import type { SceneObject } from '../core/types';

/**
 * Resolve the main-axis and cross-axis size of an object.
 * For row direction: main = width, cross = height.
 * For column direction: main = height, cross = width.
 */
function getChildSize(
  obj: SceneObject,
  isRow: boolean,
): { main: number; cross: number } {
  const p = obj.props as Record<string, unknown>;

  let w: number;
  let h: number;

  switch (obj.type) {
    case 'circle': {
      const r = (p.r as number) || 20;
      w = r * 2;
      h = r * 2;
      break;
    }
    case 'table': {
      const cols = (p.cols as string[]) || [];
      const rows = (p.rows as string[][]) || [];
      const cw = (p.colWidth as number) || 100;
      const rh = (p.rowHeight as number) || 30;
      w = cols.length * cw;
      h = (rows.length + 1) * rh;
      break;
    }
    case 'group': {
      // For nested groups that have already been laid out,
      // compute bounding box from children sizes.
      // Fall back to explicit w/h or defaults.
      w = (p.w as number) || (p._layoutW as number) || 100;
      h = (p.h as number) || (p._layoutH as number) || 50;
      break;
    }
    default: {
      // box, text, etc.
      w = (p.w as number) || 100;
      h = (p.h as number) || 50;
      break;
    }
  }

  return isRow ? { main: w, cross: h } : { main: h, cross: w };
}

/**
 * Topological sort: process inner groups before outer groups.
 * Returns group IDs in order (leaves first).
 */
function sortGroupsDepthFirst(
  groups: Array<{ id: string; childGroupIds: string[] }>,
): string[] {
  const visited = new Set<string>();
  const result: string[] = [];
  const groupMap = new Map(groups.map((g) => [g.id, g]));

  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const g = groupMap.get(id);
    if (g) {
      for (const childId of g.childGroupIds) {
        visit(childId);
      }
    }
    result.push(id);
  }

  for (const g of groups) {
    visit(g.id);
  }

  return result;
}

/**
 * Apply flexbox-like layout to groups that have `direction` set.
 * Mutates objects in place — sets children x/y and groupId.
 */
export function applyGroupLayouts(
  objects: Record<string, SceneObject>,
): void {
  // Find all layout groups (those with direction set)
  const layoutGroups: Array<{ id: string; childGroupIds: string[] }> = [];

  for (const [id, obj] of Object.entries(objects)) {
    const p = obj.props as Record<string, unknown>;
    const children = p.children as string[] | undefined;
    if (!children || !children.length) continue;
    if (!p.direction) continue;

    const childGroupIds = children.filter(
      (cid) => {
        const cp = objects[cid]?.props as Record<string, unknown> | undefined;
        return cp && (cp.children as string[] | undefined)?.length && cp.direction;
      },
    );
    layoutGroups.push({ id, childGroupIds });
  }

  if (layoutGroups.length === 0) return;

  // Process depth-first (inner groups first)
  const order = sortGroupsDepthFirst(layoutGroups);

  for (const groupId of order) {
    const group = objects[groupId];
    const gp = group.props as Record<string, unknown>;
    const direction = gp.direction as string;
    const gap = (gp.gap as number) || 0;
    const justify = (gp.justify as string) || 'center';
    const align = (gp.align as string) || 'center';
    const padding = (gp.padding as number) || 0;
    const isRow = direction === 'row';

    const childIds = ((gp.children as string[]) || []).filter(
      (cid) => objects[cid],
    );

    if (childIds.length === 0) continue;

    // Resolve sizes
    const sizes = childIds.map((cid) => getChildSize(objects[cid], isRow));

    // Total main-axis span
    const totalMain =
      sizes.reduce((sum, s) => sum + s.main, 0) +
      gap * (sizes.length - 1) +
      padding * 2;

    const maxCross = Math.max(...sizes.map((s) => s.cross));

    // Compute main-axis positions (centered around 0)
    const positions: Array<{ main: number; cross: number }> = [];

    if (justify === 'spread' && childIds.length > 1) {
      // Distribute children evenly across the total span
      const totalChildMain = sizes.reduce((sum, s) => sum + s.main, 0);
      const totalGap = totalMain - totalChildMain;
      const gapBetween = totalGap / (sizes.length - 1);

      let cursor = -totalMain / 2 + padding + sizes[0].main / 2;
      for (let i = 0; i < sizes.length; i++) {
        positions.push({ main: cursor, cross: 0 });
        if (i < sizes.length - 1) {
          cursor += sizes[i].main / 2 + gapBetween + sizes[i + 1].main / 2;
        }
      }
    } else {
      // Pack children with gap, then offset based on justify
      let cursor = sizes[0].main / 2;
      for (let i = 0; i < sizes.length; i++) {
        positions.push({ main: cursor, cross: 0 });
        if (i < sizes.length - 1) {
          cursor += sizes[i].main / 2 + gap + sizes[i + 1].main / 2;
        }
      }

      // cursor now points to center of last child
      const blockSpan = cursor + sizes[sizes.length - 1].main / 2;

      // Shift based on justify
      let offset: number;
      if (justify === 'start') {
        offset = -blockSpan / 2 + padding;
      } else if (justify === 'end') {
        offset = blockSpan / 2 - padding;
        // Shift so last child ends at offset
        offset = offset - blockSpan;
      } else {
        // 'center' or 'spread' with single child
        offset = -blockSpan / 2;
      }

      for (const pos of positions) {
        pos.main += offset;
      }
    }

    // Apply cross-axis alignment
    for (let i = 0; i < sizes.length; i++) {
      const s = sizes[i];
      if (align === 'start') {
        positions[i].cross = -(maxCross / 2) + s.cross / 2;
      } else if (align === 'end') {
        positions[i].cross = maxCross / 2 - s.cross / 2;
      }
      // 'center' leaves cross at 0
    }

    // Write positions to children
    for (let i = 0; i < childIds.length; i++) {
      const child = objects[childIds[i]];
      const cp = child.props as Record<string, unknown>;
      const pos = positions[i];

      if (isRow) {
        cp.x = pos.main;
        cp.y = pos.cross;
      } else {
        cp.x = pos.cross;
        cp.y = pos.main;
      }

      child.groupId = groupId;
    }

    // Store computed bounding box for nested group sizing
    (gp as Record<string, unknown>)._layoutW = isRow ? totalMain : maxCross + padding * 2;
    (gp as Record<string, unknown>)._layoutH = isRow ? maxCross + padding * 2 : totalMain;
  }

  // Also set groupId for non-layout containers (objects with children but no direction)
  for (const [id, obj] of Object.entries(objects)) {
    const p = obj.props as Record<string, unknown>;
    const childIds = (p.children as string[]) || [];
    if (!childIds.length) continue;
    for (const cid of childIds) {
      if (objects[cid]) {
        objects[cid].groupId = id;
      }
    }
  }
}
