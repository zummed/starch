import { z } from 'zod';
import type { Node } from '../../../types/node';
import { createNode } from '../../../types/node';
import { parseColor } from '../../../types/color';
import type { HslColor } from '../../../types/properties';
import { dsl } from '../../../dsl/dslMeta';
import type { TextMeasurer } from '../../../text/measure';

export const noteProps = dsl(z.object({
  text: z.string().describe('Note text').optional(),
  w: z.number().min(1).describe('Width').optional(),
  h: z.number().min(1).describe('Height').optional(),
  color: z.string().describe('Color (stroke; fill derived)').optional(),
  maxWidth: z.number().min(1).describe('Max auto-size width before text wraps').optional(),
  minWidth: z.number().min(0).describe('Min auto-size width').optional(),
}), {
  positional: [
    { keys: ['text'], format: 'quoted' },
    { keys: ['w', 'h'], format: 'dimension' },
  ],
  kwargs: ['color', 'maxWidth', 'minWidth'],
});

const DEFAULT_STROKE: HslColor = { h: 50, s: 60, l: 25 };
const DEFAULT_FILL: HslColor = { h: 50, s: 50, l: 45 };

export function noteTemplate(id: string, props: Record<string, unknown>, measure?: TextMeasurer): Node {
  const text = props.text as string | undefined;
  const foldSize = 12;
  const textSize = 12;
  const padX = 8;
  const padTop = 10;
  const padBottom = 18;
  const maxAutoWidth = (props.maxWidth as number) ?? 250;
  const minAutoWidth = (props.minWidth as number) ?? 80;

  let w = props.w as number | undefined;
  let h = props.h as number | undefined;
  let measured: { width: number; height: number; lines: Array<{ text: string; width: number }> } | undefined;
  if (text && measure && (w === undefined || h === undefined)) {
    const natural = measure.measure(text, { size: textSize });
    const naturalW = Math.ceil(natural.width + padX * 2 + foldSize);
    if (w === undefined && naturalW <= maxAutoWidth) {
      w = Math.max(naturalW, minAutoWidth);
      measured = natural;
    } else {
      const wrapWidth = (w ?? maxAutoWidth) - padX * 2;
      measured = measure.measure(text, { size: textSize, maxWidth: wrapWidth });
      w = w ?? Math.max(Math.ceil(measured.width + padX * 2 + foldSize), minAutoWidth);
    }
    h = h ?? Math.ceil(measured.height + padTop + padBottom);
  }
  w = w ?? 140;
  h = h ?? 80;

  let stroke: HslColor = DEFAULT_STROKE;
  let fill: HslColor = DEFAULT_FILL;

  if (props.colour || props.color) {
    const raw = (props.colour ?? props.color) as unknown;
    stroke = typeof raw === 'string' ? parseColor(raw) : (raw as HslColor);
    fill = { h: stroke.h, s: Math.round(stroke.s * 0.85), l: Math.min(stroke.l + 20, 90) };
  }

  const children: Node[] = [
    createNode({
      id: `${id}.bg`,
      rect: { w, h, radius: 2 },
      fill,
      stroke: { color: stroke, width: 2 },
    }),
    createNode({
      id: `${id}.fold`,
      path: {
        points: [
          [w / 2 - foldSize, -h / 2],
          [w / 2, -h / 2 + foldSize],
          [w / 2 - foldSize, -h / 2 + foldSize],
        ],
        closed: true,
      },
      fill: stroke,
    }),
  ];

  if (text !== undefined) {
    // Position text so top of first line aligns with padTop from the top edge.
    // Multi-line: center of the block offset so block top = -h/2 + padTop
    // Single-line: same formula works — center offset by half line height
    const textH = measured ? measured.height : textSize * 1.4;
    const textY = -h / 2 + padTop + textH / 2;
    children.push(
      createNode({
        id: `${id}.label`,
        text: { content: text, size: textSize, align: 'start' },
        fill: { h: 0, s: 0, l: 10 },
        transform: { x: -w / 2 + padX, y: textY },
      }),
    );
  }

  return createNode({
    id,
    children,
    _textMaxWidth: w - padX * 2 - foldSize,
    ...(props.transform ? { transform: props.transform as any } : {}),
    ...(props.opacity !== undefined ? { opacity: props.opacity as number } : {}),
    ...(props.style ? { style: props.style as string } : {}),
  });
}
