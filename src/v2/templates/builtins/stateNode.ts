import type { Node } from '../../types/node';
import { createNode } from '../../types/node';
import { parseColor } from '../../types/color';
import type { HslColor } from '../../types/properties';

/**
 * State machine node: rounded rect with state name and optional entry/exit/do labels.
 */
export function stateNodeTemplate(id: string, props: Record<string, unknown>): Node {
  const name = (props.name as string) ?? id;
  const w = (props.w as number) ?? 140;
  const h = (props.h as number) ?? 60;
  const entry = props.entry as string | undefined;
  const exit = props.exit as string | undefined;

  let fill: HslColor = { h: 30, s: 30, l: 20 };
  let stroke: HslColor = { h: 30, s: 50, l: 50 };

  if (props.colour || props.color) {
    const raw = (props.colour ?? props.color) as unknown;
    const hsl = typeof raw === 'string' ? parseColor(raw) : raw as HslColor;
    stroke = hsl;
    fill = { h: hsl.h, s: Math.round(hsl.s * 0.4), l: Math.round(hsl.l * 0.3) };
  }

  const isActive = (props.active as boolean) ?? false;
  const strokeWidth = isActive ? 3 : 2;

  const children: Node[] = [
    // Background
    createNode({
      id: `${id}.bg`,
      rect: { w, h, radius: 16 },
      fill,
      stroke: { ...stroke, width: strokeWidth },
    }),
    // State name
    createNode({
      id: `${id}.name`,
      text: { content: name, size: 14, bold: true, align: 'middle' },
      fill: { h: 0, s: 0, l: 90 },
      transform: { x: w / 2, y: entry || exit ? 18 : h / 2 },
    }),
  ];

  // Divider + actions
  if (entry || exit) {
    children.push(createNode({
      id: `${id}.divider`,
      path: { points: [[8, 30], [w - 8, 30]], closed: false },
      stroke: { ...stroke, width: 1 },
    }));

    let actionY = 40;
    if (entry) {
      children.push(createNode({
        id: `${id}.entry`,
        text: { content: `entry / ${entry}`, size: 10, align: 'start' },
        fill: { h: 0, s: 0, l: 70 },
        transform: { x: 12, y: actionY },
      }));
      actionY += 14;
    }
    if (exit) {
      children.push(createNode({
        id: `${id}.exit`,
        text: { content: `exit / ${exit}`, size: 10, align: 'start' },
        fill: { h: 0, s: 0, l: 70 },
        transform: { x: 12, y: actionY },
      }));
    }
  }

  return createNode({
    id,
    children,
    ...(props.transform ? { transform: props.transform as any } : {}),
    ...(props.opacity !== undefined ? { opacity: props.opacity as number } : {}),
  });
}
