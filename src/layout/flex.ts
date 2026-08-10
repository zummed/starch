import type { Node } from '../types/node';
import { Variable, Expression, Constraint } from './solver';
import type { ConstraintResult } from './solver';
import { getNodeContentBounds } from '../renderer/geometry';
import { resolveFlexContainer } from '../types/properties';

function getNodeSize(node: Node, isRow: boolean): { main: number; cross: number } {
  const { w, h } = getNodeContentBounds(node);
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

/**
 * Flex constraint strategy. Computes the same box-model math as a direct
 * layout pass (sizes, grow, justify, align), then emits it as constraints
 * instead of writing positions directly: the first child's main-axis center
 * is pinned, and each subsequent child is expressed as a delta from the
 * previous one (`c[i] - c[i-1] = delta`), so the solver actually propagates
 * the chain rather than receiving n independent pins. Cross-axis centers
 * and final width/height are pinned per child (no dependency between
 * children on the cross axis).
 */
export function flexConstraintStrategy(container: Node, children: Node[]): ConstraintResult {
  const constraints: Constraint[] = [];
  const variables = new Map<string, Variable>();

  if (children.length === 0) return { constraints, variables };

  const { direction, gap, justify, align, padding } = resolveFlexContainer(container.layout);
  const isRow = direction === 'row';

  // Sort children by order hint
  const sorted = [...children].sort((a, b) => {
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

  // Auto-size: report content-derived dimensions when the container has no
  // fixed rect — the registry applies this to the node, we don't mutate it.
  const actualW = isRow ? containerW : containerH;
  const actualH = isRow ? containerH : containerW;
  const containerSize = container.rect && container.rect.w && container.rect.h
    ? undefined
    : { w: actualW, h: actualH };

  // Per-child main/cross centers and sizes
  const mainCenters: number[] = [];
  const crossCenters: number[] = [];
  const childWidths: number[] = [];
  const childHeights: number[] = [];

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

    const childMainSize = finalMainSizes[i];
    const childCrossSize = childAlign === 'stretch' && maxCross > childCross ? maxCross : childCross;

    mainCenters.push(mainPositions[i] + childMainSize / 2 + offsetMain);
    crossCenters.push(crossPos + childCrossSize / 2 + offsetCross);

    if (isRow) {
      childWidths.push(childMainSize);
      childHeights.push(childCrossSize);
    } else {
      childWidths.push(childCrossSize);
      childHeights.push(childMainSize);
    }
  }

  // Main axis: pin the first child, chain the rest as deltas so the solver
  // genuinely propagates the relationship instead of receiving independent pins.
  const mainVars = sorted.map((child, i) =>
    new Variable(`${child.id}.${isRow ? 'centerX' : 'centerY'}`, mainCenters[i]),
  );
  mainVars.forEach(v => variables.set(v.name, v));
  constraints.push(Constraint.create(
    Expression.fromVariable(mainVars[0]),
    Expression.fromConstant(mainCenters[0]),
  ));
  for (let i = 1; i < mainVars.length; i++) {
    const delta = mainCenters[i] - mainCenters[i - 1];
    constraints.push(Constraint.create(
      Expression.fromVariable(mainVars[i]).minus(Expression.fromVariable(mainVars[i - 1])),
      Expression.fromConstant(delta),
    ));
  }

  // Cross axis + width/height: pinned per child (no inter-child dependency).
  for (let i = 0; i < sorted.length; i++) {
    const child = sorted[i];

    const crossVar = new Variable(`${child.id}.${isRow ? 'centerY' : 'centerX'}`, crossCenters[i]);
    variables.set(crossVar.name, crossVar);
    constraints.push(Constraint.create(
      Expression.fromVariable(crossVar),
      Expression.fromConstant(crossCenters[i]),
    ));

    const varW = new Variable(`${child.id}.width`, childWidths[i]);
    const varH = new Variable(`${child.id}.height`, childHeights[i]);
    variables.set(varW.name, varW);
    variables.set(varH.name, varH);
    constraints.push(Constraint.create(
      Expression.fromVariable(varW),
      Expression.fromConstant(childWidths[i]),
    ));
    constraints.push(Constraint.create(
      Expression.fromVariable(varH),
      Expression.fromConstant(childHeights[i]),
    ));
  }

  return { constraints, variables, containerSize };
}
