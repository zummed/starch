/**
 * Autocomplete plugin for the DSL code-block editor.
 *
 * Triggers on Ctrl+Space. Uses the AST + completionsAt() to provide
 * schema-aware suggestions. Renders a floating dropdown.
 */
import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { buildAstFromText } from '../../dsl/astParser';
import { completionsAt, type CompletionItem } from '../../dsl/astCompletions';

export const completionKey = new PluginKey<CompletionState>('completion');

interface CompletionState {
  active: boolean;
  items: CompletionItem[];
  selectedIndex: number;
  from: number;  // start of the word being completed
  to: number;    // end of the word being completed
}

const EMPTY: CompletionState = { active: false, items: [], selectedIndex: 0, from: 0, to: 0 };

/** Offset from ProseMirror position to text position (doc + code_block open tags). */
const PM_OFFSET = 2;

function getCompletions(state: EditorState): CompletionState {
  const text = state.doc.textContent;
  const pmPos = state.selection.from;
  const textPos = pmPos - PM_OFFSET;

  if (textPos < 0) return EMPTY;

  // Get the current line text
  const before = text.slice(0, textPos);
  const lineStart = before.lastIndexOf('\n') + 1;
  const lineEnd = text.indexOf('\n', textPos);
  const lineText = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);

  // Parse AST for context
  let ast = null;
  let model = null;
  try {
    const result = buildAstFromText(text);
    ast = result.ast;
    model = result.model;
  } catch { /* partial parse is ok */ }

  const items = completionsAt(ast, textPos, lineText, model);
  if (items.length === 0) return EMPTY;

  // Find the word being typed (for replacement range)
  let wordStart = textPos;
  while (wordStart > lineStart && /[\w\-#]/.test(text[wordStart - 1])) {
    wordStart--;
  }

  return {
    active: true,
    items,
    selectedIndex: 0,
    from: wordStart + PM_OFFSET,
    to: pmPos,
  };
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

  update(view: EditorView) {
    this.view = view;
    const state = completionKey.getState(view.state);
    if (!state || !state.active || state.items.length === 0) {
      this.menu.style.display = 'none';
      return;
    }

    const coords = view.coordsAtPos(view.state.selection.from);
    this.menu.style.display = 'block';
    this.menu.style.left = `${coords.left}px`;
    this.menu.style.top = `${coords.bottom + 4}px`;

    this.menu.innerHTML = '';
    state.items.forEach((item, i) => {
      const el = document.createElement('div');
      el.className = `starch-completion-item${i === state.selectedIndex ? ' selected' : ''}`;

      const label = document.createElement('span');
      label.className = 'starch-completion-label';
      label.textContent = item.label;
      el.appendChild(label);

      if (item.detail) {
        const detail = document.createElement('span');
        detail.className = 'starch-completion-detail';
        detail.textContent = item.detail;
        el.appendChild(detail);
      }

      if (item.scope) {
        const scope = document.createElement('span');
        scope.className = 'starch-completion-scope';
        scope.textContent = item.scope;
        el.appendChild(scope);
      }

      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        applyCompletion(this.view, state, item);
      });
      this.menu.appendChild(el);
    });

    // Scroll selected into view
    const selected = this.menu.children[state.selectedIndex] as HTMLElement;
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }

  destroy() {
    this.menu.remove();
  }
}

function applyCompletion(view: EditorView, state: CompletionState, item: CompletionItem) {
  const text = item.snippetTemplate
    // Strip snippet placeholders: ${1:W} → W
    ? item.snippetTemplate.replace(/\$\{\d+:([^}]+)\}/g, '$1')
    : item.label;

  const tr = view.state.tr.replaceWith(
    state.from,
    state.to,
    view.state.schema.text(text),
  );
  tr.setMeta(completionKey, EMPTY);
  view.dispatch(tr);
  view.focus();
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export function completionPlugin(): Plugin<CompletionState> {
  return new Plugin<CompletionState>({
    key: completionKey,

    state: {
      init: () => EMPTY,
      apply(tr, value) {
        const meta = tr.getMeta(completionKey) as CompletionState | undefined;
        if (meta !== undefined) return meta;
        if (tr.docChanged && value.active) return EMPTY;
        return value;
      },
    },

    view(editorView) {
      return new CompletionMenuView(editorView);
    },

    props: {
      handleKeyDown(view, event) {
        const state = completionKey.getState(view.state);

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
            applyCompletion(view, state, state.items[state.selectedIndex]);
            return true;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            view.dispatch(view.state.tr.setMeta(completionKey, EMPTY));
            return true;
          }
        }

        if (event.key === ' ' && event.ctrlKey) {
          event.preventDefault();
          const completionState = getCompletions(view.state);
          view.dispatch(view.state.tr.setMeta(completionKey, completionState));
          return true;
        }

        return false;
      },
    },
  });
}
