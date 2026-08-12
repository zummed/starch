import { z } from 'zod';
import type { Node } from '../../../types/node';
import { createNode } from '../../../types/node';
import { parseColor } from '../../../types/color';
import type { HslColor } from '../../../types/properties';
import { dsl } from '../../../dsl/dslMeta';

export const tableProps = dsl(z.object({
  cols: z.array(z.string()).describe('Column headers — a bracket list, e.g. ["Name", "Age"]'),
  rows: z.array(z.array(z.string())).describe('Row data — one indented line per row, cells as quoted strings'),
  colWidth: z.number().describe('Column width').optional(),
  rowHeight: z.number().describe('Row height').optional(),
  strokeWidth: z.number().describe('Grid line width').optional(),
  headerFill: z.string().describe('Header row background colour').optional(),
  headerColor: z.string().describe('Header row text colour').optional(),
  stroke: z.string().describe('Outline colour, overriding the one derived from color').optional(),
}), {
  kwargs: ['cols', 'colWidth', 'rowHeight', 'strokeWidth', 'headerFill', 'headerColor'],
  children: { rows: 'block' },
});

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

  // A child's transform is measured from its parent's centre, and the
  // background sits centred on it — so the grid is laid out from the table's
  // top-left corner, which is half its size away in each direction. Laying it
  // out from 0,0 instead put the corner of the header on the middle of the
  // background and pushed every cell down and to the right of its column.
  const left = -totalW / 2;
  const top = -totalH / 2;

  // Background
  children.push(createNode({
    id: `${id}.bg`,
    rect: { w: totalW, h: totalH },
    fill: { h: 0, s: 0, l: 15 },
    stroke: { color: stroke, width: strokeWidth },
  }));

  // Header row
  children.push(createNode({
    id: `${id}.header`,
    rect: { w: totalW, h: rowHeight },
    fill: headerFill,
    transform: { x: 0, y: top + rowHeight / 2 },
  }));

  // Header text
  cols.forEach((col, ci) => {
    children.push(createNode({
      id: `${id}.h${ci}`,
      text: { content: col, size: 12, bold: true, align: 'middle' },
      fill: headerColor,
      transform: { x: left + ci * colWidth + colWidth / 2, y: top + rowHeight / 2 },
    }));
  });

  // Data cells
  rows.forEach((row, ri) => {
    row.forEach((cell, ci) => {
      children.push(createNode({
        id: `${id}.r${ri}c${ci}`,
        text: { content: cell, size: 12, align: 'middle' },
        fill: { h: 0, s: 0, l: 80 },
        transform: {
          x: left + ci * colWidth + colWidth / 2,
          y: top + (ri + 1) * rowHeight + rowHeight / 2,
        },
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
