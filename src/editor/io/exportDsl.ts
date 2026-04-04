import type { Node as PmNode } from 'prosemirror-model';
import { extractModel } from '../extractModel';
import { buildAstFromModel } from '../../dsl/astEmitter';
import type { FormatHints } from '../../dsl/formatHints';
import { emptyFormatHints } from '../../dsl/formatHints';

export function exportDsl(doc: PmNode, formatHints?: FormatHints): string {
  const model = extractModel(doc);
  const hints = formatHints ?? emptyFormatHints();

  // Collect display hints from scene_node attrs
  const nodeFormats: Record<string, 'inline' | 'block'> = {};
  doc.forEach((node) => {
    if (node.type.name === 'scene_node') {
      collectDisplayHints(node, nodeFormats);
    }
  });

  const { text } = buildAstFromModel(model, hints, nodeFormats);
  return text;
}

function collectDisplayHints(node: PmNode, result: Record<string, 'inline' | 'block'>): void {
  if (node.type.name === 'scene_node') {
    const id = node.attrs.id as string;
    const display = node.attrs.display as 'inline' | 'block';
    if (id && display) result[id] = display;
    node.forEach((child) => {
      if (child.type.name === 'scene_node') collectDisplayHints(child, result);
    });
  }
}
