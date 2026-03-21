import type { Node } from '../../types/node';
import { createNode } from '../../types/node';
import { parseColor } from '../../types/color';
import type { HslColor } from '../../types/properties';

export function tableTemplate(id: string, props: Record<string, unknown>): Node {
  const cols = (props.cols as string[]) ?? [];
  const rows = (props.rows as string[][]) ?? [];
  const colWidth = (props.colWidth as number) ?? 100;
  const rowHeight = (props.rowHeight as number) ?? 30;
  const strokeWidth = (props.strokeWidth as number) ?? 1;

  let headerFill: HslColor = { h: 210, s: 40, l: 25 };
  let headerColor: HslColor = { h: 0, s: 0, l: 90 };
  let stroke: HslColor = { h: 0, s: 0, l: 40 };

  if (props.headerFill) headerFill = typeof props.headerFill === 'string' ? parseColor(props.headerFill) : props.headerFill as HslColor;
  if (props.headerColor) headerColor = typeof props.headerColor === 'string' ? parseColor(props.headerColor) : props.headerColor as HslColor;
  if (props.stroke) stroke = typeof props.stroke === 'string' ? parseColor(props.stroke) : props.stroke as HslColor;

  const totalW = cols.length * colWidth;
  const totalH = (rows.length + 1) * rowHeight;
  const children: Node[] = [];

  // Background
  children.push(createNode({
    id: `${id}.bg`,
    rect: { w: totalW, h: totalH },
    fill: { h: 0, s: 0, l: 15 },
    stroke: { ...stroke, width: strokeWidth },
  }));

  // Header row
  children.push(createNode({
    id: `${id}.header`,
    rect: { w: totalW, h: rowHeight },
    fill: headerFill,
    transform: { x: totalW / 2, y: rowHeight / 2 },
  }));

  // Header text
  cols.forEach((col, ci) => {
    children.push(createNode({
      id: `${id}.h${ci}`,
      text: { content: col, size: 12, bold: true, align: 'middle' },
      fill: headerColor,
      transform: { x: ci * colWidth + colWidth / 2, y: rowHeight / 2 },
    }));
  });

  // Data cells
  rows.forEach((row, ri) => {
    row.forEach((cell, ci) => {
      children.push(createNode({
        id: `${id}.r${ri}c${ci}`,
        text: { content: cell, size: 12, align: 'middle' },
        fill: { h: 0, s: 0, l: 80 },
        transform: { x: ci * colWidth + colWidth / 2, y: (ri + 1) * rowHeight + rowHeight / 2 },
      }));
    });
  });

  return createNode({
    id,
    children,
    ...(props.transform ? { transform: props.transform as any } : {}),
    ...(props.opacity !== undefined ? { opacity: props.opacity as number } : {}),
    ...(props.style ? { style: props.style as string } : {}),
  });
}
