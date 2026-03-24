/**
 * V2 Editor -- backed by the structured editor system.
 * Uses ModelManager, schema-driven decorations, DSL linter, and property popups.
 * DSL-only mode (JSON5 rendering removed).
 */
import { useRef, useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditorView, keymap, lineNumbers, highlightActiveLine, hoverTooltip, type Tooltip, GutterMarker, gutter } from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching } from '@codemirror/language';
import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { linter, lintGutter } from '@codemirror/lint';
import { starchTheme } from '../../editor/theme';
import { dslLanguage, dslHighlight } from '../../editor/dslLanguage';
import { lintDsl } from '../../editor/dslLinter';
import {
  getPropertySchema,
  getPropertyDescription,
  detectSchemaType,
  isBubblableType,
} from '../../types/schemaRegistry';
import { PropertyPopup } from '../../editor/popups/PropertyPopup';
import { ModelManager, getNestedValue, resolveIdPath } from '../../editor/modelManager';
import { schemaDecorationsExtension, setSpans, spanField, getSpanAtPos } from '../../editor/schemaDecorations';
import { getSchemaCompletions } from '../../editor/schemaCompletionSource';
import type { SchemaSection } from '../../editor/schemaSpan';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";

// --- DSL Linter ---

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

// --- Hover Tooltip (decoration-based) ---

function createHoverTooltipSource() {
  return hoverTooltip((view, pos) => {
    const spans = view.state.field(spanField);
    const span = getSpanAtPos(spans, pos);
    if (!span) return null;

    const description = getPropertyDescription(span.schemaPath);
    const schema = getPropertySchema(span.schemaPath);
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
        pathEl.textContent = span.schemaPath;
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

// --- DSL Node Inline/Block Toggle Gutter (span-based) ---

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
  getNodeFormat: (nodeId: string) => 'inline' | 'block' | undefined,
  onToggle: (nodeId: string) => void,
): Extension {
  return gutter({
    class: 'cm-dsl-toggle-gutter',
    lineMarker(view, line) {
      const spans = view.state.field(spanField);
      // Find spans on this line that represent a top-level node
      for (const span of spans) {
        if (span.from >= line.from && span.from < line.to) {
          // Check if this is a node-level span (modelPath = "objects.<id>" or "objects.<id>.<prop>")
          const parts = span.modelPath.split('.');
          if (parts[0] === 'objects' && parts.length >= 2) {
            const nodeId = parts[1];
            const isBlock = getNodeFormat(nodeId) === 'block';
            return new NodeToggleMarker(nodeId, isBlock);
          }
        }
      }
      return null;
    },
    domEventHandlers: {
      click(view, line) {
        const spans = view.state.field(spanField);
        for (const span of spans) {
          if (span.from >= line.from && span.from < line.to) {
            const parts = span.modelPath.split('.');
            if (parts[0] === 'objects' && parts.length >= 2) {
              onToggle(parts[1]);
              return true;
            }
          }
        }
        return false;
      },
    },
  });
}

// --- Editor Component ---

interface V2EditorProps {
  modelManager: ModelManager;
  height?: string;
}

export function V2Editor({ modelManager, height }: V2EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const externalDispatch = useRef(false);

  // Ref tracking -- closures baked into CodeMirror extensions use these
  const modelManagerRef = useRef(modelManager);
  modelManagerRef.current = modelManager;

  // Property popup state
  const [popup, setPopup] = useState<{
    path: string;
    schemaPath: string;
    section: SchemaSection;
    position: { x: number; y: number };
    initialFocusKey?: string;
  } | null>(null);
  const popupOpenRef = useRef(false);

  // Keep ref in sync
  useEffect(() => {
    popupOpenRef.current = popup !== null;
  }, [popup]);

  // When modelManager changes (tab switch), push new text + spans into editor and re-subscribe
  useEffect(() => {
    const view = viewRef.current;
    if (view) {
      // Initial push -- includes spans
      const result = modelManager.getDisplayResult();
      externalDispatch.current = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: result.text },
        effects: [setSpans.of(result.spans)],
      });
      externalDispatch.current = false;
    }

    // Subscribe to text changes (for popup edits / mode toggle)
    const unsubText = modelManager.onTextChange(() => {
      const v = viewRef.current;
      if (!v) return;
      const result = modelManager.getDisplayResult();
      externalDispatch.current = true;
      v.dispatch({
        changes: { from: 0, to: v.state.doc.length, insert: result.text },
        effects: [setSpans.of(result.spans)],
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
    mm.setViewFormat('dsl');
  }, []);

  // Helper to get node format from modelManager's formatHints
  const getNodeFormat = useCallback((nodeId: string): 'inline' | 'block' | undefined => {
    return modelManagerRef.current.formatHints.nodes[nodeId]?.display;
  }, []);

  // Handle click on editor -- span-based logic
  const handleEditorClick = useCallback((view: EditorView, pos: number) => {
    const spans = view.state.field(spanField);
    const span = getSpanAtPos(spans, pos);
    if (!span) return;

    // Walk up to compound ancestor
    let schemaPath = span.schemaPath;
    let modelPath = span.modelPath;
    const schema = getPropertySchema(schemaPath);
    if (!schema) return;

    let type = detectSchemaType(schema);
    let initialFocusKey: string | undefined;

    // If leaf, bubble up to compound parent
    if (!isBubblableType(type) && type !== 'object') {
      const lastDot = schemaPath.lastIndexOf('.');
      if (lastDot > 0) {
        const parentSchemaPath = schemaPath.slice(0, lastDot);
        const parentSchema = getPropertySchema(parentSchemaPath);
        if (parentSchema && isBubblableType(detectSchemaType(parentSchema))) {
          initialFocusKey = schemaPath.slice(lastDot + 1);
          schemaPath = parentSchemaPath;
          modelPath = modelPath.slice(0, modelPath.lastIndexOf('.'));
          type = detectSchemaType(parentSchema);
        }
      }
    }

    if (!['number', 'color', 'enum', 'boolean', 'object', 'pointref', 'anchor', 'string'].includes(type)) return;

    const coords = view.coordsAtPos(pos);
    if (!coords) return;

    popupOpenRef.current = true;
    setPopup({
      path: modelPath,
      schemaPath,
      section: span.section,
      position: { x: coords.left, y: coords.bottom + 4 },
      initialFocusKey,
    });
  }, []);

  // Schema-driven completion source using span context
  const schemaCompletionAdapter = useCallback((context: CompletionContext): CompletionResult | null => {
    const wordBefore = context.matchBefore(/[\w@]+/);
    if (!context.explicit && !wordBefore) return null;

    const spans = context.state.field(spanField);
    const prefix = wordBefore ? wordBefore.text : '';

    // Get current line text up to cursor for context-dependent completions
    const line = context.state.doc.lineAt(context.pos);
    const lineText = context.state.doc.sliceString(line.from, context.pos);

    const items = getSchemaCompletions(
      spans, context.pos, prefix, lineText, modelManagerRef.current.json,
    );
    if (items.length === 0) return null;

    const from = wordBefore ? wordBefore.from : context.pos;
    return {
      from,
      options: items.map(item => ({
        label: item.label,
        detail: item.detail,
        type: item.type === 'property' ? 'property' : item.type === 'value' ? 'constant' : 'keyword',
      })),
    };
  }, []);

  const createExtensions = useCallback(
    () => {
      // Update listener -- forward keystrokes to ModelManager (use ref for fresh reference)
      const updateListener = EditorView.updateListener.of((update) => {
        if (update.docChanged && !externalDispatch.current) {
          modelManagerRef.current.setText(update.state.doc.toString(), 'dsl');
        }
      });

      return [
        // Language: DSL only
        dslLanguage,
        dslHighlight,
        starchTheme,
        lineNumbers(),
        highlightActiveLine(),
        bracketMatching(),
        history(),
        keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
        EditorState.tabSize.of(2),
        // Completion: schema-driven
        autocompletion({
          override: [schemaCompletionAdapter],
          activateOnTyping: true,
        }),
        // Linter: DSL
        dslEditorLinter,
        lintGutter(),
        // Schema decorations
        schemaDecorationsExtension(),
        // Hover tooltip (reads decorations)
        createHoverTooltipSource(),
        // Node toggle gutter (span-based)
        createNodeToggleGutter(getNodeFormat, handleNodeToggle),
        updateListener,
        EditorView.domEventHandlers({
          click: (event, view) => {
            // Don't trigger popup logic if a popup is already open
            if (popupOpenRef.current) return false;
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
            if (pos === null) return false;
            // Skip clicks on empty space to the right of line content
            const posCoords = view.coordsAtPos(pos);
            if (posCoords && event.clientX > posCoords.right + 8) return false;
            // Delay to let cursor settle
            setTimeout(() => handleEditorClick(view, pos), 50);
            return false;
          },
        }),
      ];
    },
    [handleEditorClick, handleNodeToggle, getNodeFormat, schemaCompletionAdapter],
  );

  // Mount editor
  useEffect(() => {
    if (!containerRef.current) return;

    const initialResult = modelManager.getDisplayResult();

    const state = EditorState.create({
      doc: initialResult.text,
      extensions: createExtensions(),
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    // Push initial spans
    view.dispatch({
      effects: [setSpans.of(initialResult.spans)],
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
          modelPath={popup.path}
          section={popup.section}
          position={popup.position}
          initialFocusKey={popup.initialFocusKey}
          onPropertyChange={(path, value) => {
            if (value === undefined) {
              modelManagerRef.current.removeProperty(path);
            } else {
              modelManagerRef.current.updateProperty(path, value);
            }
          }}
          readValue={(path) => {
            const resolved = resolveIdPath(modelManagerRef.current.json, path);
            return getNestedValue(modelManagerRef.current.json, resolved);
          }}
          onClose={() => { popupOpenRef.current = false; setPopup(null); }}
        />,
        document.body,
      )}
    </div>
  );
}
