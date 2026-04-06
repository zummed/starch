import { z } from 'zod';
import type { Node } from '../../../types/node';
import { createNode } from '../../../types/node';
import { parseColor } from '../../../types/color';
import type { HslColor } from '../../../types/properties';
import { dsl } from '../../../dsl/dslMeta';
import type { TextMeasurer } from '../../../text/measure';

export const stateNodeProps = dsl(z.object({
  name: z.string().describe('State name'),
  entry: z.string().describe('Entry actions (separate multiple with \\n)').optional(),
  exit: z.string().describe('Exit actions (separate multiple with \\n)').optional(),
  w: z.number().min(1).describe('Width').optional(),
  h: z.number().min(1).describe('Height').optional(),
  color: z.string().describe('Color').optional(),
  minWidth: z.number().min(0).describe('Min auto-size width').optional(),
}), {
  positional: [
    { keys: ['name'], format: 'quoted' },
    { keys: ['w', 'h'], format: 'dimension' },
  ],
  kwargs: ['entry', 'exit', 'w', 'h', 'color', 'minWidth'],
});

const ACTION_SIZE = 10;
const ACTION_LINE_H = 14;

function splitActions(value: string | undefined): string[] {
  if (!value) return [];
  return value.split('\n').map(s => s.trim()).filter(Boolean);
}

export function stateNodeTemplate(id: string, props: Record<string, unknown>, measure?: TextMeasurer): Node {
  const name = (props.name as string) ?? id;
  const entryActions = splitActions(props.entry as string | undefined);
  const exitActions = splitActions(props.exit as string | undefined);
  const hasActions = entryActions.length > 0 || exitActions.length > 0;

  // Build action lines with prefixes
  const actionLines: { prefix: string; text: string }[] = [];
  for (const a of entryActions) actionLines.push({ prefix: 'entry', text: a });
  for (const a of exitActions) actionLines.push({ prefix: 'exit', text: a });

  // Measure text to compute dimensions when not explicit
  let w = props.w as number | undefined;
  let h = props.h as number | undefined;
  if (measure && (w === undefined || h === undefined)) {
    const nameM = measure.measure(name, { size: 14, bold: true });
    let contentW = nameM.width;
    for (const line of actionLines) {
      const m = measure.measure(`${line.prefix} / ${line.text}`, { size: ACTION_SIZE });
      contentW = Math.max(contentW, m.width);
    }
    const minAutoWidth = (props.minWidth as number) ?? 80;
    const actionsH = actionLines.length * ACTION_LINE_H;
    w = w ?? Math.max(Math.ceil(contentW + 32), minAutoWidth);
    h = h ?? (hasActions ? Math.ceil(30 + actionsH + 16) : Math.ceil(nameM.height + 20));
  }
  w = w ?? 140;
  h = h ?? 60;

  let fill: HslColor = { h: 30, s: 30, l: 20 };
  let stroke: HslColor = { h: 30, s: 50, l: 50 };

  if (props.colour || props.color) {
    const raw = (props.colour ?? props.color) as unknown;
    const hsl = typeof raw === 'string' ? parseColor(raw) : raw as HslColor;
    stroke = hsl;
    fill = { ...hsl, a: 0.15 };
  }

  const children: Node[] = [
    createNode({
      id: `${id}.bg`,
      rect: { w, h, radius: 16 },
      fill,
      stroke: { color: stroke, width: 2 },
    }),
    createNode({
      id: `${id}.name`,
      text: { content: name, size: 14, bold: true, align: 'middle' },
      fill: { h: 0, s: 0, l: 90 },
      transform: { x: 0, y: hasActions ? -h / 2 + 15 : 0 },
    }),
  ];

  if (hasActions) {
    children.push(createNode({
      id: `${id}.divider`,
      path: { points: [[-w / 2 + 8, -h / 2 + 30], [w / 2 - 8, -h / 2 + 30]], closed: false },
      stroke: { color: stroke, width: 1 },
    }));
    const dividerY = -h / 2 + 30;
    const actionAreaH = h / 2 - dividerY;  // space from divider to bottom
    const blockH = actionLines.length * ACTION_LINE_H;
    let actionY = dividerY + (actionAreaH - blockH) / 2 + ACTION_LINE_H / 2;
    for (let i = 0; i < actionLines.length; i++) {
      const line = actionLines[i];
      children.push(createNode({
        id: `${id}.action${i}`,
        text: { content: `${line.prefix} / ${line.text}`, size: ACTION_SIZE, align: 'start' },
        fill: { h: 0, s: 0, l: 70 },
        transform: { x: -w / 2 + 12, y: actionY },
      }));
      actionY += ACTION_LINE_H;
    }
  }

  return createNode({
    id,
    children,
    _textMaxWidth: w - 24,
    ...(props.transform ? { transform: props.transform as any } : {}),
    ...(props.opacity !== undefined ? { opacity: props.opacity as number } : {}),
    ...(props.style ? { style: props.style as string } : {}),
  });
}
