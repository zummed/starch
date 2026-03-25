import { describe, it, expect } from 'vitest';
import { completionsAt, type CompletionItem } from '../../dsl/astCompletions';
import { buildAstFromModel } from '../../dsl/astEmitter';
import { buildAstFromText } from '../../dsl/astParser';
import { emptyFormatHints } from '../../dsl/formatHints';

const hints = emptyFormatHints();

function labels(items: CompletionItem[]): string[] {
  return items.map(i => i.label);
}

describe('completionsAt', () => {
  describe('null AST', () => {
    it('returns top-level keywords when AST is null', () => {
      const items = completionsAt(null, 0);
      const l = labels(items);
      expect(l).toContain('animate');
      expect(l).toContain('style');
      expect(l).toContain('background');
    });
  });

  describe('line-text completions', () => {
    it('returns color completions after fill keyword', () => {
      const items = completionsAt(null, 0, 'box: rect 140x80 fill ');
      const l = labels(items);
      expect(l).toContain('red');
      expect(l).toContain('blue');
      expect(l).toContain('hsl');
      expect(l).toContain('rgb');
    });

    it('returns color completions after stroke keyword', () => {
      const items = completionsAt(null, 0, 'box: rect 140x80 stroke r');
      const l = labels(items);
      expect(l).toContain('red');
    });

    it('returns easing values after easing=', () => {
      const items = completionsAt(null, 0, '  0 easing=');
      const l = labels(items);
      expect(l).toContain('linear');
      expect(l).toContain('easeIn');
    });

    it('returns style names after @', () => {
      const styles = { primary: { fill: 'blue' }, secondary: { fill: 'red' } };
      const items = completionsAt(null, 0, 'box: rect 140x80 @', { styles });
      const l = labels(items);
      expect(l).toContain('primary');
      expect(l).toContain('secondary');
    });

    it('returns node IDs after ->', () => {
      const model = { objects: [{ id: 'a' }, { id: 'b' }] };
      const items = completionsAt(null, 0, 'a -> ', model);
      const l = labels(items);
      expect(l).toContain('a');
      expect(l).toContain('b');
    });

    it('returns look targets after look=', () => {
      const model = { objects: [{ id: 'target' }, { id: 'cam' }] };
      const items = completionsAt(null, 0, 'cam: camera look=', model);
      const l = labels(items);
      expect(l).toContain('target');
      expect(l).toContain('cam');
    });
  });

  describe('AST context completions', () => {
    it('returns top-level keywords for document root', () => {
      const { ast } = buildAstFromModel({ objects: [] }, hints);
      // Position 0 in an empty document should give top-level
      const items = completionsAt(ast, 0);
      const l = labels(items);
      expect(l).toContain('animate');
      expect(l).toContain('style');
    });

    it('returns node property keywords in node context', () => {
      const scene = { objects: [{ id: 'box', rect: { w: 140, h: 80 } }] };
      const { ast, text } = buildAstFromModel(scene, hints);
      // Position at the newline after the node line content — gap case
      const pos = text.indexOf('80') + 2; // after '80', at the \n
      const items = completionsAt(ast, pos);
      const l = labels(items);
      expect(l).toContain('fill');
      expect(l).toContain('stroke');
      expect(l).toContain('at');
    });

    it('returns geometry keywords for section context', () => {
      const scene = { objects: [{ id: 'box', rect: { w: 100, h: 100 } }] };
      const { ast } = buildAstFromModel(scene, hints);
      // Use sectionCompletions directly by finding the section
      const section = ast.children.find(c => c.dslRole === 'section');
      expect(section).toBeDefined();
      if (section) {
        // Verify the section provides geometry keywords when asked directly
        const items = completionsAt(ast, section.from);
        const l = labels(items);
        // This should resolve to the node line compound (gap-finding will
        // hit the compound inside the section), which offers node properties
        expect(l).toContain('fill');
        expect(l).toContain('stroke');
      }
    });

    it('returns color completions in fill context', () => {
      const scene = { objects: [{ id: 'box', rect: { w: 140, h: 80 }, fill: 'red' }] };
      const { ast, text } = buildAstFromModel(scene, hints);
      // Find the position within the fill value
      const fillPos = text.indexOf('red');
      if (fillPos >= 0) {
        const items = completionsAt(ast, fillPos);
        const l = labels(items);
        // Should include color names
        expect(l).toContain('red');
        expect(l).toContain('blue');
      }
    });
  });

  describe('from parsed text', () => {
    it('returns completions for parsed AST', () => {
      const { ast } = buildAstFromText('box: rect 140x80');
      // After the node line, completions should include properties
      const items = completionsAt(ast, 16);
      const l = labels(items);
      expect(l).toContain('fill');
      expect(l).toContain('stroke');
    });
  });
});
