/**
 * V2 Editor — backed by the structured editor system.
 * Uses ModelManager, schema-driven completion, v2 linter, and property popups.
 * Supports toggling between JSON5 and DSL view modes.
 */
import { useRef, useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditorView, keymap, lineNumbers, highlightActiveLine, hoverTooltip, type Tooltip, GutterMarker, gutter } from '@codemirror/view';
import { EditorState, Compartment, type Extension } from '@codemirror/state';
import { json } from '@codemirror/lang-json';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching } from '@codemirror/language';
import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { starchTheme, starchHighlight } from '../../editor/theme';
import { dslLanguage, dslHighlight } from '../../editor/dslLanguage';
import { parseScene } from '../../parser/parser';
import { getCompletions } from '../../editor/completionSource';
import { getCursorContext } from '../../editor/cursorPath';
import { getDslCursorContext, stripModelPrefix } from '../../editor/dslCursorPath';
import { getDslCompletions } from '../../editor/dslCompletionSource';
import { lintDsl } from '../../editor/dslLinter';
import {
  getPropertySchema,
  getPropertyDescription,
  detectSchemaType,
  isBubblableType,
  isLeafType,
  AnimConfigSchema,
} from '../../types/schemaRegistry';
import { PropertyPopup } from '../../editor/popups/PropertyPopup';
import { ModelManager, getNestedValue } from '../../editor/modelManager';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";

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
    const basePath = stripModelPrefix(ctx.path);
    let rootSchema: import('zod').ZodType | undefined;
    if (ctx.path.startsWith('animate.')) {
      rootSchema = AnimConfigSchema;
    }
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
  getNodeFormat: (nodeId: string) => 'inline' | 'block' | undefined,
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
      const isBlock = getNodeFormat(nodeId) === 'block';
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
  modelManager: ModelManager;
  viewFormat: 'json5' | 'dsl';
  onViewFormatChange?: (format: 'json5' | 'dsl') => void;
  height?: string;
}

export function V2Editor({ modelManager, viewFormat = 'dsl', onViewFormatChange, height }: V2EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const externalDispatch = useRef(false);

  // Ref tracking — closures baked into CodeMirror extensions use these
  const formatRef = useRef(viewFormat);
  formatRef.current = viewFormat;
  const modelManagerRef = useRef(modelManager);
  modelManagerRef.current = modelManager;

  // CodeMirror compartments for dynamic reconfiguration
  const langCompartment = useRef(new Compartment());
  const linterCompartment = useRef(new Compartment());
  const completionCompartment = useRef(new Compartment());

  // Property popup state
  const [popup, setPopup] = useState<{
    path: string;
    schemaPath: string;
    value: unknown;
    position: { x: number; y: number };
  } | null>(null);
  const popupOpenRef = useRef(false);

  // Keep ref in sync
  useEffect(() => {
    popupOpenRef.current = popup !== null;
  }, [popup]);

  // When modelManager changes (tab switch), push new text into editor and re-subscribe
  useEffect(() => {
    const view = viewRef.current;
    if (view) {
      const text = modelManager.getDisplayText();
      externalDispatch.current = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
      });
      externalDispatch.current = false;
    }

    // Subscribe to text changes (for popup edits / mode toggle)
    const unsubText = modelManager.onTextChange((text) => {
      const v = viewRef.current;
      if (!v) return;
      externalDispatch.current = true;
      v.dispatch({
        changes: { from: 0, to: v.state.doc.length, insert: text },
      });
      externalDispatch.current = false;
    });
    // Close any open popup when switching tabs
    setPopup(null);
    return unsubText;
  }, [modelManager]);

  // Handle inline/block toggle for a DSL node
  const handleNodeToggle = useCallback((nodeId: string) => {
    const mm = modelManagerRef.current;
    const hints = mm.formatHints;
    const current = hints.nodes[nodeId]?.display;
    const newDisplay: 'inline' | 'block' = current === 'block' ? 'inline' : 'block';
    hints.nodes[nodeId] = { display: newDisplay };
    mm.setViewFormat(formatRef.current);
  }, []);

  // Helper to get node format from modelManager's formatHints
  const getNodeFormat = useCallback((nodeId: string): 'inline' | 'block' | undefined => {
    return modelManagerRef.current.formatHints.nodes[nodeId]?.display;
  }, []);

  // Handle click on editor — detect if we clicked on a value and show popup
  const handleEditorClick = useCallback((view: EditorView, pos: number) => {
    const doc = view.state.doc.toString();
    const ctx = formatRef.current === 'dsl'
      ? getDslCursorContext(doc, pos)
      : getCursorContext(doc, pos);

    // Try to build a usable path, even when cursor is on a property name
    let path = ctx.path;
    if (ctx.isPropertyName && ctx.prefix) {
      // Extend path with the property name under cursor (e.g., clicking on "opacity" key)
      path = path ? `${path}.${ctx.prefix}` : ctx.prefix;
    }
    if (!path) return;

    // Resolve schema path (strip objects.N. / styles.NAME. prefix)
    let schemaPath = stripModelPrefix(path);

    // Handle animate section with AnimConfigSchema as root
    let rootSchema: import('zod').ZodType | undefined;
    if (path.startsWith('animate.')) {
      rootSchema = AnimConfigSchema;
    }

    // Compute model prefix (the part of path before schemaPath)
    // e.g., path="objects.0.rect.w", schemaPath="rect.w" → modelPrefix="objects.0."
    const modelPrefix = schemaPath
      ? path.slice(0, path.length - schemaPath.length)
      : path;

    // Get schema for popup widget selection
    let schema = rootSchema
      ? getPropertySchema(schemaPath, rootSchema)
      : getPropertySchema(schemaPath);

    // If extended path didn't resolve, fall back to the original ctx.path
    if (!schema && ctx.isPropertyName && ctx.path) {
      schemaPath = stripModelPrefix(ctx.path);
      schema = rootSchema
        ? getPropertySchema(schemaPath, rootSchema)
        : getPropertySchema(schemaPath);
    }

    if (!schema) return;

    let type = detectSchemaType(schema);

    // Bubble up: if this is a leaf type, check if the parent is a compound object/color
    if (isLeafType(type)) {
      const parentSchemaPath = schemaPath.includes('.')
        ? schemaPath.split('.').slice(0, -1).join('.')
        : '';  // empty string = node root
      const parentSchema = rootSchema
        ? getPropertySchema(parentSchemaPath, rootSchema)
        : getPropertySchema(parentSchemaPath);
      if (parentSchema && isBubblableType(detectSchemaType(parentSchema))) {
        schemaPath = parentSchemaPath;
        schema = parentSchema;
        type = detectSchemaType(schema);
      }
    }

    // Only show popup for types that have widgets
    if (!['number', 'color', 'enum', 'boolean', 'object', 'pointref', 'anchor', 'string'].includes(type)) return;

    // Reconstruct model path after bubbling
    const finalPath = schemaPath
      ? modelPrefix + schemaPath
      : modelPrefix.endsWith('.') ? modelPrefix.slice(0, -1) : modelPrefix;

    const value = getNestedValue(modelManagerRef.current.json, finalPath);

    const coords = view.coordsAtPos(pos);
    if (!coords) return;

    popupOpenRef.current = true;
    setPopup({
      path: finalPath,
      schemaPath,
      value,
      position: { x: coords.left, y: coords.bottom + 4 },
    });
  }, []);

  // Popup change handler — delegates to ModelManager
  // For compound objects, uses per-property updates to avoid replacing the whole
  // object (which causes DSL format disruption and potential data loss).
  const handlePopupChange = useCallback((newValue: unknown) => {
    if (!popup) return;
    const mm = modelManagerRef.current;
    const oldValue = popup.value;

    if (
      typeof newValue === 'object' && newValue !== null && !Array.isArray(newValue) &&
      typeof oldValue === 'object' && oldValue !== null && !Array.isArray(oldValue)
    ) {
      const oldObj = oldValue as Record<string, unknown>;
      const newObj = newValue as Record<string, unknown>;

      // Update changed or added properties individually
      for (const key of Object.keys(newObj)) {
        if (newObj[key] !== oldObj[key]) {
          mm.updateProperty(`${popup.path}.${key}`, newObj[key]);
        }
      }
      // Remove deleted properties
      for (const key of Object.keys(oldObj)) {
        if (!(key in newObj) && key !== 'id' && key !== 'children') {
          mm.removeProperty(`${popup.path}.${key}`);
        }
      }
    } else {
      mm.updateProperty(popup.path, newValue);
    }

    // Re-read canonical value from model (avoids stale references)
    const fresh = getNestedValue(mm.json, popup.path);
    setPopup(prev => prev ? { ...prev, value: fresh ?? newValue } : null);
  }, [popup]);

  // Handle format toggle
  const handleFormatToggle = useCallback((newFormat: 'json5' | 'dsl') => {
    formatRef.current = newFormat;
    modelManagerRef.current.setViewFormat(newFormat);
    // Reconfigure CodeMirror compartments for new format
    const view = viewRef.current;
    if (view) {
      const isDsl = newFormat === 'dsl';
      view.dispatch({
        effects: [
          langCompartment.current.reconfigure(isDsl ? [dslLanguage, dslHighlight] : [json(), starchHighlight]),
          linterCompartment.current.reconfigure(isDsl ? dslEditorLinter : v2EditorLinter),
          completionCompartment.current.reconfigure(
            autocompletion({
              override: [isDsl ? dslCompletionSource : v2CompletionSource],
              activateOnTyping: true,
            }),
          ),
        ],
      });
    }
    if (onViewFormatChange) onViewFormatChange(newFormat);
  }, [onViewFormatChange]);

  // Respond to external format prop changes (e.g., Mode button in App toolbar)
  const prevFormatRef = useRef(viewFormat);
  useEffect(() => {
    if (viewFormat !== prevFormatRef.current) {
      prevFormatRef.current = viewFormat;
      handleFormatToggle(viewFormat);
    }
  }, [viewFormat, handleFormatToggle]);

  const createExtensions = useCallback(
    () => {
      const isDsl = formatRef.current === 'dsl';

      // Update listener — forward keystrokes to ModelManager (use ref for fresh reference)
      const updateListener = EditorView.updateListener.of((update) => {
        if (update.docChanged && !externalDispatch.current) {
          modelManagerRef.current.setText(update.state.doc.toString(), formatRef.current);
        }
      });

      return [
        // Language: JSON for JSON5 mode, DSL language for DSL mode
        langCompartment.current.of(isDsl ? [dslLanguage, dslHighlight] : [json(), starchHighlight]),
        starchTheme,
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
        createNodeToggleGutter(formatRef, getNodeFormat, handleNodeToggle),
        updateListener,
        EditorView.domEventHandlers({
          click: (event, view) => {
            // Don't trigger popup logic if a popup is already open
            if (popupOpenRef.current) return false;
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
            if (pos === null) return false;
            // Delay to let cursor settle
            setTimeout(() => handleEditorClick(view, pos), 50);
            return false;
          },
        }),
      ];
    },
    [handleEditorClick, handleNodeToggle, getNodeFormat],
  );

  // Mount editor
  useEffect(() => {
    if (!containerRef.current) return;

    const initialText = modelManager.getDisplayText();

    const state = EditorState.create({
      doc: initialText,
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

  return (
    <div style={{ height: height || '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
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
          onClose={() => { popupOpenRef.current = false; setPopup(null); }}
        />,
        document.body,
      )}
    </div>
  );
}
