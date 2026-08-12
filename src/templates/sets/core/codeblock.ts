import { z } from 'zod';
import type { Node } from '../../../types/node';
import { textblockTemplate } from './textblock';
import { dsl } from '../../../dsl/dslMeta';

export const codeblockProps = dsl(z.object({
  lines: z.array(z.string()).describe('Lines of code — one quoted string per indented line'),
  size: z.number().describe('Font size').optional(),
  lineHeight: z.number().describe('Line height in pixels').optional(),
}), {
  kwargs: ['size', 'lineHeight'],
  children: { lines: 'block' },
});

export function codeblockTemplate(id: string, props: Record<string, unknown>): Node {
  return textblockTemplate(id, {
    ...props,
    mono: true,
    size: props.size ?? 13,
    lineHeight: props.lineHeight ?? 20,
  });
}
