/**
 * StructuralEditor — ProseMirror-based structural editor for Starch DSL.
 *
 * Replaces the old CodeMirror-backed V2Editor with a schema-driven,
 * NodeView-powered editing surface.
 */
import {
  useRef,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
  type Ref,
} from 'react';
import { EditorState, type Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { history, undo, redo } from 'prosemirror-history';
import {
  ProsemirrorAdapterProvider,
  useNodeViewFactory,
} from '@prosemirror-adapter/react';

import { starchSchema } from './schema/starchSchema';
import { extractModel } from './extractModel';
import { importDsl, type ImportResult } from './io/importDsl';
import { exportDsl } from './io/exportDsl';
import { type FormatHints, emptyFormatHints } from '../dsl/formatHints';

import { navigationPlugin } from './plugins/navigationPlugin';
import { completionPlugin } from './plugins/completionPlugin';
import { draftResolverPlugin } from './plugins/draftResolverPlugin';

import { SceneNodeView } from './views/SceneNodeView';
import { PropertySlotView } from './views/PropertySlotView';
import { CompoundSlotView } from './views/CompoundSlotView';
import { MetadataView } from './views/MetadataView';
import {
  StyleBlockView,
  AnimateBlockView,
  ImagesBlockView,
} from './views/SectionView';
import { KeyframeBlockView, KeyframeEntryView } from './views/KeyframeView';

import './editorStyles.css';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface StructuralEditorProps {
  initialDsl: string;
  onModelChange: (model: Record<string, any>) => void;
  height?: string;
}

export interface StructuralEditorHandle {
  /** Replace the editor content with new DSL text. */
  loadDsl(text: string): void;
  /** Serialise the current document back to DSL text. */
  getDsl(): string;
}

// ---------------------------------------------------------------------------
// Inner component (must be rendered inside ProsemirrorAdapterProvider)
// ---------------------------------------------------------------------------

const StructuralEditorInner = forwardRef(function StructuralEditorInner(
  { initialDsl, onModelChange, height }: StructuralEditorProps,
  ref: Ref<StructuralEditorHandle>,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const formatHintsRef = useRef<FormatHints>(emptyFormatHints());
  const onModelChangeRef = useRef(onModelChange);
  onModelChangeRef.current = onModelChange;

  const nodeViewFactory = useNodeViewFactory();

  // Build the ProseMirror nodeViews record using the adapter factory.
  const buildNodeViews = useCallback(() => {
    return {
      scene_node: nodeViewFactory({ component: SceneNodeView }),
      property_slot: nodeViewFactory({ component: PropertySlotView }),
      compound_slot: nodeViewFactory({ component: CompoundSlotView }),
      metadata: nodeViewFactory({ component: MetadataView }),
      style_block: nodeViewFactory({ component: StyleBlockView }),
      animate_block: nodeViewFactory({ component: AnimateBlockView }),
      images_block: nodeViewFactory({ component: ImagesBlockView }),
      keyframe_block: nodeViewFactory({ component: KeyframeBlockView }),
      keyframe_entry: nodeViewFactory({ component: KeyframeEntryView }),
    };
  }, [nodeViewFactory]);

  // Create ProseMirror state from DSL text.
  const createState = useCallback((dslText: string): EditorState => {
    let result: ImportResult;
    try {
      result = importDsl(dslText);
    } catch {
      // If parsing fails, start with an empty doc
      result = {
        doc: starchSchema.node('doc', null, []),
        formatHints: emptyFormatHints(),
      };
    }
    formatHintsRef.current = result.formatHints;

    return EditorState.create({
      doc: result.doc,
      plugins: [
        history(),
        keymap({ 'Mod-z': undo, 'Mod-Shift-z': redo, 'Mod-y': redo }),
        keymap(baseKeymap),
        navigationPlugin(),
        completionPlugin(),
        draftResolverPlugin(),
      ],
    });
  }, []);

  // Dispatch handler -- called on every transaction.
  const dispatchTransaction = useCallback(
    (tr: Transaction) => {
      const view = viewRef.current;
      if (!view) return;

      const newState = view.state.apply(tr);
      view.updateState(newState);

      if (tr.docChanged) {
        const model = extractModel(newState.doc);
        onModelChangeRef.current(model);
      }
    },
    [],
  );

  // Mount / unmount the EditorView.
  useEffect(() => {
    if (!containerRef.current) return;

    const state = createState(initialDsl);

    const view = new EditorView(containerRef.current, {
      state,
      dispatchTransaction(tr) {
        // Use the closure-captured helper so we always get the latest ref.
        const newState = view.state.apply(tr);
        view.updateState(newState);

        if (tr.docChanged) {
          const model = extractModel(newState.doc);
          onModelChangeRef.current(model);
        }
      },
      nodeViews: buildNodeViews(),
    });

    viewRef.current = view;

    // Fire initial model extraction so the consumer gets the parsed model
    // even before the user types anything.
    const initialModel = extractModel(state.doc);
    onModelChangeRef.current(initialModel);

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only run on mount -- initialDsl is consumed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Expose imperative methods.
  useImperativeHandle(
    ref,
    () => ({
      loadDsl(text: string) {
        const view = viewRef.current;
        if (!view) return;

        const state = createState(text);
        view.updateState(state);

        const model = extractModel(state.doc);
        onModelChangeRef.current(model);
      },

      getDsl() {
        const view = viewRef.current;
        if (!view) {
          return '';
        }
        return exportDsl(view.state.doc, formatHintsRef.current);
      },
    }),
    [createState],
  );

  return (
    <div
      className="starch-editor"
      style={{ height: height ?? '100%', overflow: 'auto' }}
      ref={containerRef}
    />
  );
});

// ---------------------------------------------------------------------------
// Public wrapper (provides the adapter context)
// ---------------------------------------------------------------------------

export const StructuralEditor = forwardRef(function StructuralEditor(
  props: StructuralEditorProps,
  ref: Ref<StructuralEditorHandle>,
) {
  return (
    <ProsemirrorAdapterProvider>
      <StructuralEditorInner ref={ref} {...props} />
    </ProsemirrorAdapterProvider>
  );
});
