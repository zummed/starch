import { createSvgEl, setAttrs, removeChildren } from './svgHelpers';
import { scaleAroundAnchor } from '../../../engine/anchor';
import { FONT } from '../constants';
import type { AnchorPoint } from '../../../core/types';

export interface TableHandles {
  root: SVGGElement;
  innerG: SVGGElement;
  _lastCols: number;
  _lastRows: number;
}

export function createTable(props: Record<string, unknown>): TableHandles {
  const root = createSvgEl('g');
  const innerG = createSvgEl('g');
  root.appendChild(innerG);

  const handles: TableHandles = { root, innerG, _lastCols: 0, _lastRows: 0 };
  updateTable(handles, props);
  return handles;
}

export function updateTable(h: TableHandles, props: Record<string, unknown>): void {
  const {
    x = 0, y = 0, cols = [], rows = [],
    fill = '#1a1d24', stroke = '#2a2d35',
    headerFill = '#14161c', textColor = '#c9cdd4',
    headerColor = '#e2e5ea', textSize = 12,
    colWidth = 100, rowHeight = 30,
    opacity = 1, scale = 1, strokeWidth = 1, anchor = 'center',
  } = props as Record<string, unknown>;

  const colsArr = cols as string[];
  const rowsArr = rows as string[][];
  const cw = colWidth as number;
  const rh = rowHeight as number;
  const totalW = colsArr.length * cw;
  const totalH = (rowsArr.length + 1) * rh;

  const { outerTranslate, innerTransform } = scaleAroundAnchor(
    x as number, y as number, scale as number, anchor as AnchorPoint,
    totalW / 2, totalH / 2,
  );

  h.root.setAttribute('transform', outerTranslate);
  h.root.setAttribute('opacity', String(opacity));
  h.innerG.setAttribute('transform', innerTransform);

  // Rebuild inner content when structure changes
  if (colsArr.length !== h._lastCols || rowsArr.length !== h._lastRows) {
    removeChildren(h.innerG);
    rebuildTableContent(h.innerG, colsArr, rowsArr, cw, rh, totalW, totalH,
      fill as string, stroke as string, headerFill as string,
      textColor as string, headerColor as string,
      textSize as number, strokeWidth as number);
    h._lastCols = colsArr.length;
    h._lastRows = rowsArr.length;
  } else {
    // Update attributes in-place
    updateTableContent(h.innerG, colsArr, rowsArr, cw, rh, totalW, totalH,
      fill as string, stroke as string, headerFill as string,
      textColor as string, headerColor as string,
      textSize as number, strokeWidth as number);
  }
}

function rebuildTableContent(
  g: SVGGElement, colsArr: string[], rowsArr: string[][],
  cw: number, rh: number, totalW: number, totalH: number,
  fill: string, stroke: string, headerFill: string,
  textColor: string, headerColor: string,
  textSize: number, strokeWidth: number,
): void {
  // Header rect
  g.appendChild(createSvgEl('rect', {
    x: -totalW / 2, y: -totalH / 2, width: totalW, height: rh,
    rx: 6, fill: headerFill, stroke, 'stroke-width': strokeWidth,
  }));

  // Header text
  for (let ci = 0; ci < colsArr.length; ci++) {
    const t = createSvgEl('text', {
      x: -totalW / 2 + ci * cw + cw / 2,
      y: -totalH / 2 + rh / 2 + 1,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      fill: headerColor,
      'font-size': textSize,
      'font-weight': 700,
      'font-family': FONT,
    });
    t.textContent = colsArr[ci];
    g.appendChild(t);
  }

  // Data rows
  for (let ri = 0; ri < rowsArr.length; ri++) {
    g.appendChild(createSvgEl('rect', {
      x: -totalW / 2, y: -totalH / 2 + (ri + 1) * rh,
      width: totalW, height: rh,
      fill, stroke, 'stroke-width': strokeWidth,
      rx: ri === rowsArr.length - 1 ? 6 : 0,
    }));
    const row = rowsArr[ri];
    for (let ci = 0; ci < row.length; ci++) {
      const t = createSvgEl('text', {
        x: -totalW / 2 + ci * cw + cw / 2,
        y: -totalH / 2 + (ri + 1) * rh + rh / 2 + 1,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        fill: textColor,
        'font-size': textSize,
        'font-family': FONT,
      });
      t.textContent = row[ci];
      g.appendChild(t);
    }
  }

  // Outer border
  g.appendChild(createSvgEl('rect', {
    x: -totalW / 2, y: -totalH / 2,
    width: totalW, height: totalH,
    rx: 6, fill: 'none', stroke, 'stroke-width': strokeWidth + 0.5,
  }));
}

function updateTableContent(
  g: SVGGElement, colsArr: string[], rowsArr: string[][],
  cw: number, rh: number, totalW: number, totalH: number,
  fill: string, stroke: string, headerFill: string,
  textColor: string, headerColor: string,
  textSize: number, strokeWidth: number,
): void {
  // Same structure — rebuild is simpler and fast enough for tables
  removeChildren(g);
  rebuildTableContent(g, colsArr, rowsArr, cw, rh, totalW, totalH,
    fill, stroke, headerFill, textColor, headerColor, textSize, strokeWidth);
}
