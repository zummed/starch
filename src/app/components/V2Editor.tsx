/**
 * V2 Editor -- backed by the structured editor system.
 * Uses ModelManager, AST-driven decorations, DSL linter, and property popups.
 * DSL-only mode (JSON5 rendering removed).
 */
import { useRef, useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditorView, keymap, lineNumbers, highlightActiveLine, hoverTooltip, type Tooltip, GutterMarker, gutter } from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching } from '@codemirror/language';
import { autocompletion, snippet, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { linter, lintGutter } from '@codemirror/lint';
import { starchTheme } from '../../editor/theme';
import { dslLanguage, dslHighlight } from '../../editor/dslLanguage';
import {
  getPropertySchema,
  getPropertyDescription,
  detectSchemaType,
  isBubblableType,
} from '../../types/schemaRegistry';
import { PropertyPopup } from '../../editor/popups/PropertyPopup';
import { ModelManager, getNestedValue, resolveIdPath } from '../../editor/modelManager';
import { astExtension, setAst, astField } from '../../dsl/astDecorations';
import { nodeAt, findCompound, flattenLeaves } from '../../dsl/astTypes';
import { completionsAt } from '../../dsl/astCompletions';
import { buildAstFromText } from '../../dsl/astParser';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";

// --- DSL Linter (AST-based) ---

const dslEditorLinter = linter((view) => {
  const doc = view.state.doc.toString();
  if (!doc.trim()) return [];
  try {
    buildAstFromText(doc);
    return [];
  } catch (e: unknown) {
    const err = e as Error;
    const message = err.message || 'Parse error';

    // Try to extract line:col from the error message
    const lineColMatch = message.match(/at line (\d+):(\d+)/);
    if (lineColMatch) {
      const lineNum = Math.min(parseInt(lineColMatch[1]), view.state.doc.lines);
      const line = view.state.doc.line(lineNum);
      const col = Math.min(parseInt(lineColMatch[2]) - 1, line.length);
      const from = line.from + Math.max(0, col);
      return [{
        from,
        to: Math.min(from + 1, line.to),
        severity: 'error' as const,
        message: message.replace(/\s+at line \d+(:\d+)?/, '').trim(),
      }];
    }

    const lineMatch = message.match(/(?:at )?line (\d+)/);
    if (lineMatch) {
      const lineNum = Math.min(parseInt(lineMatch[1]), view.state.doc.lines);
      const line = view.state.doc.line(lineNum);
      return [{
        from: line.from,
        to: Math.min(line.from + 1, line.to),
        severity: 'error' as const,
        message: message.replace(/\s+at line \d+(:\d+)?/, '').trim(),
      }];
    }

    // No position info — report at line 1
    return [{
      from: 0,
      to: Math.min(1, view.state.doc.length),
      severity: 'error' as const,
      message: message.replace(/\s+at line \d+(:\d+)?/, '').trim(),
    }];
  }
}, { delay: 300 });

// --- Hover Tooltip (AST-based) ---

function createHoverTooltipSource() {
  return hoverTooltip((view, pos) => {
    const ast = view.state.field(astField);
    if (!ast) return null;
    const node = nodeAt(ast, pos);
    if (!node || node.dslRole === 'document' || node.dslRole === 'section') return null;

    const schemaPath = node.schemaPath;
    const description = getPropertyDescription(schemaPath);
    const schema = getPropertySchema(schemaPath);
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

// --- DSL Node Inline/Block Toggle Gutter (AST-based) ---

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
      const ast = view.state.field(astField);
      if (!ast) return null;
      const leaves = flattenLeaves(ast);
      for (const leaf of leaves) {
        if (leaf.from >= line.from && leaf.from < line.to) {
          const parts = leaf.modelPath.split('.');
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
        const ast = view.state.field(astField);
        if (!ast) return false;
        const leaves = flattenLeaves(ast);
        for (const leaf of leaves) {
          if (leaf.from >= line.from && leaf.from < line.to) {
            const parts = leaf.modelPath.split('.');
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
    section: 'node' | 'style' | 'animate' | 'images';
    position: { x: number; y: number };
    initialFocusKey?: string;
  } | null>(null);
  const popupOpenRef = useRef(false);

  // Keep ref in sync
  useEffect(() => {
    popupOpenRef.current = popup !== null;
  }, [popup]);

  // When modelManager changes (tab switch), push new text + AST into editor and re-subscribe
  useEffect(() => {
    const view = viewRef.current;
    if (view) {
      // Initial push -- includes AST
      const result = modelManager.getDisplayResult();
      externalDispatch.current = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: result.text },
        effects: [setAst.of(result.ast)],
      });
      externalDispatch.current = false;
    }

    // Subscribe to text changes (for popup edits / mode toggle) — pushes text + AST
    const unsubText = modelManager.onTextChange(() => {
      const v = viewRef.current;
      if (!v) return;
      const result = modelManager.getDisplayResult();
      externalDispatch.current = true;
      v.dispatch({
        changes: { from: 0, to: v.state.doc.length, insert: result.text },
        effects: [setAst.of(result.ast)],
      });
      externalDispatch.current = false;
    });

    // Subscribe to model changes (fires after successful parse from typing) — pushes AST only.
    // setText() doesn't emit textChange (editor already has the text), so we need this
    // separate path to keep AST in sync with freshly typed content.
    const unsubModel = modelManager.onModelChange(() => {
      const v = viewRef.current;
      if (!v || externalDispatch.current) return;
      // Use the AST stored by _processText (from buildAstFromText), not getDisplayResult
      const ast = modelManager.ast;
      if (ast) {
        v.dispatch({
          effects: [setAst.of(ast)],
        });
      }
    });

    // Close any open popup when switching tabs
    setPopup(null);
    return () => { unsubText(); unsubModel(); };
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

  // Handle click on editor -- AST-based logic
  const handleEditorClick = useCallback((view: EditorView, pos: number) => {
    const ast = view.state.field(astField);
    if (!ast) return;
    const node = nodeAt(ast, pos);
    if (!node || node.dslRole === 'document' || node.dslRole === 'section') return;

    // Use findCompound() to walk up to nearest compound ancestor
    const compound = findCompound(node);
    if (!compound) return;

    let schemaPath = compound.schemaPath;
    let modelPath = compound.modelPath;
    const schema = getPropertySchema(schemaPath);
    if (!schema) return;

    let type = detectSchemaType(schema);
    let initialFocusKey: string | undefined;

    // If leaf was clicked, record the field name for initial focus
    if (node !== compound && node.schemaPath !== compound.schemaPath) {
      const leafSp = node.schemaPath;
      const compoundSp = compound.schemaPath;
      if (leafSp.startsWith(compoundSp + '.')) {
        initialFocusKey = leafSp.slice(compoundSp.length + 1);
      } else if (compoundSp === '' && leafSp) {
        initialFocusKey = leafSp;
      }
    }

    // If compound is a node-line (objects.<id>), check if the clicked node's
    // immediate compound is actually a sub-property (like rect, fill, stroke).
    // In that case, use the sub-property compound instead.
    if (type === 'object' && compound.modelPath.split('.').length === 2 && node !== compound) {
      // Try to find a more specific compound between node and the node-line
      let inner = node;
      while (inner.parent && inner.parent !== compound) {
        if (inner.parent.dslRole === 'compound') {
          const innerSchema = getPropertySchema(inner.parent.schemaPath);
          if (innerSchema) {
            const innerType = detectSchemaType(innerSchema);
            if (isBubblableType(innerType) || innerType === 'object') {
              schemaPath = inner.parent.schemaPath;
              modelPath = inner.parent.modelPath;
              type = innerType;
              // Recalculate initialFocusKey relative to the inner compound
              const leafSp = node.schemaPath;
              if (leafSp.startsWith(schemaPath + '.')) {
                initialFocusKey = leafSp.slice(schemaPath.length + 1);
              } else {
                initialFocusKey = undefined;
              }
              break;
            }
          }
        }
        inner = inner.parent!;
      }
    }

    if (!['number', 'color', 'enum', 'boolean', 'object', 'pointref', 'anchor', 'string'].includes(type)) return;

    // Derive section from modelPath
    const section = deriveSectionFromModelPath(modelPath);

    const coords = view.coordsAtPos(pos);
    if (!coords) return;

    popupOpenRef.current = true;
    setPopup({
      path: modelPath,
      schemaPath,
      section,
      position: { x: coords.left, y: coords.bottom + 4 },
      initialFocusKey,
    });
  }, []);

  // AST-driven completion source
  const astCompletionAdapter = useCallback((context: CompletionContext): CompletionResult | null => {
    const wordBefore = context.matchBefore(/[\w@]+/);
    if (!context.explicit && !wordBefore) return null;

    const ast = context.state.field(astField);

    // Get current line text up to cursor, EXCLUDING the partially-typed word.
    // This keeps context detection stable as the user types — CodeMirror handles
    // filtering by the partial word itself.
    const line = context.state.doc.lineAt(context.pos);
    const fullLineText = context.state.doc.sliceString(line.from, context.pos);
    const lineText = wordBefore
      ? context.state.doc.sliceString(line.from, wordBefore.from)
      : fullLineText;

    const items = completionsAt(
      ast, wordBefore ? wordBefore.from : context.pos, lineText, modelManagerRef.current.json,
    );
    if (items.length === 0) return null;

    // Let CodeMirror handle prefix filtering (it has built-in fuzzy matching).
    // We just return all items; CodeMirror filters by the word at `from`.
    const sectionCache: Record<string, { name: string; rank: number; header: (section: { name: string }) => HTMLElement }> = {};
    function getSection(scope: string) {
      if (sectionCache[scope]) return sectionCache[scope];
      const isNode = scope === 'node';
      const section = {
        name: isNode ? 'node properties' : scope,
        rank: isNode ? 1 : 0,
        header(sec: { name: string }) {
          const el = document.createElement('div');
          el.style.cssText = 'padding: 2px 8px; font-size: 10px; color: #5a5f69; border-top: 1px solid #2a2d35; font-family: monospace;';
          el.textContent = sec.name;
          return el;
        },
      };
      sectionCache[scope] = section;
      return section;
    }

    const from = wordBefore ? wordBefore.from : context.pos;
    return {
      from,
      options: items.map(item => {
        const option: any = {
          label: item.label,
          detail: item.detail,
          type: item.type === 'property' ? 'property' : item.type === 'value' ? 'constant' : 'keyword',
        };
        if (item.snippetTemplate) {
          option.apply = snippet(item.snippetTemplate);
        }
        if (item.scope) {
          option.section = getSection(item.scope);
        }
        return option;
      }),
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
        // Completion: AST-driven
        autocompletion({
          override: [astCompletionAdapter],
          activateOnTyping: true,
        }),
        // Linter: DSL (AST-based)
        dslEditorLinter,
        lintGutter(),
        // AST decorations
        astExtension(),
        // Hover tooltip (reads AST)
        createHoverTooltipSource(),
        // Node toggle gutter (AST-based)
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
    [handleEditorClick, handleNodeToggle, getNodeFormat, astCompletionAdapter],
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

    // Push initial AST
    view.dispatch({
      effects: [setAst.of(initialResult.ast)],
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

// --- Helpers ---

function deriveSectionFromModelPath(modelPath: string): 'node' | 'style' | 'animate' | 'images' {
  if (modelPath.startsWith('styles')) return 'style';
  if (modelPath.startsWith('animate')) return 'animate';
  if (modelPath.startsWith('images')) return 'images';
  return 'node';
}
