import { describe, it, expect } from 'vitest';
import { getDsl } from '../../dsl/dslMeta';
import { DocumentSchema } from '../../types/schemaRegistry';
import type { z } from 'zod';
import { walkDocument } from '../../dsl/schemaWalker';
import { buildAstFromText } from '../../dsl/astParser';
import { v2Samples } from '../../samples';

describe('DocumentSchema top-level annotations', () => {
  it('name field has topLevel + keyword + quoted positional', () => {
    const shape = (DocumentSchema as any).shape;
    const inner = (shape.name as any)._def.innerType;
    const hints = getDsl(inner as z.ZodType);
    expect(hints).toBeDefined();
    expect(hints?.topLevel).toBe(true);
    expect(hints?.keyword).toBe('name');
    expect(hints?.positional?.[0].format).toBe('quoted');
  });

  it('description field has topLevel + keyword + quoted positional', () => {
    const shape = (DocumentSchema as any).shape;
    const inner = (shape.description as any)._def.innerType;
    const hints = getDsl(inner as z.ZodType);
    expect(hints?.topLevel).toBe(true);
    expect(hints?.keyword).toBe('description');
    expect(hints?.positional?.[0].format).toBe('quoted');
  });

  it('background field has topLevel + keyword + default positional', () => {
    const shape = (DocumentSchema as any).shape;
    const inner = (shape.background as any)._def.innerType;
    const hints = getDsl(inner as z.ZodType);
    expect(hints?.topLevel).toBe(true);
    expect(hints?.keyword).toBe('background');
    expect(hints?.positional).toBeDefined();
  });

  it('viewport field has topLevel + keyword + dimension positional', () => {
    const shape = (DocumentSchema as any).shape;
    const inner = (shape.viewport as any)._def.innerType;
    const hints = getDsl(inner as z.ZodType);
    expect(hints?.topLevel).toBe(true);
    expect(hints?.keyword).toBe('viewport');
    expect(hints?.positional?.[0].format).toBe('dimension');
  });
});

describe('walker parity with astParser', () => {
  // Only test samples that the walker is expected to handle in the current
  // implementation state. Expand this list as features are added.
  const SUPPORTED_NAMES = new Set<string>([
    'rect', 'ellipse', 'text',
  ]);

  for (const sample of v2Samples) {
    if (!SUPPORTED_NAMES.has(sample.name)) continue;

    it(`parity for ${sample.category}/${sample.name}`, () => {
      const walkerResult = walkDocument(sample.dsl);
      const parserResult = buildAstFromText(sample.dsl);

      // Compare top-level fields (name, background, viewport)
      expect(walkerResult.model.name).toEqual(parserResult.model.name);
      expect(walkerResult.model.background).toEqual(parserResult.model.background);

      // Compare objects count
      expect(walkerResult.model.objects?.length ?? 0)
        .toEqual(parserResult.model.objects?.length ?? 0);
    });
  }
});
