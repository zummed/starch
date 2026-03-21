/**
 * V2 Editor — backed by the structured editor system.
 * Uses ModelManager, schema-driven completion, v2 linter, and property popups.
 */
import { useRef, useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { json } from '@codemirror/lang-json';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching } from '@codemirror/language';
import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { starchTheme, starchHighlight } from '../../../editor/theme';
import { findValueSpan, formatValue } from '../../editor/textReplace';
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
    dslPath: string;
    key: string;       // the property key clicked on (e.g., "h", "radius")
    cursorPos: number;  // cursor offset in the text, for finding the value span
    value: unknown;
    position: { x: number; y: number };
  } | null>(null);
  const popupOpenRef = useRef(false);

  // Keep ref in sync
  useEffect(() => {
    popupOpenRef.current = popup !== null;
  }, [popup]);

  // Handle click on editor — detect if we clicked on a value and show popup
  const handleEditorClick = useCallback((view: EditorView, event: MouseEvent) => {
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return;

    const doc = view.state.doc.toString();
    const ctx = getCursorContext(doc, pos);

    // Clicking on a property name (like "fill", "rect") — open compound popup
    if (ctx.isPropertyName && ctx.path) {
      // Extract the full word at click position from the text
      const wordMatch = doc.slice(Math.max(0, pos - 20), pos + 20).match(/[\w]+/g);
      let clickedWord = '';
      let searchStart = Math.max(0, pos - 20);
      for (const word of (wordMatch ?? [])) {
        const wordStart = doc.indexOf(word, searchStart);
        const wordEnd = wordStart + word.length;
        if (pos >= wordStart && pos <= wordEnd) {
          clickedWord = word;
          break;
        }
        searchStart = wordEnd;
      }
      if (!clickedWord) clickedWord = ctx.prefix;

      if (clickedWord) {
        const parts = ctx.path.split('.');
        const filtered: string[] = [];
        let i = 0;
        if (parts[0] === 'objects' && parts.length >= 2 && /^\d+$/.test(parts[1])) i = 2;
        else if (parts[0] === 'styles' && parts.length >= 2) i = 2;
        while (i < parts.length) {
          if (parts[i] === 'children' && i + 1 < parts.length && /^\d+$/.test(parts[i + 1])) i += 2;
          else { filtered.push(parts[i]); i++; }
        }
        const schemaPath = filtered.length > 0 ? [...filtered, clickedWord].join('.') : clickedWord;

        const schema = getPropertySchema(schemaPath);
        if (schema) {
          const type = detectSchemaType(schema);
          if (['color', 'object'].includes(type)) {
            const currentValue = extractValueAtCursor(doc, pos, type, clickedWord);
            const coords = view.coordsAtPos(pos);
            if (coords) {
              setPopup({
                schemaPath,
                dslPath: ctx.path,
                key: clickedWord,
                cursorPos: pos,
                value: currentValue,
                position: { x: coords.left, y: coords.bottom + 4 },
              });
              return;
            }
          }
        }
      }
    }

    // Clicking on a value (after the colon)
    if (!ctx.isPropertyName && ctx.currentKey && ctx.path) {
      // Map DSL path to schema path — strip structural segments to get to node property path
      const parts = ctx.path.split('.');
      // Strip objects.N, styles.name, and children.N segments
      const filtered: string[] = [];
      let i = 0;
      // Skip top-level key (objects, styles, animate)
      if (parts[0] === 'objects' && parts.length >= 2 && /^\d+$/.test(parts[1])) {
        i = 2;
      } else if (parts[0] === 'styles' && parts.length >= 2) {
        i = 2;
      }
      // Walk remaining parts, skipping children.N pairs
      while (i < parts.length) {
        if (parts[i] === 'children' && i + 1 < parts.length && /^\d+$/.test(parts[i + 1])) {
          i += 2; // skip children.N
        } else {
          filtered.push(parts[i]);
          i++;
        }
      }
      let schemaPath = filtered.join('.');

      // Append current key if not already at the end
      if (!schemaPath.endsWith(ctx.currentKey)) {
        schemaPath = schemaPath ? `${schemaPath}.${ctx.currentKey}` : ctx.currentKey;
      }

      const schema = getPropertySchema(schemaPath);
      if (!schema) return;

      const type = detectSchemaType(schema);
      // Show popup for types that have widgets (including compound objects)
      if (['number', 'color', 'enum', 'boolean', 'object'].includes(type)) {
        const currentValue = extractValueAtCursor(doc, pos, type, ctx.currentKey);

        const coords = view.coordsAtPos(pos);
        if (coords) {
          setPopup({
            schemaPath,
            dslPath: ctx.path,
            key: ctx.currentKey,
            cursorPos: pos,
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
          // Don't trigger popup logic if a popup is already open
          if (popupOpenRef.current) return false;
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

  // Handle popup value change — surgical text replacement at the value span
  const handlePopupChange = useCallback((newValue: unknown) => {
    if (!popup) return;
    const view = viewRef.current;
    if (!view) return;

    const doc = view.state.doc.toString();
    const span = findValueSpan(doc, popup.cursorPos, popup.key);
    if (!span) return;

    const replacement = formatValue(newValue);

    externalUpdate.current = true;
    view.dispatch({
      changes: { from: span.from, to: span.to, insert: replacement },
    });
    externalUpdate.current = false;

    const newDoc = view.state.doc.toString();
    onChangeRef.current(newDoc);

    // Update popup state — adjust cursorPos for the length change
    const delta = replacement.length - (span.to - span.from);
    setPopup(prev => prev ? { ...prev, value: newValue, cursorPos: prev.cursorPos + delta } : null);
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
      {popup && createPortal(
        <PropertyPopup
          schemaPath={popup.schemaPath}
          value={popup.value}
          position={popup.position}
          onChange={handlePopupChange}
          onClose={() => setPopup(null)}
        />,
        document.body,
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────

function extractValueAtCursor(doc: string, pos: number, type: string, key: string): unknown {
  // Use findValueSpan to get the exact text of the value for this key
  const span = findValueSpan(doc, pos, key);
  if (!span) return type === 'number' ? 0 : type === 'boolean' ? false : null;

  const valueText = doc.slice(span.from, span.to).trim();

  if (type === 'number') {
    const num = parseFloat(valueText);
    return isNaN(num) ? 0 : num;
  }
  if (type === 'boolean') {
    return valueText === 'true';
  }
  if (type === 'enum') {
    return valueText.replace(/^["']|["']$/g, '');
  }
  if (type === 'color') {
    // Parse the HSL object from the value text
    const hMatch = valueText.match(/h:\s*(-?\d+)/);
    const sMatch = valueText.match(/s:\s*(-?\d+)/);
    const lMatch = valueText.match(/l:\s*(-?\d+)/);
    if (hMatch && sMatch && lMatch) {
      return { h: parseInt(hMatch[1]), s: parseInt(sMatch[1]), l: parseInt(lMatch[1]) };
    }
    return { h: 210, s: 80, l: 50 };
  }
  return null;
}
