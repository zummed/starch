/**
 * Walk a scene model + Zod schemas to resolve dotted paths. General-purpose —
 * usable from completions, hover, diagnostics.
 */
import type { z } from 'zod';
import { getPropertySchema, detectSchemaType, getAvailableProperties } from '../types/schemaRegistry';
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

export interface NextSegment {
  /** The segment name (property key or child node id). */
  name: string;
  /** 'drill' means "this has substructure, keep drilling with another dot."
   *  'leaf' means "this is terminal — insert colon to assign a value." */
  kind: 'drill' | 'leaf';
  /** Where this segment came from — helps consumers format display. */
  source: 'child' | 'property';
  /** For 'property' entries, the Zod schema of that field. Consumers use
   *  this for value-completion dispatch. */
  schema?: z.ZodType;
}

const INTERNAL_KEYS = new Set(['id', 'children', 'template', 'props', 'style']);

/**
 * List the next-level segment options at a resolved location.
 *
 * - At a node: returns child-node ids (drill) + the node's schema fields
 *   (classified by type).
 * - At a sub-object: returns the sub-object's declared fields.
 * - At a leaf: returns an empty list (terminal).
 */
/**
 * Read the scalar or sub-object at a dotted path. Returns undefined if the
 * path is unresolvable OR the property is not set on the actual model value.
 *
 * Note the distinction from pathExists: a schema-reachable path that is
 * unset on the model resolves to location.modelValue === undefined, so this
 * function returns undefined. pathExists would return true for the same
 * path (it exists in the schema).
 */
export function currentValueAt(modelJson: any, path: string): unknown {
  if (!path) return undefined;
  const segments = path.split('.');
  const loc = resolvePath(modelJson, segments);
  if (!loc) return undefined;
  return loc.modelValue;
}

/**
 * Check whether a dotted path is resolvable through the scene model +
 * schemas. Returns true even if the property is not set on the model,
 * as long as the path is schema-valid from an existing root node.
 */
export function pathExists(modelJson: any, path: string): boolean {
  if (!path) return false;
  const segments = path.split('.');
  return resolvePath(modelJson, segments) !== null;
}

export function enumerateNextSegments(location: ResolvedLocation): NextSegment[] {
  if (location.kind === 'leaf') return [];

  const segments: NextSegment[] = [];

  // If at a node, add children first.
  if (location.kind === 'node') {
    const children = (location.modelValue as any)?.children;
    if (Array.isArray(children)) {
      for (const child of children) {
        if (child && typeof child.id === 'string') {
          segments.push({ name: child.id, kind: 'drill', source: 'child' });
        }
      }
    }
  }

  // Add schema-declared properties.
  if (location.schema) {
    const props = getAvailableProperties('', location.schema);
    for (const p of props) {
      if (INTERNAL_KEYS.has(p.name)) continue;
      // Don't re-emit child ids as properties.
      if (segments.some(s => s.name === p.name)) continue;
      const type = detectSchemaType(p.schema);
      const kind: 'drill' | 'leaf' = type === 'object' ? 'drill' : 'leaf';
      segments.push({ name: p.name, kind, source: 'property', schema: p.schema });
    }
  }

  return segments;
}
