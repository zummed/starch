import type { AttributeSpec } from 'prosemirror-model';

/**
 * Helper to define attrs with defaults for ProseMirror NodeSpecs.
 */
export function attrs(
  defs: Record<string, { default: unknown }>
): Record<string, AttributeSpec> {
  return defs;
}
