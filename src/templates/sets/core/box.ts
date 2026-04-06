import { z } from 'zod';
import type { Node } from '../../../types/node';
import { createNode } from '../../../types/node';
import { parseColor } from '../../../types/color';
import type { HslColor } from '../../../types/properties';
import { dsl } from '../../../dsl/dslMeta';

export const boxProps = dsl(z.object({
  text: z.string().describe('Label text').optional(),
  w: z.number().min(1).describe('Width').optional(),
  h: z.number().min(1).describe('Height').optional(),
  radius: z.number().min(0).describe('Corner radius').optional(),
  textSize: z.number().min(1).describe('Font size').optional(),
  color: z.string().describe('Color (sets stroke + faded fill)').optional(),
  textColor: z.string().describe('Text color').optional(),
}), {
  positional: [
    { keys: ['text'], format: 'quoted' },
    { keys: ['w', 'h'], format: 'dimension' },
  ],
  kwargs: ['radius', 'textSize', 'color', 'textColor'],
});

function deriveFillFromStroke(stroke: HslColor): HslColor {
  return {
    h: stroke.h,
    s: Math.round(stroke.s * 0.35),
    l: Math.round(stroke.l * 0.15),
  };
}

export function boxTemplate(id: string, props: Record<string, unknown>): Node {
  const w = (props.w as number) ?? 120;
  const h = (props.h as number) ?? 60;
  const radius = (props.radius as number) ?? 6;
  const text = props.text as string | undefined;
  const textSize = (props.textSize as number) ?? 14;

  // Color handling — neutral gray default
  let stroke: HslColor = { h: 0, s: 0, l: 50 };
  let fill: HslColor = { h: 0, s: 0, l: 15 };

  if (props.colour || props.color) {
    const raw = (props.colour ?? props.color) as unknown;
    const hsl = typeof raw === 'string' ? parseColor(raw) : raw as HslColor;
    stroke = hsl;
    fill = deriveFillFromStroke(hsl);
  }
  if (props.fill) {
    fill = typeof props.fill === 'string' ? parseColor(props.fill) : props.fill as HslColor;
  }
  if (props.stroke) {
    stroke = typeof props.stroke === 'string' ? parseColor(props.stroke) : props.stroke as HslColor;
  }

  const children: Node[] = [
    createNode({
      id: `${id}.bg`,
      rect: { w, h, radius },
      fill,
      stroke: { color: stroke, width: (props.strokeWidth as number) ?? 2 },
    }),
  ];

  if (text) {
    children.push(createNode({
      id: `${id}.label`,
      text: { content: text, size: textSize, align: 'middle' },
      fill: props.textColor
        ? (typeof props.textColor === 'string' ? parseColor(props.textColor) : props.textColor as HslColor)
        : { h: 0, s: 0, l: 90 },
      transform: { x: w / 2, y: h / 2 },
    }));
  }

  return createNode({
    id,
    children,
    ...(props.transform ? { transform: props.transform as any } : {}),
    ...(props.opacity !== undefined ? { opacity: props.opacity as number } : {}),
    ...(props.style ? { style: props.style as string } : {}),
  });
}
