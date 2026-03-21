/**
 * V2 Editor — backed by the structured editor system.
 * Uses ModelManager, schema-driven completion, v2 linter, and property popups.
 */
import { useRef, useEffect, useCallback, useState } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { json } from '@codemirror/lang-json';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching } from '@codemirror/language';
import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { starchTheme, starchHighlight } from '../../../editor/theme';
import { parseScene } from '../../parser/parser';
import { getCompletions } from '../../editor/completionSource';
import { getCursorContext } from '../../editor/cursorPath';
import {
  getPropertySchema,
  detectSchemaType,
  getEnumValues,
  getNumberConstraints,
} from '../../types/schemaRegistry';
import { PropertyPopup } from '../../editor/popups/PropertyPopup';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";

// ─── V2 Linter ──────────────────────────────────────────────────

const v2EditorLinter = linter((view) => {
  const doc = view.state.doc.toString();
  if (!doc.trim()) return [];
  const diagnostics: Diagnostic[] = [];
  try {
    parseScene(doc);
  } catch (e: unknown) {
    const err = e as Error & { lineNumber?: number; columnNumber?: number };
    const msg = err.message.replace(/^JSON5 parse error:\s*/, '').replace(/^JSON5:\s*/, '');
    if (err.lineNumber) {
      const lineNum = Math.min(err.lineNumber, view.state.doc.lines);
      const line = view.state.doc.line(lineNum);
      const col = Math.min((err.columnNumber || 1) - 1, line.length);
      const from = line.from + Math.max(0, col);
      diagnostics.push({ from, to: Math.min(from + 1, line.to), severity: 'error', message: msg });
    } else {
      diagnostics.push({ from: 0, to: Math.min(1, doc.length), severity: 'error', message: msg });
    }
  }
  return diagnostics;
}, { delay: 300 });

// ─── V2 Completion Source ───────────────────────────────────────

function v2CompletionSource(context: CompletionContext): CompletionResult | null {
  const doc = context.state.doc.toString();
  const pos = context.pos;

  const items = getCompletions(doc, pos);
  if (items.length === 0) return null;

  // Find where the current word starts for replacement range
  let from = pos;
  const textBefore = doc.slice(Math.max(0, pos - 50), pos);
  const wordMatch = textBefore.match(/[\w]+$/);
  if (wordMatch) {
    from = pos - wordMatch[0].length;
  }

  return {
    from,
    options: items.map(item => ({
      label: item.label,
      detail: item.detail,
      info: item.info,
      apply: item.insertText,
      type: item.type === 'property' ? 'property' : item.type === 'value' ? 'constant' : 'keyword',
    })),
  };
}

// ─── Editor Component ───────────────────────────────────────────

interface V2EditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function V2Editor({ value, onChange }: V2EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const externalUpdate = useRef(false);

  // Property popup state
  const [popup, setPopup] = useState<{
    schemaPath: string;
    value: unknown;
    position: { x: number; y: number };
  } | null>(null);

  // Handle click on editor — detect if we clicked on a value and show popup
  const handleEditorClick = useCallback((view: EditorView, event: MouseEvent) => {
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return;

    const doc = view.state.doc.toString();
    const ctx = getCursorContext(doc, pos);

    if (!ctx.isPropertyName && ctx.currentKey && ctx.path) {
      // Map DSL path to schema path
      const parts = ctx.path.split('.');
      let schemaPath = ctx.path;
      if (parts[0] === 'objects' && parts.length >= 2 && /^\d+$/.test(parts[1])) {
        schemaPath = parts.slice(2).join('.');
      }

      // Check if this path ends with the current key already
      if (!schemaPath.endsWith(ctx.currentKey)) {
        schemaPath = schemaPath ? `${schemaPath}.${ctx.currentKey}` : ctx.currentKey;
      }

      const schema = getPropertySchema(schemaPath);
      if (!schema) return;

      const type = detectSchemaType(schema);
      // Only show popup for types that have widgets
      if (['number', 'color', 'enum', 'boolean'].includes(type)) {
        // Get the current value from the text (rough extraction)
        const currentValue = extractValueAtCursor(doc, pos, type);

        const coords = view.coordsAtPos(pos);
        if (coords) {
          setPopup({
            schemaPath,
            value: currentValue,
            position: { x: coords.left, y: coords.bottom + 4 },
          });
        }
      }
    }
  }, []);

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
        override: [v2CompletionSource],
        activateOnTyping: true,
      }),
      v2EditorLinter,
      lintGutter(),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !externalUpdate.current) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
      EditorView.domEventHandlers({
        click: (event, view) => {
          // Delay to let cursor settle
          setTimeout(() => handleEditorClick(view, event), 50);
          return false;
        },
      }),
    ],
    [handleEditorClick],
  );

  // Mount editor
  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: createExtensions(),
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Sync external value changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      externalUpdate.current = true;
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
      externalUpdate.current = false;
    }
  }, [value]);

  // Handle popup value change
  const handlePopupChange = useCallback((newValue: unknown) => {
    if (!popup) return;
    // For now, just log — proper integration would update the model
    // and re-serialize. This will be connected through ModelManager.
    console.log('Popup change:', popup.schemaPath, newValue);
  }, [popup]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflow: 'auto',
          fontSize: 12,
          fontFamily: FONT,
        }}
      />
      {popup && (
        <PropertyPopup
          schemaPath={popup.schemaPath}
          value={popup.value}
          position={popup.position}
          onChange={handlePopupChange}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────

function extractValueAtCursor(doc: string, pos: number, type: string): unknown {
  // Simple extraction — look for the value after the colon near the cursor
  const before = doc.slice(Math.max(0, pos - 100), pos);
  const after = doc.slice(pos, Math.min(doc.length, pos + 100));

  if (type === 'number') {
    const numMatch = (before + after).match(/:\s*(-?\d+\.?\d*)/);
    return numMatch ? parseFloat(numMatch[1]) : 0;
  }
  if (type === 'boolean') {
    const boolMatch = (before + after).match(/:\s*(true|false)/);
    return boolMatch ? boolMatch[1] === 'true' : false;
  }
  if (type === 'enum') {
    const enumMatch = (before + after).match(/:\s*"([^"]+)"/);
    return enumMatch ? enumMatch[1] : '';
  }
  if (type === 'color') {
    // Try to extract HSL object
    const hMatch = (before + after).match(/h:\s*(\d+)/);
    const sMatch = (before + after).match(/s:\s*(\d+)/);
    const lMatch = (before + after).match(/l:\s*(\d+)/);
    if (hMatch && sMatch && lMatch) {
      return { h: parseInt(hMatch[1]), s: parseInt(sMatch[1]), l: parseInt(lMatch[1]) };
    }
    return { h: 210, s: 80, l: 50 };
  }
  return null;
}
