import { z } from 'zod';
import type { Node } from '../../../types/node';
import { createNode } from '../../../types/node';
import { parseColor } from '../../../types/color';
import type { HslColor } from '../../../types/properties';
import { dsl } from '../../../dsl/dslMeta';
import type { TextMeasurer } from '../../../text/measure';

export const pillProps = dsl(z.object({
  text: z.string().describe('Label text').optional(),
  w: z.number().min(1).describe('Width').optional(),
  h: z.number().min(1).describe('Height').optional(),
  color: z.string().describe('Color (sets stroke + faded fill)').optional(),
}), {
  positional: [
    { keys: ['text'], format: 'quoted' },
    { keys: ['w', 'h'], format: 'dimension' },
  ],
  kwargs: ['color'],
});

export function pillTemplate(id: string, props: Record<string, unknown>, measure?: TextMeasurer): Node {
  const text = props.text as string | undefined;
  const textSize = 12;

  let w = props.w as number | undefined;
  let h = props.h as number | undefined;
  let measured: { width: number; height: number; lines: Array<{ text: string; width: number }> } | undefined;
  if (text && measure && (w === undefined || h === undefined)) {
    measured = measure.measure(text, { size: textSize });
    w = w ?? Math.ceil(measured.width + 24);
    h = h ?? Math.ceil(measured.height + 12);
  }
  w = w ?? 80;
  h = h ?? 30;
  const radius = Math.min(w, h) / 2;

  let stroke: HslColor = { h: 0, s: 0, l: 50 };
  let fill: HslColor = { h: 0, s: 0, l: 15 };

  if (props.colour || props.color) {
    const raw = (props.colour ?? props.color) as unknown;
    stroke = typeof raw === 'string' ? parseColor(raw) : (raw as HslColor);
    fill = { h: stroke.h, s: stroke.s, l: stroke.l, a: 0.15 };
  }

  const children: Node[] = [
    createNode({
      id: `${id}.bg`,
      rect: { w, h, radius },
      fill,
      stroke: { color: stroke, width: 2 },
    }),
  ];

  if (text !== undefined) {
    children.push(
      createNode({
        id: `${id}.label`,
        text: { content: text, size: textSize, align: 'middle' },
        fill: { h: 0, s: 0, l: 90 },
      }),
    );
  }

  const pillPadX = 12;
  return createNode({
    id,
    children,
    _textMaxWidth: w - pillPadX * 2,
    ...(props.transform ? { transform: props.transform as any } : {}),
    ...(props.opacity !== undefined ? { opacity: props.opacity as number } : {}),
    ...(props.style ? { style: props.style as string } : {}),
  });
}
