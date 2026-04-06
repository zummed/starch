import { describe, it, expect } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
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

const PM_OFFSET = 2;

/** Create a state with cursor at a text offset. */
function stateAt(text: string, cursorTextPos: number) {
  const doc = text
    ? schema.node('doc', null, [schema.node('code_block', null, [schema.text(text)])])
    : schema.node('doc', null, [schema.node('code_block')]);

  let state = EditorState.create({
    doc,
    plugins: [completionPlugin(), keymap(baseKeymap)],
  });

  const pmPos = cursorTextPos + PM_OFFSET;
  const sel = TextSelection.create(state.doc, pmPos);
  state = state.apply(state.tr.setSelection(sel));
  return state;
}

/**
 * Replicate the word boundary logic from the plugin.
 * Returns the word being typed and the replacement range (as text offsets).
 */
function wordBoundary(text: string, cursorTextPos: number) {
  const before = text.slice(0, cursorTextPos);
  const lineStart = before.lastIndexOf('\n') + 1;

  let wordStart = cursorTextPos;
  while (wordStart > lineStart && /[a-zA-Z_\-#@]/.test(text[wordStart - 1])) {
    wordStart--;
  }

  return {
    word: text.slice(wordStart, cursorTextPos),
    from: wordStart,
    to: cursorTextPos,
  };
}

/** Simulate applying a completion: replace from..to with label text. */
function applyResult(text: string, from: number, to: number, label: string): string {
  return text.slice(0, from) + label + text.slice(to);
}

// ---------------------------------------------------------------------------
// Word boundary tests
// ---------------------------------------------------------------------------

describe('completion word boundary', () => {
  it('identifies a partial keyword at end of line', () => {
    expect(wordBoundary('box: rect 100x60 fi', 19).word).toBe('fi');
  });

  it('does NOT eat a dimension value like 100x60', () => {
    expect(wordBoundary('box: rect 100x60', 16).word).toBe('');
  });

  it('does NOT eat a number', () => {
    expect(wordBoundary('opacity 0.5', 11).word).toBe('');
  });

  it('matches a keyword at start of line', () => {
    expect(wordBoundary('fill', 4).word).toBe('fill');
  });

  it('matches a keyword after indentation', () => {
    expect(wordBoundary('  fill', 6).word).toBe('fill');
  });

  it('empty word when cursor is after a space', () => {
    expect(wordBoundary('box: rect 100x60 ', 17).word).toBe('');
  });

  it('matches @style prefix', () => {
    expect(wordBoundary('@prim', 5).word).toBe('@prim');
  });

  it('does not cross a colon', () => {
    // Cursor right after ":" — colon is not [a-zA-Z_\-#@]
    expect(wordBoundary('box:', 4).word).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Completion application tests
// ---------------------------------------------------------------------------

describe('completion application', () => {
  it('typing "fill " then completing a color INSERTS after the space', () => {
    const text = 'box: rect 100x60 fill ';
    const cursor = 22; // after the space
    const { from, to, word } = wordBoundary(text, cursor);
    expect(word).toBe(''); // no word — just a space
    expect(from).toBe(to); // zero-width range

    const result = applyResult(text, from, to, 'red');
    expect(result).toBe('box: rect 100x60 fill red');
  });

  it('typing "fi" then completing "fill" replaces only "fi"', () => {
    const text = 'box: rect 100x60 fi';
    const cursor = 19;
    const { from, to } = wordBoundary(text, cursor);

    const result = applyResult(text, from, to, 'fill');
    expect(result).toBe('box: rect 100x60 fill');
  });

  it('typing "re" then completing "rect" replaces only "re"', () => {
    const text = '  re';
    const cursor = 4;
    const { from, to } = wordBoundary(text, cursor);
    expect(from).toBe(2); // start of "re"
    expect(to).toBe(4);   // end of "re"

    const result = applyResult(text, from, to, 'rect');
    expect(result).toBe('  rect');
  });

  it('completing with snippet template expands placeholders', () => {
    const template = 'rect ${1:W}x${2:H}';
    const expanded = template.replace(/\$\{\d+:([^}]+)\}/g, '$1');
    expect(expanded).toBe('rect WxH');
  });

  it('completing "rect" from "re" inserts the full snippet', () => {
    const text = 'box:\n  re';
    const cursor = 9; // after "re"
    const { from, to } = wordBoundary(text, cursor);

    // Snippet template for rect
    const expanded = 'rect WxH';
    const result = applyResult(text, from, to, expanded);
    expect(result).toBe('box:\n  rect WxH');
  });

  it('does NOT eat "fill" when completing a color after "fill "', () => {
    // This is the critical bug: "fill " + select color should keep "fill"
    const text = 'foo: rect 100x100 fill ';
    const cursor = 23; // after space
    const { from, to, word } = wordBoundary(text, cursor);
    expect(word).toBe('');

    const result = applyResult(text, from, to, 'black');
    expect(result).toBe('foo: rect 100x100 fill black');
  });

  it('cursor after "fill" (no space) replaces the keyword', () => {
    // If you press Ctrl+Space while cursor is on "fill" itself,
    // the whole word gets replaced. This is expected for keyword replacement.
    const text = 'foo: rect 100x100 fill';
    const cursor = 22;
    const { from, to, word } = wordBoundary(text, cursor);
    expect(word).toBe('fill');

    const result = applyResult(text, from, to, 'fill');
    expect(result).toBe('foo: rect 100x100 fill'); // no change
  });
});
