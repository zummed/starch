/**
 * Tests for live filtering of the completion menu as the user types.
 *
 * When the completion menu is open, each keystroke should narrow the list
 * by filtering items against the growing prefix. The menu should close
 * when no items match.
 */
import { describe, it, expect } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import {
  completionPlugin,
  completionKey,
  getCompletionsFromState,
} from '../../editor/plugins/completionPlugin';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';

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
    ? schema.node('doc', null, [
        schema.node('code_block', null, [schema.text(text)]),
      ])
    : schema.node('doc', null, [schema.node('code_block')]);

  let state = EditorState.create({
    doc,
    plugins: [completionPlugin(), keymap(baseKeymap)],
  });

  const pmPos = cursorTextPos + PM_OFFSET;
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, pmPos)),
  );
  return state;
}

function getCompletionState(state: EditorState) {
  return completionKey.getState(state);
}

function isActive(state: EditorState): boolean {
  return getCompletionState(state)?.active ?? false;
}

function getLabels(state: EditorState): string[] {
  const cs = getCompletionState(state);
  return cs?.items.map((i) => i.label) ?? [];
}

/**
 * Simulate typing a character while the completion menu is open.
 * This inserts the character (which changes the doc, closing the menu
 * per the current apply logic), then re-triggers completion.
 *
 * The plugin should keep the menu open and filter by the new prefix.
 */
function typeChar(state: EditorState, char: string): EditorState {
  // Insert the character at cursor
  const tr = state.tr.insertText(char, state.selection.from, state.selection.to);
  return state.apply(tr);
}

describe('completion live filtering', () => {
  it('typing a character while menu is open should keep it open with filtered results', () => {
    // Start with "r" typed, menu open showing items starting with "r"
    const state = createEditor('box:\n  r', 8);
    // Trigger completion
    const cs = triggerCompletion(state);
    expect(isActive(cs)).toBe(true);
    const allLabels = getLabels(cs);
    expect(allLabels).toContain('rect');

    // Type 'e' → "re" — should narrow to items starting with "re"
    const afterE = typeAndRefilter(cs, 'e');
    expect(isActive(afterE)).toBe(true);
    const reLabels = getLabels(afterE);
    expect(reLabels).toContain('rect');
    // Should NOT contain items that don't start with "re"
    for (const label of reLabels) {
      expect(label.toLowerCase().startsWith('re')).toBe(true);
    }
  });

  it('typing narrows further with each character', () => {
    const state = createEditor('box:\n  ', 7);
    const cs = triggerCompletion(state);

    const afterR = typeAndRefilter(cs, 'r');
    const rCount = getLabels(afterR).length;

    const afterRe = typeAndRefilter(afterR, 'e');
    const reCount = getLabels(afterRe).length;

    const afterRec = typeAndRefilter(afterRe, 'c');
    const recCount = getLabels(afterRec).length;

    // Each successive character should have equal or fewer matches
    expect(reCount).toBeLessThanOrEqual(rCount);
    expect(recCount).toBeLessThanOrEqual(reCount);
    expect(recCount).toBeGreaterThan(0); // "rect" should still match
  });

  it('menu closes when no items match the typed prefix', () => {
    const state = createEditor('box:\n  ', 7);
    const cs = triggerCompletion(state);

    const afterX = typeAndRefilter(cs, 'x');
    const afterXz = typeAndRefilter(afterX, 'z');
    const afterXzq = typeAndRefilter(afterXz, 'q');

    // "xzq" shouldn't match anything
    expect(isActive(afterXzq)).toBe(false);
  });

  it('Backspace widens the filter', () => {
    const state = createEditor('box:\n  rec', 10);
    const cs = triggerCompletion(state);
    const recLabels = getLabels(cs);

    // Simulate backspace: delete last char, re-trigger
    const afterBackspace = backspaceAndRefilter(cs);
    const reLabels = getLabels(afterBackspace);

    // "re" should match more than "rec"
    expect(reLabels.length).toBeGreaterThanOrEqual(recLabels.length);
  });
});

// ---------------------------------------------------------------------------
// Helpers that simulate the plugin behavior we want to implement
// ---------------------------------------------------------------------------

/**
 * Trigger completion at current cursor position.
 * Replicates what Ctrl+Space does in the plugin.
 */
function triggerCompletion(state: EditorState): EditorState {
  const cs = getCompletionsFromState(state);
  if (!cs.active) return state;
  const tr = state.tr.setMeta(completionKey, cs);
  return state.apply(tr);
}

/**
 * Type a character and re-trigger completion filtering.
 */
function typeAndRefilter(state: EditorState, char: string): EditorState {
  const typed = typeChar(state, char);
  return triggerCompletion(typed);
}

/**
 * Backspace and re-trigger completion.
 */
function backspaceAndRefilter(state: EditorState): EditorState {
  const { from } = state.selection;
  if (from <= PM_OFFSET) return state;
  const tr = state.tr.delete(from - 1, from);
  const deleted = state.apply(tr);
  return triggerCompletion(deleted);
}
