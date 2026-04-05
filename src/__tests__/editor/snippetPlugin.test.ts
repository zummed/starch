/**
 * Tests for snippet placeholders.
 *
 * After completing e.g. "rect", the editor inserts "rect WxH" where W and H
 * are placeholder regions. The user types into the active placeholder (replacing
 * it), then Tab or Enter advances to the next. After the last placeholder,
 * Tab/Enter exits the snippet and inserts a trailing space.
 */
import { describe, it, expect } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import {
  snippetPlugin,
  snippetKey,
  activateSnippet,
  type SnippetState,
} from '../../editor/plugins/snippetPlugin';

const schema = new Schema({
  nodes: {
    doc: { content: 'code_block' },
    code_block: { content: 'text*', code: true },
    text: { group: 'inline' },
  },
});

const PM_OFFSET = 1;

function createEditor(text: string, cursorTextPos: number) {
  const doc = text
    ? schema.node('doc', null, [schema.node('code_block', null, [schema.text(text)])])
    : schema.node('doc', null, [schema.node('code_block')]);

  let state = EditorState.create({
    doc,
    plugins: [snippetPlugin(), keymap(baseKeymap)],
  });

  const pmPos = cursorTextPos + PM_OFFSET;
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, pmPos)),
  );
  return state;
}

function getText(state: EditorState): string {
  return state.doc.textContent;
}

function getCursor(state: EditorState): number {
  return state.selection.from - PM_OFFSET;
}

function getSelection(state: EditorState): { from: number; to: number } {
  return {
    from: state.selection.from - PM_OFFSET,
    to: state.selection.to - PM_OFFSET,
  };
}

function getSnippetState(state: EditorState): SnippetState | undefined {
  return snippetKey.getState(state);
}

// ---------------------------------------------------------------------------
// Snippet state management
// ---------------------------------------------------------------------------

describe('snippet activation', () => {
  it('activateSnippet parses placeholders from template', () => {
    // "rect ${1:W}x${2:H}" inserted at text offset 0
    // Expanded text: "rect WxH"
    // Placeholder 1: "W" at expanded offset 5 (length 1)
    // Placeholder 2: "H" at expanded offset 7 (length 1)
    const state = createEditor('rect WxH', 0);
    const insertFrom = 0; // text offset where snippet was inserted
    const template = 'rect ${1:W}x${2:H}';

    const newState = activateSnippet(state, insertFrom, template);

    const ss = getSnippetState(newState);
    expect(ss).toBeDefined();
    expect(ss!.active).toBe(true);
    expect(ss!.placeholders).toHaveLength(2);
    expect(ss!.placeholders[0]).toEqual({ index: 1, from: 5, to: 6, text: 'W' });
    expect(ss!.placeholders[1]).toEqual({ index: 2, from: 7, to: 8, text: 'H' });
    expect(ss!.activeIndex).toBe(0);
  });

  it('activateSnippet selects the first placeholder text', () => {
    const state = createEditor('rect WxH', 0);
    const newState = activateSnippet(state, 0, 'rect ${1:W}x${2:H}');

    const sel = getSelection(newState);
    expect(sel.from).toBe(5); // start of "W"
    expect(sel.to).toBe(6);   // end of "W"
  });

  it('works with fill ${1:color} template', () => {
    const state = createEditor('fill color', 0);
    const newState = activateSnippet(state, 0, 'fill ${1:color}');

    const ss = getSnippetState(newState);
    expect(ss!.placeholders).toHaveLength(1);
    expect(ss!.placeholders[0]).toEqual({ index: 1, from: 5, to: 10, text: 'color' });

    const sel = getSelection(newState);
    expect(sel.from).toBe(5);
    expect(sel.to).toBe(10);
  });

  it('works with snippet inserted mid-line', () => {
    const state = createEditor('box: rect WxH', 0);
    const newState = activateSnippet(state, 5, 'rect ${1:W}x${2:H}');

    const ss = getSnippetState(newState);
    // Placeholders relative to document, not snippet
    expect(ss!.placeholders[0]).toEqual({ index: 1, from: 10, to: 11, text: 'W' });
    expect(ss!.placeholders[1]).toEqual({ index: 2, from: 12, to: 13, text: 'H' });
  });
});

// ---------------------------------------------------------------------------
// Tab navigation between placeholders
// ---------------------------------------------------------------------------

describe('Tab navigation', () => {
  it('Tab moves from first to second placeholder', () => {
    const state = createEditor('rect WxH', 0);
    const withSnippet = activateSnippet(state, 0, 'rect ${1:W}x${2:H}');

    // Simulate Tab by dispatching the meta
    const tabbed = simulateTab(withSnippet);

    const ss = getSnippetState(tabbed);
    expect(ss!.activeIndex).toBe(1);

    const sel = getSelection(tabbed);
    expect(sel.from).toBe(7); // start of "H"
    expect(sel.to).toBe(8);   // end of "H"
  });

  it('Tab after last placeholder deactivates snippet', () => {
    const state = createEditor('rect WxH', 0);
    const withSnippet = activateSnippet(state, 0, 'rect ${1:W}x${2:H}');

    const tab1 = simulateTab(withSnippet);  // → placeholder 2
    const tab2 = simulateTab(tab1);          // → exit snippet

    const ss = getSnippetState(tab2);
    expect(ss!.active).toBe(false);
  });

  it('single-placeholder snippet: Tab exits immediately', () => {
    const state = createEditor('fill color', 0);
    const withSnippet = activateSnippet(state, 0, 'fill ${1:color}');

    const tabbed = simulateTab(withSnippet);

    const ss = getSnippetState(tabbed);
    expect(ss!.active).toBe(false);
  });

  it('exit inserts trailing space and positions cursor after it', () => {
    const state = createEditor('rect WxH', 0);
    const withSnippet = activateSnippet(state, 0, 'rect ${1:W}x${2:H}');

    const tab1 = simulateTab(withSnippet);  // → placeholder 2
    const tab2 = simulateTab(tab1);          // → exit snippet

    expect(getText(tab2)).toBe('rect WxH ');
    expect(getCursor(tab2)).toBe(9); // after the trailing space
  });

  it('single-placeholder exit inserts trailing space', () => {
    const state = createEditor('fill color', 0);
    const withSnippet = activateSnippet(state, 0, 'fill ${1:color}');

    const typed = simulateType(withSnippet, '#fff');
    const exited = simulateTab(typed);

    expect(getText(exited)).toBe('fill #fff ');
    expect(getCursor(exited)).toBe(10);
  });

  it('trailing space goes after suffix text, not after placeholder (animate Ns)', () => {
    // Template "animate ${1:3}s" → expanded "animate 3s"
    // The "s" is a suffix after the placeholder, space must go after it
    const state = createEditor('animate 3s', 0);
    const withSnippet = activateSnippet(state, 0, 'animate ${1:3}s');

    const typed = simulateType(withSnippet, '5');
    const exited = simulateTab(typed);

    expect(getText(exited)).toBe('animate 5s ');
    expect(getCursor(exited)).toBe(11);
  });
});

// ---------------------------------------------------------------------------
// Typing replaces placeholder
// ---------------------------------------------------------------------------

describe('typing into placeholder', () => {
  it('typing replaces the placeholder text', () => {
    const state = createEditor('rect WxH', 0);
    const withSnippet = activateSnippet(state, 0, 'rect ${1:W}x${2:H}');

    // Simulate typing "100" — replaces the selected "W"
    const typed = simulateType(withSnippet, '100');

    expect(getText(typed)).toBe('rect 100xH');
  });

  it('after typing, Tab still moves to next placeholder', () => {
    const state = createEditor('rect WxH', 0);
    const withSnippet = activateSnippet(state, 0, 'rect ${1:W}x${2:H}');

    const typed = simulateType(withSnippet, '100');
    const tabbed = simulateTab(typed);

    const sel = getSelection(tabbed);
    // "H" shifted because "W" became "100" (2 extra chars)
    // Original H was at 7-8, now at 9-10
    expect(sel.from).toBe(9);
    expect(sel.to).toBe(10);
    expect(getText(tabbed)[sel.from]).toBe('H');
  });

  it('typing into second placeholder after tabbing works', () => {
    const state = createEditor('rect WxH', 0);
    const withSnippet = activateSnippet(state, 0, 'rect ${1:W}x${2:H}');

    const typed1 = simulateType(withSnippet, '100');
    const tabbed = simulateTab(typed1);
    const typed2 = simulateType(tabbed, '60');

    expect(getText(typed2)).toBe('rect 100x60');
  });

  it('full flow: complete rect, type dimensions, exit', () => {
    const state = createEditor('rect WxH', 0);
    const withSnippet = activateSnippet(state, 0, 'rect ${1:W}x${2:H}');

    const typed1 = simulateType(withSnippet, '140');
    const tabbed = simulateTab(typed1);
    const typed2 = simulateType(tabbed, '80');
    const exited = simulateTab(typed2);

    expect(getText(exited)).toBe('rect 140x80 ');
    expect(getSnippetState(exited)!.active).toBe(false);
    // Cursor after the trailing space
    expect(getCursor(exited)).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// Helpers to simulate user actions via EditorState transforms
// ---------------------------------------------------------------------------

/** Simulate pressing Tab/Enter — advances to next placeholder or exits with trailing space. */
function simulateTab(state: EditorState): EditorState {
  const ss = getSnippetState(state);
  if (!ss || !ss.active) return state;

  const nextIndex = ss.activeIndex + 1;
  if (nextIndex >= ss.placeholders.length) {
    // Exit snippet — insert trailing space after the full snippet text
    const insertPos = ss.snippetEnd + PM_OFFSET;
    const tr = state.tr
      .insertText(' ', insertPos)
      .setMeta(snippetKey, { ...ss, active: false });
    tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
    return state.apply(tr);
  }

  // Move to next placeholder
  const ph = ss.placeholders[nextIndex];
  let tr = state.tr.setSelection(
    TextSelection.create(state.doc, ph.from + PM_OFFSET, ph.to + PM_OFFSET),
  );
  tr = tr.setMeta(snippetKey, { ...ss, activeIndex: nextIndex });
  return state.apply(tr);
}

/** Simulate typing text — replaces the current selection (placeholder). */
function simulateType(state: EditorState, text: string): EditorState {
  const { from, to } = state.selection;
  const tr = state.tr.insertText(text, from, to);

  // Update snippet state: adjust placeholder positions for the text change
  const ss = getSnippetState(state);
  if (ss && ss.active) {
    const delta = text.length - (to - from);
    const currentPh = ss.placeholders[ss.activeIndex];
    const updatedPlaceholders = ss.placeholders.map((ph, i) => {
      if (i === ss.activeIndex) {
        // The active placeholder was replaced
        return { ...ph, to: ph.from + text.length, text };
      }
      if (i > ss.activeIndex) {
        // Later placeholders shift by delta
        return { ...ph, from: ph.from + delta, to: ph.to + delta };
      }
      return ph;
    });
    tr.setMeta(snippetKey, { ...ss, placeholders: updatedPlaceholders, snippetEnd: ss.snippetEnd + delta });
  }

  return state.apply(tr);
}
