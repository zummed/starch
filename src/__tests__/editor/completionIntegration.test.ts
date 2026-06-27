/**
 * Integration tests for autocomplete — tests the full completion flow
 * using actual ProseMirror EditorState.
 */
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

/**
 * Create a state with cursor at a given text offset.
 * Returns the state and a helper to read text/cursor position.
 */
function editor(text: string, cursorTextOffset: number) {
  const doc = text
    ? schema.node('doc', null, [schema.node('code_block', null, [schema.text(text)])])
    : schema.node('doc', null, [schema.node('code_block')]);

  const state = EditorState.create({ doc });

  // Find the actual start of text content inside code_block
  const codeBlock = state.doc.firstChild!;
  const textStart = 1; // text content starts at PM position 1
  const pmPos = textStart + cursorTextOffset;

  // Clamp to valid range inside the code_block
  const maxPos = textStart + (codeBlock.content.size);
  const clampedPos = Math.min(pmPos, maxPos);

  const sel = TextSelection.create(state.doc, clampedPos);
  const withCursor = state.apply(state.tr.setSelection(sel));

  return {
    state: withCursor,
    textStart,
    getText: () => withCursor.doc.textContent,
    cursorTextOffset: () => withCursor.selection.from - textStart,
  };
}

/**
 * Simulate applying a completion: compute word boundary, then insertText.
 * This replicates the exact logic from completionPlugin.ts.
 */
function applyCompletion(
  state: EditorState,
  label: string,
  snippetTemplate?: string,
) {
  const text = state.doc.textContent;
  const textStart = 1; // text starts at PM position 1
  const pmPos = state.selection.from;
  const textPos = pmPos - textStart;

  // Word boundary — same logic as plugin
  const before = text.slice(0, textPos);
  const lineStart = before.lastIndexOf('\n') + 1;

  let wordStart = textPos;
  while (wordStart > lineStart && /[a-zA-Z_\-#@]/.test(text[wordStart - 1])) {
    wordStart--;
  }

  const from = wordStart + textStart;
  const to = pmPos;

  // Build insert text
  let insertStr: string;
  let cursorOffset: number | null = null;

  if (snippetTemplate) {
    const firstPlaceholder = snippetTemplate.indexOf('${1:');
    if (firstPlaceholder >= 0) cursorOffset = firstPlaceholder;
    insertStr = snippetTemplate.replace(/\$\{\d+:([^}]+)\}/g, '$1');
  } else {
    insertStr = label;
  }

  let tr = state.tr.insertText(insertStr, from, to);

  if (cursorOffset !== null) {
    const cp = from + cursorOffset;
    tr = tr.setSelection(TextSelection.create(tr.doc, cp));
  }

  const newState = state.apply(tr);
  return {
    text: newState.doc.textContent,
    cursorTextOffset: newState.selection.from - textStart,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('completion integration', () => {
  // First, verify our test helper works
  describe('editor helper', () => {
    it('creates a doc with correct text', () => {
      const e = editor('hello', 5);
      expect(e.getText()).toBe('hello');
    });

    it('places cursor at the right text offset', () => {
      const e = editor('hello', 3);
      expect(e.cursorTextOffset()).toBe(3);
    });

    it('cursor at start of text', () => {
      const e = editor('hello', 0);
      expect(e.cursorTextOffset()).toBe(0);
    });

    it('cursor at end of text', () => {
      const e = editor('hello', 5);
      expect(e.cursorTextOffset()).toBe(5);
    });
  });

  describe('insert after space (no word to replace)', () => {
    it('"fill " + complete "red" → "fill red"', () => {
      const e = editor('box: rect 100x60 fill ', 22);
      const result = applyCompletion(e.state, 'red');
      expect(result.text).toBe('box: rect 100x60 fill red');
    });

    it('"fill " + complete "steelblue" → cursor after steelblue', () => {
      const e = editor('box: rect 100x60 fill ', 22);
      const result = applyCompletion(e.state, 'steelblue');
      expect(result.text).toBe('box: rect 100x60 fill steelblue');
      expect(result.cursorTextOffset).toBe(31);
    });
  });

  describe('replace partial word', () => {
    it('"fi" → "fill color"', () => {
      const e = editor('box: rect 100x60 fi', 19);
      const result = applyCompletion(e.state, 'fill', 'fill ${1:color}');
      expect(result.text).toBe('box: rect 100x60 fill color');
    });

    it('"re" → "rect WxH"', () => {
      const e = editor('box:\n  re', 9); // cursor AFTER "re"
      const result = applyCompletion(e.state, 'rect', 'rect ${1:W}x${2:H}');
      expect(result.text).toBe('box:\n  rect WxH');
    });

    it('"rec" → "rect WxH"', () => {
      const e = editor('rec', 3);
      const result = applyCompletion(e.state, 'rect', 'rect ${1:W}x${2:H}');
      expect(result.text).toBe('rect WxH');
    });
  });

  describe('snippet cursor placement', () => {
    it('cursor at first placeholder in "rect ${1:W}x${2:H}"', () => {
      const e = editor('box:\n  re', 9); // cursor AFTER "re"
      const result = applyCompletion(e.state, 'rect', 'rect ${1:W}x${2:H}');
      // "re" starts at textOffset 7. Snippet placeholder at offset 5.
      expect(result.cursorTextOffset).toBe(7 + 5); // 12
      expect(result.text[12]).toBe('W');
    });

    it('cursor at color placeholder in "fill ${1:color}"', () => {
      const e = editor('box: rect 100x60 fi', 19);
      const result = applyCompletion(e.state, 'fill', 'fill ${1:color}');
      // "fi" starts at textOffset 17. "fill " has ${1:color} at offset 5.
      expect(result.cursorTextOffset).toBe(17 + 5); // 22
    });
  });

  describe('does not eat adjacent values', () => {
    it('does not eat dimension when completing after space', () => {
      const e = editor('box: rect 100x60 ', 17);
      const result = applyCompletion(e.state, 'fill');
      expect(result.text).toBe('box: rect 100x60 fill');
    });

    it('preserves text after cursor when replacing partial word', () => {
      const e = editor('box: rect 100x60 fi at 200,150', 19);
      const result = applyCompletion(e.state, 'fill', 'fill ${1:color}');
      expect(result.text).toBe('box: rect 100x60 fill color at 200,150');
    });
  });

  describe('empty/edge cases', () => {
    it('insert at start of empty second line', () => {
      const e = editor('box: rect 100x60\n', 17);
      const result = applyCompletion(e.state, 'fill', 'fill ${1:color}');
      expect(result.text).toBe('box: rect 100x60\nfill color');
    });

    it('insert on indented line', () => {
      const e = editor('box:\n  ', 7);
      const result = applyCompletion(e.state, 'rect', 'rect ${1:W}x${2:H}');
      expect(result.text).toBe('box:\n  rect WxH');
    });
  });
});
