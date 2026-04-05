/**
 * Regression tests for completion bugs.
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
  const lineEnd = text.indexOf('\n', cursorPos);
  const lineText = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
  return completionsAt(ast, cursorPos, lineText, model);
}

describe('completion bugs', () => {
  describe('top-level completions with existing content', () => {
    it('shows top-level keywords on a blank line after name', () => {
      const text = 'name "Test"\n';
      const completions = getCompletions(text, text.length); // cursor at end
      const labels = completions.map(c => c.label);
      // Top-level keywords: name, description, background, viewport, images, style, animate
      // Should include at least `background` or `animate`
      expect(labels).toContain('background');
      expect(labels).toContain('animate');
    });

    it('does NOT show object-only completions at top level after existing content', () => {
      const text = 'name "Test"\n';
      const completions = getCompletions(text, text.length);
      const labels = completions.map(c => c.label);
      // Should NOT contain node property completions like 'fill', 'stroke', 'opacity'
      // at the top level. These only make sense inside a scene node.
      expect(labels).not.toContain('opacity');
      expect(labels).not.toContain('depth');
    });

    it('shows top-level keywords on blank line after background', () => {
      const text = 'background white\n';
      const completions = getCompletions(text, text.length);
      const labels = completions.map(c => c.label);
      expect(labels).toContain('name');
      expect(labels).toContain('animate');
    });
  });

  describe('animate keyword does not crash', () => {
    it('walkDocument handles incomplete animate keyword', () => {
      const text = 'animate';
      expect(() => walkDocument(text)).not.toThrow();
    });

    it('leavesToAst handles animate-only text', () => {
      const text = 'animate';
      const { ast: ctx } = walkDocument(text);
      expect(() => leavesToAst(ctx.astLeaves(), text.length)).not.toThrow();
    });

    it('completionsAt does not crash for cursor after animate', () => {
      const text = 'animate';
      expect(() => getCompletions(text, text.length)).not.toThrow();
    });

    it('completions after animate keyword are reasonable', () => {
      const text = 'animate ';
      const completions = getCompletions(text, text.length);
      // Should not crash, may be empty or show animate options
      expect(Array.isArray(completions)).toBe(true);
    });
  });
});
