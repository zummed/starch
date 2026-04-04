/**
 * Autocomplete plugin for the DSL code-block editor.
 *
 * Triggers on Ctrl+Space. Uses the AST + completionsAt() to provide
 * schema-aware suggestions. Renders a floating dropdown.
 */
import { Plugin, PluginKey, TextSelection, type EditorState } from 'prosemirror-state';
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
const PM_OFFSET = 1;

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

  // Find the word being typed (for replacement range).
  // Only walk back through alpha/underscore/hyphen/@/# — NOT digits.
  // This prevents eating dimensions (100x60), numbers (0.5), etc.
  let wordStart = textPos;
  while (wordStart > lineStart && /[a-zA-Z_\-#@]/.test(text[wordStart - 1])) {
    wordStart--;
  }

  const typedWord = text.slice(wordStart, textPos).toLowerCase();

  let items = completionsAt(ast, textPos, lineText, model);

  // Filter by typed prefix
  if (typedWord) {
    items = items.filter(item => item.label.toLowerCase().startsWith(typedWord));
  }

  if (items.length === 0) return EMPTY;

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

function applyCompletion(view: EditorView, cState: CompletionState, item: CompletionItem) {
  let insertText: string;
  let cursorOffset: number | null = null; // offset from start of inserted text to place cursor

  if (item.snippetTemplate) {
    // Find first placeholder position for cursor placement
    const raw = item.snippetTemplate;
    const firstPlaceholder = raw.indexOf('${1:');
    if (firstPlaceholder >= 0) {
      cursorOffset = firstPlaceholder;
    }
    // Strip snippet placeholders: ${1:W} → W
    insertText = raw.replace(/\$\{\d+:([^}]+)\}/g, '$1');
  } else {
    insertText = item.label;
  }

  const tr = view.state.tr.insertText(insertText, cState.from, cState.to);
  tr.setMeta(completionKey, EMPTY);

  // Position cursor at first placeholder if snippet, otherwise at end
  if (cursorOffset !== null) {
    const cursorPos = cState.from + cursorOffset;
    tr.setSelection(TextSelection.create(tr.doc, cursorPos));
  }

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
