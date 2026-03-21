/**
 * Schema-driven completion source for CodeMirror.
 * Queries the Zod schema registry based on cursor position.
 */
import { getCursorContext } from './cursorPath';
import {
  getAvailableProperties,
  getPropertySchema,
  detectSchemaType,
  getEnumValues,
} from '../types/schemaRegistry';

export interface CompletionItem {
  label: string;
  detail?: string;
  info?: string;
  insertText: string;
  type: 'property' | 'value' | 'keyword';
}

/**
 * Map a DSL-level path to a schema path.
 * DSL paths like "objects.0.rect" → schema path "rect" (inside NodeSchema)
 * DSL paths like "objects.0.rect.w" → schema path "rect.w"
 * DSL paths like "styles.primary.fill" → schema path "fill"
 * DSL paths like "animate.duration" → schema path handled by AnimConfigSchema
 */
function dslPathToSchemaPath(dslPath: string): string {
  const parts = dslPath.split('.');
  const filtered: string[] = [];
  let i = 0;

  // Strip top-level key
  if (parts[0] === 'objects' && parts.length >= 2 && /^\d+$/.test(parts[1])) {
    i = 2;
  } else if (parts[0] === 'styles' && parts.length >= 2) {
    i = 2;
  }

  // Walk remaining parts, skipping children.N pairs
  while (i < parts.length) {
    if (parts[i] === 'children' && i + 1 < parts.length && /^\d+$/.test(parts[i + 1])) {
      i += 2;
    } else {
      filtered.push(parts[i]);
      i++;
    }
  }

  return filtered.join('.');
}

/**
 * Get completion items for a given text and cursor offset.
 */
export function getCompletions(text: string, cursorOffset: number): CompletionItem[] {
  const ctx = getCursorContext(text, cursorOffset);
  const schemaPath = dslPathToSchemaPath(ctx.path);

  if (ctx.isPropertyName) {
    return getPropertyCompletions(schemaPath, ctx.prefix, text);
  }

  if (ctx.currentKey) {
    return getValueCompletions(schemaPath, ctx.currentKey, ctx.prefix);
  }

  return [];
}

function getPropertyCompletions(path: string, prefix: string, text: string): CompletionItem[] {
  const props = getAvailableProperties(path);
  if (props.length === 0) return [];

  // Filter out properties that already exist in the current text context
  // (simple heuristic — check if the property name appears near the cursor)
  const items: CompletionItem[] = [];

  for (const prop of props) {
    if (prefix && !prop.name.startsWith(prefix)) continue;
    // Skip internal/identity fields in completion
    if (prop.name === 'children' || prop.name === 'template' || prop.name === 'props') continue;

    const type = detectSchemaType(prop.schema);
    let insertText: string;

    switch (type) {
      case 'object':
        insertText = `${prop.name}: { }`;
        break;
      case 'color':
        insertText = `${prop.name}: { h: 210, s: 80, l: 50 }`;
        break;
      case 'array':
        insertText = `${prop.name}: []`;
        break;
      case 'boolean':
        insertText = `${prop.name}: true`;
        break;
      case 'string':
        insertText = `${prop.name}: ""`;
        break;
      case 'number':
        insertText = `${prop.name}: 0`;
        break;
      case 'enum': {
        const values = getEnumValues(prop.schema);
        insertText = `${prop.name}: "${values?.[0] ?? ''}"`;
        break;
      }
      default:
        insertText = `${prop.name}: `;
    }

    items.push({
      label: prop.name,
      detail: prop.description,
      info: `(${type}) ${prop.category}`,
      insertText,
      type: 'property',
    });
  }

  return items;
}

function getValueCompletions(path: string, key: string, prefix: string): CompletionItem[] {
  // The path may already end with the key (e.g., path="fill", key="fill")
  // or the key may be a child of the path (e.g., path="rect", key="w")
  let fullPath: string;
  if (path.endsWith(key)) {
    fullPath = path;
  } else {
    fullPath = path ? `${path}.${key}` : key;
  }
  const schema = getPropertySchema(fullPath);
  if (!schema) return [];

  const type = detectSchemaType(schema);

  if (type === 'enum') {
    const values = getEnumValues(schema);
    if (!values) return [];
    return values
      .filter(v => !prefix || v.startsWith(prefix))
      .map(v => ({
        label: v,
        insertText: `"${v}"`,
        type: 'value' as const,
      }));
  }

  if (type === 'boolean') {
    return [
      { label: 'true', insertText: 'true', type: 'value' },
      { label: 'false', insertText: 'false', type: 'value' },
    ];
  }

  if (type === 'color') {
    // Suggest some common colors
    return [
      { label: 'red', insertText: '{ h: 0, s: 100, l: 50 }', detail: 'Red', type: 'value' },
      { label: 'blue', insertText: '{ h: 210, s: 100, l: 50 }', detail: 'Blue', type: 'value' },
      { label: 'green', insertText: '{ h: 120, s: 100, l: 50 }', detail: 'Green', type: 'value' },
      { label: 'yellow', insertText: '{ h: 60, s: 100, l: 50 }', detail: 'Yellow', type: 'value' },
      { label: 'purple', insertText: '{ h: 270, s: 80, l: 50 }', detail: 'Purple', type: 'value' },
      { label: 'orange', insertText: '{ h: 30, s: 100, l: 50 }', detail: 'Orange', type: 'value' },
      { label: 'white', insertText: '{ h: 0, s: 0, l: 100 }', detail: 'White', type: 'value' },
    ];
  }

  return [];
}
