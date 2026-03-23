import type { Node } from '../../types/node';
import { createNode } from '../../types/node';
import { parseColor } from '../../types/color';
import type { HslColor } from '../../types/properties';

/**
 * Sequence diagram participant: a header box at the top with a lifeline path extending downward.
 */
export function sequenceParticipantTemplate(id: string, props: Record<string, unknown>): Node {
  const name = (props.name as string) ?? id;
  const w = (props.w as number) ?? 120;
  const h = (props.h as number) ?? 40;
  const lifelineHeight = (props.lifelineHeight as number) ?? 200;

  let fill: HslColor = { h: 210, s: 50, l: 30 };
  let stroke: HslColor = { h: 210, s: 60, l: 50 };

  if (props.colour || props.color) {
    const raw = (props.colour ?? props.color) as unknown;
    const hsl = typeof raw === 'string' ? parseColor(raw) : raw as HslColor;
    stroke = hsl;
    fill = { h: hsl.h, s: Math.round(hsl.s * 0.5), l: Math.round(hsl.l * 0.4) };
  }

  const children: Node[] = [
    // Header box
    createNode({
      id: `${id}.header`,
      rect: { w, h, radius: 4 },
      fill,
      stroke: { color: stroke, width: 2 },
    }),
    // Name text
    createNode({
      id: `${id}.name`,
      text: { content: name, size: 13, bold: true, align: 'middle' },
      fill: { h: 0, s: 0, l: 90 },
      transform: { x: w / 2, y: h / 2 },
    }),
    // Lifeline
    createNode({
      id: `${id}.lifeline`,
      path: { points: [[w / 2, h], [w / 2, h + lifelineHeight]], closed: false },
      stroke: { color: stroke, width: 1 },
      dash: { pattern: 'dashed', length: 6, gap: 4 },
    }),
  ];

  return createNode({
    id,
    children,
    ...(props.transform ? { transform: props.transform as any } : {}),
    ...(props.opacity !== undefined ? { opacity: props.opacity as number } : {}),
  });
}
