/**
 * Completion context should respect cursor's line indentation.
 *
 * - Cursor at column 0 on blank line after content → top-level completions
 * - Cursor indented on new line → node-context completions (continuation)
 */
import { describe, it, expect } from 'vitest';
import { walkDocument } from '../../dsl/schemaWalker';
import { leavesToAst } from '../../dsl/astAdapter';
import { completionsAt } from '../../dsl/astCompletions';

function getCompletions(text: string, cursorPos: number) {
  const { model, ast: ctx } = walkDocument(text);
  const ast = leavesToAst(ctx.astLeaves(), text.length);
  const before = text.slice(0, cursorPos);
  const lineStart = before.lastIndexOf('\n') + 1;
  const lineText = text.slice(lineStart, cursorPos);
  return completionsAt(ast, cursorPos, lineText, model);
}

describe('completion respects line indent', () => {
  it('cursor at col 0 on blank line after a box shows top-level keywords', () => {
    const text = 'box: rect 100x60 fill steelblue at 200,150\n';
    const completions = getCompletions(text, text.length);
    const labels = completions.map(c => c.label);
    // Should show top-level keywords, NOT node/transform-specific
    expect(labels).toContain('animate');
    expect(labels).toContain('background');
    expect(labels).toContain('name');
    // Should NOT contain transform kwargs
    expect(labels).not.toContain('rotation');
    expect(labels).not.toContain('scale');
  });

  it('cursor at col 0 after multi-line content shows top-level', () => {
    const text = 'name "Test"\nbox: rect 100x60\n';
    const completions = getCompletions(text, text.length);
    const labels = completions.map(c => c.label);
    expect(labels).toContain('animate');
    expect(labels).not.toContain('rotation');
  });
});
