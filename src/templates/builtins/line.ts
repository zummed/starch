import type { Node, PointRef } from '../../types/node';
import { createNode } from '../../types/node';
import { parseColor } from '../../types/color';
import type { HslColor } from '../../types/properties';

export function lineTemplate(id: string, props: Record<string, unknown>): Node {
  const from = props.from as PointRef;
  const to = props.to as PointRef;
  const smooth = (props.smooth as boolean) ?? false;
  const bend = props.bend as number | undefined;
  const route = props.route as [number, number][] | undefined;
  const progress = props.drawProgress as number | undefined;
  const label = props.label as string | undefined;
  const labelSize = (props.labelSize as number) ?? 11;
  const arrow = (props.arrow as boolean) ?? true;
  const dashed = (props.dashed as boolean) ?? false;

  let stroke: HslColor = { h: 0, s: 0, l: 60 };
  if (props.colour || props.color) {
    const raw = (props.colour ?? props.color) as unknown;
    stroke = typeof raw === 'string' ? parseColor(raw) : raw as HslColor;
  }
  if (props.stroke) {
    stroke = typeof props.stroke === 'string' ? parseColor(props.stroke) : props.stroke as HslColor;
  }
  const strokeWidth = (props.strokeWidth as number) ?? 2;

  const children: Node[] = [
    createNode({
      id: `${id}.route`,
      path: {
        from, to, smooth,
        ...(bend !== undefined ? { bend } : {}),
        ...(route ? { route } : {}),
        ...(progress !== undefined ? { drawProgress: progress } : {}),
      },
      stroke: { ...stroke, width: strokeWidth },
      ...(dashed ? { dash: { pattern: 'dashed', length: 8, gap: 4 } } : {}),
    }),
  ];

  if (arrow) {
    children.push(createNode({
      id: `${id}.arrowEnd`,
      path: { points: [[-8, -4], [0, 0], [-8, 4]], closed: false },
      fill: stroke,
      stroke: { ...stroke, width: 1 },
    }));
  }

  if (label) {
    children.push(createNode({
      id: `${id}.label`,
      text: { content: label, size: labelSize, align: 'middle' },
      fill: { h: 0, s: 0, l: 80 },
      transform: { pathFollow: `${id}.route`, pathProgress: 0.5 },
    }));
  }

  return createNode({
    id,
    children,
    ...(props.opacity !== undefined ? { opacity: props.opacity as number } : {}),
    ...(props.style ? { style: props.style as string } : {}),
  });
}
