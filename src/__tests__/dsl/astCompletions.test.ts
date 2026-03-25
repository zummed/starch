import { describe, it, expect } from 'vitest';
import { completionsAt, type CompletionItem } from '../../dsl/astCompletions';
import { buildAstFromModel } from '../../dsl/astEmitter';
import { buildAstFromText } from '../../dsl/astParser';
import { emptyFormatHints } from '../../dsl/formatHints';

const hints = emptyFormatHints();

function labels(items: CompletionItem[]): string[] {
  return items.map(i => i.label);
}

function scoped(items: CompletionItem[], scope: string): string[] {
  return items.filter(i => i.scope === scope).map(i => i.label);
}

function snippets(items: CompletionItem[]): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const i of items) result[i.label] = i.snippetTemplate;
  return result;
}

/**
 * Simulate what the V2Editor adapter does: strip the partial word from lineText.
 * This mirrors the fix where we pass lineText without the word being typed,
 * so context detection stays stable as the user types to filter.
 */
function completionsWithPrefix(
  text: string,
  cursorOffset: number,
  modelJson?: any,
): { items: CompletionItem[]; prefix: string } {
  const lineStart = text.lastIndexOf('\n', cursorOffset - 1) + 1;
  const fullLine = text.slice(lineStart, cursorOffset);
  // Find word at end (simulates CodeMirror's matchBefore(/[\w@]+/))
  const wordMatch = fullLine.match(/([\w@]+)$/);
  const prefix = wordMatch ? wordMatch[1] : '';
  const lineText = wordMatch ? fullLine.slice(0, fullLine.length - prefix.length) : fullLine;
  const pos = wordMatch ? cursorOffset - prefix.length : cursorOffset;

  const { ast } = buildAstFromText(text);
  const items = completionsAt(ast, pos, lineText, modelJson);
  return { items, prefix };
}

function filteredLabels(text: string, cursorOffset: number, modelJson?: any): string[] {
  const { items, prefix } = completionsWithPrefix(text, cursorOffset, modelJson);
  if (!prefix) return labels(items);
  const lower = prefix.toLowerCase();
  return labels(items).filter(l => l.toLowerCase().startsWith(lower));
}

describe('completionsAt', () => {
  // ─── Top-Level ────────────────────────────────────────────────

  describe('top-level context', () => {
    it('returns top-level keywords when AST is null', () => {
      const l = labels(completionsAt(null, 0));
      expect(l).toContain('animate');
      expect(l).toContain('style');
      expect(l).toContain('background');
      expect(l).toContain('name');
    });

    it('returns top-level keywords for document root', () => {
      const { ast } = buildAstFromModel({ objects: [] }, hints);
      const l = labels(completionsAt(ast, 0));
      expect(l).toContain('animate');
      expect(l).toContain('style');
    });
  });

  // ─── Geometry Keywords ────────────────────────────────────────

  describe('geometry keywords after node ID', () => {
    it('offers geometry types after "id: "', () => {
      const l = labels(completionsAt(null, 0, 'box: '));
      expect(l).toContain('rect');
      expect(l).toContain('ellipse');
      expect(l).toContain('text');
      expect(l).toContain('image');
      expect(l).toContain('camera');
    });

    it('offers geometry types after "id:" (no space)', () => {
      const l = labels(completionsAt(null, 0, 'box:'));
      expect(l).toContain('rect');
    });

    it('filters geometry by prefix — "re" matches rect', () => {
      const fl = filteredLabels('box: re\n', 7);
      expect(fl).toContain('rect');
      expect(fl).not.toContain('ellipse');
    });

    it('filters geometry by prefix — "cam" matches camera', () => {
      const fl = filteredLabels('box: cam\n', 8);
      expect(fl).toContain('camera');
      expect(fl).not.toContain('rect');
    });

    it('filters geometry by prefix — "el" matches ellipse', () => {
      const fl = filteredLabels('box: el\n', 7);
      expect(fl).toContain('ellipse');
    });

    it('geometry keywords have snippet templates', () => {
      const items = completionsAt(null, 0, 'box: ');
      const s = snippets(items);
      expect(s['rect']).toContain('${1:W}x${2:H}');
      expect(s['ellipse']).toContain('${1:RX}x${2:RY}');
      expect(s['text']).toContain('"${1:content}"');
    });
  });

  // ─── Color Completions ────────────────────────────────────────

  describe('color completions', () => {
    it('returns colors after "fill "', () => {
      const l = labels(completionsAt(null, 0, 'box: rect 100x100 fill '));
      expect(l).toContain('red');
      expect(l).toContain('blue');
      expect(l).toContain('cornflowerblue');
      expect(l).toContain('hsl');
      expect(l).toContain('rgb');
    });

    it('returns colors after "stroke "', () => {
      const l = labels(completionsAt(null, 0, 'box: rect 100x100 stroke '));
      expect(l).toContain('red');
      expect(l).toContain('hsl');
    });

    it('filters colors by prefix — "steel" matches steelblue', () => {
      const fl = filteredLabels('box: rect 100x100 fill steel\n', 28);
      expect(fl).toContain('steelblue');
      expect(fl).not.toContain('red');
    });

    it('hsl/rgb have snippet templates in color list', () => {
      const items = completionsAt(null, 0, 'fill ');
      const s = snippets(items);
      expect(s['hsl']).toContain('${1:H} ${2:S} ${3:L}');
      expect(s['rgb']).toContain('${1:R} ${2:G} ${3:B}');
    });
  });

  // ─── Positional Keywords (no named completions) ───────────────

  describe('positional keyword context', () => {
    it('"rect " offers WxH snippet, not property names', () => {
      const items = completionsAt(null, 0, 'box: rect ');
      const l = labels(items);
      expect(l).not.toContain('fill');  // not node-level
      expect(l).not.toContain('w');     // not positional field names
      // Should offer dimension snippet
      expect(items.length).toBeLessThanOrEqual(1);
      if (items.length > 0) {
        expect(items[0].snippetTemplate).toContain('x');
      }
    });

    it('"at " offers X,Y snippet, not node properties', () => {
      const items = completionsAt(null, 0, 'box: rect 100x100 at ');
      const l = labels(items);
      expect(l).not.toContain('fill');
      expect(l).not.toContain('x');
      expect(items.length).toBeLessThanOrEqual(1);
      if (items.length > 0) {
        expect(items[0].snippetTemplate).toContain('${1:X}');
      }
    });

    it('"hsl " offers H S L snippet', () => {
      const items = completionsAt(null, 0, 'fill hsl ');
      expect(items.length).toBeLessThanOrEqual(1);
      if (items.length > 0) {
        expect(items[0].snippetTemplate).toContain('${1:H}');
      }
    });

    it('"rgb " offers R G B snippet', () => {
      const items = completionsAt(null, 0, 'fill rgb ');
      expect(items.length).toBeLessThanOrEqual(1);
      if (items.length > 0) {
        expect(items[0].snippetTemplate).toContain('${1:R}');
      }
    });

    it('"ellipse " offers dimension snippet', () => {
      const items = completionsAt(null, 0, 'box: ellipse ');
      expect(items.length).toBeLessThanOrEqual(1);
    });
  });

  // ─── Kwarg Value Completions ──────────────────────────────────

  describe('kwarg value completions (after =)', () => {
    it('returns easing values after "easing="', () => {
      const l = labels(completionsAt(null, 0, '  0 easing='));
      expect(l).toContain('linear');
      expect(l).toContain('easeIn');
      expect(l).toContain('easeOut');
    });

    it('returns node IDs after "look="', () => {
      const model = { objects: [{ id: 'target' }, { id: 'cam' }] };
      const l = labels(completionsAt(null, 0, 'cam: camera look=', model));
      expect(l).toContain('target');
      expect(l).toContain('cam');
    });

    it('returns style names after "@"', () => {
      const model = { styles: { primary: { fill: 'blue' }, dark: { fill: 'black' } } };
      const l = labels(completionsAt(null, 0, 'box: rect 100x100 @', model));
      expect(l).toContain('primary');
      expect(l).toContain('dark');
    });

    it('returns node IDs after "->"', () => {
      const model = { objects: [{ id: 'a' }, { id: 'b' }] };
      const l = labels(completionsAt(null, 0, 'a -> ', model));
      expect(l).toContain('a');
      expect(l).toContain('b');
    });
  });

  // ─── Two-Tier Scoped Completions ──────────────────────────────

  describe('two-tier scoped completions', () => {
    it('after "stroke red ": width in stroke scope, properties in node scope', () => {
      const { ast } = buildAstFromText('box: rect 100x100 stroke red ');
      const items = completionsAt(ast, 29, 'box: rect 100x100 stroke red ');
      expect(scoped(items, 'stroke')).toContain('width');
      expect(scoped(items, 'node')).toContain('fill');
      expect(scoped(items, 'node')).toContain('at');
    });

    it('after "rect 140x80 ": radius in rect scope, properties in node scope', () => {
      const { ast } = buildAstFromText('box: rect 140x80 ');
      const items = completionsAt(ast, 17, 'box: rect 140x80 ');
      expect(scoped(items, 'rect')).toContain('radius');
      expect(scoped(items, 'node')).toContain('fill');
      expect(scoped(items, 'node')).toContain('stroke');
    });

    it('after "fill red ": no scope tags (color is a leaf type)', () => {
      const { ast } = buildAstFromText('box: rect 100x100 fill red ');
      const items = completionsAt(ast, 27, 'box: rect 100x100 fill red ');
      const scopedItems = items.filter(i => i.scope !== undefined);
      expect(scopedItems).toHaveLength(0);
    });

    it('after "rect 140x80 radius=8 ": rect scope empty, node scope only', () => {
      const { ast } = buildAstFromText('box: rect 140x80 radius=8 ');
      const items = completionsAt(ast, 26, 'box: rect 140x80 radius=8 ');
      expect(scoped(items, 'rect')).toHaveLength(0);
      // Node properties should still be available
      const l = labels(items);
      expect(l).toContain('fill');
    });

    it('after "stroke red width=2 ": stroke scope empty, node scope only', () => {
      const { ast } = buildAstFromText('box: rect 100x100 stroke red width=2 ');
      const items = completionsAt(ast, 37, 'box: rect 100x100 stroke red width=2 ');
      expect(scoped(items, 'stroke')).toHaveLength(0);
    });
  });

  // ─── Positional Fields Excluded from Completions ──────────────

  describe('positional fields excluded', () => {
    it('rect completions do NOT include w or h (positional, not kwargs)', () => {
      const { ast } = buildAstFromText('box: rect 140x80 ');
      const items = completionsAt(ast, 17, 'box: rect 140x80 ');
      const rectItems = scoped(items, 'rect');
      expect(rectItems).not.toContain('w');
      expect(rectItems).not.toContain('h');
      expect(rectItems).toContain('radius');
    });

    it('stroke completions do NOT include color (positional)', () => {
      const { ast } = buildAstFromText('box: rect 100x100 stroke red ');
      const items = completionsAt(ast, 29, 'box: rect 100x100 stroke red ');
      const strokeItems = scoped(items, 'stroke');
      expect(strokeItems).not.toContain('color');
      expect(strokeItems).toContain('width');
    });

    it('transform completions do NOT include x or y (positional)', () => {
      const { ast } = buildAstFromText('box: rect 100x100 at 50,75 ');
      const items = completionsAt(ast, 27, 'box: rect 100x100 at 50,75 ');
      const atItems = scoped(items, 'transform');
      expect(atItems).not.toContain('x');
      expect(atItems).not.toContain('y');
      // Should have transform kwargs
      expect(atItems).toContain('rotation');
      expect(atItems).toContain('scale');
    });
  });

  // ─── Snippet Templates ────────────────────────────────────────

  describe('snippet templates', () => {
    it('fill has a color snippet template', () => {
      const { ast } = buildAstFromText('box: rect 100x100 ');
      const items = completionsAt(ast, 18, 'box: rect 100x100 ');
      const fill = items.find(i => i.label === 'fill');
      expect(fill?.snippetTemplate).toBe('fill ${1:color}');
    });

    it('stroke has a color snippet template', () => {
      const { ast } = buildAstFromText('box: rect 100x100 ');
      const items = completionsAt(ast, 18, 'box: rect 100x100 ');
      const stroke = items.find(i => i.label === 'stroke');
      expect(stroke?.snippetTemplate).toContain('${1:color}');
    });

    it('at has a position snippet template', () => {
      const { ast } = buildAstFromText('box: rect 100x100 ');
      const items = completionsAt(ast, 18, 'box: rect 100x100 ');
      const at = items.find(i => i.label === 'at');
      expect(at?.snippetTemplate).toContain('${1:X},${2:Y}');
    });

    it('kwarg completions have value snippets', () => {
      const { ast } = buildAstFromText('box: rect 140x80 ');
      const items = completionsAt(ast, 17, 'box: rect 140x80 ');
      const radius = items.find(i => i.label === 'radius');
      expect(radius?.snippetTemplate).toMatch(/radius=\$\{1:\d+\}/);
    });

    it('layout has a type snippet template', () => {
      const { ast } = buildAstFromText('box: rect 100x100 ');
      const items = completionsAt(ast, 18, 'box: rect 100x100 ');
      const layout = items.find(i => i.label === 'layout');
      expect(layout?.snippetTemplate).toContain('${1:type}');
    });
  });

  // ─── Prefix Filtering Stability ───────────────────────────────
  // Simulates the V2Editor adapter behavior: lineText stripped of partial word.
  // Ensures the same result set is returned regardless of what's been typed so far,
  // so CodeMirror can filter the list as the user types.

  describe('prefix filtering stability', () => {
    it('typing "fi" after "rect 100x100 " still shows fill', () => {
      // User typed "box: rect 100x100 fi" — adapter strips "fi", lineText = "box: rect 100x100 "
      const fl = filteredLabels('box: rect 100x100 fi\n', 20);
      expect(fl).toContain('fill');
    });

    it('typing "st" after "rect 100x100 " still shows stroke', () => {
      const fl = filteredLabels('box: rect 100x100 st\n', 20);
      expect(fl).toContain('stroke');
    });

    it('typing "ra" after "rect 100x100 " still shows radius', () => {
      const fl = filteredLabels('box: rect 100x100 ra\n', 20);
      expect(fl).toContain('radius');
    });

    it('typing "re" on fresh node line still shows rect', () => {
      const fl = filteredLabels('box: re\n', 7);
      expect(fl).toContain('rect');
    });

    it('typing "cam" on fresh node line still shows camera', () => {
      const fl = filteredLabels('box: cam\n', 8);
      expect(fl).toContain('camera');
    });

    it('typing "wid" after "stroke red " shows width', () => {
      const fl = filteredLabels('box: rect 100x100 stroke red wid\n', 33);
      expect(fl).toContain('width');
    });

    it('typing "rot" after "at 50,75 " shows rotation', () => {
      const fl = filteredLabels('box: rect 100x100 at 50,75 rot\n', 31);
      expect(fl).toContain('rotation');
    });
  });

  // ─── Node Property Completions ────────────────────────────────

  describe('node property completions', () => {
    it('does not offer geometry keywords when geometry already present', () => {
      const { ast } = buildAstFromText('box: rect 100x100 ');
      const items = completionsAt(ast, 18, 'box: rect 100x100 ');
      const l = labels(items);
      expect(l).not.toContain('rect');
      expect(l).not.toContain('ellipse');
    });

    it('does not offer properties already present on the node', () => {
      const { ast } = buildAstFromText('box: rect 100x100 fill red ');
      const items = completionsAt(ast, 27, 'box: rect 100x100 fill red ');
      const l = labels(items);
      expect(l).not.toContain('fill');  // already present
      expect(l).toContain('stroke');    // not yet present
    });

    it('offers @style references when styles exist in model', () => {
      const model = { styles: { primary: {} }, objects: [{ id: 'box', rect: { w: 100, h: 100 } }] };
      const { ast } = buildAstFromText('box: rect 100x100 ');
      const items = completionsAt(ast, 18, 'box: rect 100x100 ', model);
      const l = labels(items);
      expect(l).toContain('@primary');
    });
  });

  // ─── Derived from Schema (no hardcoded strings) ───────────────

  describe('schema-derived (single source of truth)', () => {
    it('geometry list comes from NodeSchema hints, not hardcoded', () => {
      // If a new geometry is added to NodeSchema.geometry hint,
      // it should appear without changing completions code
      const items = completionsAt(null, 0, 'box: ');
      const l = labels(items);
      // All geometry types from NodeSchema should be present
      expect(l).toContain('rect');
      expect(l).toContain('ellipse');
      expect(l).toContain('text');
      expect(l).toContain('image');
      expect(l).toContain('camera');
      expect(l).toContain('path');
    });

    it('node properties come from NodeSchema hints', () => {
      const { ast } = buildAstFromText('box: rect 100x100 ');
      const items = completionsAt(ast, 18, 'box: rect 100x100 ');
      const l = labels(items);
      // These are derived from inlineProps/blockProps/kwargs/flags
      expect(l).toContain('fill');
      expect(l).toContain('stroke');
      expect(l).toContain('at');
      expect(l).toContain('dash');
      expect(l).toContain('layout');
    });

    it('color-positional detection is schema-driven', () => {
      // fill and stroke should trigger color completions
      // because their schema type resolves to 'color'
      const fillItems = completionsAt(null, 0, 'fill ');
      expect(labels(fillItems)).toContain('red');

      const strokeItems = completionsAt(null, 0, 'stroke ');
      expect(labels(strokeItems)).toContain('red');
    });
  });
});
