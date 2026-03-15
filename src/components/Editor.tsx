import { useRef, useEffect, useCallback } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { json } from '@codemirror/lang-json';
import { autocompletion } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching } from '@codemirror/language';
import { starchTheme, starchHighlight } from '../editor/theme';
import { starchCompletions } from '../editor/completions';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  parseError?: string | null;
  width?: number;
}

export function Editor({ value, onChange, parseError, width = 360 }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Track whether an update came from us (external value sync) to avoid echo
  const externalUpdate = useRef(false);

  const createExtensions = useCallback(
    () => [
      json(),
      starchTheme,
      starchHighlight,
      lineNumbers(),
      highlightActiveLine(),
      bracketMatching(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      autocompletion({
        override: [starchCompletions],
        activateOnTyping: true,
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !externalUpdate.current) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
    ],
    [],
  );

  // Initialize CodeMirror on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: createExtensions(),
      }),
      parent: containerRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes into CodeMirror
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== value) {
      externalUpdate.current = true;
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      });
      externalUpdate.current = false;
    }
  }, [value]);

  return (
    <div
      style={{
        width,
        borderRight: '1px solid #1a1d24',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: '10px 14px 6px',
          fontSize: 10,
          color: '#3a3f49',
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: FONT,
        }}
      >
        <span>JSON5</span>
        {parseError && <span style={{ color: '#ef4444' }}>Parse error</span>}
      </div>
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflow: 'hidden',
        }}
      />
    </div>
  );
}
