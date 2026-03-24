// src/editor/schemaCompletionSource.ts
import type { SchemaSpan } from './schemaSpan';
import { getSpanAtPos } from './schemaDecorations';
import {
  getPropertySchema, detectSchemaType, getEnumValues,
  getAvailableProperties, AnimConfigSchema, EasingNameSchema,
} from '../types/schemaRegistry';
import { getAllColorNames } from '../types/color';

export interface SchemaCompletionItem {
  label: string;
  type?: string;
  detail?: string;
}

/**
 * Get completions based on span context + model data.
 * @param spans Current span map
 * @param pos Cursor position
 * @param prefix Partially typed word
 * @param lineText Current line text up to cursor (for context-dependent completions)
 * @param modelJson The model JSON (for extracting node IDs, style names)
 */
export function getSchemaCompletions(
  spans: SchemaSpan[],
  pos: number,
  prefix: string,
  lineText?: string,
  modelJson?: any,
): SchemaCompletionItem[] {
  // Content-dependent completions that don't need span context
  if (lineText) {
    // After = sign: value completions (easing=, look=, etc.)
    const equalsMatch = lineText.match(/(\w+)\s*=\s*(\w*)$/);
    if (equalsMatch) {
      const key = equalsMatch[1];
      if (key === 'easing') {
        const values = getEnumValues(EasingNameSchema) ?? [];
        return filterByPrefix(values.map(v => ({ label: v, type: 'value', detail: 'Easing function' })), prefix);
      }
      if (key === 'look' && modelJson) {
        return filterByPrefix(extractNodeIds(modelJson), prefix);
      }
    }

    // After fill/stroke keyword: color completions
    if (lineText.match(/\b(fill|stroke)\s+\w*$/)) {
      return filterByPrefix(colorCompletions(), prefix);
    }

    // After @ sign: style names
    if (lineText.match(/@\w*$/) && modelJson?.styles) {
      return filterByPrefix(
        Object.keys(modelJson.styles).map(n => ({ label: n, type: 'value', detail: 'Style name' })),
        prefix,
      );
    }

    // After -> : node IDs for connections
    if (lineText.includes('->') && modelJson) {
      return filterByPrefix(extractNodeIds(modelJson), prefix);
    }
  }

  // Span-based completions
  const span = getSpanAtPos(spans, pos) ?? findNearestSpan(spans, pos);

  if (!span) {
    // No span context -- could be at top level or in an unspanned region
    // Offer top-level keywords + node IDs
    const items: SchemaCompletionItem[] = [
      { label: 'name', type: 'keyword', detail: 'Document name' },
      { label: 'description', type: 'keyword', detail: 'Document description' },
      { label: 'background', type: 'keyword', detail: 'Background color' },
      { label: 'viewport', type: 'keyword', detail: 'Viewport dimensions' },
      { label: 'images', type: 'keyword', detail: 'Image definitions' },
      { label: 'style', type: 'keyword', detail: 'Named style block' },
      { label: 'animate', type: 'keyword', detail: 'Animation block' },
    ];
    return filterByPrefix(items, prefix);
  }

  const rootSchema = span.section === 'animate' ? AnimConfigSchema : undefined;
  const schema = getPropertySchema(span.schemaPath, rootSchema);
  if (!schema) return [];

  const type = detectSchemaType(schema);

  switch (type) {
    case 'color':
      return filterByPrefix(colorCompletions(), prefix);
    case 'enum':
      return filterByPrefix(
        (getEnumValues(schema) ?? []).map(v => ({ label: v, type: 'value' })),
        prefix,
      );
    case 'object':
      return filterByPrefix(
        getAvailableProperties(span.schemaPath, rootSchema)
          .map(p => ({ label: p.name, type: 'property', detail: p.description })),
        prefix,
      );
    default:
      return [];
  }
}

function colorCompletions(): SchemaCompletionItem[] {
  return getAllColorNames().map(name => ({ label: name, type: 'value', detail: 'Named color' }));
}

function extractNodeIds(modelJson: any): SchemaCompletionItem[] {
  if (!modelJson?.objects) return [];
  const ids: SchemaCompletionItem[] = [];
  const walk = (nodes: any[]) => {
    for (const n of nodes) {
      if (n.id) ids.push({ label: n.id, type: 'value', detail: 'Node ID' });
      if (n.children) walk(n.children);
    }
  };
  walk(modelJson.objects);
  return ids;
}

function findNearestSpan(spans: SchemaSpan[], pos: number): SchemaSpan | null {
  let best: SchemaSpan | null = null;
  for (const s of spans) {
    if (s.to <= pos) best = s;
    if (s.from > pos) break;
  }
  return best;
}

function filterByPrefix(items: SchemaCompletionItem[], prefix: string): SchemaCompletionItem[] {
  if (!prefix) return items;
  const lower = prefix.toLowerCase();
  return items.filter(i => i.label.toLowerCase().startsWith(lower));
}
