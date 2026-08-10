import type { Node } from '../../types/node';
import type { ConstraintResult } from '../solver';
import { Variable, Expression, Constraint } from '../solver';
import { getNodeContentBounds } from '../../renderer/geometry';
import { resolveGridContainer } from '../../types/properties';

/**
 * Read a numeric property from a node's layout bag, with a fallback.
 */
function hint(node: Node, key: string, fallback: number): number {
  if (node.layout && key in node.layout) {
    return (node.layout as any)[key] as number;
  }
  return fallback;
}

function hintStr(node: Node, key: string, fallback: string): string {
  if (node.layout && key in node.layout) {
    return (node.layout as any)[key] as string;
  }
  return fallback;
}

interface Placement {
  child: Node;
  col: number; // 0-based
  row: number; // 0-based
  cSpan: number;
  rSpan: number;
}

export function gridConstraintStrategy(container: Node, children: Node[]): ConstraintResult {
  const constraints: Constraint[] = [];
  const variables = new Map<string, Variable>();

  if (children.length === 0) return { constraints, variables };

  const resolved = resolveGridContainer(container.layout);
  const columns = Math.max(1, resolved.columns);
  const { colGap, rowGap, padding, align: containerAlign } = resolved;
  const fixedRows = resolved.rows;

  let containerW = container.rect?.w || 0;
  let containerH = container.rect?.h || 0;

  const occupied = new Set<string>(); // "col,row" keys
  function markOccupied(col: number, row: number, cSpan: number, rSpan: number): void {
    for (let r = row; r < row + rSpan; r++) {
      for (let c = col; c < col + cSpan; c++) occupied.add(`${c},${r}`);
    }
  }
  function isOccupied(col: number, row: number, cSpan: number, rSpan: number): boolean {
    for (let r = row; r < row + rSpan; r++) {
      for (let c = col; c < col + cSpan; c++) {
        if (occupied.has(`${c},${r}`)) return true;
      }
    }
    return false;
  }

  // Clamp a requested column start so [col, col+cSpan) fits in [0, columns).
  function clampCol(child: Node, requestedCol: number, cSpan: number): number {
    if (requestedCol + cSpan <= columns) return requestedCol;
    const clamped = Math.max(0, columns - cSpan);
    console.warn(`[layout] grid "${container.id}": child "${child.id}" gridCol places it past ${columns} columns, clamped to column ${clamped + 1}`);
    return clamped;
  }

  const placements: Placement[] = [];
  const partialColChildren: { child: Node; cSpan: number; rSpan: number; col: number }[] = [];
  const partialRowChildren: { child: Node; cSpan: number; rSpan: number; row: number }[] = [];
  const autoChildren: { child: Node; cSpan: number; rSpan: number }[] = [];

  for (const child of children) {
    let cSpan = hint(child, 'colSpan', 1);
    if (cSpan > columns) {
      console.warn(`[layout] grid "${container.id}": child "${child.id}" colSpan ${cSpan} exceeds ${columns} columns, clamped`);
      cSpan = columns;
    }
    cSpan = Math.max(1, cSpan);
    const rSpan = Math.max(1, hint(child, 'rowSpan', 1));

    const gridColRaw = hint(child, 'gridCol', 0); // 1-based, 0 = auto
    const gridRowRaw = hint(child, 'gridRow', 0);

    if (gridColRaw > 0 && gridRowRaw > 0) {
      const col = clampCol(child, gridColRaw - 1, cSpan);
      const row = gridRowRaw - 1;
      markOccupied(col, row, cSpan, rSpan);
      placements.push({ child, col, row, cSpan, rSpan });
    } else if (gridColRaw > 0) {
      // Partial hint: fixed column, first free row scanning downward.
      partialColChildren.push({ child, cSpan, rSpan, col: clampCol(child, gridColRaw - 1, cSpan) });
    } else if (gridRowRaw > 0) {
      // Partial hint: fixed row, first free column scanning rightward.
      partialRowChildren.push({ child, cSpan, rSpan, row: gridRowRaw - 1 });
    } else {
      autoChildren.push({ child, cSpan, rSpan });
    }
  }

  for (const { child, cSpan, rSpan, col } of partialColChildren) {
    let row = 0;
    while (isOccupied(col, row, cSpan, rSpan)) row++;
    markOccupied(col, row, cSpan, rSpan);
    placements.push({ child, col, row, cSpan, rSpan });
  }

  for (const { child, cSpan, rSpan, row } of partialRowChildren) {
    let col = 0;
    const maxCol = columns - cSpan;
    while (col < maxCol && isOccupied(col, row, cSpan, rSpan)) col++;
    markOccupied(col, row, cSpan, rSpan);
    placements.push({ child, col, row, cSpan, rSpan });
  }

  let autoRow = 0;
  let autoCol = 0;
  for (const { child, cSpan, rSpan } of autoChildren) {
    while (true) {
      if (autoCol + cSpan > columns) {
        autoCol = 0;
        autoRow++;
        continue;
      }
      if (!isOccupied(autoCol, autoRow, cSpan, rSpan)) break;
      autoCol++;
      if (autoCol >= columns) {
        autoCol = 0;
        autoRow++;
      }
    }
    markOccupied(autoCol, autoRow, cSpan, rSpan);
    placements.push({ child, col: autoCol, row: autoRow, cSpan, rSpan });
    autoCol += cSpan;
  }

  // Row count: content-derived, but `rows` fixes it (reserves empty rows too).
  let contentRows = 0;
  for (const p of placements) contentRows = Math.max(contentRows, p.row + p.rSpan);
  const totalRows = fixedRows ?? Math.max(1, contentRows);

  // Cell width: from container rect, or (guard) from the widest child's
  // intrinsic width when there's no usable container width.
  let autoSizeW = false;
  let cellW: number;
  if (containerW > 0) {
    const availableW = containerW - padding * 2;
    cellW = (availableW - colGap * (columns - 1)) / columns;
  } else {
    autoSizeW = true;
    let widest = 0;
    for (const p of placements) {
      const bounds = getNodeContentBounds(p.child);
      const perColumn = p.cSpan > 1 ? (bounds.w - colGap * (p.cSpan - 1)) / p.cSpan : bounds.w;
      widest = Math.max(widest, perColumn);
    }
    cellW = widest > 0 ? widest : 100;
  }

  let autoSizeH = false;
  let cellH: number;
  if (containerH > 0) {
    const availableH = containerH - padding * 2;
    cellH = (availableH - rowGap * (totalRows - 1)) / totalRows;
  } else {
    autoSizeH = true;
    cellH = cellW; // square cells by default
  }

  if (autoSizeW) containerW = columns * cellW + colGap * (columns - 1) + padding * 2;
  if (autoSizeH) containerH = totalRows * cellH + rowGap * (totalRows - 1) + padding * 2;

  const containerSize = (autoSizeW || autoSizeH) ? { w: containerW, h: containerH } : undefined;

  const halfW = containerW / 2;
  const halfH = containerH / 2;

  for (const p of placements) {
    const { child, col, row, cSpan, rSpan } = p;
    const align = hintStr(child, 'alignSelf', containerAlign);

    const cellLeft = padding + col * (cellW + colGap);
    const spanW = cSpan * cellW + (cSpan - 1) * colGap;
    const cellTop = padding + row * (cellH + rowGap);
    const spanH = rSpan * cellH + (rSpan - 1) * rowGap;

    let childW: number;
    let childH: number;
    let cx: number;
    let cy: number;

    if (align === 'stretch') {
      childW = spanW;
      childH = spanH;
      cx = cellLeft + spanW / 2;
      cy = cellTop + spanH / 2;
    } else {
      const bounds = getNodeContentBounds(child);
      childW = bounds.w || spanW;
      childH = bounds.h || spanH;
      cx = align === 'start' ? cellLeft + childW / 2
        : align === 'end' ? cellLeft + spanW - childW / 2
        : cellLeft + spanW / 2; // center
      cy = align === 'start' ? cellTop + childH / 2
        : align === 'end' ? cellTop + spanH - childH / 2
        : cellTop + spanH / 2; // center
    }

    const centerX = cx - halfW;
    const centerY = cy - halfH;

    const varCX = new Variable(`${child.id}.centerX`, centerX);
    const varCY = new Variable(`${child.id}.centerY`, centerY);
    const varW = new Variable(`${child.id}.width`, childW);
    const varH = new Variable(`${child.id}.height`, childH);

    variables.set(varCX.name, varCX);
    variables.set(varCY.name, varCY);
    variables.set(varW.name, varW);
    variables.set(varH.name, varH);

    constraints.push(Constraint.create(Expression.fromVariable(varCX), Expression.fromConstant(centerX)));
    constraints.push(Constraint.create(Expression.fromVariable(varCY), Expression.fromConstant(centerY)));
    constraints.push(Constraint.create(Expression.fromVariable(varW), Expression.fromConstant(childW)));
    constraints.push(Constraint.create(Expression.fromVariable(varH), Expression.fromConstant(childH)));
  }

  return { constraints, variables, containerSize };
}
