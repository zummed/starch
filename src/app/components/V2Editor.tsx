/**
 * V2 Editor — backed by the structured editor system.
 * Uses ModelManager, schema-driven completion, v2 linter, and property popups.
 * Supports toggling between JSON5 and DSL view modes.
 */
import { useRef, useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditorView, keymap, lineNumbers, highlightActiveLine, hoverTooltip, type Tooltip, GutterMarker, gutter } from '@codemirror/view';
import { EditorState, Compartment, type Extension, StateField, StateEffect, RangeSet } from '@codemirror/state';
import { json } from '@codemirror/lang-json';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching } from '@codemirror/language';
import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { starchTheme, starchHighlight } from '../../editor/theme';
import { findValueSpan, formatValue } from '../../editor/textReplace';
import { resolveDslClick, applyDslPopupChange, type DslClickTarget } from '../../editor/dslClickTarget';
import { parseScene } from '../../parser/parser';
import { getCompletions } from '../../editor/completionSource';
import { getCursorContext } from '../../editor/cursorPath';
import { getDslCursorContext } from '../../editor/dslCursorPath';
import { getDslCompletions } from '../../editor/dslCompletionSource';
import { lintDsl } from '../../editor/dslLinter';
import { parseDsl } from '../../dsl/parser';
import { generateDsl } from '../../dsl/generator';
import JSON5 from 'json5';
import {
  getPropertySchema,
  getPropertyDescription,
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

// ─── V2 Linter (JSON5 mode) ──────────────────────────────────────

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

// ─── V2 Linter (DSL mode) ───────────────────────────────────────

const dslEditorLinter = linter((view) => {
  const doc = view.state.doc.toString();
  if (!doc.trim()) return [];
  const diags = lintDsl(doc);
  return diags.map(d => {
    const lineNum = Math.min(d.line, view.state.doc.lines);
    const line = view.state.doc.line(lineNum);
    const col = Math.min(d.col - 1, line.length);
    const from = line.from + Math.max(0, col);
    return {
      from,
      to: Math.min(from + 1, line.to),
      severity: d.severity as 'error' | 'warning' | 'info',
      message: d.message,
    };
  });
}, { delay: 300 });

// ─── V2 Completion Source (JSON5 mode) ───────────────────────────

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

// ─── V2 Completion Source (DSL mode) ────────────────────────────

function dslCompletionSource(context: CompletionContext): CompletionResult | null {
  // Only activate if there's a word being typed or it's explicit (Ctrl+Space)
  const wordBefore = context.matchBefore(/[\w@]+/);
  if (!context.explicit && !wordBefore) return null;

  const doc = context.state.doc.toString();
  const pos = context.pos;

  const items = getDslCompletions(doc, pos);
  if (items.length === 0) return null;

  const from = wordBefore ? wordBefore.from : pos;

  return {
    from,
    options: items.map(item => ({
      label: item.label,
      detail: item.detail,
      type: item.type === 'property' ? 'property' : item.type === 'value' ? 'constant' : 'keyword',
    })),
  };
}

// ─── Hover Tooltip ───────────────────────────────────────────────

function createHoverTooltipSource(formatRef: { current: 'json5' | 'dsl' }) {
  return hoverTooltip((view, pos) => {
    const doc = view.state.doc.toString();
    const ctx = formatRef.current === 'dsl'
      ? getDslCursorContext(doc, pos)
      : getCursorContext(doc, pos);

    if (!ctx.path) return null;

    // Determine the schema path
    const { schemaPath: basePath, rootSchema } = resolveDslPath(ctx.path);
    let schemaPath = basePath;

    // Append key if at a value position
    if (!ctx.isPropertyName && ctx.currentKey && !schemaPath.endsWith(ctx.currentKey)) {
      schemaPath = schemaPath ? `${schemaPath}.${ctx.currentKey}` : ctx.currentKey;
    }

    // If at a property name position, try to get the word at hover position
    if (ctx.isPropertyName) {
      // Extract the word at hover position
      const line = view.state.doc.lineAt(pos);
      const lineText = line.text;
      const lineOffset = pos - line.from;
      const wordMatch = lineText.slice(0, lineOffset + 20).match(/\b(\w+)$/);
      if (!wordMatch) return null;
      const word = lineText.slice(lineOffset).match(/^\w*/)?.[0] || '';
      const fullWord = (wordMatch[1] || '') + word.slice(wordMatch[1]?.length || 0);
      // Get word boundaries
      const wordStart = lineText.lastIndexOf(fullWord, lineOffset);
      if (wordStart < 0) return null;
      const wordBefore = lineText.substring(Math.max(0, lineOffset - 20), lineOffset);
      const wm = wordBefore.match(/(\w+)$/);
      if (!wm) return null;
      const hoveredWord = wm[1];
      schemaPath = basePath ? `${basePath}.${hoveredWord}` : hoveredWord;
    }

    if (!schemaPath) return null;

    const description = getPropertyDescription(schemaPath, rootSchema);
    const schema = getPropertySchema(schemaPath, rootSchema);
    if (!description && !schema) return null;

    const type = schema ? detectSchemaType(schema) : 'unknown';

    return {
      pos,
      above: true,
      create() {
        const dom = document.createElement('div');
        dom.style.cssText = 'padding: 4px 8px; font-size: 11px; font-family: monospace; max-width: 300px;';

        const pathEl = document.createElement('div');
        pathEl.style.cssText = 'color: #a78bfa; font-weight: bold; margin-bottom: 2px;';
        pathEl.textContent = schemaPath;
        dom.appendChild(pathEl);

        if (description) {
          const descEl = document.createElement('div');
          descEl.style.cssText = 'color: #c9cdd4;';
          descEl.textContent = description;
          dom.appendChild(descEl);
        }

        const typeEl = document.createElement('div');
        typeEl.style.cssText = 'color: #6b7280; font-size: 10px; margin-top: 2px;';
        typeEl.textContent = `Type: ${type}`;
        dom.appendChild(typeEl);

        return { dom };
      },
    } satisfies Tooltip;
  }, { hoverTime: 400 });
}

// ─── DSL Node Inline/Block Toggle Gutter ─────────────────────────

const NODE_LINE_RE = /^(\s*)(\w+)\s*:/;

/** Detect node lines in DSL text and return line numbers + node IDs. */
function findNodeLines(text: string): Array<{ lineNum: number; nodeId: string; indent: number }> {
  const lines = text.split('\n');
  const result: Array<{ lineNum: number; nodeId: string; indent: number }> = [];
  const DOC_KW = new Set(['name', 'description', 'background', 'viewport', 'images', 'style', 'animate']);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(NODE_LINE_RE);
    if (m && !DOC_KW.has(m[2])) {
      result.push({ lineNum: i + 1, nodeId: m[2], indent: m[1].length });
    }
  }
  return result;
}

class NodeToggleMarker extends GutterMarker {
  constructor(readonly nodeId: string, readonly isBlock: boolean) {
    super();
  }
  toDOM() {
    const span = document.createElement('span');
    span.style.cssText = 'cursor: pointer; font-size: 10px; color: #4a4f59; user-select: none; padding: 0 2px;';
    span.textContent = this.isBlock ? '\u25BC' : '\u25B6'; // down triangle = block, right triangle = inline
    span.title = this.isBlock ? 'Collapse to inline' : 'Expand to block';
    return span;
  }
}

function createNodeToggleGutter(
  formatRef: { current: 'json5' | 'dsl' },
  nodeFormatsRef: { current: Record<string, 'inline' | 'block'> },
  onToggle: (nodeId: string) => void,
): Extension {
  return gutter({
    class: 'cm-dsl-toggle-gutter',
    lineMarker(view, line) {
      if (formatRef.current !== 'dsl') return null;
      const lineText = view.state.doc.sliceString(line.from, line.to);
      const m = lineText.match(NODE_LINE_RE);
      if (!m) return null;
      const nodeId = m[2];
      const DOC_KW = new Set(['name', 'description', 'background', 'viewport', 'images', 'style', 'animate']);
      if (DOC_KW.has(nodeId)) return null;
      const isBlock = nodeFormatsRef.current[nodeId] === 'block';
      return new NodeToggleMarker(nodeId, isBlock);
    },
    domEventHandlers: {
      click(view, line) {
        if (formatRef.current !== 'dsl') return false;
        const lineText = view.state.doc.sliceString(line.from, line.to);
        const m = lineText.match(NODE_LINE_RE);
        if (!m) return false;
        const nodeId = m[2];
        const DOC_KW = new Set(['name', 'description', 'background', 'viewport', 'images', 'style', 'animate']);
        if (DOC_KW.has(nodeId)) return false;
        onToggle(nodeId);
        return true;
      },
    },
  });
}

// ─── Editor Component ───────────────────────────────────────────

interface V2EditorProps {
  value: string;
  onChange: (value: string) => void;
  viewFormat?: 'json5' | 'dsl';
  onViewFormatChange?: (format: 'json5' | 'dsl') => void;
  nodeFormats?: Record<string, 'inline' | 'block'>;
  onNodeFormatsChange?: (formats: Record<string, 'inline' | 'block'>) => void;
}

export function V2Editor({ value, onChange, viewFormat = 'json5', onViewFormatChange, nodeFormats, onNodeFormatsChange }: V2EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const externalUpdate = useRef(false);

  // View format state (use prop or internal state)
  const [internalFormat, setInternalFormat] = useState<'json5' | 'dsl'>(viewFormat);
  const currentFormat = onViewFormatChange ? viewFormat : internalFormat;
  const formatRef = useRef(currentFormat);
  formatRef.current = currentFormat;

  // Track the last valid JSON5 text (canonical storage)
  const json5TextRef = useRef(value);
  // Track last valid raw scene for DSL generation
  const lastValidRawRef = useRef<any>(null);

  // Flag to suppress useEffect editor overwrite during popup edits.
  // When a popup change updates the canonical JSON5 and notifies the parent,
  // the parent re-renders with a new `value` prop. Without this flag, the
  // useEffect([value]) would regenerate DSL and overwrite the editor, which
  // invalidates the popup target's spans (causing corruption on next drag).
  const popupEditingRef = useRef(false);

  // Node formats for DSL inline/block toggle
  const nodeFormatsRef = useRef<Record<string, 'inline' | 'block'>>(nodeFormats || {});
  if (nodeFormats) nodeFormatsRef.current = nodeFormats;

  // CodeMirror compartments for dynamic reconfiguration
  const langCompartment = useRef(new Compartment());
  const linterCompartment = useRef(new Compartment());
  const completionCompartment = useRef(new Compartment());

  // Property popup state
  const [popup, setPopup] = useState<{
    schemaPath: string;
    target?: DslClickTarget; // only present in DSL mode — fully resolved click target
    dslPath: string;
    key: string;       // the property key clicked on (e.g., "h", "radius")
    cursorPos: number;  // cursor offset in the text, for finding the value span
    value: unknown;
    position: { x: number; y: number };
  } | null>(null);
  const popupOpenRef = useRef(false);
  // Sync ref for the DSL click target — updated synchronously on every popup change,
  // avoiding stale closure issues during rapid slider drags where multiple onChange
  // calls fire before React re-renders with the updated popup state.
  const dslTargetRef = useRef<DslClickTarget | null>(null);

  // Keep ref in sync
  useEffect(() => {
    popupOpenRef.current = popup !== null;
  }, [popup]);

  // Parse initial value to get raw scene data
  useEffect(() => {
    try {
      const trimmed = value.trim();
      if (trimmed.startsWith('{')) {
        json5TextRef.current = value;
        lastValidRawRef.current = JSON5.parse(trimmed);
      } else {
        // DSL text — parse to raw, generate JSON5
        const raw = parseDsl(trimmed);
        lastValidRawRef.current = raw;
        json5TextRef.current = JSON5.stringify(raw, null, 2);
      }
    } catch { /* keep previous */ }
  }, []);

  // Handle inline/block toggle for a DSL node
  const handleNodeToggle = useCallback((nodeId: string) => {
    const view = viewRef.current;
    if (!view || formatRef.current !== 'dsl') return;

    const current = nodeFormatsRef.current[nodeId];
    const newFormat: 'inline' | 'block' = current === 'block' ? 'inline' : 'block';
    const newFormats: Record<string, 'inline' | 'block'> = { ...nodeFormatsRef.current, [nodeId]: newFormat };
    nodeFormatsRef.current = newFormats;

    if (onNodeFormatsChange) {
      onNodeFormatsChange(newFormats);
    }

    // Regenerate DSL with the new node formats
    if (lastValidRawRef.current) {
      try {
        const newText = generateDsl(lastValidRawRef.current, { nodeFormats: newFormats });
        externalUpdate.current = true;
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: newText },
        });
        externalUpdate.current = false;
      } catch { /* keep current */ }
    }
  }, [onNodeFormatsChange]);

  // Handle click on editor — detect if we clicked on a value and show popup
  const handleEditorClick = useCallback((view: EditorView, event: MouseEvent) => {
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return;

    const doc = view.state.doc.toString();

    // ─── DSL mode: use resolveDslClick (resolve-once architecture) ───
    if (formatRef.current === 'dsl') {
      const target = resolveDslClick(doc, pos);
      if (!target) return;

      const coords = view.coordsAtPos(pos);
      if (coords) {
        dslTargetRef.current = target;
        setPopup({
          schemaPath: target.schemaPath,
          target,
          dslPath: '',
          key: '',
          cursorPos: pos,
          value: target.value,
          position: { x: coords.left, y: coords.bottom + 4 },
        });
      }
      return;
    }

    // ─── JSON5 mode: existing cursor context pipeline (unchanged) ────
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

          if (type === 'color' || type === 'object') {
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
    () => {
      const isDsl = formatRef.current === 'dsl';
      return [
        // Language: JSON for JSON5 mode, nothing for DSL mode
        langCompartment.current.of(isDsl ? [] : json()),
        starchTheme,
        starchHighlight,
        lineNumbers(),
        highlightActiveLine(),
        bracketMatching(),
        history(),
        keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
        EditorState.tabSize.of(2),
        // Completion: mode-specific
        completionCompartment.current.of(
          autocompletion({
            override: [isDsl ? dslCompletionSource : v2CompletionSource],
            activateOnTyping: true,
          }),
        ),
        // Linter: mode-specific
        linterCompartment.current.of(isDsl ? dslEditorLinter : v2EditorLinter),
        lintGutter(),
        createHoverTooltipSource(formatRef),
        createNodeToggleGutter(formatRef, nodeFormatsRef, handleNodeToggle),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !externalUpdate.current) {
            const newText = update.state.doc.toString();
            if (formatRef.current === 'dsl') {
              // In DSL mode: parse DSL → serialize to JSON5 → update canonical text
              try {
                const raw = parseDsl(newText);
                const json5Text = JSON5.stringify(raw, null, 2);
                json5TextRef.current = json5Text;
                lastValidRawRef.current = raw;
              } catch { /* DSL parse failed, keep last valid */ }
            } else {
              // JSON5 mode: store directly
              json5TextRef.current = newText;
              try {
                lastValidRawRef.current = JSON5.parse(newText);
              } catch { /* keep last valid */ }
            }
            // Always emit the canonical JSON5 text to the parent
            onChangeRef.current(json5TextRef.current);
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
      ];
    },
    [handleEditorClick, handleNodeToggle],
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

    // If this value change was triggered by a popup edit, skip the editor
    // content replacement — the popup already has the correct DSL in the editor
    // and replacing it would invalidate the popup target's spans.
    if (popupEditingRef.current) {
      popupEditingRef.current = false;
      return;
    }

    // Update the canonical JSON5 text
    json5TextRef.current = value;
    try {
      const trimmed = value.trim();
      if (trimmed.startsWith('{')) {
        lastValidRawRef.current = JSON5.parse(trimmed);
      } else if (trimmed) {
        lastValidRawRef.current = parseDsl(trimmed);
      }
    } catch { /* keep previous */ }

    // Generate the display text based on current format
    let displayText: string;
    if (formatRef.current === 'dsl') {
      try {
        displayText = lastValidRawRef.current
          ? generateDsl(lastValidRawRef.current, { nodeFormats: nodeFormatsRef.current })
          : value;
      } catch {
        displayText = value;
      }
    } else {
      displayText = value;
    }

    const current = view.state.doc.toString();
    if (current !== displayText) {
      externalUpdate.current = true;
      view.dispatch({
        changes: { from: 0, to: current.length, insert: displayText },
      });
      externalUpdate.current = false;
    }
  }, [value]);

  // Handle format toggle
  const handleFormatToggle = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;

    const newFormat = formatRef.current === 'json5' ? 'dsl' : 'json5';

    // Update format state
    if (onViewFormatChange) {
      onViewFormatChange(newFormat);
    } else {
      setInternalFormat(newFormat);
    }
    formatRef.current = newFormat;

    // Generate the new display text
    let newText: string;
    if (newFormat === 'dsl') {
      try {
        newText = lastValidRawRef.current
          ? generateDsl(lastValidRawRef.current, { nodeFormats: nodeFormatsRef.current })
          : json5TextRef.current;
      } catch {
        newText = json5TextRef.current;
      }
    } else {
      newText = json5TextRef.current;
    }

    // Update CodeMirror content
    externalUpdate.current = true;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: newText },
    });
    externalUpdate.current = false;

    // Reconfigure compartments for the new mode
    const isDsl = newFormat === 'dsl';
    view.dispatch({
      effects: [
        langCompartment.current.reconfigure(isDsl ? [] : json()),
        linterCompartment.current.reconfigure(isDsl ? dslEditorLinter : v2EditorLinter),
        completionCompartment.current.reconfigure(
          autocompletion({
            override: [isDsl ? dslCompletionSource : v2CompletionSource],
            activateOnTyping: true,
          }),
        ),
      ],
    });
  }, [onViewFormatChange]);

  // Handle popup value change — surgical text replacement at the value span
  const handlePopupChange = useCallback((newValue: unknown) => {
    if (!popup) return;
    const view = viewRef.current;
    if (!view) return;

    const doc = view.state.doc.toString();
    const isDsl = formatRef.current === 'dsl';

    const currentTarget = dslTargetRef.current;
    if (isDsl && currentTarget) {
      // DSL mode: use applyDslPopupChange with the ref-based target
      // (ref avoids stale closure during rapid slider drags)
      const newDoc = applyDslPopupChange(doc, currentTarget, newValue);

      externalUpdate.current = true;
      view.dispatch({
        changes: { from: 0, to: doc.length, insert: newDoc },
      });
      externalUpdate.current = false;

      // Re-parse DSL to update canonical JSON5
      try {
        const raw = parseDsl(newDoc);
        const json5Text = JSON5.stringify(raw, null, 2);
        json5TextRef.current = json5Text;
        lastValidRawRef.current = raw;
      } catch { /* keep last valid */ }
      // Suppress the useEffect editor overwrite — our DSL text is authoritative
      popupEditingRef.current = true;
      onChangeRef.current(json5TextRef.current);

      // Update target ref SYNCHRONOUSLY for the next rapid onChange call.
      // For color-compound and dimension targets, compute the new span directly
      // from the replacement length (re-resolving would land on a sub-token like
      // hsl-component instead of color-compound, causing type mismatch).
      const oldSpan = currentTarget.span;
      const replacementLen = newDoc.length - doc.length + (oldSpan.to - oldSpan.from);

      if (currentTarget.kind === 'color-compound') {
        dslTargetRef.current = {
          ...currentTarget,
          value: newValue,
          span: { from: oldSpan.from, to: oldSpan.from + replacementLen },
        };
      } else if (currentTarget.kind === 'dimension' && currentTarget.fullDimSpan) {
        const oldFullLen = currentTarget.fullDimSpan.to - currentTarget.fullDimSpan.from;
        const newFullLen = newDoc.length - doc.length + oldFullLen;
        dslTargetRef.current = {
          ...currentTarget,
          value: newValue,
          fullDimSpan: { from: currentTarget.fullDimSpan.from, to: currentTarget.fullDimSpan.from + newFullLen },
          span: { from: currentTarget.fullDimSpan.from, to: currentTarget.fullDimSpan.from + newFullLen },
        };
      } else {
        const reResolved = resolveDslClick(newDoc, oldSpan.from + 1);
        dslTargetRef.current = reResolved ?? { ...currentTarget, value: newValue };
      }

      // Also update React state for re-render (non-critical path)
      setPopup(prev => prev ? {
        ...prev,
        value: newValue,
        target: dslTargetRef.current!,
        cursorPos: oldSpan.from + 1,
      } : null);
    } else {
      // JSON5 mode — existing behavior
      let span: { from: number; to: number } | null;
      span = findValueSpan(doc, popup.cursorPos, popup.key);
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
      setPopup(prev => prev ? { ...prev, value: newValue, cursorPos: span!.from + 1 } : null);
    }
  }, [popup]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Format toggle bar */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '2px 8px',
        borderBottom: '1px solid #1a1d24', background: '#0a0c10', flexShrink: 0,
      }}>
        <button
          onClick={handleFormatToggle}
          title="Toggle between JSON5 and DSL view"
          style={{
            padding: '2px 8px', borderRadius: 4, fontSize: 10, fontFamily: FONT,
            border: `1px solid ${currentFormat === 'dsl' ? '#a78bfa' : '#2a2d35'}`,
            background: currentFormat === 'dsl' ? 'rgba(167,139,250,0.1)' : '#14161c',
            color: currentFormat === 'dsl' ? '#a78bfa' : '#6b7280',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          {currentFormat === 'json5' ? 'DSL' : 'JSON5'}
        </button>
        <span style={{ fontSize: 9, color: '#4a4f59', marginLeft: 8 }}>
          {currentFormat === 'json5' ? 'JSON5 mode' : 'DSL mode'}
        </span>
      </div>
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
          onClose={() => { dslTargetRef.current = null; setPopup(null); }}
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
