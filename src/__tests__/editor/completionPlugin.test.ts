import { describe, it, expect } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { completionPlugin, completionKey } from '../../editor/plugins/completionPlugin';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';

const schema = new Schema({
  nodes: {
    doc: { content: 'code_block' },
    code_block: { content: 'text*', code: true },
    text: { group: 'inline' },
  },
});

function createState(text: string, cursorPos?: number) {
  const doc = text
    ? schema.node('doc', null, [schema.node('code_block', null, [schema.text(text)])])
    : schema.node('doc', null, [schema.node('code_block')]);

  const state = EditorState.create({
    doc,
    plugins: [completionPlugin(), keymap(baseKeymap)],
  });

  if (cursorPos !== undefined) {
    // cursorPos is text offset; PM pos = text offset + 2
    const pmPos = cursorPos + 2;
    const tr = state.tr.setSelection(
      state.selection.constructor.near(state.doc.resolve(pmPos)),
    );
    return state.apply(tr);
  }
  return state;
}

function getWordRange(text: string, cursorTextPos: number) {
  // Replicate the word boundary logic from completionPlugin
  const PM_OFFSET = 2;
  const pmPos = cursorTextPos + PM_OFFSET;

  const before = text.slice(0, cursorTextPos);
  const lineStart = before.lastIndexOf('\n') + 1;

  let wordStart = cursorTextPos;
  while (wordStart > lineStart && /[a-zA-Z_\-#@]/.test(text[wordStart - 1])) {
    wordStart--;
  }

  return { from: wordStart + PM_OFFSET, to: pmPos, word: text.slice(wordStart, cursorTextPos) };
}

describe('completion word boundary', () => {
  it('identifies a partial keyword at end of line', () => {
    const { from, to, word } = getWordRange('box: rect 100x60 fi', 19);
    expect(word).toBe('fi');
  });

  it('does NOT eat a dimension value like 100x60', () => {
    const { from, to, word } = getWordRange('box: rect 100x60', 16);
    // Should NOT match "100x60" — that's a dimension, not a keyword being typed
    expect(word).toBe('');
  });

  it('does NOT eat a number', () => {
    const { from, to, word } = getWordRange('opacity 0.5', 11);
    expect(word).toBe('');
  });

  it('matches a keyword at start of line', () => {
    const { word } = getWordRange('fill', 4);
    expect(word).toBe('fill');
  });

  it('matches a keyword after indentation', () => {
    const { word } = getWordRange('  fill', 6);
    expect(word).toBe('fill');
  });

  it('matches partial keyword after space', () => {
    const { word } = getWordRange('box: rect 100x60 fi', 19);
    expect(word).toBe('fi');
  });

  it('matches nothing when cursor is after a space', () => {
    const { word } = getWordRange('box: rect 100x60 ', 17);
    expect(word).toBe('');
  });

  it('does NOT eat into a hex color (digits are not keyword chars)', () => {
    const { word } = getWordRange('fill #3366', 10);
    // Hex colors are not completable keywords — they won't be walked back
    expect(word).toBe('');
  });

  it('matches a style reference', () => {
    const { word } = getWordRange('@prim', 5);
    expect(word).toBe('@prim');
  });

  it('does NOT eat across a colon', () => {
    const { word } = getWordRange('box:', 4);
    // The colon is not part of the word
    expect(word).toBe('');
  });

  it('preserves keyword before cursor when inserting after space', () => {
    // Simulates: user types "fill " then triggers completion
    // The completion should INSERT after the space, not replace "fill"
    const text = 'fill ';
    const { word, from, to } = getWordRange(text, 5);
    expect(word).toBe('');
    expect(from).toBe(to); // zero-width range = insert
  });
});
