import { describe, it, expect } from 'vitest';
import { importDsl } from '../../editor/io/importDsl';
import { exportDsl } from '../../editor/io/exportDsl';
import { buildAstFromText } from '../../dsl/astParser';

describe('exportDsl', () => {
  it('round-trips a simple scene', () => {
    const original = `objects\n  box:\n    rect 100x200\n    fill red`;
    const { doc, formatHints } = importDsl(original);
    const text = exportDsl(doc, formatHints);

    // Re-parse to verify it's valid DSL
    const reparsed = buildAstFromText(text);
    expect(reparsed.model.objects).toHaveLength(1);
    expect(reparsed.model.objects[0].id).toBe('box');
    expect(reparsed.model.objects[0].rect.w).toBe(100);
    expect(reparsed.model.objects[0].fill).toBe('red');
  });

  it('round-trips metadata', () => {
    const original = `name "My Scene"\nbackground white\nobjects\n  a:\n    rect 10x10`;
    const { doc, formatHints } = importDsl(original);
    const text = exportDsl(doc, formatHints);

    const reparsed = buildAstFromText(text);
    expect(reparsed.model.name).toBe('My Scene');
    expect(reparsed.model.background).toBe('white');
  });

  it('produces parseable DSL for compound properties', () => {
    const original = `objects\n  box:\n    rect 10x10\n    stroke red width=2`;
    const { doc, formatHints } = importDsl(original);
    const text = exportDsl(doc, formatHints);

    const reparsed = buildAstFromText(text);
    expect(reparsed.model.objects[0].stroke).toBeDefined();
  });
});
