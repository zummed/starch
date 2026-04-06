import { describe, it, expect } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';

const schema = new Schema({
  nodes: {
    doc: { content: 'code_block' },
    code_block: { content: 'text*', code: true },
    text: { group: 'inline' },
  },
});

describe('ProseMirror position mapping', () => {
  it('determines the correct text offset for code_block', () => {
    const text = 'abcde';
    const doc = schema.node('doc', null, [
      schema.node('code_block', null, [schema.text(text)]),
    ]);
    const state = EditorState.create({ doc });

    // Find the first position where we can read char 'a'
    let textStartPos = -1;
    for (let pos = 0; pos < doc.nodeSize; pos++) {
      try {
        const content = doc.textBetween(pos, pos + 1, '', '');
        if (content === 'a') {
          textStartPos = pos;
          break;
        }
      } catch { /* ignore */ }
    }

    expect(textStartPos).toBeGreaterThan(0);

    // Verify all characters are at consecutive positions
    for (let i = 0; i < text.length; i++) {
      const content = doc.textBetween(textStartPos + i, textStartPos + i + 1, '', '');
      expect(content).toBe(text[i]);
    }

    // The "text start PM position" is where 'a' lives
    // So PM_OFFSET = textStartPos (pm position of first char)
    // And textPos = pmPos - textStartPos
    const PM_OFFSET = textStartPos;

    // Verify cursor can be placed at start of text
    const startSel = TextSelection.create(doc, PM_OFFSET);
    expect(startSel.from).toBe(PM_OFFSET);

    // Verify cursor can be placed after last char
    const endPos = PM_OFFSET + text.length;
    const endSel = TextSelection.create(doc, endPos);
    expect(endSel.from).toBe(endPos);

    // Verify insertText at end works
    const tr = state.tr.insertText('XYZ', endPos, endPos);
    const result = state.apply(tr);
    expect(result.doc.textContent).toBe('abcdeXYZ');

    // Verify insertText replacing "cd" works
    const from = PM_OFFSET + 2; // 'c' position
    const to = PM_OFFSET + 4;   // after 'd'
    const tr2 = state.tr.insertText('REPLACED', from, to);
    const result2 = state.apply(tr2);
    expect(result2.doc.textContent).toBe('abREPLACEDe');

    // Report the offset for use in the plugin
    console.log('PM_OFFSET =', PM_OFFSET);
  });
});
