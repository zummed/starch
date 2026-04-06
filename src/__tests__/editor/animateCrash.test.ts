/**
 * Reproduce the animate + Ctrl+Space crash reported by the user.
 */
import { describe, it, expect } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { activateSnippet } from '../../editor/plugins/snippetPlugin';

const schema = new Schema({
  nodes: {
    doc: { content: 'code_block' },
    code_block: { content: 'text*', code: true },
    text: { group: 'inline' },
  },
});

describe('animate completion application', () => {
  it('does not crash when applying animate snippet', () => {
    // User types "animate", cursor at end
    const text = 'animate';
    const doc = schema.node('doc', null, [
      schema.node('code_block', null, [schema.text(text)]),
    ]);
    let state = EditorState.create({ doc });
    state = state.apply(state.tr.setSelection(TextSelection.create(doc, 8)));

    // Completion selects "animate" with snippetTemplate 'animate ${1:3}s'
    // applyCompletion strips placeholders → 'animate 3s', inserts at from=1, to=8
    const insertText = 'animate 3s';
    const from = 1, to = 8;
    const tr = state.tr.insertText(insertText, from, to);
    state = state.apply(tr);

    expect(state.doc.textContent).toBe('animate 3s');

    // Then activates snippet
    const insertFrom = 0; // from - PM_OFFSET (1)
    expect(() => {
      state = activateSnippet(state, insertFrom, 'animate ${1:3}s');
    }).not.toThrow();
  });

  it('snippet placeholder positioned correctly', () => {
    const text = 'animate 3s';
    const doc = schema.node('doc', null, [
      schema.node('code_block', null, [schema.text(text)]),
    ]);
    let state = EditorState.create({ doc });
    state = state.apply(state.tr.setSelection(TextSelection.create(doc, 11)));

    state = activateSnippet(state, 0, 'animate ${1:3}s');
    // Placeholder "3" is at expanded offset 8 (after "animate "), length 1
    // In doc: textStart=1, so "3" is at PM pos 9
    expect(state.selection.from).toBe(9);
    expect(state.selection.to).toBe(10);
  });
});
