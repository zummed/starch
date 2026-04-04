/**
 * Parse-on-change plugin: debounced parsing of DSL text to extract the model.
 * Calls onModelChange whenever the document changes.
 */
import { Plugin, PluginKey } from 'prosemirror-state';
import { buildAstFromText } from '../../dsl/astParser';

export const parseKey = new PluginKey('parseOnChange');

interface ParsePluginOptions {
  onModelChange: (model: any) => void;
  debounceMs?: number;
}

export function parseOnChangePlugin({ onModelChange, debounceMs = 100 }: ParsePluginOptions): Plugin {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return new Plugin({
    key: parseKey,

    view() {
      return {
        update(view) {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            const text = view.state.doc.textContent;
            try {
              const { model } = buildAstFromText(text);
              onModelChange(model);
            } catch {
              // Parse error — don't update model
            }
          }, debounceMs);
        },
        destroy() {
          if (timer) clearTimeout(timer);
        },
      };
    },
  });
}
