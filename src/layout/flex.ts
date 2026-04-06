import type { LayoutStrategy, ChildPlacement } from './registry';
import type { Node } from '../types/node';

function getNodeSize(node: Node, isRow: boolean): { main: number; cross: number } {
  let w = 0, h = 0;

  if (node.rect) {
    w = node.rect.w;
    h = node.rect.h;
  } else if (node.ellipse) {
    w = node.ellipse.rx * 2;
    h = node.ellipse.ry * 2;
  } else if (node.image) {
    w = node.image.w;
    h = node.image.h;
  } else {
    w = 100;
    h = 50;
  }

  return isRow ? { main: w, cross: h } : { main: h, cross: w };
}

function getHint(node: Node, key: string, fallback: number): number {
  if (node.layout && key in node.layout) {
    return (node.layout as any)[key] as number;
  }
  return fallback;
}

function getHintStr(node: Node, key: string, fallback: string): string {
  if (node.layout && key in node.layout) {
    return (node.layout as any)[key] as string;
  }
  return fallback;
}

export const flexStrategy: LayoutStrategy = (container: Node, children: Node[]): ChildPlacement[] => {
  // Exclude structural children (depth < 0) from layout flow —
  // they keep their manual transforms and are not flex items.
  const layoutChildren = children.filter(c => (c.depth ?? 0) >= 0);
  if (layoutChildren.length === 0) return [];

  const layout = container.layout!;
  const isRow = (layout.direction ?? 'column') === 'row';
  const gap = layout.gap ?? 0;
  const justify = layout.justify ?? 'start';
  const align = layout.align ?? 'start';
  const padding = layout.padding ?? 0;

  // Sort children by order hint
  const sorted = [...layoutChildren].sort((a, b) => {
    const oa = getHint(a, 'order', 0);
    const ob = getHint(b, 'order', 0);
    return oa - ob;
  });

  const sizes = sorted.map(c => getNodeSize(c, isRow));
  const totalChildMain = sizes.reduce((sum, s) => sum + s.main, 0);
  const totalGaps = gap * Math.max(0, sizes.length - 1);
  const contentMain = totalChildMain + totalGaps;

  // Compute available main axis space from container
  let containerMain = 0;
  if (container.rect) {
    containerMain = (isRow ? container.rect.w : container.rect.h) || 0;
  }
  const availableMain = containerMain > 0 ? containerMain - padding * 2 : contentMain;
  const extraSpace = availableMain - contentMain;

  // Apply grow
  const finalMainSizes = sizes.map(s => s.main);
  if (extraSpace > 0) {
    const totalGrow = sorted.reduce((sum, c) => sum + getHint(c, 'grow', 0), 0);
    if (totalGrow > 0) {
      sorted.forEach((c, i) => {
        const g = getHint(c, 'grow', 0);
        if (g > 0) finalMainSizes[i] += (g / totalGrow) * extraSpace;
      });
    }
  }

  // Compute main-axis positions
  const finalContentMain = finalMainSizes.reduce((s, v) => s + v, 0) + totalGaps;
  const mainPositions: number[] = [];

  let cursor = 0;
  if (justify === 'center') {
    cursor = (availableMain - finalContentMain) / 2;
  } else if (justify === 'end') {
    cursor = availableMain - finalContentMain;
  } else if (justify === 'spaceBetween' && sorted.length > 1) {
    const totalItem = finalMainSizes.reduce((s, v) => s + v, 0);
    const spacer = (availableMain - totalItem) / (sorted.length - 1);
    let pos = padding;
    for (let i = 0; i < sorted.length; i++) {
      mainPositions.push(pos);
      pos += finalMainSizes[i] + spacer;
    }
  } else if (justify === 'spaceAround' && sorted.length > 0) {
    const totalItem = finalMainSizes.reduce((s, v) => s + v, 0);
    const spacer = (availableMain - totalItem) / sorted.length;
    let pos = padding + spacer / 2;
    for (let i = 0; i < sorted.length; i++) {
      mainPositions.push(pos);
      pos += finalMainSizes[i] + spacer;
    }
  }

  // Standard start/center/end placement
  if (mainPositions.length === 0) {
    let pos = cursor + padding;
    for (let i = 0; i < sorted.length; i++) {
      mainPositions.push(pos);
      pos += finalMainSizes[i] + gap;
    }
  }

  // Cross-axis
  let containerCross = 0;
  if (container.rect) {
    containerCross = (isRow ? container.rect.h : container.rect.w) || 0;
  }
  const maxCross = containerCross > 0 ? containerCross - padding * 2 : Math.max(...sizes.map(s => s.cross));

  // containerW/containerH hold main/cross axis sizes respectively
  // (for row: W=width=main, H=height=cross; for column: W=height=main, H=width=cross)
  const containerW = containerMain > 0 ? containerMain : finalContentMain + padding * 2;
  const containerH = containerCross > 0 ? containerCross : maxCross + padding * 2;
  const offsetMain = -containerW / 2;
  const offsetCross = -containerH / 2;

  // Auto-size: set rect dimensions from content when missing or zero
  const actualW = isRow ? containerW : containerH;
  const actualH = isRow ? containerH : containerW;
  if (!container.rect) {
    (container as any).rect = { w: actualW, h: actualH };
  } else {
    if (!container.rect.w) container.rect.w = actualW;
    if (!container.rect.h) container.rect.h = actualH;
  }

  const placements: ChildPlacement[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const child = sorted[i];
    const childAlign = getHintStr(child, 'alignSelf', align);
    const childCross = sizes[i].cross;

    let crossPos = padding;
    if (childAlign === 'center') {
      crossPos = padding + (maxCross - childCross) / 2;
    } else if (childAlign === 'end') {
      crossPos = padding + maxCross - childCross;
    } else if (childAlign === 'stretch') {
      crossPos = padding;
    }

    // Position is the center of the child (rects draw centered)
    const childMainSize = finalMainSizes[i];
    const childCrossSize = sizes[i].cross;
    const mainCenter = mainPositions[i] + childMainSize / 2 + offsetMain;
    const crossCenter = crossPos + childCrossSize / 2 + offsetCross;

    const placement: ChildPlacement = {
      id: child.id,
      x: isRow ? mainCenter : crossCenter,
      y: isRow ? crossCenter : mainCenter,
    };

    // If grow changed size, report it
    if (finalMainSizes[i] !== sizes[i].main) {
      if (isRow) {
        placement.w = finalMainSizes[i];
      } else {
        placement.h = finalMainSizes[i];
      }
    }

    // Stretch cross
    if (childAlign === 'stretch' && maxCross > childCross) {
      if (isRow) {
        placement.h = maxCross;
      } else {
        placement.w = maxCross;
      }
    }

    placements.push(placement);
  }

  return placements;
};
