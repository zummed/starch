/**
 * Autocomplete plugin for the DSL code-block editor.
 *
 * Triggers on Ctrl+Space. Uses the AST + completionsAt() to provide
 * schema-aware suggestions. Renders a floating dropdown.
 */
import { Plugin, PluginKey, TextSelection, type EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { walkDocument } from '../../dsl/schemaWalker';
import { leavesToAst } from '../../dsl/astAdapter';
import { completionsAt, type CompletionItem } from '../../dsl/astCompletions';
import { snippetKey, activateSnippet } from './snippetPlugin';

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
const PM_OFFSET = 1;

/** Exported for testing. */
export function getCompletionsFromState(state: EditorState): CompletionState {
  return getCompletions(state);
}

function getCompletions(state: EditorState): CompletionState {
  const text = state.doc.textContent;
  const selFrom = state.selection.from;
  const selTo = state.selection.to;
  const hasSelection = selFrom !== selTo;
  const textPos = selFrom - PM_OFFSET;

  if (textPos < 0) return EMPTY;

  // Get the current line text (based on selection start)
  const before = text.slice(0, textPos);
  const lineStart = before.lastIndexOf('\n') + 1;
  const lineEnd = text.indexOf('\n', textPos);
  const lineText = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);

  // Parse AST for context using the schema-driven walker.
  let ast = null;
  let model = null;
  try {
    const { model: m, ast: ctx } = walkDocument(text);
    model = m;
    ast = leavesToAst(ctx.astLeaves(), text.length);
  } catch { /* partial parse is ok */ }

  let from: number;
  let to: number;
  let typedWord = '';

  if (hasSelection) {
    // When there's a selection (e.g., active placeholder), replace the
    // entire selection. Don't use word boundary.
    from = selFrom;
    to = selTo;
  } else {
    // Find the word being typed (for replacement range).
    // Only walk back through alpha/underscore/hyphen/@/# — NOT digits.
    let wordStart = textPos;
    while (wordStart > lineStart && /[a-zA-Z_\-#@]/.test(text[wordStart - 1])) {
      wordStart--;
    }
    typedWord = text.slice(wordStart, textPos).toLowerCase();
    from = wordStart + PM_OFFSET;
    to = selFrom;
  }

  let items = completionsAt(ast, textPos, lineText, model);

  // Filter by typed prefix (only when no selection — selection means we're
  // replacing a placeholder, not filtering by user input)
  if (typedWord && !hasSelection) {
    items = items.filter(item => item.label.toLowerCase().startsWith(typedWord));
  }

  if (items.length === 0) return EMPTY;

  return {
    active: true,
    items,
    selectedIndex: 0,
    from,
    to,
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

function applyCompletion(view: EditorView, cState: CompletionState, item: CompletionItem) {
  // Strip snippet placeholders for the inserted text: ${1:W} → W
  const insertText = item.snippetTemplate
    ? item.snippetTemplate.replace(/\$\{\d+:([^}]+)\}/g, '$1')
    : item.label;

  const tr = view.state.tr.insertText(insertText, cState.from, cState.to);
  tr.setMeta(completionKey, EMPTY);
  view.dispatch(tr);

  // If the item has a snippet template with placeholders, activate snippet mode
  if (item.snippetTemplate && item.snippetTemplate.includes('${')) {
    const insertFrom = cState.from - PM_OFFSET; // text offset
    const newState = activateSnippet(view.state, insertFrom, item.snippetTemplate);
    view.updateState(newState);
  }

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
      apply(tr, value, _oldState, newState) {
        const meta = tr.getMeta(completionKey) as CompletionState | undefined;
        if (meta !== undefined) return meta;
        // When the doc changes while the menu is open, re-filter
        if (tr.docChanged && value.active) {
          return getCompletions(newState);
        }
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
