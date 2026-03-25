import { describe, it, expect } from 'vitest';
import { buildAstFromText } from '../../dsl/astParser';

describe('buildAstFromText formatHints', () => {
  it('returns model and formatHints', () => {
    const { model, formatHints } = buildAstFromText('box: rect 100x200');
    expect(model.objects).toHaveLength(1);
    expect(formatHints).toBeDefined();
    expect(formatHints.nodes).toBeDefined();
  });

  it('detects inline node (everything on one line)', () => {
    const { formatHints } = buildAstFromText('box: rect 100x200 fill hsl 210 70 45');
    expect(formatHints.nodes['box']).toEqual({ display: 'inline' });
  });

  it('detects block node (properties on indented lines)', () => {
    const dsl = `box: rect 100x200\n  fill hsl 210 70 45\n  stroke hsl 0 0 0`;
    const { formatHints } = buildAstFromText(dsl);
    expect(formatHints.nodes['box']).toEqual({ display: 'block' });
  });

  it('handles mixed inline and block nodes', () => {
    const dsl = `label: text "hi" fill hsl 210 70 45\nbox: rect 100x200\n  fill hsl 0 80 50`;
    const { formatHints } = buildAstFromText(dsl);
    expect(formatHints.nodes['label']).toEqual({ display: 'inline' });
    expect(formatHints.nodes['box']).toEqual({ display: 'block' });
  });

  it('nodes with no indented children are inline', () => {
    const { formatHints } = buildAstFromText('dot: ellipse 10x10');
    expect(formatHints.nodes['dot']).toEqual({ display: 'inline' });
  });

  it('does not classify animate scope identifiers as nodes', () => {
    const dsl = `box: rect 100x200\nanimate 3s\n  1  box.fill.h: 240`;
    const { formatHints } = buildAstFromText(dsl);
    expect(formatHints.nodes['box']).toEqual({ display: 'inline' });
  });

  it('preserves scene output', () => {
    const { model } = buildAstFromText('box: rect 100x200 fill hsl 210 70 45');
    expect(model.objects[0].id).toBe('box');
    expect(model.objects[0].rect).toEqual({ w: 100, h: 200 });
    expect(model.objects[0].fill).toEqual({ h: 210, s: 70, l: 45 });
  });
});
