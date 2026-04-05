/**
 * Walk a scene model + Zod schemas to resolve dotted paths. General-purpose —
 * usable from completions, hover, diagnostics.
 */
import type { z } from 'zod';
import { getPropertySchema, detectSchemaType } from '../types/schemaRegistry';
import { NodeSchema } from '../types/node';

export type LocationKind = 'node' | 'subobject' | 'leaf';

export interface ResolvedLocation {
  /** The JSON value at this path (node, sub-object, or scalar). */
  modelValue: unknown;
  /** The Zod schema describing modelValue's shape. May be null if the
   *  schema can't be determined (should not normally happen). */
  schema: z.ZodType | null;
  /** What kind of location this is. Callers use this to decide whether to
   *  offer it as a drill target or a terminal leaf. */
  kind: LocationKind;
  /** The segments consumed so far, joined with '.'. */
  path: string;
}

/**
 * Find a node by id in an array of nodes (recursively searching children).
 * Returns null if not found.
 */
function findNodeById(nodes: any[] | undefined, id: string): any | null {
  if (!nodes) return null;
  for (const n of nodes) {
    if (n && n.id === id) return n;
  }
  return null;
}

/**
 * Resolve a dotted path through a scene model. Segment 0 must name a
 * top-level object id. Subsequent segments walk children (by id) or
 * sub-objects/leaves (by key on the current node's Zod schema).
 *
 * Returns null on any unresolvable segment.
 */
export function resolvePath(
  modelJson: any,
  segments: string[],
): ResolvedLocation | null {
  if (!modelJson || !Array.isArray(modelJson.objects)) return null;
  if (segments.length === 0) return null;

  // Segment 0: top-level node
  const rootNode = findNodeById(modelJson.objects, segments[0]);
  if (!rootNode) return null;

  let currentValue: any = rootNode;
  let currentSchema: z.ZodType | null = NodeSchema;
  let currentKind: LocationKind = 'node';
  const consumed: string[] = [segments[0]];

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];

    // If we're at a node, try children first, then properties.
    if (currentKind === 'node') {
      const child = findNodeById(currentValue.children, seg);
      if (child) {
        currentValue = child;
        currentSchema = NodeSchema;
        currentKind = 'node';
        consumed.push(seg);
        continue;
      }
      // Fall through to property resolution on the node.
    }

    // Resolve property on current schema.
    if (!currentSchema) return null;
    const fieldSchema = getPropertySchema(seg, currentSchema);
    if (!fieldSchema) return null;

    // Does the current model value actually have this key set?
    const nextValue = currentValue?.[seg];

    // Classify the next location by the field's schema type.
    const type = detectSchemaType(fieldSchema);
    currentSchema = fieldSchema;
    currentValue = nextValue;
    consumed.push(seg);

    if (type === 'object') {
      currentKind = 'subobject';
    } else {
      currentKind = 'leaf';
      // Leaf is terminal — later segments would fail.
    }
  }

  return {
    modelValue: currentValue,
    schema: currentSchema,
    kind: currentKind,
    path: consumed.join('.'),
  };
}
