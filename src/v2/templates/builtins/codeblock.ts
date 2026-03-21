import type { Node } from '../../types/node';
import { textblockTemplate } from './textblock';

export function codeblockTemplate(id: string, props: Record<string, unknown>): Node {
  return textblockTemplate(id, {
    ...props,
    mono: true,
    size: props.size ?? 13,
    lineHeight: props.lineHeight ?? 20,
  });
}
