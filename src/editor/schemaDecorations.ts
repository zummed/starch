// src/editor/schemaDecorations.ts
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';
import { StateField, StateEffect } from '@codemirror/state';
import type { SchemaSpan } from './schemaSpan';

/** State effect to replace the current span map. */
export const setSpans = StateEffect.define<SchemaSpan[]>();

/** StateField that holds the current SchemaSpan array. */
export const spanField = StateField.define<SchemaSpan[]>({
  create: () => [],
  update(spans, tr) {
    for (const e of tr.effects) {
      if (e.is(setSpans)) return e.value;
    }
    return spans;
  },
});

/** StateField that builds decorations from spans. Only rebuilds when setSpans fires. */
export const spanDecorations = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decos, tr) {
    // Only rebuild when spans actually changed
    if (!tr.effects.some(e => e.is(setSpans))) return decos;
    const spans = tr.state.field(spanField);
    if (spans.length === 0) return Decoration.none;
    const marks = spans.map(span =>
      Decoration.mark({
        attributes: {
          'data-schema-path': span.schemaPath,
          'data-model-path': span.modelPath,
          'data-section': span.section,
        },
      }).range(span.from, span.to)
    );
    // Decorations must be sorted by from position
    marks.sort((a, b) => a.from - b.from);
    return Decoration.set(marks);
  },
  provide: f => EditorView.decorations.from(f),
});

/** Lookup a span by position. Uses binary search — spans MUST be sorted by `from` ascending
 *  (which SchemaRenderer guarantees since it emits in document order). */
export function getSpanAtPos(spans: SchemaSpan[], pos: number): SchemaSpan | null {
  let lo = 0, hi = spans.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const span = spans[mid];
    if (pos < span.from) hi = mid - 1;
    else if (pos >= span.to) lo = mid + 1;
    else return span;
  }
  return null;
}

/** Bundle of extensions for schema decorations. */
export function schemaDecorationsExtension() {
  return [spanField, spanDecorations];
}
