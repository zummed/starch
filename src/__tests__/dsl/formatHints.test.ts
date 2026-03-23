import { describe, it, expect } from 'vitest';
import { parseDslWithHints } from '../../dsl/parser';

describe('parseDslWithHints', () => {
  it('returns scene and formatHints', () => {
    const { scene, formatHints } = parseDslWithHints('box: rect 100x200');
    expect(scene.objects).toHaveLength(1);
    expect(formatHints).toBeDefined();
    expect(formatHints.nodes).toBeDefined();
  });

  it('detects inline node (everything on one line)', () => {
    const { formatHints } = parseDslWithHints('box: rect 100x200 fill 210 70 45');
    expect(formatHints.nodes['box']).toEqual({ display: 'inline' });
  });

  it('detects block node (properties on indented lines)', () => {
    const dsl = `box: rect 100x200\n  fill 210 70 45\n  stroke 0 0 0`;
    const { formatHints } = parseDslWithHints(dsl);
    expect(formatHints.nodes['box']).toEqual({ display: 'block' });
  });

  it('handles mixed inline and block nodes', () => {
    const dsl = `label: text "hi" fill 210 70 45\nbox: rect 100x200\n  fill 0 80 50`;
    const { formatHints } = parseDslWithHints(dsl);
    expect(formatHints.nodes['label']).toEqual({ display: 'inline' });
    expect(formatHints.nodes['box']).toEqual({ display: 'block' });
  });

  it('nodes with no indented children are inline', () => {
    const { formatHints } = parseDslWithHints('dot: ellipse 10x10');
    expect(formatHints.nodes['dot']).toEqual({ display: 'inline' });
  });

  it('does not classify animate scope identifiers as nodes', () => {
    const dsl = `box: rect 100x200\nanimate 3s\n  1  box.fill.h: 240`;
    const { formatHints } = parseDslWithHints(dsl);
    expect(formatHints.nodes['box']).toEqual({ display: 'inline' });
  });

  it('preserves parseDsl scene output exactly', () => {
    const { scene } = parseDslWithHints('box: rect 100x200 fill hsl 210 70 45');
    expect(scene.objects[0].id).toBe('box');
    expect(scene.objects[0].rect).toEqual({ w: 100, h: 200 });
    expect(scene.objects[0].fill).toEqual({ h: 210, s: 70, l: 45 });
  });
});
