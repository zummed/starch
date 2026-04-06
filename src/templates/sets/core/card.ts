import { z } from 'zod';
import type { Node } from '../../../types/node';
import { createNode } from '../../../types/node';
import { parseColor } from '../../../types/color';
import type { HslColor } from '../../../types/properties';
import { dsl } from '../../../dsl/dslMeta';
import type { TextMeasurer } from '../../../text/measure';

export const cardProps = dsl(z.object({
  title: z.string().describe('Card title'),
  body: z.string().describe('Body text').optional(),
  w: z.number().min(1).describe('Width').optional(),
  h: z.number().min(1).describe('Height').optional(),
  color: z.string().describe('Color (sets stroke + faded fill)').optional(),
  maxWidth: z.number().min(1).describe('Max auto-size width before body wraps').optional(),
  minWidth: z.number().min(0).describe('Min auto-size width').optional(),
}), {
  positional: [
    { keys: ['title'], format: 'quoted' },
    { keys: ['w', 'h'], format: 'dimension' },
  ],
  kwargs: ['body', 'color', 'maxWidth', 'minWidth'],
});

export function cardTemplate(id: string, props: Record<string, unknown>, measure?: TextMeasurer): Node {
  const title = (props.title as string) ?? '';
  const body = props.body as string | undefined;

  // Measure text to compute dimensions when not explicit
  let w = props.w as number | undefined;
  let h = props.h as number | undefined;
  let titleMeasured: { width: number; height: number; lines: Array<{ text: string; width: number }> } | undefined;
  let bodyMeasured: { width: number; height: number; lines: Array<{ text: string; width: number }> } | undefined;
  const maxAutoWidth = (props.maxWidth as number) ?? 300;
  const minAutoWidth = (props.minWidth as number) ?? 120;
  if (measure && (w === undefined || h === undefined)) {
    titleMeasured = measure.measure(title, { size: 14, bold: true });
    bodyMeasured = body ? measure.measure(body, { size: 11, maxWidth: (w ?? maxAutoWidth) - 20 }) : undefined;
    w = w ?? Math.max(Math.ceil(titleMeasured.width + 32), bodyMeasured ? Math.ceil(bodyMeasured.width + 20) : 0, minAutoWidth);
    const bodyHeight = bodyMeasured ? bodyMeasured.height + 8 : 20;
    h = h ?? Math.ceil(32 + bodyHeight + 16);
  }
  w = w ?? 180;
  h = h ?? 100;

  const headerY = -h / 2 + 16;
  const dividerY = -h / 2 + 32;
  const bodyY = dividerY + 16;

  let stroke: HslColor = { h: 0, s: 0, l: 50 };
  let fill: HslColor = { h: 0, s: 0, l: 15 };

  if (props.colour || props.color) {
    const raw = (props.colour ?? props.color) as unknown;
    stroke = typeof raw === 'string' ? parseColor(raw) : (raw as HslColor);
    fill = { h: stroke.h, s: Math.round(stroke.s * 0.35), l: Math.round(stroke.l * 0.15) };
  }

  const children: Node[] = [
    createNode({
      id: `${id}.bg`,
      rect: { w, h, radius: 6 },
      fill,
      stroke: { color: stroke, width: 2 },
    }),
    createNode({
      id: `${id}.header`,
      text: { content: title, size: 14, align: 'middle', bold: true },
      fill: { h: 0, s: 0, l: 90 },
      transform: { x: 0, y: headerY },
    }),
    createNode({
      id: `${id}.divider`,
      path: {
        points: [
          [-w / 2, dividerY],
          [w / 2, dividerY],
        ],
      },
      ...(stroke ? { stroke: { color: stroke, width: 1 } } : { stroke: { color: { h: 0, s: 0, l: 50 }, width: 1 } }),
    }),
  ];

  if (body !== undefined) {
    const bodyTextH = bodyMeasured ? bodyMeasured.height : 11 * 1.4;
    children.push(
      createNode({
        id: `${id}.body`,
        text: { content: body, size: 11, align: 'start' },
        fill: { h: 0, s: 0, l: 80 },
        transform: { x: -w / 2 + 10, y: bodyY + bodyTextH / 2 },
      }),
    );
  }

  return createNode({
    id,
    children,
    _textMaxWidth: w - 20,  // body text inset: 10px each side
    ...(props.transform ? { transform: props.transform as any } : {}),
    ...(props.opacity !== undefined ? { opacity: props.opacity as number } : {}),
    ...(props.style ? { style: props.style as string } : {}),
  });
}
