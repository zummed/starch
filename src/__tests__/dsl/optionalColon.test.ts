/**
 * Tests for colon-optional node declarations inside node-list contexts.
 *
 * At the top level, the colon is required to disambiguate node IDs from
 * potential keywords. Inside an objects/children array, the context makes
 * every line a node definition, so the colon can be dropped.
 */
import { describe, it, expect } from 'vitest';
import { buildAstFromText } from '../../dsl/astParser';

describe('optional colon in node lists', () => {
  describe('inside objects section', () => {
    it('accepts colon-less node declarations', () => {
      const dsl = `objects
  box rect 100x60 fill steelblue
  circle ellipse 50x50 fill red`;
      const { model } = buildAstFromText(dsl);

      expect(model.objects).toHaveLength(2);
      expect(model.objects[0].id).toBe('box');
      expect(model.objects[0].rect).toEqual({ w: 100, h: 60 });
      expect(model.objects[0].fill).toBe('steelblue');
      expect(model.objects[1].id).toBe('circle');
      // ellipse uses diameter format (transform: 'double'), so 50x50 → rx=25, ry=25
      expect(model.objects[1].ellipse).toEqual({ rx: 25, ry: 25 });
    });

    it('accepts mixed colon and colon-less in same section', () => {
      const dsl = `objects
  box: rect 100x60
  circle ellipse 50x50`;
      const { model } = buildAstFromText(dsl);

      expect(model.objects).toHaveLength(2);
      expect(model.objects[0].id).toBe('box');
      expect(model.objects[1].id).toBe('circle');
    });

    it('accepts colon-less with block-formatted body', () => {
      const dsl = `objects
  box rect 100x60
    fill steelblue
    stroke darkblue width=2`;
      const { model } = buildAstFromText(dsl);

      expect(model.objects).toHaveLength(1);
      expect(model.objects[0].id).toBe('box');
      expect(model.objects[0].fill).toBe('steelblue');
      expect(model.objects[0].stroke).toEqual({ color: 'darkblue', width: 2 });
    });
  });

  describe('top-level (no objects header)', () => {
    it('still requires colon at top level', () => {
      // Top-level node declarations still need the colon
      const dsl = `box: rect 100x60 fill steelblue`;
      const { model } = buildAstFromText(dsl);

      expect(model.objects).toHaveLength(1);
      expect(model.objects[0].id).toBe('box');
    });
  });

  describe('nested children', () => {
    it('accepts colon-less children under parent', () => {
      const dsl = `objects
  parent: at 100,100
    child1 rect 50x50 fill red
    child2 ellipse 30x30 fill blue`;
      const { model } = buildAstFromText(dsl);

      expect(model.objects).toHaveLength(1);
      expect(model.objects[0].id).toBe('parent');
      expect(model.objects[0].children).toHaveLength(2);
      expect(model.objects[0].children[0].id).toBe('child1');
      expect(model.objects[0].children[1].id).toBe('child2');
    });
  });

  describe('round-trip with existing samples', () => {
    it('existing colon-ful DSL continues to work', () => {
      const dsl = `objects
  box:
    rect 140x80
    fill steelblue`;
      const { model } = buildAstFromText(dsl);

      expect(model.objects).toHaveLength(1);
      expect(model.objects[0].id).toBe('box');
      expect(model.objects[0].rect.w).toBe(140);
    });
  });
});
