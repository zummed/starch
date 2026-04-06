import { z } from 'zod';
import type { Node } from '../../../types/node';
import { textblockTemplate } from './textblock';

export const codeblockProps = z.object({
  lines: z.array(z.string()).describe('Lines of code'),
  size: z.number().describe('Font size').optional(),
});

export function codeblockTemplate(id: string, props: Record<string, unknown>): Node {
  return textblockTemplate(id, {
    ...props,
    mono: true,
    size: props.size ?? 13,
    lineHeight: props.lineHeight ?? 20,
  });
}
