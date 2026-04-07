/**
 * Parse-on-change plugin: debounced parsing of DSL text to extract the model.
 * Calls onModelChange whenever the document changes.
 */
import { Plugin, PluginKey } from 'prosemirror-state';
import { walkDocument } from '../../dsl/schemaWalker';

export const parseKey = new PluginKey('parseOnChange');

interface ParsePluginOptions {
  onModelChange: (model: any) => void;
  debounceMs?: number;
}

export function parseOnChangePlugin({ onModelChange, debounceMs = 100 }: ParsePluginOptions): Plugin {
  let rafId: number | null = null;
  let trailing: ReturnType<typeof setTimeout> | null = null;

  function flush(view: any) {
    const text = view.state.doc.textContent;
    try {
      const { model } = walkDocument(text);
      onModelChange(model);
    } catch {
      // Parse error — don't update model
    }
  }

  return new Plugin({
    key: parseKey,

    view() {
      return {
        update(view) {
          // Immediate: throttle to once per animation frame so continuous
          // slider drags update the canvas every frame instead of waiting
          // for the debounce timeout.
          if (rafId === null) {
            rafId = requestAnimationFrame(() => {
              rafId = null;
              flush(view);
            });
          }
          // Trailing: also schedule a debounced parse to catch the final
          // state after edits stop (in case the RAF was coalesced or the
          // last change arrived between frames).
          if (trailing) clearTimeout(trailing);
          trailing = setTimeout(() => {
            trailing = null;
            flush(view);
          }, debounceMs);
        },
        destroy() {
          if (rafId !== null) cancelAnimationFrame(rafId);
          if (trailing) clearTimeout(trailing);
        },
      };
    },
  });
}
