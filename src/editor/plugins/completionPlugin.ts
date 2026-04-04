import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { getPropertySchema, detectSchemaType, getEnumValues } from '../../types/schemaRegistry';
import { NodeSchema } from '../../types/node';

export const completionKey = new PluginKey<CompletionState>('completion');

export interface CompletionItem {
  label: string;
  type?: string;
  detail?: string;
}

interface CompletionState {
  active: boolean;
  items: CompletionItem[];
  selectedIndex: number;
}

const EMPTY_STATE: CompletionState = { active: false, items: [], selectedIndex: 0 };

// ---------------------------------------------------------------------------
// Completion logic
// ---------------------------------------------------------------------------

export function getCompletionsForPosition(view: EditorView): CompletionItem[] {
  const { state } = view;
  const pos = state.selection.from;
  const $pos = state.doc.resolve(pos);

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
            .filter(v => !text || v.toLowerCase().startsWith(text.toLowerCase()))
            .map(v => ({ label: v, type: 'value' }));
        }
      }
    }

    if (node.type.name === 'scene_node') {
      const existingKeys = new Set<string>();
      node.forEach(child => {
        if (child.attrs?.key) existingKeys.add(child.attrs.key as string);
      });
      return [];
    }
  }

  return [];
}

// ---------------------------------------------------------------------------
// Completion menu DOM
// ---------------------------------------------------------------------------

class CompletionMenuView {
  private menu: HTMLDivElement;
  private view: EditorView;

  constructor(view: EditorView) {
    this.view = view;
    this.menu = document.createElement('div');
    this.menu.className = 'starch-completion-menu';
    this.menu.style.display = 'none';
    document.body.appendChild(this.menu);
  }

  update(view: EditorView, prevState: EditorState) {
    this.view = view;
    const state = completionKey.getState(view.state);
    if (!state || !state.active || state.items.length === 0) {
      this.menu.style.display = 'none';
      return;
    }

    // Position at cursor
    const coords = view.coordsAtPos(view.state.selection.from);
    this.menu.style.display = 'block';
    this.menu.style.left = `${coords.left}px`;
    this.menu.style.top = `${coords.bottom + 4}px`;

    // Render items
    this.menu.innerHTML = '';
    state.items.forEach((item, i) => {
      const el = document.createElement('div');
      el.className = `starch-completion-item${i === state.selectedIndex ? ' selected' : ''}`;
      el.textContent = item.label;
      if (item.detail) {
        const detail = document.createElement('span');
        detail.className = 'starch-completion-detail';
        detail.textContent = ` ${item.detail}`;
        el.appendChild(detail);
      }
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        applyCompletion(this.view, item);
      });
      this.menu.appendChild(el);
    });
  }

  destroy() {
    this.menu.remove();
  }
}

function applyCompletion(view: EditorView, item: CompletionItem) {
  // Replace the current slot's text content with the completion label
  const { state } = view;
  const $pos = state.doc.resolve(state.selection.from);

  // Find the enclosing text-containing node
  for (let depth = $pos.depth; depth >= 0; depth--) {
    const node = $pos.node(depth);
    const start = $pos.start(depth);
    if (node.type.spec.content === 'text*') {
      const tr = state.tr.replaceWith(start, start + node.content.size,
        node.content.size > 0 || item.label
          ? state.schema.text(item.label)
          : state.schema.text(item.label)
      );
      view.dispatch(tr.setMeta(completionKey, EMPTY_STATE));
      view.focus();
      return;
    }
  }

  // Fallback: insert at cursor
  const tr = state.tr.insertText(item.label);
  view.dispatch(tr.setMeta(completionKey, EMPTY_STATE));
  view.focus();
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export function completionPlugin(): Plugin<CompletionState> {
  return new Plugin<CompletionState>({
    key: completionKey,

    state: {
      init: () => EMPTY_STATE,
      apply(tr, value) {
        const meta = tr.getMeta(completionKey) as CompletionState | undefined;
        if (meta) return meta;
        // Close on doc changes (user typed something outside the menu)
        if (tr.docChanged && value.active) return EMPTY_STATE;
        return value;
      },
    },

    view(editorView) {
      return new CompletionMenuView(editorView);
    },

    props: {
      handleKeyDown(view, event) {
        const state = completionKey.getState(view.state);

        // When menu is active, handle navigation
        if (state && state.active && state.items.length > 0) {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            const next = (state.selectedIndex + 1) % state.items.length;
            view.dispatch(view.state.tr.setMeta(completionKey, { ...state, selectedIndex: next }));
            return true;
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            const next = (state.selectedIndex - 1 + state.items.length) % state.items.length;
            view.dispatch(view.state.tr.setMeta(completionKey, { ...state, selectedIndex: next }));
            return true;
          }
          if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault();
            applyCompletion(view, state.items[state.selectedIndex]);
            return true;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            view.dispatch(view.state.tr.setMeta(completionKey, EMPTY_STATE));
            return true;
          }
        }

        // Ctrl+Space triggers completion
        if (event.key === ' ' && event.ctrlKey) {
          event.preventDefault();
          const items = getCompletionsForPosition(view);
          if (items.length > 0) {
            view.dispatch(view.state.tr.setMeta(completionKey, {
              active: true,
              items,
              selectedIndex: 0,
            }));
          }
          return true;
        }

        return false;
      },
    },
  });
}
