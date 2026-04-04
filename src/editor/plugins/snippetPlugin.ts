/**
 * Snippet placeholder plugin.
 *
 * After a completion inserts snippet text (e.g., "rect WxH"), this plugin
 * tracks placeholder positions, selects the active one, and handles:
 *   - Tab → advance to next placeholder (or exit)
 *   - Typing → replace active placeholder text, shift later placeholders
 *   - Escape → exit snippet mode
 */
import { Plugin, PluginKey, TextSelection, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

const PM_OFFSET = 1;

export interface Placeholder {
  index: number;
  from: number;  // text offset (not PM position)
  to: number;    // text offset
  text: string;
}

export interface SnippetState {
  active: boolean;
  placeholders: Placeholder[];
  activeIndex: number;
}

const EMPTY: SnippetState = { active: false, placeholders: [], activeIndex: 0 };

export const snippetKey = new PluginKey<SnippetState>('snippet');

/**
 * Parse a snippet template string and extract placeholder definitions.
 * Template format: "rect ${1:W}x${2:H}"
 * Returns placeholders with positions relative to the expanded text.
 */
function parsePlaceholders(template: string): Placeholder[] {
  const placeholders: Placeholder[] = [];
  const regex = /\$\{(\d+):([^}]+)\}/g;
  let match;

  // Build the expanded text to calculate positions
  let expanded = '';
  let lastIndex = 0;

  // First pass: find all placeholders and their positions in expanded text
  const raw = template;
  let offset = 0;
  const tempRegex = /\$\{(\d+):([^}]+)\}/g;
  let m;

  // Calculate expanded text by removing ${N:...} wrappers
  let expandedPos = 0;
  let remaining = template;
  const results: Array<{ index: number; from: number; to: number; text: string }> = [];

  while ((m = tempRegex.exec(raw)) !== null) {
    const beforeLen = m.index - lastIndex;
    expandedPos += beforeLen;

    const idx = parseInt(m[1]);
    const text = m[2];
    results.push({
      index: idx,
      from: expandedPos,
      to: expandedPos + text.length,
      text,
    });

    expandedPos += text.length;
    lastIndex = m.index + m[0].length;
  }

  // Sort by index
  results.sort((a, b) => a.index - b.index);
  return results;
}

/**
 * Activate a snippet after insertion. Call this after inserting expanded
 * snippet text at `insertFrom` (text offset in the document).
 *
 * Sets the snippet state with placeholder positions adjusted to document
 * offsets, and selects the first placeholder.
 */
export function activateSnippet(
  state: EditorState,
  insertFrom: number,
  template: string,
): EditorState {
  const placeholders = parsePlaceholders(template).map(ph => ({
    ...ph,
    from: ph.from + insertFrom,
    to: ph.to + insertFrom,
  }));

  if (placeholders.length === 0) return state;

  const first = placeholders[0];
  const snippetState: SnippetState = {
    active: true,
    placeholders,
    activeIndex: 0,
  };

  // Select the first placeholder text
  const tr = state.tr.setSelection(
    TextSelection.create(state.doc, first.from + PM_OFFSET, first.to + PM_OFFSET),
  );
  tr.setMeta(snippetKey, snippetState);

  return state.apply(tr);
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export function snippetPlugin(): Plugin<SnippetState> {
  return new Plugin<SnippetState>({
    key: snippetKey,

    state: {
      init: () => EMPTY,
      apply(tr, value) {
        const meta = tr.getMeta(snippetKey) as SnippetState | undefined;
        if (meta !== undefined) return meta;

        // If doc changed and snippet is active, adjust placeholder positions
        if (tr.docChanged && value.active) {
          const mapping = tr.mapping;
          const updated = value.placeholders.map(ph => ({
            ...ph,
            from: mapping.map(ph.from + PM_OFFSET) - PM_OFFSET,
            to: mapping.map(ph.to + PM_OFFSET) - PM_OFFSET,
          }));
          return { ...value, placeholders: updated };
        }

        return value;
      },
    },

    props: {
      // Render placeholder decorations
      decorations(state) {
        const ss = snippetKey.getState(state);
        if (!ss || !ss.active) return DecorationSet.empty;

        const decos: Decoration[] = [];
        for (let i = 0; i < ss.placeholders.length; i++) {
          const ph = ss.placeholders[i];
          const from = ph.from + PM_OFFSET;
          const to = ph.to + PM_OFFSET;
          if (from >= to) continue;
          const cls = i === ss.activeIndex
            ? 'snippet-placeholder snippet-active'
            : 'snippet-placeholder';
          decos.push(Decoration.inline(from, to, { class: cls }));
        }

        return DecorationSet.create(state.doc, decos);
      },

      handleKeyDown(view, event) {
        const ss = snippetKey.getState(view.state);
        if (!ss || !ss.active) return false;

        if (event.key === 'Tab' && !event.shiftKey) {
          event.preventDefault();

          const nextIndex = ss.activeIndex + 1;
          if (nextIndex >= ss.placeholders.length) {
            // Exit snippet
            const lastPh = ss.placeholders[ss.placeholders.length - 1];
            const cursorPos = lastPh.to + PM_OFFSET;
            const tr = view.state.tr
              .setSelection(TextSelection.create(view.state.doc, cursorPos))
              .setMeta(snippetKey, { ...ss, active: false });
            view.dispatch(tr);
          } else {
            // Move to next placeholder
            const ph = ss.placeholders[nextIndex];
            const tr = view.state.tr
              .setSelection(TextSelection.create(
                view.state.doc, ph.from + PM_OFFSET, ph.to + PM_OFFSET,
              ))
              .setMeta(snippetKey, { ...ss, activeIndex: nextIndex });
            view.dispatch(tr);
          }
          return true;
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          const tr = view.state.tr.setMeta(snippetKey, EMPTY);
          view.dispatch(tr);
          return true;
        }

        return false;
      },
    },
  });
}
