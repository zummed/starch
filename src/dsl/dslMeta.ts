import type { z } from 'zod';

export interface PositionalHint {
  keys: string[];
  format?: 'dimension' | 'spaced' | 'joined' | 'arrow' | 'quoted' | 'tuples' | 'color' | 'bracketList';
  separator?: string;
  suffix?: string;
  keyword?: string;           // intermediate keyword (e.g., 'at' in chapter "name" at 3.5)
  fallbackToKwarg?: boolean;  // when subset of keys present, emit as kwargs
  transform?: 'double';       // value transformation (e.g., radius→diameter for ellipse)
}

export interface DslHints {
  keyword?: string;
  positional?: PositionalHint[];
  kwargs?: string[];
  flags?: string[];
  sigil?: { key: string; prefix: string };
  children?: Record<string, 'block' | 'inline'>;
  record?: {
    key: string;
    entryHints: DslHints;
  };
  variants?: Array<{
    when: string;
    hints: DslHints;
  }>;
  // Node-line specific (only on NodeSchema):
  nodeId?: string;
  geometry?: string[];
  inlineProps?: string[];
  blockProps?: string[];
  inlineLayoutHints?: string[];
  // Top-level document field — parseable at document root
  topLevel?: boolean;
  // Array items are user-named instances (e.g., objects, children)
  instanceDeclaration?: {
    idKey: string;               // field name holding the ID (e.g., 'id')
    colon: 'required' | 'optional'; // whether `id: body` colon is required
  };
  // Array with flat-reference assignment support (box.fill: red → objects[box].fill)
  flatReference?: boolean;
  // Field opened by a section keyword header (style name, animate, images)
  sectionKeyword?: string;
  // Section body is indented entries (vs inline)
  indentedEntries?: boolean;
}

const dslRegistry = new WeakMap<z.ZodType, DslHints>();

export function dsl<T extends z.ZodType>(schema: T, hints: DslHints): T {
  dslRegistry.set(schema, hints);
  // Also store on _def so hints survive Zod's .describe() copies
  // (.describe() spreads _def into a new object, losing WeakMap identity).
  (schema as any)._def._dslHints = hints;
  return schema;
}

export function getDsl(schema: z.ZodType): DslHints | undefined {
  return dslRegistry.get(schema) ?? (schema as any)._def?._dslHints;
}
