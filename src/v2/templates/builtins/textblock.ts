import type { Node } from '../../types/node';
import { createNode } from '../../types/node';
import { parseColor } from '../../types/color';
import type { HslColor } from '../../types/properties';

export function textblockTemplate(id: string, props: Record<string, unknown>): Node {
  const lines = (props.lines as string[]) ?? [];
  const size = (props.size as number) ?? 14;
  const lineHeight = (props.lineHeight as number) ?? size * 1.4;
  const mono = (props.mono as boolean) ?? false;
  const bold = (props.bold as boolean) ?? false;
  const align = (props.align as 'start' | 'middle' | 'end') ?? 'start';

  let fill: HslColor = { h: 0, s: 0, l: 90 };
  if (props.color || props.colour) {
    const raw = (props.color ?? props.colour) as unknown;
    fill = typeof raw === 'string' ? parseColor(raw) : raw as HslColor;
  }

  const children: Node[] = lines.map((line, i) => createNode({
    id: `${id}.line${i}`,
    text: { content: line, size, bold, mono, align },
    fill,
    transform: { x: 0, y: i * lineHeight },
  }));

  return createNode({
    id,
    children,
    ...(props.transform ? { transform: props.transform as any } : {}),
    ...(props.opacity !== undefined ? { opacity: props.opacity as number } : {}),
    ...(props.style ? { style: props.style as string } : {}),
  });
}
