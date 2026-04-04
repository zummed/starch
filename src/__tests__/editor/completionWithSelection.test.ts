/**
 * Tests for completion behavior when there's an active selection.
 *
 * When a snippet placeholder is selected and the user triggers completion,
 * selecting an item should REPLACE the selection (the placeholder text),
 * not insert before it.
 */
import { describe, it, expect } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { getCompletionsFromState } from '../../editor/plugins/completionPlugin';

const schema = new Schema({
  nodes: {
    doc: { content: 'code_block' },
    code_block: { content: 'text*', code: true },
    text: { group: 'inline' },
  },
});

const PM_OFFSET = 1;

function stateWithSelection(text: string, selFromText: number, selToText: number) {
  const doc = schema.node('doc', null, [
    schema.node('code_block', null, [schema.text(text)]),
  ]);
  let state = EditorState.create({ doc });
  const sel = TextSelection.create(
    doc,
    selFromText + PM_OFFSET,
    selToText + PM_OFFSET,
  );
  state = state.apply(state.tr.setSelection(sel));
  return state;
}

describe('completion with active selection (placeholder)', () => {
  it('replacement range covers the entire selection', () => {
    // "fill color" with "color" selected (text offsets 5-10)
    const state = stateWithSelection('fill color', 5, 10);
    const cs = getCompletionsFromState(state);

    expect(cs.active).toBe(true);
    // The replacement range should cover the selection
    // from = start of selection in PM coords = 5+1 = 6
    // to = end of selection in PM coords = 10+1 = 11
    expect(cs.from).toBe(6);
    expect(cs.to).toBe(11);
  });

  it('word boundary does not walk past selection start', () => {
    // With "fi" typed, no selection, cursor at 2 (after "fi")
    // word boundary should walk back to 0 (start of "fi")
    const state = stateWithSelection('fill color', 2, 2);
    const cs = getCompletionsFromState(state);

    // Replacement range covers "fi"
    expect(cs.from).toBe(0 + PM_OFFSET); // 1
    expect(cs.to).toBe(2 + PM_OFFSET);   // 3
  });

  it('when selection exists, uses selection bounds not word boundary', () => {
    // "fill color" with "col" selected (partial placeholder)
    const state = stateWithSelection('fill color', 5, 8);
    const cs = getCompletionsFromState(state);

    // Should use selection as replacement range, not word boundary
    expect(cs.from).toBe(5 + PM_OFFSET); // 6
    expect(cs.to).toBe(8 + PM_OFFSET);   // 9
  });
});
