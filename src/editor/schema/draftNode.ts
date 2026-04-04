import { getPropertySchema, detectSchemaType, getEnumValues, getNumberConstraints } from '../../types/schemaRegistry';
import { NodeSchema } from '../../types/node';
import { parseGeometryText, parseSlotValue } from '../extractModel';

interface ResolveResult {
  resolved: boolean;
  value?: unknown;
  hint?: string;
}

const GEOMETRY_KEYWORDS = new Set(['rect', 'ellipse', 'text', 'path', 'image', 'camera']);

export function tryResolveDraft(text: string, schemaPath: string): ResolveResult {
  const trimmed = text.trim();
  if (!trimmed) return { resolved: false, hint: 'empty' };

  // Geometry slots
  if (GEOMETRY_KEYWORDS.has(schemaPath)) {
    const value = parseGeometryText(schemaPath, trimmed);
    if (value && Object.keys(value).length > 0) {
      return { resolved: true, value };
    }
    return { resolved: false, hint: `expected: ${schemaPath} dimensions` };
  }

  // Look up the Zod schema for this path
  const schema = getPropertySchema(schemaPath, NodeSchema);
  if (!schema) {
    // Fall back to simple value parsing
    const value = parseSlotValue(schemaPath, trimmed);
    return value !== undefined ? { resolved: true, value } : { resolved: false, hint: 'unknown schema' };
  }

  // Try Zod validation
  const parsed = parseSlotValue(schemaPath, trimmed);
  const parseResult = schema.safeParse(parsed);
  if (parseResult.success) {
    return { resolved: true, value: parseResult.data };
  }

  // Build a helpful hint
  const type = detectSchemaType(schema);
  let hint = `expected: ${type}`;

  if (type === 'number') {
    const constraints = getNumberConstraints(schema);
    if (constraints && constraints.min != null && constraints.max != null) {
      hint = `expected: number (${constraints.min}–${constraints.max})`;
    }
  } else if (type === 'enum') {
    const values = getEnumValues(schema);
    if (values) hint = `expected: ${values.join(' | ')}`;
  }

  return { resolved: false, hint };
}
