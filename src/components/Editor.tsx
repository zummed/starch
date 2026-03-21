import { useRef, useEffect, useCallback, useState } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { json } from '@codemirror/lang-json';
import { autocompletion } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching } from '@codemirror/language';
import { lintGutter } from '@codemirror/lint';
import { starchTheme, starchHighlight } from '../editor/theme';
import { starchCompletions } from '../editor/completions';
import { starchLinter } from '../editor/linter';
import { ExportDialog } from './ExportDialog';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  parseError?: string | null;
  width?: number;
  onClose?: () => void;
  /** Override the default v1 linter with a custom one */
  linterExtension?: any;
  /** Override the default v1 completions with a custom source */
  completionSource?: any;
}

export function Editor({ value, onChange, parseError, width = 360, onClose, linterExtension, completionSource }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [saved, setSaved] = useState(false);
  const [showExport, setShowExport] = useState(false);

  const handleSave = useCallback(() => {
    const blob = new Blob([value], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diagram.starch';
    a.click();
    URL.revokeObjectURL(url);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, [value]);

  const handleLoad = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.starch,.json,.json5,.txt';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          onChange(reader.result);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [onChange]);

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
      keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
      EditorState.tabSize.of(2),
      autocompletion({
        override: [completionSource ?? starchCompletions],
        activateOnTyping: true,
      }),
      linterExtension ?? starchLinter,
      lintGutter(),
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
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '6px 14px',
          fontSize: 10,
          color: '#3a3f49',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: FONT,
          flexShrink: 0,
        }}
      >
        <span>JSON5</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={handleLoad}
          style={{
            fontSize: 10, padding: '2px 8px', background: 'transparent',
            color: '#4a4f59', border: '1px solid #2a2d35', borderRadius: 4,
            cursor: 'pointer', fontFamily: FONT,
          }}
          onMouseEnter={e => { (e.currentTarget).style.color = '#8a8f98'; }}
          onMouseLeave={e => { (e.currentTarget).style.color = '#4a4f59'; }}
        >
          Open
        </button>
        <button
          onClick={handleSave}
          style={{
            fontSize: 10, padding: '2px 8px', background: 'transparent',
            color: saved ? '#34d399' : '#4a4f59', border: '1px solid #2a2d35', borderRadius: 4,
            cursor: 'pointer', fontFamily: FONT,
          }}
          onMouseEnter={e => { if (!saved) (e.currentTarget).style.color = '#8a8f98'; }}
          onMouseLeave={e => { if (!saved) (e.currentTarget).style.color = '#4a4f59'; }}
        >
          {saved ? 'Saved!' : 'Save'}
        </button>
        <button
          onClick={() => setShowExport(true)}
          style={{
            fontSize: 10, padding: '2px 8px', background: 'transparent',
            color: '#4a4f59', border: '1px solid #2a2d35', borderRadius: 4,
            cursor: 'pointer', fontFamily: FONT,
          }}
          onMouseEnter={e => { (e.currentTarget).style.color = '#a78bfa'; (e.currentTarget).style.borderColor = '#a78bfa'; }}
          onMouseLeave={e => { (e.currentTarget).style.color = '#4a4f59'; (e.currentTarget).style.borderColor = '#2a2d35'; }}
        >
          Export
        </button>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              fontSize: 10, padding: '2px 8px', background: 'transparent',
              color: '#4a4f59', border: '1px solid #2a2d35', borderRadius: 4,
              cursor: 'pointer', fontFamily: FONT,
            }}
            onMouseEnter={e => { (e.currentTarget).style.color = '#ef4444'; (e.currentTarget).style.borderColor = '#ef4444'; }}
            onMouseLeave={e => { (e.currentTarget).style.color = '#4a4f59'; (e.currentTarget).style.borderColor = '#2a2d35'; }}
          >
            Close
          </button>
        )}
      </div>
      {showExport && <ExportDialog dsl={value} onClose={() => setShowExport(false)} />}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflow: 'auto',
          minHeight: 0,
        }}
      />
    </div>
  );
}
