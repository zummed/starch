/**
 * Shared ProseMirror schema for the Starch DSL editor.
 *
 * The entire DSL document is a single `code_block` of text — structure comes
 * from parsing + syntax-highlight decorations, not the PM node tree. This is
 * the single schema used by both the live editor (StructuralEditor) and the
 * headless EditorSession, so simulated typing exercises the real document shape.
 */
import { Schema } from 'prosemirror-model';

export const dslSchema = new Schema({
  nodes: {
    doc: { content: 'code_block' },
    code_block: {
      content: 'text*',
      code: true,
      defining: true,
      toDOM: () => ['pre', { class: 'dsl-code' }, ['code', 0]] as const,
      parseDOM: [{ tag: 'pre', preserveWhitespace: 'full' as const }],
    },
    text: { group: 'inline' },
  },
});

/** Build a doc node holding `text` in a single code block. */
export function createDslDoc(text: string) {
  if (!text) {
    return dslSchema.node('doc', null, [dslSchema.node('code_block')]);
  }
  return dslSchema.node('doc', null, [
    dslSchema.node('code_block', null, [dslSchema.text(text)]),
  ]);
}

/** Offset between a text offset and its ProseMirror position (doc + code_block open = 1). */
export const PM_OFFSET = 1;
