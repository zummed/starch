/**
 * AST-based CodeMirror decorations.
 *
 * Replaces schemaDecorations.ts — uses AstNode tree instead of flat SchemaSpan[].
 * Provides:
 *   - setAst: StateEffect to push a new AST root
 *   - astField: StateField holding the current AstNode | null
 *   - astDecorations: StateField building Decoration.mark from AST leaves
 *   - astExtension(): bundle of all extensions
 */
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';
import { StateField, StateEffect } from '@codemirror/state';
import type { AstNode } from './astTypes';
import { flattenLeaves } from './astTypes';

/** State effect to replace the current AST root. */
export const setAst = StateEffect.define<AstNode | null>();

/** StateField that holds the current AST root. */
export const astField = StateField.define<AstNode | null>({
  create: () => null,
  update(ast, tr) {
    for (const e of tr.effects) {
      if (e.is(setAst)) return e.value;
    }
    return ast;
  },
});

/** StateField that builds decorations from AST leaves. Only rebuilds when setAst fires. */
export const astDecorations = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decos, tr) {
    // Only rebuild when AST actually changed
    if (!tr.effects.some(e => e.is(setAst))) return decos;
    const ast = tr.state.field(astField);
    if (!ast) return Decoration.none;

    const leaves = flattenLeaves(ast);
    if (leaves.length === 0) return Decoration.none;

    const docLength = tr.state.doc.length;
    const marks = leaves
      .filter(leaf => leaf.from < leaf.to && leaf.to <= docLength)
      .map(leaf =>
        Decoration.mark({
          attributes: {
            'data-schema-path': leaf.schemaPath,
            'data-model-path': leaf.modelPath,
            'data-dsl-role': leaf.dslRole,
          },
        }).range(leaf.from, leaf.to)
      );

    // Decorations must be sorted by from position
    marks.sort((a, b) => a.from - b.from);
    return Decoration.set(marks);
  },
  provide: f => EditorView.decorations.from(f),
});

/** Bundle of extensions for AST-based decorations. */
export function astExtension() {
  return [astField, astDecorations];
}
