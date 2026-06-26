/**
 * EditorSession — a headless, browser-free model of the Starch DSL editor.
 *
 * It drives the REAL ProseMirror state and the REAL completion/snippet plugins
 * through real transactions — no EditorView, no DOM. Every keystroke, completion
 * accept, snippet tab, and click-to-edit goes through the same code the live
 * editor runs, so a test (or a script) can "type in the editor" and observe
 * exactly what a user would see.
 *
 *   const s = new EditorSession();
 *   s.type('box: re');
 *   s.triggerCompletion();          // Ctrl+Space
 *   s.availableLabels();            // ['rect', ...]
 *   s.accept('rect');               // inserts snippet "rect WxH", selects W
 *   s.type('140'); s.tab(); s.type('80'); s.tab();
 *   s.text;                          // "box: rect 140x80 "
 *   s.model();                       // parsed model (the "idea")
 *   s.clickEdit(s.text.indexOf('140'), 200);  // popup edit
 */
import { EditorState, TextSelection } from 'prosemirror-state';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { history, undo, redo } from 'prosemirror-history';

import { dslSchema, createDslDoc, PM_OFFSET } from './schema';
import {
  completionPlugin,
  completionKey,
  getCompletionsFromState,
  acceptCompletion,
  type CompletionState,
} from './plugins/completionPlugin';
import { snippetPlugin, snippetKey, advanceSnippet, exitSnippet } from './plugins/snippetPlugin';
import type { CompletionItem } from '../dsl/astCompletions';
import {
  resolveEditTarget, resolvePropertySchema, serializeLeafValue, serializeFieldValue,
  parseCompoundText, rebuildCompoundText, parseNodeKwargs, rebuildNodeKwargs,
  type EditTarget,
} from './popupEdit';
import { detectSchemaType } from '../types/schemaRegistry';
import { walkDocument } from '../dsl/schemaWalker';
import { registerBuiltinTemplates } from '../templates/index';

const EMPTY_COMPLETION: CompletionState = {
  active: false, items: [], selectedIndex: 0, from: 0, to: 0,
};

export class EditorSession {
  state: EditorState;

  constructor(initialText = '') {
    // The live app registers templates via parseScene; do the same here so
    // shape-set and template-prop completions work in a standalone session.
    registerBuiltinTemplates();
    this.state = EditorState.create({
      doc: createDslDoc(initialText),
      plugins: [
        history(),
        keymap({ 'Mod-z': undo, 'Mod-Shift-z': redo, 'Mod-y': redo }),
        snippetPlugin(),
        completionPlugin(),
        keymap(baseKeymap),
      ],
    });
    this.moveToEnd();
  }

  // ─── Text + selection ──────────────────────────────────────────

  get text(): string {
    return this.state.doc.textContent;
  }

  /** Cursor as a text offset (selection head). */
  get cursor(): number {
    return this.state.selection.from - PM_OFFSET;
  }

  /** Current selection as text offsets. */
  get selection(): { from: number; to: number } {
    return {
      from: this.state.selection.from - PM_OFFSET,
      to: this.state.selection.to - PM_OFFSET,
    };
  }

  private clampPm(textPos: number): number {
    const max = this.state.doc.content.size;
    return Math.max(PM_OFFSET, Math.min(textPos + PM_OFFSET, max));
  }

  /** Move the cursor to a text offset. */
  moveTo(textPos: number): this {
    const pm = this.clampPm(textPos);
    this.state = this.state.apply(
      this.state.tr.setSelection(TextSelection.create(this.state.doc, pm)),
    );
    return this;
  }

  moveToEnd(): this {
    return this.moveTo(this.text.length);
  }

  /** Select a text range (e.g. to emulate an active placeholder). */
  select(from: number, to: number): this {
    this.state = this.state.apply(
      this.state.tr.setSelection(
        TextSelection.create(this.state.doc, this.clampPm(from), this.clampPm(to)),
      ),
    );
    return this;
  }

  /**
   * Type text one character at a time, exactly as a user would — each keystroke
   * is its own transaction, so completion re-filtering and snippet placeholder
   * remapping run per character. A non-empty selection (e.g. a snippet
   * placeholder) is replaced by the first character.
   */
  type(str: string): this {
    for (const ch of str) {
      const { from, to } = this.state.selection;
      this.state = this.state.apply(this.state.tr.insertText(ch, from, to));
    }
    return this;
  }

  /** Backspace `n` times: deletes a non-empty selection, else one char back. */
  backspace(n = 1): this {
    for (let i = 0; i < n; i++) {
      const { from, to } = this.state.selection;
      if (from !== to) {
        this.state = this.state.apply(this.state.tr.delete(from, to));
        continue;
      }
      if (from <= PM_OFFSET) break;
      this.state = this.state.apply(this.state.tr.delete(from - 1, from));
    }
    return this;
  }

  /** Replace the whole document (like loadDsl), cursor to end by default. */
  setText(text: string, cursor?: number): this {
    this.state = EditorState.create({ doc: createDslDoc(text), plugins: this.state.plugins });
    return cursor === undefined ? this.moveToEnd() : this.moveTo(cursor);
  }

  // ─── Completion (the menu) ─────────────────────────────────────

  /** Open the completion menu at the cursor (Ctrl+Space). */
  triggerCompletion(): this {
    this.state = this.state.apply(
      this.state.tr.setMeta(completionKey, getCompletionsFromState(this.state)),
    );
    return this;
  }

  /** The active menu state, or null when closed. */
  menu(): CompletionState | null {
    const cs = completionKey.getState(this.state);
    return cs && cs.active ? cs : null;
  }

  menuOpen(): boolean {
    return this.menu() !== null;
  }

  /** Items currently shown in the menu (empty if closed). */
  completionItems(): CompletionItem[] {
    return this.menu()?.items ?? [];
  }

  completionLabels(): string[] {
    return this.completionItems().map(i => i.label);
  }

  /**
   * Completions that WOULD be offered at the cursor right now, computed fresh
   * (independent of whether the menu is open). This is what a Ctrl+Space would
   * show — the canonical "what can I type here" query.
   */
  availableCompletions(): CompletionItem[] {
    const cs = getCompletionsFromState(this.state);
    return cs.active ? cs.items : [];
  }

  availableLabels(): string[] {
    return this.availableCompletions().map(i => i.label);
  }

  /** Move the menu selection (ArrowDown / ArrowUp). */
  selectNext(): this {
    const cs = this.menu();
    if (cs) {
      const i = (cs.selectedIndex + 1) % cs.items.length;
      this.state = this.state.apply(this.state.tr.setMeta(completionKey, { ...cs, selectedIndex: i }));
    }
    return this;
  }

  selectPrev(): this {
    const cs = this.menu();
    if (cs) {
      const i = (cs.selectedIndex - 1 + cs.items.length) % cs.items.length;
      this.state = this.state.apply(this.state.tr.setMeta(completionKey, { ...cs, selectedIndex: i }));
    }
    return this;
  }

  /**
   * Accept a completion. With no argument, accepts the currently selected menu
   * item (opening the menu first if needed). A string accepts the item with
   * that label; a number accepts by index. Drives the real acceptCompletion
   * (snippet activation included).
   */
  accept(target?: string | number): this {
    let cs = this.menu();
    if (!cs) {
      const fresh = getCompletionsFromState(this.state);
      if (!fresh.active) return this;
      cs = fresh;
    }
    let item: CompletionItem | undefined;
    if (typeof target === 'string') item = cs.items.find(i => i.label === target);
    else if (typeof target === 'number') item = cs.items[target];
    else item = cs.items[cs.selectedIndex];
    if (!item) throw new Error(`accept: no completion ${JSON.stringify(target)} in [${cs.items.map(i => i.label).join(', ')}]`);
    this.state = acceptCompletion(this.state, cs, item);
    return this;
  }

  /** Close the completion menu (Escape), keeping snippet state. */
  closeMenu(): this {
    this.state = this.state.apply(this.state.tr.setMeta(completionKey, EMPTY_COMPLETION));
    return this;
  }

  // ─── Snippet placeholders ──────────────────────────────────────

  snippetActive(): boolean {
    return snippetKey.getState(this.state)?.active ?? false;
  }

  /**
   * Press Tab. Mirrors the live plugin order (snippet plugin first, then
   * completion): an active snippet advances to the next placeholder; otherwise
   * an open completion menu accepts the selected item.
   */
  tab(): this {
    if (this.snippetActive()) {
      this.state = advanceSnippet(this.state);
      return this;
    }
    if (this.menu()) return this.accept();
    return this;
  }

  /**
   * Press Escape. Mirrors live plugin order: an active snippet is exited (and
   * the menu is left as-is, since the snippet plugin intercepts first);
   * otherwise the completion menu closes.
   */
  escape(): this {
    if (this.snippetActive()) {
      this.state = exitSnippet(this.state);
      return this;
    }
    return this.closeMenu();
  }

  // ─── Click-to-edit (popup) ─────────────────────────────────────

  /** The editable target a click at `textPos` would open, or null. */
  editTargetAt(textPos: number): EditTarget | null {
    return resolveEditTarget(this.text, textPos);
  }

  /**
   * Emulate clicking a LEAF value (color/number/enum/anchor/string) at
   * `textPos` and committing `newValue` in the popup — the real text-surgery
   * path. Throws on a compound/object target (use clickEditField for those),
   * matching the editor, which opens a multi-field CompoundPopup there.
   */
  clickEdit(textPos: number, newValue: unknown): this {
    const target = resolveEditTarget(this.text, textPos);
    if (!target) return this;
    if (target.schemaType === 'object') {
      throw new Error(`clickEdit at ${textPos} hit a compound (${target.schemaPath}); use clickEditField`);
    }
    const replacement = serializeLeafValue(target.schemaType, newValue);
    this.state = this.state.apply(
      this.state.tr.insertText(replacement, target.from + PM_OFFSET, target.to + PM_OFFSET),
    );
    return this;
  }

  /**
   * Emulate editing one field of a compound/object popup (clicking a keyword
   * like `rect`/`stroke`, or the node id for `_node` kwargs) and committing a
   * field value — the real CompoundPopup rebuild path (rebuildCompoundText /
   * rebuildNodeKwargs), not a raw value splice.
   */
  clickEditField(textPos: number, field: string, value: unknown): this {
    const target = resolveEditTarget(this.text, textPos);
    if (!target || target.schemaType !== 'object') return this;
    const currentText = this.text.slice(target.from, target.to);
    let rebuilt: string;
    if (target.schemaPath === '_node') {
      const fields = parseNodeKwargs(currentText);
      fields[field] = String(value);
      rebuilt = rebuildNodeKwargs(currentText, fields);
    } else {
      const fields = parseCompoundText(currentText, target.schemaPath);
      const fieldSchema = resolvePropertySchema(`${target.schemaPath}.${field}`);
      const fieldType = fieldSchema ? detectSchemaType(fieldSchema) : 'string';
      fields[field] = serializeFieldValue(fieldType, value);
      const keyword = currentText.split(/\s+/)[0];
      rebuilt = rebuildCompoundText(keyword, fields, target.schemaPath);
    }
    this.state = this.state.apply(
      this.state.tr.insertText(rebuilt, target.from + PM_OFFSET, target.to + PM_OFFSET),
    );
    return this;
  }

  // ─── The idea ──────────────────────────────────────────────────

  /** Parse the current text into the model (the "idea"). */
  model(): Record<string, any> {
    return walkDocument(this.text).model;
  }
}

export { dslSchema };
