import { Plugin, PluginKey } from 'prosemirror-state';
import { tryResolveDraft } from '../schema/draftNode';

export const draftResolverKey = new PluginKey('draftResolver');

export function draftResolverPlugin(): Plugin {
  return new Plugin({
    key: draftResolverKey,
    appendTransaction(transactions, _oldState, newState) {
      const docChanged = transactions.some(tr => tr.docChanged);
      if (!docChanged) return null;

      let tr = newState.tr;
      let changed = false;

      newState.doc.descendants((node, pos) => {
        if (node.type.name === 'draft_slot') {
          const text = node.textContent;
          const result = tryResolveDraft(text, node.attrs.schemaPath);

          if (result.resolved) {
            const propertySlot = newState.schema.node('property_slot', {
              key: node.attrs.parentKey,
              schemaPath: node.attrs.schemaPath,
            }, text ? [newState.schema.text(text)] : []);

            tr = tr.replaceWith(pos, pos + node.nodeSize, propertySlot);
            changed = true;
          }
        }
      });

      return changed ? tr : null;
    },
  });
}
