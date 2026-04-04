import { describe, it, expect } from 'vitest';
import { getDsl } from '../../dsl/dslMeta';
import { DocumentSchema } from '../../types/schemaRegistry';
import type { z } from 'zod';

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
