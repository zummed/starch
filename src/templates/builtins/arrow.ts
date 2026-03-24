import type { Node, PointRef } from '../../types/node';
import { createNode } from '../../types/node';
import { parseColor } from '../../types/color';
import type { HslColor } from '../../types/properties';
import type { AnchorPoint } from '../../types/anchor';

const ARROW_SIZE = 8;

export function arrowTemplate(id: string, props: Record<string, unknown>): Node {
  const from = props.from as PointRef;
  const to = props.to as PointRef;
  const fromAnchor = props.fromAnchor as AnchorPoint | undefined;
  const toAnchor = props.toAnchor as AnchorPoint | undefined;
  const smooth = (props.smooth as boolean) ?? false;
  const bend = props.bend as number | undefined;
  const route = props.route as PointRef[] | undefined;
  const radius = props.radius as number | undefined;
  const closed = (props.closed as boolean) ?? false;
  const drawProgress = props.drawProgress as number | undefined;
  const label = props.label as string | undefined;
  const labelSize = (props.labelSize as number) ?? 11;
  const arrow = (props.arrow as boolean) ?? true;
  const arrowStart = (props.arrowStart as boolean) ?? false;
  const dashed = (props.dashed as boolean) ?? false;
  const gap = (props.gap as number) ?? 4;

  let stroke: HslColor = { h: 0, s: 0, l: 60 };
  if (props.colour || props.color) {
    const raw = (props.colour ?? props.color) as unknown;
    stroke = typeof raw === 'object' ? raw as HslColor : stroke;
  }
  if (props.stroke) {
    stroke = typeof props.stroke === 'object' ? props.stroke as HslColor : stroke;
  }
  const strokeWidth = (props.strokeWidth as number) ?? 2;

  const children: Node[] = [];

  // Route path
  children.push(createNode({
    id: `${id}.route`,
    path: {
      route: route ? [from, ...route, to] : [from, to],
      smooth, closed,
      ...(fromAnchor ? { fromAnchor } : {}),
      ...(toAnchor ? { toAnchor } : {}),
      ...(bend !== undefined ? { bend } : {}),
      ...(radius !== undefined ? { radius } : {}),
      ...(drawProgress !== undefined ? { drawProgress } : {}),
      ...(arrow ? { toGap: gap + ARROW_SIZE } : { toGap: gap }),
      ...(arrowStart ? { fromGap: gap + ARROW_SIZE } : { fromGap: gap }),
    },
    stroke: { color: stroke, width: strokeWidth },
    ...(dashed ? { dash: { pattern: 'dashed', length: 8, gap: 4 } } : {}),
  }));

  // End arrowhead — points forward from path end toward target
  if (arrow) {
    children.push(createNode({
      id: `${id}.headEnd`,
      path: {
        points: [[0, -ARROW_SIZE / 2], [ARROW_SIZE, 0], [0, ARROW_SIZE / 2]],
        closed: true,
      },
      fill: stroke,
      transform: { pathFollow: `${id}.route`, pathProgress: 1.0 },
    }));
  }

  // Start arrowhead — points backward from path start toward source
  if (arrowStart) {
    children.push(createNode({
      id: `${id}.headStart`,
      path: {
        points: [[0, -ARROW_SIZE / 2], [-ARROW_SIZE, 0], [0, ARROW_SIZE / 2]],
        closed: true,
      },
      fill: stroke,
      transform: { pathFollow: `${id}.route`, pathProgress: 0.0 },
    }));
  }

  // Label with background
  if (label) {
    const labelPadX = 6;
    const labelPadY = 3;
    const estWidth = label.length * labelSize * 0.6 + labelPadX * 2;
    const estHeight = labelSize + labelPadY * 2;
    children.push(createNode({
      id: `${id}.label`,
      transform: { pathFollow: `${id}.route`, pathProgress: 0.5 },
      children: [
        createNode({
          id: `${id}.label.bg`,
          rect: { w: estWidth, h: estHeight, radius: 3 },
          fill: { h: 0, s: 0, l: 8 },
          opacity: 0.85,
        }),
        createNode({
          id: `${id}.label.text`,
          text: { content: label, size: labelSize, align: 'middle' },
          fill: { h: 0, s: 0, l: 80 },
        }),
      ],
    }));
  }

  return createNode({
    id,
    children,
    ...(props.opacity !== undefined ? { opacity: props.opacity as number } : {}),
    ...(props.style ? { style: props.style as string } : {}),
  });
}
