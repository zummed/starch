/**
 * StructuralEditor — ProseMirror-based structural editor for Starch DSL.
 *
 * Uses a lightweight custom React NodeView adapter (reactNodeView.tsx) instead
 * of @prosemirror-adapter/react, which is incompatible with React 19.
 */
import {
  useRef,
  useEffect,
  useImperativeHandle,
  useCallback,
  forwardRef,
  type Ref,
} from 'react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { history, undo, redo } from 'prosemirror-history';

import { starchSchema } from './schema/starchSchema';
import { extractModel } from './extractModel';
import { importDsl, type ImportResult } from './io/importDsl';
import { exportDsl } from './io/exportDsl';
import { type FormatHints, emptyFormatHints } from '../dsl/formatHints';

import { navigationPlugin } from './plugins/navigationPlugin';
import { completionPlugin } from './plugins/completionPlugin';
import { draftResolverPlugin } from './plugins/draftResolverPlugin';

import { reactNodeView } from './reactNodeView';
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
  loadDsl(text: string): void;
  getDsl(): string;
}

// ---------------------------------------------------------------------------
// NodeView factories (created once, reused)
// ---------------------------------------------------------------------------

const nodeViews = {
  scene_node: reactNodeView(SceneNodeView),
  property_slot: reactNodeView(PropertySlotView),
  compound_slot: reactNodeView(CompoundSlotView),
  metadata: reactNodeView(MetadataView),
  style_block: reactNodeView(StyleBlockView),
  animate_block: reactNodeView(AnimateBlockView),
  images_block: reactNodeView(ImagesBlockView),
  keyframe_block: reactNodeView(KeyframeBlockView),
  keyframe_entry: reactNodeView(KeyframeEntryView),
  style_ref: reactNodeView(
    ({ node }) => <span className="style-ref">{node.attrs.name as string}</span>,
    { atom: true },
  ),
  geometry_slot: reactNodeView(({ node }) => (
    <div className="geometry-slot">
      <span className="keyword">{node.attrs.keyword as string}</span>{' '}
      <span className="value" data-content-hole="" />
    </div>
  )),
  image_entry: reactNodeView(({ node }) => (
    <div className="property-slot">
      <span className="key">{node.attrs.key as string}</span>
      <span className="value" data-content-hole="" />
    </div>
  )),
  chapter: reactNodeView(({ node }) => (
    <div className="keyframe-entry">
      <span className="key">chapter</span>{' '}
      <span data-content-hole="" />
    </div>
  )),
  draft_slot: reactNodeView(({ node }) => (
    <div className="draft-slot">
      <span data-content-hole="" />
      {node.attrs.expectedType && (
        <span className="draft-hint">{node.attrs.expectedType as string}</span>
      )}
    </div>
  )),
};

// ---------------------------------------------------------------------------
// Plugins (created once per editor instance)
// ---------------------------------------------------------------------------

function createPlugins() {
  return [
    history(),
    keymap({ 'Mod-z': undo, 'Mod-Shift-z': redo, 'Mod-y': redo }),
    keymap(baseKeymap),
    navigationPlugin(),
    completionPlugin(),
    draftResolverPlugin(),
  ];
}

// ---------------------------------------------------------------------------
// Editor component
// ---------------------------------------------------------------------------

export const StructuralEditor = forwardRef(function StructuralEditor(
  { initialDsl, onModelChange, height }: StructuralEditorProps,
  ref: Ref<StructuralEditorHandle>,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const formatHintsRef = useRef<FormatHints>(emptyFormatHints());
  const onModelChangeRef = useRef(onModelChange);
  onModelChangeRef.current = onModelChange;

  const createState = useCallback((dslText: string): EditorState => {
    let result: ImportResult;
    try {
      result = importDsl(dslText);
    } catch {
      result = {
        doc: starchSchema.node('doc', null, []),
        formatHints: emptyFormatHints(),
      };
    }
    formatHintsRef.current = result.formatHints;

    return EditorState.create({
      doc: result.doc,
      plugins: createPlugins(),
    });
  }, []);

  // Mount / unmount the EditorView.
  useEffect(() => {
    if (!containerRef.current) return;

    const state = createState(initialDsl);

    const view = new EditorView(containerRef.current, {
      state,
      dispatchTransaction(tr) {
        const newState = view.state.apply(tr);
        view.updateState(newState);

        if (tr.docChanged) {
          const model = extractModel(newState.doc);
          onModelChangeRef.current(model);
        }
      },
      nodeViews,
    });

    viewRef.current = view;

    // Emit initial model
    const initialModel = extractModel(state.doc);
    onModelChangeRef.current(initialModel);

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        if (!view) return '';
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
