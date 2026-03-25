import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { dsl, getDsl } from '../../dsl/dslMeta';

describe('dslMeta', () => {
  it('attaches and retrieves hints from a schema', () => {
    const schema = dsl(z.object({ w: z.number(), h: z.number() }), {
      keyword: 'rect',
      positional: [{ keys: ['w', 'h'], format: 'dimension' }],
    });
    const hints = getDsl(schema);
    expect(hints).toBeDefined();
    expect(hints!.keyword).toBe('rect');
    expect(hints!.positional![0].format).toBe('dimension');
  });

  it('returns undefined for unannotated schemas', () => {
    const schema = z.number();
    expect(getDsl(schema)).toBeUndefined();
  });

  it('preserves zod schema functionality after annotation', () => {
    const schema = dsl(z.object({ w: z.number() }), { keyword: 'rect' });
    expect(schema.safeParse({ w: 100 }).success).toBe(true);
    expect(schema.safeParse({ w: 'bad' }).success).toBe(false);
  });

  it('supports variants hint', () => {
    const schema = dsl(z.object({ route: z.array(z.string()).optional() }), {
      variants: [
        { when: 'route', hints: { positional: [{ keys: ['route'], format: 'arrow' }] } },
      ],
    });
    const hints = getDsl(schema);
    expect(hints!.variants).toHaveLength(1);
    expect(hints!.variants![0].when).toBe('route');
  });

  it('supports record hint for dynamic-keyed maps', () => {
    const schema = dsl(z.object({
      changes: z.record(z.string(), z.unknown()),
    }), {
      record: { key: 'changes', entryHints: { positional: [{ keys: ['_key'] }, { keys: ['_value'] }] } },
    });
    expect(getDsl(schema)!.record!.key).toBe('changes');
  });

  it('supports sigil hint', () => {
    const schema = dsl(z.object({ style: z.string() }), {
      sigil: { key: 'style', prefix: '@' },
    });
    expect(getDsl(schema)!.sigil!.prefix).toBe('@');
  });
});
