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
  AnimConfigSchema,
} from '../../types/schemaRegistry';
import { PropertyPopup } from '../../editor/popups/PropertyPopup';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";

// ─── DSL path to schema resolution ──────────────────────────────

function resolveDslPath(dslPath: string): { schemaPath: string; rootSchema?: import('zod').ZodType } {
  const parts = dslPath.split('.');
  const filtered: string[] = [];
  let i = 0;
  let rootSchema: import('zod').ZodType | undefined;

  if (parts[0] === 'objects' && parts.length >= 2 && /^\d+$/.test(parts[1])) {
    i = 2;
  } else if (parts[0] === 'styles' && parts.length >= 2) {
    i = 2;
  } else if (parts[0] === 'animate') {
    i = 1;
    rootSchema = AnimConfigSchema;
  }

  while (i < parts.length) {
    if (parts[i] === 'children' && i + 1 < parts.length && /^\d+$/.test(parts[i + 1])) {
      i += 2;
    } else {
      filtered.push(parts[i]);
      i++;
    }
  }

  return { schemaPath: filtered.join('.'), rootSchema };
}

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
        const { schemaPath: basePath, rootSchema } = resolveDslPath(ctx.path);
        const schemaPath = basePath ? `${basePath}.${clickedWord}` : clickedWord;

        const schema = getPropertySchema(schemaPath, rootSchema);
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

    // Clicking on a value (after the colon or inside an array)
    if (!ctx.isPropertyName && ctx.path) {
      const { schemaPath: basePath, rootSchema } = resolveDslPath(ctx.path);
      let schemaPath = basePath;

      // Append current key if not already at the end
      if (ctx.currentKey && !schemaPath.endsWith(ctx.currentKey)) {
        schemaPath = schemaPath ? `${schemaPath}.${ctx.currentKey}` : ctx.currentKey;
      }

      let schema = getPropertySchema(schemaPath, rootSchema);
      if (!schema) return;

      let type = detectSchemaType(schema);

      // If we're inside a tuple element (e.g., number inside [250, 100]),
      // check if the parent is a pointref and show that popup instead
      if (type === 'number' && /\.\d+$/.test(schemaPath)) {
        const parentPath = schemaPath.replace(/\.\d+$/, '');
        const parentSchema = getPropertySchema(parentPath, rootSchema);
        if (parentSchema && detectSchemaType(parentSchema) === 'pointref') {
          schemaPath = parentPath;
          schema = parentSchema;
          type = 'pointref';
        }
      }

      // Show popup for types that have widgets
      if (['number', 'color', 'enum', 'boolean', 'object', 'pointref'].includes(type)) {
        const key = ctx.currentKey || schemaPath.split('.').pop() || '';
        const currentValue = extractValueAtCursor(doc, pos, type, key);

        const coords = view.coordsAtPos(pos);
        if (coords) {
          setPopup({
            schemaPath,
            dslPath: ctx.path,
            key: key,
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
    let span = findValueSpan(doc, popup.cursorPos, popup.key);

    // For PointRef inside arrays (key is numeric), find the enclosing [...] or "..."
    if (!span && /^\d+$/.test(popup.key)) {
      span = findEnclosingValue(doc, popup.cursorPos);
    }
    if (!span) return;

    const replacement = formatValue(newValue);

    externalUpdate.current = true;
    view.dispatch({
      changes: { from: span.from, to: span.to, insert: replacement },
    });
    externalUpdate.current = false;

    const newDoc = view.state.doc.toString();
    onChangeRef.current(newDoc);

    // Update popup state — place cursor inside the replacement
    setPopup(prev => prev ? { ...prev, value: newValue, cursorPos: span.from + 1 } : null);
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

/**
 * Find the enclosing [...] or "..." value around a cursor position.
 * Used for PointRef values inside arrays where there's no key to search for.
 */
function findEnclosingValue(doc: string, pos: number): { from: number; to: number } | null {
  // Search backward for [ or "
  let start = pos;
  let depth = 0;
  while (start > 0) {
    start--;
    if (doc[start] === ']') depth++;
    if (doc[start] === '[') {
      if (depth === 0) break;
      depth--;
    }
    if (doc[start] === '"' && depth === 0) {
      // Find the closing quote
      const end = doc.indexOf('"', start + 1);
      if (end >= 0) return { from: start, to: end + 1 };
      return null;
    }
  }
  if (doc[start] === '[') {
    // Find matching ]
    let d = 1;
    let end = start + 1;
    while (end < doc.length && d > 0) {
      if (doc[end] === '[') d++;
      if (doc[end] === ']') d--;
      end++;
    }
    return { from: start, to: end };
  }
  return null;
}

function extractValueAtCursor(doc: string, pos: number, type: string, key: string): unknown {
  // For pointref inside arrays, use enclosing value search instead of key-based search
  if (type === 'pointref' && /^\d+$/.test(key)) {
    const enclosing = findEnclosingValue(doc, pos);
    if (enclosing) {
      const valueText = doc.slice(enclosing.from, enclosing.to).trim();
      try {
        const parsed = JSON.parse(valueText);
        if (Array.isArray(parsed)) return parsed;
      } catch { /* not JSON */ }
      // Might be a quoted string
      if (valueText.startsWith('"') && valueText.endsWith('"')) {
        return valueText.slice(1, -1);
      }
    }
    return [0, 0];
  }

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
    const hMatch = valueText.match(/h:\s*(-?\d+)/);
    const sMatch = valueText.match(/s:\s*(-?\d+)/);
    const lMatch = valueText.match(/l:\s*(-?\d+)/);
    if (hMatch && sMatch && lMatch) {
      return { h: parseInt(hMatch[1]), s: parseInt(sMatch[1]), l: parseInt(lMatch[1]) };
    }
    return { h: 210, s: 80, l: 50 };
  }
  if (type === 'object') {
    const result: Record<string, unknown> = {};
    const kvPattern = /(\w+):\s*(-?\d+\.?\d*|true|false|"[^"]*")/g;
    let m;
    while ((m = kvPattern.exec(valueText)) !== null) {
      const val = m[2];
      if (val === 'true') result[m[1]] = true;
      else if (val === 'false') result[m[1]] = false;
      else if (val.startsWith('"')) result[m[1]] = val.slice(1, -1);
      else result[m[1]] = parseFloat(val);
    }
    return result;
  }
  if (type === 'pointref') {
    // Find the enclosing [...] or "..." around the cursor
    // Search backward for [ or " and forward for ] or "
    const region = doc.slice(Math.max(0, pos - 50), Math.min(doc.length, pos + 50));
    const regionStart = Math.max(0, pos - 50);

    // Try to find a [...] containing the cursor
    for (let start = pos - regionStart; start >= 0; start--) {
      if (region[start] === '[') {
        const end = region.indexOf(']', start);
        if (end >= 0) {
          const inner = region.slice(start, end + 1);
          try {
            const parsed = JSON.parse(inner);
            if (Array.isArray(parsed)) return parsed;
          } catch { /* not valid JSON */ }
        }
        break;
      }
      if (region[start] === '"') {
        const end = region.indexOf('"', start + 1);
        if (end >= 0) {
          return region.slice(start + 1, end);
        }
        break;
      }
    }
    return [0, 0];
  }
  return null;
}
