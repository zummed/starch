/**
 * Pure, view-independent core of the click-to-edit popup.
 *
 * This is the actual logic the editor uses to turn a click into an edit of the
 * "idea" (the model): resolve what's under the cursor, serialize a new value to
 * DSL, and splice it back into the text. It is deliberately free of ProseMirror
 * and React so that BOTH the live plugin and the interaction test harness drive
 * the exact same code — the harness can't drift from what the editor really does.
 */
import { walkDocument } from '../dsl/schemaWalker';
import { leavesToAst } from '../dsl/astAdapter';
import { resolvePath } from '../dsl/modelPathWalker';
import { type AstNode, nodeAt, findCompound } from '../dsl/astTypes';
import {
  getPropertySchema,
  getAvailableProperties,
  detectSchemaType,
  getSchemaDefault,
  DocumentSchema,
  unwrap,
  type SchemaType,
} from '../types/schemaRegistry';
import { NodeSchema } from '../types/node';
import { getShapeDefinition, listSets } from '../templates/registry';
import { getDsl } from '../dsl/dslMeta';
import type { z } from 'zod';
import type { Color } from '../types/properties';

// ─── Schema resolution ───────────────────────────────────────────

/** Resolve a template prop schema from a `tplprops:templateName.propName` path. */
export function resolveTemplatePropSchema(schemaPath: string): z.ZodType | null {
  const tplMatch = schemaPath.match(/^tplprops:(.+)\.(\w+)$/);
  if (!tplMatch) return null;
  const templateName = tplMatch[1];
  const propName = tplMatch[2];

  if (templateName.includes('.')) {
    const dotIdx = templateName.indexOf('.');
    const def = getShapeDefinition(templateName.slice(0, dotIdx), templateName.slice(dotIdx + 1));
    const propSchema = def ? (def.props as any).shape?.[propName] : undefined;
    return propSchema ?? null;
  }
  for (const set of listSets()) {
    const def = set.shapes.get(templateName);
    const propSchema = def ? (def.props as any).shape?.[propName] : undefined;
    if (propSchema) return propSchema;
  }
  return null;
}

/** Resolve a schema path against NodeSchema first, then DocumentSchema, then template props. */
export function resolvePropertySchema(path: string): z.ZodType | null {
  return getPropertySchema(path, NodeSchema)
    ?? getPropertySchema(path, DocumentSchema)
    ?? resolveTemplatePropSchema(path);
}

/** List available properties at a path, trying both roots. */
export function resolveAvailableProperties(path: string) {
  const nodeProps = getAvailableProperties(path, NodeSchema);
  if (nodeProps.length > 0) return nodeProps;
  return getAvailableProperties(path, DocumentSchema);
}

// ─── Value serialization ─────────────────────────────────────────

/** Serialize a Color value to DSL text. */
export function colorToDsl(color: Color): string {
  if (typeof color === 'string') return color; // named or hex
  if (typeof color === 'object' && color !== null) {
    if ('h' in color && 's' in color && 'l' in color) {
      const c = color as { h: number; s: number; l: number; a?: number };
      return c.a !== undefined ? `hsl ${c.h} ${c.s} ${c.l} a=${c.a}` : `hsl ${c.h} ${c.s} ${c.l}`;
    }
    if ('r' in color && 'g' in color && 'b' in color) {
      const c = color as { r: number; g: number; b: number; a?: number };
      return c.a !== undefined ? `rgb ${c.r} ${c.g} ${c.b} a=${c.a}` : `rgb ${c.r} ${c.g} ${c.b}`;
    }
    if ('name' in color) {
      const c = color as { name: string; a?: number };
      return c.a !== undefined ? `${c.name} a=${c.a}` : c.name;
    }
    if ('hex' in color) {
      const c = color as { hex: string; a?: number };
      return c.a !== undefined ? `${c.hex} a=${c.a}` : c.hex;
    }
  }
  return String(color);
}

/** Quote and escape a string for DSL (inverse of the tokenizer's readString). */
export function quoteString(s: string): string {
  return '"' + s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t') + '"';
}

/** Serialize a single leaf-widget value (color/number/enum/anchor/string) to DSL text. */
export function serializeLeafValue(schemaType: SchemaType, value: unknown): string {
  if (schemaType === 'color') return colorToDsl(value as Color);
  if (schemaType === 'anchor' && Array.isArray(value)) return `(${value.join(',')})`;
  // String values must stay quoted — they may contain spaces, and quoted
  // positionals (text content, image src) require quotes to re-parse at all.
  if (schemaType === 'string') return quoteString(String(value));
  return String(value);
}

/** Serialize one compound-field value to a DSL token (mirrors the field widgets). */
export function serializeFieldValue(schemaType: SchemaType, value: unknown): string {
  if (schemaType === 'color') return colorToDsl(value as Color);
  if (schemaType === 'anchor') {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return `(${value.join(',')})`;
  }
  return String(value);
}

// ─── Edit target resolution (cursor → editable property) ─────────

export interface EditTarget {
  schemaType: SchemaType;
  schemaPath: string;
  from: number; // text offset of the editable span start
  to: number;   // text offset of the editable span end
  value: unknown;
}

function isJoinedPositional(compoundSchemaPath: string, valueSchemaPath: string): boolean {
  const schema = resolvePropertySchema(compoundSchemaPath);
  if (!schema) return false;
  const hints = getDsl(unwrap(schema));
  if (!hints?.positional) return false;
  const prefix = compoundSchemaPath + '.';
  if (!valueSchemaPath.startsWith(prefix)) return false;
  const key = valueSchemaPath.slice(prefix.length);
  return hints.positional.some(hint =>
    (hint.format === 'dimension' || hint.format === 'joined') && hint.keys.includes(key));
}

function findDirectValue(compound: AstNode, schemaPath: string): AstNode | null {
  for (const child of compound.children) {
    if (child.dslRole === 'value' && child.schemaPath === schemaPath) return child;
  }
  return null;
}

function findKwargValue(compound: AstNode, schemaPath: string): AstNode | null {
  for (const child of compound.children) {
    if (child.dslRole === 'kwarg-value' && child.schemaPath === schemaPath) return child;
    const found = findKwargValue(child, schemaPath);
    if (found) return found;
  }
  return null;
}

const LEAF_WIDGET_TYPES = ['color', 'number', 'enum', 'anchor', 'string'];
const WIDGET_TYPES = ['color', 'number', 'enum', 'object', 'anchor', 'string'];

/**
 * Resolve the editable property under a text offset — the view-independent
 * heart of detectPopupAt. Returns text offsets (no ProseMirror PM_OFFSET).
 */
export function resolveEditTarget(text: string, textPos: number): EditTarget | null {
  if (textPos < 0 || textPos >= text.length) return null;

  let ast: AstNode;
  let model: any;
  try {
    const walked = walkDocument(text);
    model = walked.model;
    ast = leavesToAst(walked.ast.astLeaves(), text.length);
  } catch {
    return null;
  }

  // Resolve a schema path, including `track:<dotted-path>` keyframe-value leaves,
  // whose type depends on the animated property (walked through the scene model).
  const schemaForPath = (p: string): z.ZodType | null => {
    if (p.startsWith('track:')) {
      const loc = resolvePath(model, p.slice('track:'.length).split('.'));
      return (loc?.schema as z.ZodType) ?? null;
    }
    return resolvePropertySchema(p);
  };

  const node = nodeAt(ast, textPos);
  if (!node) return null;

  let schemaPath: string;
  let rangeFrom: number;
  let rangeTo: number;
  let popupValue: unknown = node.value;

  if (node.dslRole === 'keyword' || node.dslRole === 'compound') {
    schemaPath = node.schemaPath;
    const compound = node.dslRole === 'compound' ? node : findCompound(node);
    const compSchema = schemaPath ? schemaForPath(schemaPath) : null;
    const compType = compSchema ? detectSchemaType(compSchema) : 'unknown';
    const valueChild = compound && LEAF_WIDGET_TYPES.includes(compType)
      ? findDirectValue(compound, schemaPath)
      : null;
    if (valueChild) {
      rangeFrom = valueChild.from;
      rangeTo = valueChild.to;
      popupValue = valueChild.value;
    } else {
      rangeFrom = compound?.from ?? node.from;
      rangeTo = compound?.to ?? node.to;
    }
  } else if (node.dslRole === 'value' || node.dslRole === 'kwarg-value') {
    const compound = findCompound(node);
    if (compound?.schemaPath && isJoinedPositional(compound.schemaPath, node.schemaPath)) {
      schemaPath = compound.schemaPath;
      rangeFrom = compound.from;
      rangeTo = compound.to;
    } else {
      const ownSchema = node.schemaPath ? schemaForPath(node.schemaPath) : null;
      const ownType = ownSchema ? detectSchemaType(ownSchema) : 'unknown';
      if (ownType !== 'unknown' && LEAF_WIDGET_TYPES.includes(ownType)) {
        schemaPath = node.schemaPath;
      } else if (compound?.schemaPath) {
        schemaPath = compound.schemaPath;
      } else {
        schemaPath = node.schemaPath;
      }
      rangeFrom = node.from;
      rangeTo = node.to;
    }
  } else if (node.dslRole === 'kwarg-key') {
    schemaPath = node.schemaPath;
    const compound = findCompound(node);
    const sibling = compound ? findKwargValue(compound, node.schemaPath) : null;
    if (sibling) {
      rangeFrom = sibling.from;
      rangeTo = sibling.to;
      popupValue = sibling.value;
    } else {
      rangeFrom = node.from;
      rangeTo = node.to;
    }
  } else {
    return null;
  }

  if (!schemaPath) return null;

  // Node ID click → node-level popup (kwargs like depth/opacity).
  if (schemaPath === 'id' && node.dslRole === 'value') {
    const compound = findCompound(node);
    if (compound && compound.schemaPath === '') {
      return {
        schemaType: 'object' as SchemaType,
        schemaPath: '_node',
        value: popupValue,
        from: compound.from,
        to: compound.to,
      };
    }
  }

  const schema = schemaForPath(schemaPath);
  if (!schema) return null;
  const schemaType = detectSchemaType(schema);
  if (!WIDGET_TYPES.includes(schemaType)) return null;

  return { schemaType, schemaPath, value: popupValue, from: rangeFrom, to: rangeTo };
}

// ─── Compound (object) field parse/rebuild ───────────────────────

export function parseCompoundText(text: string, schemaPath: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const tokens = text.split(/\s+/);
  if (tokens.length === 0) return fields;

  const kwargTokenIndices = new Set<number>();
  for (let i = 1; i < tokens.length; i++) {
    const eq = tokens[i].indexOf('=');
    if (eq > 0) {
      fields[tokens[i].slice(0, eq)] = tokens[i].slice(eq + 1);
      kwargTokenIndices.add(i);
    }
  }

  const positionalTokens: string[] = [];
  for (let i = 1; i < tokens.length; i++) {
    if (!kwargTokenIndices.has(i)) positionalTokens.push(tokens[i]);
  }

  const schema = resolvePropertySchema(schemaPath);
  const hints = schema ? getDsl(unwrap(schema)) : undefined;

  if (hints?.positional && positionalTokens.length > 0) {
    let tokenIdx = 0;
    for (const hint of hints.positional) {
      if (tokenIdx >= positionalTokens.length) break;
      if (hint.format === 'color') {
        const colorTokens: string[] = [];
        while (tokenIdx < positionalTokens.length) {
          colorTokens.push(positionalTokens[tokenIdx]);
          tokenIdx++;
          const first = colorTokens[0];
          if (first === 'rgb' || first === 'hsl') {
            if (colorTokens.length >= 4) break;
          } else {
            break;
          }
        }
        if (hint.keys.length === 1) fields[hint.keys[0]] = colorTokens.join(' ');
      } else if (hint.format === 'dimension' || hint.format === 'joined') {
        // Keyword-led pair: "140x80" (size, split on x) or "200,150" (position).
        const token = positionalTokens[tokenIdx++];
        const sep = hint.format === 'dimension' ? 'x' : (hint.separator ?? ',');
        const parts = token.split(sep);
        for (let k = 0; k < hint.keys.length && k < parts.length; k++) fields[hint.keys[k]] = parts[k];
      } else {
        for (const key of hint.keys) {
          if (tokenIdx < positionalTokens.length) fields[key] = positionalTokens[tokenIdx++];
        }
      }
    }
  } else if (positionalTokens.length > 0) {
    positionalTokens.forEach((t, i) => { fields[`_pos${i}`] = t; });
  }

  return fields;
}

export function rebuildCompoundText(keyword: string, fields: Record<string, string>, schemaPath: string): string {
  const schema = resolvePropertySchema(schemaPath);
  const hints = schema ? getDsl(unwrap(schema)) : undefined;
  const parts: string[] = [keyword];
  const emittedKeys = new Set<string>();

  if (hints?.positional) {
    for (const hint of hints.positional) {
      if (hint.format === 'color' && hint.keys.length === 1) {
        const val = fields[hint.keys[0]];
        if (val) { parts.push(val); emittedKeys.add(hint.keys[0]); }
      } else if (hint.format === 'dimension' || hint.format === 'joined') {
        const vals = hint.keys.map(k => fields[k]).filter(Boolean);
        if (vals.length === hint.keys.length) {
          const sep = hint.format === 'dimension' ? 'x' : (hint.separator ?? ',');
          parts.push(vals.join(sep));
          hint.keys.forEach(k => emittedKeys.add(k));
        }
      } else {
        for (const key of hint.keys) {
          const val = fields[key];
          if (val) { parts.push(val); emittedKeys.add(key); }
        }
      }
    }
  }

  for (const name of (hints?.kwargs ?? [])) {
    const val = fields[name];
    if (val !== undefined && val !== '') { parts.push(`${name}=${val}`); emittedKeys.add(name); }
  }
  for (const [name, val] of Object.entries(fields)) {
    if (!emittedKeys.has(name) && !name.startsWith('_pos') && val !== '') parts.push(`${name}=${val}`);
  }

  return parts.join(' ');
}

// ─── Node-level kwargs (node ID popup) ───────────────────────────

export const NODE_KWARG_NAMES = ['opacity', 'depth'];

export function parseNodeKwargs(text: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const kwargSet = new Set(NODE_KWARG_NAMES);
  for (const token of text.split(/\s+/)) {
    const eq = token.indexOf('=');
    if (eq > 0) {
      const key = token.slice(0, eq);
      if (kwargSet.has(key)) fields[key] = token.slice(eq + 1);
    }
  }
  return fields;
}

export function rebuildNodeKwargs(originalText: string, fields: Record<string, string>): string {
  const tokens = originalText.split(/\s+/);
  const kwargSet = new Set(NODE_KWARG_NAMES);
  const kept = tokens.filter(t => {
    const eq = t.indexOf('=');
    return eq <= 0 || !kwargSet.has(t.slice(0, eq));
  });
  for (const name of NODE_KWARG_NAMES) {
    const val = fields[name];
    if (val !== undefined && val !== '') kept.push(`${name}=${val}`);
  }
  return kept.join(' ');
}

// ─── Apply ───────────────────────────────────────────────────────

/** Splice replacement text into [from, to). The live editor's text surgery. */
export function applyTextEdit(text: string, from: number, to: number, replacement: string): string {
  return text.slice(0, from) + replacement + text.slice(to);
}

export { getSchemaDefault };
