/**
 * StructuralEditor — ProseMirror code-block editor for Starch DSL.
 *
 * The entire DSL document is a single code_block containing text.
 * Structure comes from parsing and syntax highlighting decorations.
 */
import {
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
  type Ref,
} from 'react';
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { history, undo, redo } from 'prosemirror-history';

import { buildAstFromText } from '../dsl/astParser';
import { syntaxHighlightPlugin } from './plugins/syntaxHighlight';
import { parseOnChangePlugin } from './plugins/parseOnChange';
import { completionPlugin } from './plugins/completionPlugin';
import { clickPopupPlugin } from './plugins/clickPopupPlugin';

import './editorStyles.css';

// ---------------------------------------------------------------------------
// Schema — single code block containing text
// ---------------------------------------------------------------------------

const schema = new Schema({
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

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface StructuralEditorProps {
  initialDsl: string;
  onModelChange: (model: Record<string, any>) => void;
  height?: string;
}

export interface StructuralEditorHandle {
  loadDsl(text: string): void;
  getDsl(): string;
}

// ---------------------------------------------------------------------------
// Editor component
// ---------------------------------------------------------------------------

export const StructuralEditor = forwardRef(function StructuralEditor(
  { initialDsl, onModelChange, height }: StructuralEditorProps,
  ref: Ref<StructuralEditorHandle>,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onModelChangeRef = useRef(onModelChange);
  onModelChangeRef.current = onModelChange;

  function createDoc(text: string) {
    if (!text) {
      return schema.node('doc', null, [schema.node('code_block')]);
    }
    return schema.node('doc', null, [
      schema.node('code_block', null, [schema.text(text)]),
    ]);
  }

  // Mount / unmount
  useEffect(() => {
    if (!containerRef.current) return;

    const doc = createDoc(initialDsl);

    const state = EditorState.create({
      doc,
      plugins: [
        history(),
        keymap({ 'Mod-z': undo, 'Mod-Shift-z': redo, 'Mod-y': redo }),
        completionPlugin(),
        clickPopupPlugin(),
        keymap(baseKeymap),
        syntaxHighlightPlugin(),
        parseOnChangePlugin({
          onModelChange: (model) => onModelChangeRef.current(model),
          debounceMs: 150,
        }),
      ],
    });

    const view = new EditorView(containerRef.current, { state });
    viewRef.current = view;

    // Emit initial model so the diagram renders immediately.
    if (initialDsl.trim()) {
      try {
        const { model } = buildAstFromText(initialDsl);
        onModelChangeRef.current(model);
      } catch { /* parse error on init is ok */ }
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    loadDsl(text: string) {
      const view = viewRef.current;
      if (!view) return;
      const doc = createDoc(text);
      const state = EditorState.create({
        doc,
        plugins: view.state.plugins,
      });
      view.updateState(state);
      // Emit model immediately so the diagram updates
      if (text.trim()) {
        try {
          const { model } = buildAstFromText(text);
          onModelChangeRef.current(model);
        } catch { /* ok */ }
      }
    },
    getDsl() {
      const view = viewRef.current;
      if (!view) return '';
      return view.state.doc.textContent;
    },
  }));

  return (
    <div
      className="starch-editor"
      style={{ height: height ?? '100%', overflow: 'auto' }}
      ref={containerRef}
    />
  );
});
