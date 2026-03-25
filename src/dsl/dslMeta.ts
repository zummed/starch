import type { z } from 'zod';

export interface PositionalHint {
  keys: string[];
  format?: 'dimension' | 'spaced' | 'joined' | 'arrow' | 'quoted' | 'tuples';
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
}

const dslRegistry = new WeakMap<z.ZodType, DslHints>();

export function dsl<T extends z.ZodType>(schema: T, hints: DslHints): T {
  dslRegistry.set(schema, hints);
  return schema;
}

export function getDsl(schema: z.ZodType): DslHints | undefined {
  return dslRegistry.get(schema);
}
