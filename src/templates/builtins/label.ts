import type { Node } from '../../types/node';
import { createNode } from '../../types/node';
import { parseColor } from '../../types/color';
import type { HslColor } from '../../types/properties';

export function labelTemplate(id: string, props: Record<string, unknown>): Node {
  const text = (props.text as string) ?? '';
  const size = (props.size as number) ?? 14;
  const bold = (props.bold as boolean) ?? false;
  const align = (props.align as 'start' | 'middle' | 'end') ?? 'middle';

  let fill: HslColor | undefined;
  if (props.color || props.colour) {
    const raw = (props.color ?? props.colour) as unknown;
    fill = typeof raw === 'string' ? parseColor(raw) : raw as HslColor;
  }

  return createNode({
    id,
    text: { content: text, size, bold, align },
    ...(fill ? { fill } : {}),
    ...(props.transform ? { transform: props.transform as any } : {}),
    ...(props.opacity !== undefined ? { opacity: props.opacity as number } : {}),
    ...(props.style ? { style: props.style as string } : {}),
  });
}
