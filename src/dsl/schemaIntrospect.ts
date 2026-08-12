import { z } from 'zod';
import { getDsl } from './dslMeta';
import type { DslHints } from './dslMeta';

/**
 * Shared Zod-schema introspection helpers.
 *
 * These are the single source of truth used by BOTH the parse path
 * (hintExecutors / schemaWalker) and the emit path (astEmitter) so the two
 * stay in lock-step. The object definitions (Zod schemas carrying DslHints)
 * drive every surface: parsing, emission, completion, and click-to-edit.
 */

/** Unwrap Zod optional/default/describe wrappers down to the inner schema. */
export function unwrap(schema: z.ZodType): z.ZodType {
  let s: any = schema;
  while (s?._def?.innerType) {
    s = s._def.innerType;
  }
  return s as z.ZodType;
}

/**
 * Walk the Zod schema chain (including Zod v4's `_zod.parent`) to find the
 * version that carries DSL hints. `.describe()` creates a new schema object
 * while keeping the original reachable via `_zod.parent`, so the DSL hint
 * (stored by identity) lives on an ancestor.
 */
export function findDslSchema(schema: z.ZodType): z.ZodType {
  let s: any = schema;
  while (s) {
    if (getDsl(s as z.ZodType)) return s as z.ZodType;
    s = s?._zod?.parent ?? null;
  }
  return schema;
}

/** Resolve the DslHints for a schema, searching wrappers and parents. */
export function getConstructHints(schema: z.ZodType): DslHints | undefined {
  return getDsl(findDslSchema(unwrap(schema)));
}

/**
 * Resolve a named field's DSL-hinted schema within an object schema,
 * unwrapping wrappers so the returned schema is ready for hint lookup.
 */
export function resolveFieldSchema(schema: z.ZodType, field: string): z.ZodType | null {
  const shape = (unwrap(schema) as any).shape;
  if (!shape?.[field]) return null;
  return findDslSchema(unwrap(shape[field]));
}

/** The shape (field → schema) of an object schema, or null if not an object. */
export function objectShape(schema: z.ZodType): Record<string, z.ZodType> | null {
  const shape = (unwrap(schema) as any).shape;
  return shape ?? null;
}

export interface BlockEntryField {
  /** The field the indented lines populate. */
  key: string;
  /** 'line' — one string per line; 'row' — the line's strings become a row. */
  shape: 'line' | 'row';
}

/**
 * The field a shape fills from the indented block beneath its line, if it
 * declares one: `children: { lines: 'block' }` on the props schema.
 *
 * The entry syntax is not declared anywhere — it is read off the field's own
 * Zod type, so `z.array(z.string())` takes one string per line and
 * `z.array(z.array(z.string()))` takes a row of strings per line. The schema
 * is the grammar here as everywhere else; a shape gets block content by
 * declaring the field it lands in.
 */
export function blockEntryField(propsSchema: z.ZodType | undefined): BlockEntryField | null {
  if (!propsSchema) return null;
  const hints = getDsl(findDslSchema(unwrap(propsSchema)));
  const shape = objectShape(propsSchema);
  if (!hints?.children || !shape) return null;
  const elementOf = (s: z.ZodType): z.ZodType | null => {
    const arr = unwrap(s) as any;
    if (!(arr instanceof z.ZodArray)) return null;
    const el = (arr.element ?? arr._def?.element) as z.ZodType | undefined;
    return el ? unwrap(el) : null;
  };
  for (const [key, mode] of Object.entries(hints.children)) {
    if (mode !== 'block' || !shape[key]) continue;
    const element = elementOf(shape[key]);
    if (!element) continue;
    if (element instanceof z.ZodString) return { key, shape: 'line' };
    const cell = elementOf(element);
    if (cell instanceof z.ZodString) return { key, shape: 'row' };
  }
  return null;
}
