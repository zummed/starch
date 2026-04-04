import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { getPropertySchema, detectSchemaType, getEnumValues } from '../../types/schemaRegistry';
import { NodeSchema } from '../../types/node';

export const completionKey = new PluginKey('completion');

export interface CompletionItem {
  label: string;
  type?: string;
  detail?: string;
}

/**
 * Get schema-aware completions for the current cursor position.
 * Reads the enclosing node's schemaPath to scope suggestions.
 */
export function getCompletionsForPosition(view: EditorView): CompletionItem[] {
  const { state } = view;
  const pos = state.selection.from;
  const $pos = state.doc.resolve(pos);

  // Walk up to find the enclosing typed node
  for (let depth = $pos.depth; depth >= 0; depth--) {
    const node = $pos.node(depth);
    const schemaPath = node.attrs?.schemaPath as string | undefined;
    if (!schemaPath) continue;

    const text = node.textContent;
    const schema = getPropertySchema(schemaPath, NodeSchema);

    if (schema) {
      const type = detectSchemaType(schema);

      if (type === 'enum') {
        const values = getEnumValues(schema);
        if (values) {
          return values
            .filter(v => !text || v.startsWith(text))
            .map(v => ({ label: v, type: 'value' }));
        }
      }
    }

    // For scene_node context, suggest property names
    if (node.type.name === 'scene_node') {
      const existingKeys = new Set<string>();
      node.forEach(child => {
        if (child.attrs?.key) existingKeys.add(child.attrs.key as string);
      });
      // Return available property completions (scaffold for now)
      return [];
    }
  }

  return [];
}

export function completionPlugin(): Plugin {
  return new Plugin({
    key: completionKey,
    props: {
      handleKeyDown(view, event) {
        if (event.key === ' ' && event.ctrlKey) {
          const items = getCompletionsForPosition(view);
          if (items.length > 0) {
            // Completion menu rendering will be added in a follow-up.
            // For now this logs items for debugging.
            console.log('Completions:', items);
          }
          return true;
        }
        return false;
      },
    },
  });
}
