import type { SceneObject } from '../core/types';

/**
 * Get the main-axis and cross-axis size of an object.
 */
function getChildSize(
  props: Record<string, unknown>,
  type: string,
  isRow: boolean,
): { main: number; cross: number } {
  let w: number;
  let h: number;

  switch (type) {
    case 'circle': {
      const r = (props.r as number) || 20;
      w = r * 2;
      h = r * 2;
      break;
    }
    case 'table': {
      const cols = (props.cols as string[]) || [];
      const rows = (props.rows as string[][]) || [];
      const cw = (props.colWidth as number) || 100;
      const rh = (props.rowHeight as number) || 30;
      w = cols.length * cw;
      h = (rows.length + 1) * rh;
      break;
    }
    default: {
      w = (props._layoutW as number) || (props.w as number) || 100;
      h = (props._layoutH as number) || (props.h as number) || 50;
      break;
    }
  }

  return isRow ? { main: w, cross: h } : { main: h, cross: w };
}

interface ChildEntry {
  id: string;
  order: number;
  definitionOrder: number;
}

/**
 * Build membership map: containerId → sorted children.
 * Reads `group` from animated props, falls back to base props.
 */
function buildMembership(
  objects: Record<string, SceneObject>,
  allProps: Record<string, Record<string, unknown>>,
): Map<string, ChildEntry[]> {
  const membership = new Map<string, ChildEntry[]>();

  for (const [id, obj] of Object.entries(objects)) {
    const props = allProps[id] || obj.props;
    const groupId = props.group as string | undefined;
    if (!groupId) continue;

    // Prevent self-referencing groups
    if (groupId === id) continue;

    // Validate: container must exist and have direction set
    const containerProps = allProps[groupId] || (objects[groupId]?.props as Record<string, unknown>);
    if (!containerProps || !containerProps.direction) continue;

    if (!membership.has(groupId)) {
      membership.set(groupId, []);
    }
    membership.get(groupId)!.push({
      id,
      order: (props.order as number) ?? 0,
      definitionOrder: obj._definitionOrder ?? 0,
    });
  }

  // Sort children: by order, then by definition order
  for (const children of membership.values()) {
    children.sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.definitionOrder - b.definitionOrder;
    });
  }

  return membership;
}

/**
 * Topological sort: process inner containers before outer ones.
 */
function sortContainersDepthFirst(
  membership: Map<string, ChildEntry[]>,
  _allProps: Record<string, Record<string, unknown>>,
): string[] {
  const visited = new Set<string>();
  const result: string[] = [];

  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    // Visit child containers first
    const children = membership.get(id);
    if (children) {
      for (const child of children) {
        if (membership.has(child.id)) {
          visit(child.id);
        }
      }
    }
    result.push(id);
  }

  for (const containerId of membership.keys()) {
    visit(containerId);
  }

  return result;
}

/**
 * Compute flexbox layout and write world-space positions into allProps.
 * Mutates allProps in place.
 */
export function computeLayout(
  objects: Record<string, SceneObject>,
  allProps: Record<string, Record<string, unknown>>,
): void {
  const membership = buildMembership(objects, allProps);
  if (membership.size === 0) return;

  const order = sortContainersDepthFirst(membership, allProps);

  // Two passes needed for nesting: first pass computes sizes (bottom-up),
  // second pass writes correct world-space positions (now that parent
  // containers have been positioned by their own parents).
  for (let pass = 0; pass < 2; pass++) {
  for (const containerId of order) {
    const children = membership.get(containerId);
    if (!children || children.length === 0) continue;

    const containerProps = allProps[containerId];
    if (!containerProps) continue;

    const direction = containerProps.direction as string;
    const gap = (containerProps.gap as number) || 0;
    const justify = (containerProps.justify as string) || 'start';
    const align = (containerProps.align as string) || 'start';
    const padAll = (containerProps.padding as number) || 0;
    const padTop = (containerProps.paddingTop as number) ?? padAll;
    const padRight = (containerProps.paddingRight as number) ?? padAll;
    const padBottom = (containerProps.paddingBottom as number) ?? padAll;
    const padLeft = (containerProps.paddingLeft as number) ?? padAll;
    const isRow = direction === 'row';

    // Main-axis and cross-axis padding
    const padMainStart = isRow ? padLeft : padTop;
    const padMainEnd = isRow ? padRight : padBottom;
    const padCrossStart = isRow ? padTop : padLeft;
    const padCrossEnd = isRow ? padBottom : padRight;
    const padMainTotal = padMainStart + padMainEnd;
    const padCrossTotal = padCrossStart + padCrossEnd;

    const inputKeys = objects[containerId]?._inputKeys;
    const hasExplicitW = inputKeys ? (inputKeys.has('w') || inputKeys.has('size')) : !!(containerProps.w as number);
    const hasExplicitH = inputKeys ? (inputKeys.has('h') || inputKeys.has('size')) : !!(containerProps.h as number);
    const hasExplicitSize = hasExplicitW || hasExplicitH;
    const containerW = hasExplicitW ? ((containerProps._layoutW as number) || (containerProps.w as number) || 0) : 0;
    const containerH = hasExplicitH ? ((containerProps._layoutH as number) || (containerProps.h as number) || 0) : 0;
    const containerMain = isRow ? containerW : containerH;
    const containerCross = isRow ? containerH : containerW;
    const shouldWrap = (containerProps.wrap as boolean) ?? false;

    // Resolve child sizes
    const childIds = children.map((c) => c.id);
    const sizes = childIds.map((id) => {
      const p = allProps[id] || {};
      const type = objects[id]?.type || 'box';
      return getChildSize(p, type, isRow);
    });

    // Break into wrap lines if wrap is enabled
    const lines: Array<{ ids: string[]; sizes: Array<{ main: number; cross: number }> }> = [];
    if (shouldWrap && hasExplicitSize) {
      const maxMain = containerMain - padMainTotal;
      let currentLine: { ids: string[]; sizes: Array<{ main: number; cross: number }> } = { ids: [], sizes: [] };
      let currentMain = 0;
      for (let i = 0; i < childIds.length; i++) {
        const needed = currentLine.ids.length > 0 ? gap + sizes[i].main : sizes[i].main;
        if (currentMain + needed > maxMain && currentLine.ids.length > 0) {
          lines.push(currentLine);
          currentLine = { ids: [], sizes: [] };
          currentMain = 0;
        }
        currentLine.ids.push(childIds[i]);
        currentLine.sizes.push(sizes[i]);
        currentMain += currentLine.ids.length === 1 ? sizes[i].main : gap + sizes[i].main;
      }
      if (currentLine.ids.length > 0) lines.push(currentLine);
    } else {
      lines.push({ ids: childIds, sizes });
    }

    // Process each line
    let lineCrossOffset = 0;
    let totalCrossExtent = 0;
    const lineResults: Array<{ ids: string[]; mainPositions: number[]; crossPositions: number[]; finalMainSizes: number[]; lineCross: number; lineCrossOffset: number }> = [];

    for (const line of lines) {
      const lineIds = line.ids;
      const lineSizes = line.sizes;

      const totalChildMain = lineSizes.reduce((sum, s) => sum + s.main, 0);
      const totalGaps = gap * (lineSizes.length - 1);
      const contentMain = totalChildMain + totalGaps;
      const availableMain = hasExplicitSize ? (containerMain - padMainTotal) : contentMain;
      const extraSpace = availableMain - contentMain;

      // Apply grow/shrink
      const finalMainSizes = lineSizes.map((s) => s.main);
      if (extraSpace > 0) {
        const totalGrow = lineIds.reduce((sum, id) => sum + ((allProps[id]?.grow as number) ?? 0), 0);
        if (totalGrow > 0) {
          lineIds.forEach((id, i) => {
            const g = (allProps[id]?.grow as number) ?? 0;
            if (g > 0) finalMainSizes[i] += (g / totalGrow) * extraSpace;
          });
        }
      } else if (extraSpace < 0) {
        const totalShrink = lineIds.reduce((sum, id, i) => sum + ((allProps[id]?.shrink as number) ?? 0) * lineSizes[i].main, 0);
        if (totalShrink > 0) {
          lineIds.forEach((id, i) => {
            const s = (allProps[id]?.shrink as number) ?? 0;
            if (s > 0) finalMainSizes[i] = Math.max(0, finalMainSizes[i] - (s * lineSizes[i].main / totalShrink) * Math.abs(extraSpace));
          });
        }
      }

      const finalContentMain = finalMainSizes.reduce((s, v) => s + v, 0) + totalGaps;
      const mainPositions: number[] = [];

      if (justify === 'spaceBetween' && lineIds.length > 1) {
        const totalItemMain = finalMainSizes.reduce((s, v) => s + v, 0);
        const spacerSize = (availableMain - totalItemMain) / (lineIds.length - 1);
        let cursor = -availableMain / 2 + finalMainSizes[0] / 2;
        for (let i = 0; i < lineIds.length; i++) {
          mainPositions.push(cursor);
          if (i < lineIds.length - 1) cursor += finalMainSizes[i] / 2 + spacerSize + finalMainSizes[i + 1] / 2;
        }
      } else if (justify === 'spaceAround' && lineIds.length > 0) {
        const totalItemMain = finalMainSizes.reduce((s, v) => s + v, 0);
        const spacerSize = (availableMain - totalItemMain) / lineIds.length;
        let cursor = -availableMain / 2 + spacerSize / 2 + finalMainSizes[0] / 2;
        for (let i = 0; i < lineIds.length; i++) {
          mainPositions.push(cursor);
          if (i < lineIds.length - 1) cursor += finalMainSizes[i] / 2 + spacerSize + finalMainSizes[i + 1] / 2;
        }
      } else {
        let cursor = finalMainSizes[0] / 2;
        for (let i = 0; i < lineIds.length; i++) {
          mainPositions.push(cursor);
          if (i < lineIds.length - 1) cursor += finalMainSizes[i] / 2 + gap + finalMainSizes[i + 1] / 2;
        }
        let offset: number;
        if (justify === 'start' || (justify === 'center' && !hasExplicitSize)) {
          offset = hasExplicitSize ? -availableMain / 2 : -finalContentMain / 2;
        } else if (justify === 'end') {
          offset = hasExplicitSize ? availableMain / 2 - finalContentMain : -finalContentMain / 2;
        } else {
          // center with explicit size
          offset = -finalContentMain / 2;
        }
        for (let i = 0; i < mainPositions.length; i++) mainPositions[i] += offset;
      }

      const lineCross = Math.max(...lineSizes.map((s) => s.cross));
      const maxCross = hasExplicitSize && lines.length === 1 ? (containerCross - padCrossTotal) : lineCross;

      const crossPositions: number[] = [];
      for (let i = 0; i < lineIds.length; i++) {
        const childAlign = (allProps[lineIds[i]]?.alignSelf as string) || align;
        const childCross = lineSizes[i].cross;
        if (childAlign === 'start') {
          crossPositions.push(-maxCross / 2 + childCross / 2);
        } else if (childAlign === 'end') {
          crossPositions.push(maxCross / 2 - childCross / 2);
        } else if (childAlign === 'stretch') {
          crossPositions.push(0);
          const p = allProps[lineIds[i]];
          if (p) {
            if (isRow) p._layoutH = maxCross;
            else p._layoutW = maxCross;
          }
        } else {
          crossPositions.push(0);
        }
      }

      lineResults.push({ ids: lineIds, mainPositions, crossPositions, finalMainSizes, lineCross: maxCross, lineCrossOffset: lineCrossOffset });
      lineCrossOffset += maxCross + (lineResults.length > 1 ? gap : 0);
      totalCrossExtent = lineCrossOffset;
    }

    // Auto-size
    const totalContentMain = lines.length === 1
      ? (lines[0].sizes.reduce((s, v) => s + v.main, 0) + gap * (lines[0].ids.length - 1))
      : (containerMain - padMainTotal);
    const autoMain = totalContentMain + padMainTotal;
    const autoCross = totalCrossExtent + padCrossTotal;

    if (!hasExplicitW) {
      containerProps._layoutW = isRow ? autoMain : autoCross;
    }
    if (!hasExplicitH) {
      containerProps._layoutH = isRow ? autoCross : autoMain;
    }

    // Write world-space positions (offset for asymmetric padding)
    const cx = (containerProps.x as number) || 0;
    const cy = (containerProps.y as number) || 0;
    const halfTotalCross = totalCrossExtent / 2;
    const mainPadOffset = (padMainStart - padMainEnd) / 2;
    const crossPadOffset = (padCrossStart - padCrossEnd) / 2;

    for (const lr of lineResults) {
      for (let i = 0; i < lr.ids.length; i++) {
        const childProps = allProps[lr.ids[i]];
        if (!childProps) continue;

        const mainPos = lr.mainPositions[i] + mainPadOffset;
        const crossPos = lr.crossPositions[i] + lr.lineCrossOffset + lr.lineCross / 2 - halfTotalCross + crossPadOffset;

        if (isRow) {
          childProps.x = cx + mainPos;
          childProps.y = cy + crossPos;
        } else {
          childProps.x = cx + crossPos;
          childProps.y = cy + mainPos;
        }

        if (lr.finalMainSizes[i] !== lines[lineResults.indexOf(lr)].sizes[i].main) {
          if (isRow) childProps._layoutW = lr.finalMainSizes[i];
          else childProps._layoutH = lr.finalMainSizes[i];
        }
      }
    }
  }
  } // end two-pass loop
}
