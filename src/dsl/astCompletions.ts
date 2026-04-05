/**
 * AST-based completions: use the AST tree to determine context-aware suggestions.
 *
 * ALL completion logic derives from annotated zod schemas (DslHints).
 * No hardcoded property names, keyword lists, or regex patterns.
 */
import type { AstNode } from './astTypes';
import { nodeAt, findCompound } from './astTypes';
import { getAllColorNames } from '../types/color';
import {
  getPropertySchema, detectSchemaType, getEnumValues,
  getAvailableProperties, getSchemaDefault, EasingNameSchema,
  DocumentSchema,
} from '../types/schemaRegistry';
import { getDsl, type DslHints } from './dslMeta';
import {
  RectGeomSchema, EllipseGeomSchema, TextGeomSchema,
  PathGeomSchema, ImageGeomSchema, CameraSchema, NodeSchema,
} from '../types/node';
import {
  StrokeSchema, TransformSchema, DashSchema, LayoutSchema,
  ColorSchema, HslColorSchema, RgbColorSchema,
  NamedAlphaColorSchema, HexAlphaColorSchema,
} from '../types/properties';
import { AnimConfigSchema } from '../types/animation';
import { z } from 'zod';

export interface CompletionItem {
  label: string;
  type?: string;    // 'keyword' | 'value' | 'property'
  detail?: string;
  scope?: string;   // section label: 'stroke', 'rect', 'node', etc.
  snippetTemplate?: string;  // e.g., "rect ${1:W}x${2:H}"
}

// ─── Schema-Derived Lookup Tables ───────────────────────────────
// Built once at module load from the annotated schemas.

/**
 * Map from schemaPath to the original annotated schema constant.
 * getDsl() requires the exact object reference that was passed to dsl(),
 * not a .describe().optional() wrapper from getPropertySchema().
 */
const ANNOTATED_SCHEMAS: Record<string, z.ZodType> = {
  rect: RectGeomSchema,
  ellipse: EllipseGeomSchema,
  text: TextGeomSchema,
  path: PathGeomSchema,
  image: ImageGeomSchema,
  camera: CameraSchema,
  stroke: StrokeSchema,
  transform: TransformSchema,
  dash: DashSchema,
  layout: LayoutSchema,
  // Color format schemas (for positional snippet support)
  hsl: HslColorSchema,
  rgb: RgbColorSchema,
};

/** Derive geometry keywords from NodeSchema's `geometry` hint. */
const NODE_HINTS = getDsl(NodeSchema);
const GEOMETRY_KEYWORDS: string[] = NODE_HINTS?.geometry ?? [];

/** Build keyword→schemaPath map from annotated schemas' keyword hints. */
const KEYWORD_TO_SCHEMA: Record<string, string> = {};
for (const [schemaPath, schema] of Object.entries(ANNOTATED_SCHEMAS)) {
  const hints = getDsl(schema);
  if (hints?.keyword) {
    KEYWORD_TO_SCHEMA[hints.keyword] = schemaPath;
  }
}

/**
 * Keywords whose first positional arg resolves to a color type.
 * These should NOT get snippet templates — they have context-aware color completions instead.
 * Derived from: (1) annotated schemas with color positionals, (2) node properties with color type.
 */
const COLOR_POSITIONAL_KEYWORDS = new Set<string>();
// Check annotated schemas (e.g., stroke has positional color)
for (const [schemaPath, schema] of Object.entries(ANNOTATED_SCHEMAS)) {
  const hints = getDsl(schema);
  if (hints?.keyword && hints.positional?.length) {
    const firstKeys = hints.positional[0].keys;
    if (firstKeys.length === 1) {
      const fieldSchema = getPropertySchema(schemaPath + '.' + firstKeys[0]);
      if (fieldSchema && detectSchemaType(fieldSchema) === 'color') {
        COLOR_POSITIONAL_KEYWORDS.add(hints.keyword);
      }
    }
  }
}
// Check node properties that directly take a color value (e.g., fill)
if (NODE_HINTS?.inlineProps) {
  for (const prop of NODE_HINTS.inlineProps) {
    if (ANNOTATED_SCHEMAS[prop]) continue; // already checked above
    const fieldSchema = getPropertySchema(prop);
    if (fieldSchema && detectSchemaType(fieldSchema) === 'color') {
      COLOR_POSITIONAL_KEYWORDS.add(prop);
    }
  }
}
if (NODE_HINTS?.blockProps) {
  for (const prop of NODE_HINTS.blockProps) {
    if (ANNOTATED_SCHEMAS[prop]) continue;
    const fieldSchema = getPropertySchema(prop);
    if (fieldSchema && detectSchemaType(fieldSchema) === 'color') {
      COLOR_POSITIONAL_KEYWORDS.add(prop);
    }
  }
}

/**
 * Keywords that have positional args (from DslHints).
 * After these keywords, the user types values by position — suppress node-level fallthrough.
 */
const POSITIONAL_KEYWORDS = new Set<string>();
for (const [, schema] of Object.entries(ANNOTATED_SCHEMAS)) {
  const hints = getDsl(schema);
  if (hints?.keyword && hints.positional?.length) {
    POSITIONAL_KEYWORDS.add(hints.keyword);
  }
}
// Also add color format keywords
for (const colorSchema of [HslColorSchema, RgbColorSchema]) {
  const hints = getDsl(colorSchema);
  if (hints?.keyword) POSITIONAL_KEYWORDS.add(hints.keyword);
}

/**
 * Derive node property keywords from NodeSchema's DslHints.
 * Combines inlineProps, blockProps (deduplicated), kwargs, and flags.
 * Each gets its keyword label from its schema's DslHint, or the field name itself.
 */
function buildNodePropertyKeywords(): CompletionItem[] {
  if (!NODE_HINTS) return [];
  const seen = new Set<string>();
  const items: CompletionItem[] = [];

  // Gather all property field names from the node hints
  const propFields = new Set<string>();
  if (NODE_HINTS.inlineProps) for (const p of NODE_HINTS.inlineProps) propFields.add(p);
  if (NODE_HINTS.blockProps) for (const p of NODE_HINTS.blockProps) propFields.add(p);

  for (const field of propFields) {
    const schema = ANNOTATED_SCHEMAS[field];
    const hints = schema ? getDsl(schema) : null;
    const keyword = hints?.keyword ?? field;
    if (seen.has(keyword)) continue;
    seen.add(keyword);
    const fieldSchema = getPropertySchema(field);
    const desc = fieldSchema?.description ?? '';
    items.push({ label: keyword, type: 'keyword', detail: desc });
  }

  // Add kwargs (opacity, depth, etc.) — these are key=value, not compound keywords
  if (NODE_HINTS.kwargs) {
    for (const k of NODE_HINTS.kwargs) {
      if (seen.has(k)) continue;
      seen.add(k);
      const fieldSchema = getPropertySchema(k);
      const desc = fieldSchema?.description ?? '';
      items.push({ label: k, type: 'keyword', detail: desc });
    }
  }

  // Add flags (visible, etc.)
  if (NODE_HINTS.flags) {
    for (const f of NODE_HINTS.flags) {
      if (seen.has(f)) continue;
      seen.add(f);
      const fieldSchema = getPropertySchema(f);
      const desc = fieldSchema?.description ?? '';
      items.push({ label: f, type: 'keyword', detail: desc });
    }
  }

  return items;
}

const NODE_PROPERTY_KEYWORDS: CompletionItem[] = buildNodePropertyKeywords();

/**
 * Derive top-level keywords from DocumentSchema's shape.
 * Maps JSON field names to their DSL keywords where they differ.
 * Excludes 'objects' (user types node IDs directly).
 */
function buildTopLevelKeywords(): CompletionItem[] {
  const shape = (DocumentSchema as any).shape;
  if (!shape) return [];
  const items: CompletionItem[] = [];
  const skip = new Set(['objects']); // user types node IDs, not 'objects'
  // JSON field name → DSL keyword (where they differ)
  const dslKeywordMap: Record<string, string> = { styles: 'style' };
  // Snippet templates per top-level keyword
  const templates: Record<string, string> = {
    name: 'name "${1:title}"',
    description: 'description "${1:text}"',
    background: 'background ${1:color}',
    viewport: 'viewport ${1:W}x${2:H}',
    images: 'images',
    style: 'style ${1:name}',
    animate: 'animate ${1:3}s',
  };
  for (const [name, fieldSchema] of Object.entries(shape)) {
    if (skip.has(name)) continue;
    const keyword = dslKeywordMap[name] ?? name;
    // Description lives on the inner (unwrapped) schema
    const inner = (fieldSchema as any)._def?.innerType ?? fieldSchema;
    const desc = (inner as z.ZodType).description ?? '';
    items.push({
      label: keyword,
      type: 'keyword',
      detail: desc,
      snippetTemplate: templates[keyword],
    });
  }
  return items;
}

const TOP_LEVEL_KEYWORDS: CompletionItem[] = buildTopLevelKeywords();

// ─── Main Entry Point ────────────────────────────────────────────

/**
 * Generate context-aware completions at the given cursor position.
 *
 * @param lineText Text on the current line up to (not past) the cursor.
 */
export function completionsAt(
  ast: AstNode | null,
  pos: number,
  lineText?: string,
  modelJson?: any,
): CompletionItem[] {
  // Content-dependent completions from line text (works even without AST context)
  if (lineText) {
    const lineItems = lineTextCompletions(lineText, modelJson);
    if (lineItems.length > 0) return lineItems;
  }

  if (!ast) return TOP_LEVEL_KEYWORDS;

  // Determine context from line indent (separating the partial word being typed
  // from prior content on the same line).
  //   - line with no content before the partial word at column 0 → document-level
  //   - line with only whitespace before the partial word → indented continuation
  //   - line with non-whitespace content before the partial word → mid-line (use existing logic)
  const wordAtEnd = lineText?.match(/[\w\-#@]+$/);
  const beforeWord = wordAtEnd
    ? lineText!.slice(0, wordAtEnd.index)
    : (lineText ?? '');
  const onFreshLine = /^\s*$/.test(beforeWord);

  if (onFreshLine && beforeWord.length === 0) {
    return topLevelCompletions(ast, modelJson);
  }

  // Find deepest node at cursor
  let node = nodeAt(ast, pos);

  // When cursor lands in a gap (document level or past section end),
  // find the nearest preceding context to provide relevant completions.
  if (!node || node.dslRole === 'document') {
    const context = findNearestContext(ast, pos);
    if (context) {
      node = context;
    } else {
      return topLevelCompletions(ast, modelJson);
    }
  }

  if (node.dslRole === 'section') {
    return sectionCompletions(node, modelJson);
  }

  // Inside a node or its children
  return nodeContextCompletions(node, pos, modelJson);
}

// ─── Line-Text Completions ───────────────────────────────────────
// Derived from schema hints — no hardcoded keyword lists.

function lineTextCompletions(lineText: string, modelJson?: any): CompletionItem[] {
  // After = sign: value completions based on the key's schema type
  const equalsMatch = lineText.match(/(\w+)\s*=\s*(\w*)$/);
  if (equalsMatch) {
    const key = equalsMatch[1];
    return kwargValueCompletions(key, modelJson);
  }

  // After @ sign: style names from model
  if (lineText.match(/@\w*$/) && modelJson?.styles) {
    return Object.keys(modelJson.styles).map(n => ({
      label: n, type: 'value', detail: 'Style name',
    }));
  }

  // After -> : node IDs for connections
  if (lineText.includes('->') && modelJson) {
    return extractNodeIds(modelJson);
  }

  // After node ID + colon: offer geometry keywords (derived from NodeSchema.geometry hint).
  // This handles the case where the user is typing a new node and the AST is stale.
  if (lineText.match(/^\s*\w+:\s+\w*$/) || lineText.match(/^\s*\w+:\s*$/)) {
    return GEOMETRY_KEYWORDS.map(g => {
      const item: CompletionItem = { label: g, type: 'keyword', detail: 'Geometry type' };
      const schemaKey = KEYWORD_TO_SCHEMA[g] ?? g;
      const tmpl = buildSnippetTemplate(schemaKey);
      if (tmpl) item.snippetTemplate = tmpl;
      return item;
    });
  }

  // Check for a keyword at the end of the line followed by a space.
  // Derived from DslHints: color-positional keywords get color completions,
  // other positional keywords offer a snippet showing the expected format.
  const keywordMatch = lineText.match(/\b(\w+)\s+\w*$/);
  if (keywordMatch) {
    const kw = keywordMatch[1];
    if (COLOR_POSITIONAL_KEYWORDS.has(kw)) {
      return colorCompletions();
    }
    if (POSITIONAL_KEYWORDS.has(kw)) {
      // Offer a snippet completion showing the expected positional format
      const schemaKey = KEYWORD_TO_SCHEMA[kw];
      if (schemaKey) {
        const tmpl = buildPositionalOnlySnippet(schemaKey);
        if (tmpl) {
          return [{ label: tmpl.label, type: 'keyword', detail: tmpl.detail, snippetTemplate: tmpl.template }];
        }
      }
      return []; // no positional info available — suppress fallthrough
    }
  }

  return [];
}

/**
 * Generate completions for values after a kwarg key (e.g., after `easing=`).
 * Looks up the key across all annotated schemas to find its type.
 */
function kwargValueCompletions(key: string, modelJson?: any): CompletionItem[] {
  // Try to find this key in any annotated schema
  for (const [schemaPath, schema] of Object.entries(ANNOTATED_SCHEMAS)) {
    const hints = getDsl(schema);
    if (hints?.kwargs?.includes(key)) {
      const fieldSchema = getPropertySchema(schemaPath + '.' + key);
      if (fieldSchema) {
        const type = detectSchemaType(fieldSchema);
        if (type === 'enum') {
          const values = getEnumValues(fieldSchema);
          if (values) return values.map(v => ({ label: v, type: 'value', detail: `${key} value` }));
        }
        if (type === 'color') return colorCompletions();
        if (type === 'pointref' || type === 'string') {
          // String/pointref kwargs may want node IDs or other contextual values
          if (modelJson) return extractNodeIds(modelJson);
        }
      }
    }
  }
  // Also check AnimConfigSchema kwargs
  const animHints = getDsl(AnimConfigSchema);
  if (animHints?.kwargs?.includes(key)) {
    const fieldSchema = getPropertySchema('animate.' + key);
    // Fallback: check EasingNameSchema directly for 'easing'
    if (key === 'easing' || (fieldSchema && detectSchemaType(fieldSchema) === 'enum')) {
      const values = getEnumValues(fieldSchema ?? EasingNameSchema);
      if (values) return values.map(v => ({ label: v, type: 'value', detail: 'Easing function' }));
    }
  }
  // Also check NodeSchema kwargs (opacity, depth, etc. — numeric, no list completions)
  if (NODE_HINTS?.kwargs?.includes(key)) {
    const fieldSchema = getPropertySchema(key);
    if (fieldSchema) {
      const type = detectSchemaType(fieldSchema);
      if (type === 'enum') {
        const values = getEnumValues(fieldSchema);
        if (values) return values.map(v => ({ label: v, type: 'value' }));
      }
    }
  }
  return [];
}

// ─── Top-Level Completions ───────────────────────────────────────

function topLevelCompletions(ast: AstNode, modelJson?: any): CompletionItem[] {
  const items: CompletionItem[] = [...TOP_LEVEL_KEYWORDS];
  if (modelJson) {
    items.push(...extractNodeIds(modelJson));
  }
  return items;
}

// ─── Section Completions ─────────────────────────────────────────

function sectionCompletions(node: AstNode, modelJson?: any): CompletionItem[] {
  const sp = node.schemaPath;

  if (sp === 'objects' || sp === '') {
    // Inside objects section → suggest geometry keywords with snippets
    const items: CompletionItem[] = GEOMETRY_KEYWORDS.map(g => {
      const item: CompletionItem = { label: g, type: 'keyword', detail: 'Geometry type' };
      const schemaKey = KEYWORD_TO_SCHEMA[g] ?? g;
      const tmpl = buildSnippetTemplate(schemaKey);
      if (tmpl) item.snippetTemplate = tmpl;
      return item;
    });
    if (modelJson) {
      items.push(...extractNodeIds(modelJson));
    }
    return items;
  }

  if (sp === 'animate') {
    // Derive from AnimConfigSchema hints
    const animHints = getDsl(AnimConfigSchema);
    const items: CompletionItem[] = [];
    if (animHints?.flags) {
      for (const f of animHints.flags) {
        items.push({ label: f, type: 'keyword', detail: `Animation ${f}` });
      }
    }
    if (animHints?.children) {
      for (const key of Object.keys(animHints.children)) {
        if (key === 'chapters') {
          items.push({ label: 'chapter', type: 'keyword', detail: 'Named chapter marker' });
        }
      }
    }
    return items;
  }

  return [];
}

// ─── Node Context Completions ────────────────────────────────────

function nodeContextCompletions(node: AstNode, pos: number, modelJson?: any): CompletionItem[] {
  const compound = findCompound(node);

  if (!compound) {
    return [...NODE_PROPERTY_KEYWORDS];
  }

  const sp = compound.schemaPath;

  const lastChild = compound.children.length > 0
    ? compound.children[compound.children.length - 1]
    : null;
  const cursorPastChildren = !lastChild || pos >= lastChild.to;

  // Color context — check if the compound's schema resolves to a color type
  if (isColorContext(node, compound)) {
    return colorCompletions();
  }

  // Enum context
  if (node.dslRole === 'value' || node.dslRole === 'kwarg-value') {
    const schema = getPropertySchema(node.schemaPath);
    if (schema) {
      const type = detectSchemaType(schema);
      if (type === 'enum') {
        const values = getEnumValues(schema);
        if (values) return values.map(v => ({ label: v, type: 'value' }));
      }
    }
  }

  // Node-line compound → suggest missing properties with two-tier scoping.
  // Always try findPrecedingCompound — don't gate on cursorPastChildren.
  // Partially-typed tokens may be parsed as stray children, but the preceding
  // compound still tells us the relevant scope.
  if (isNodeLine(compound)) {
    {
      const preceding = findPrecedingCompound(compound, pos);
      if (preceding && preceding.schemaPath) {
        const schema = getPropertySchema(preceding.schemaPath);
        if (schema) {
          const type = detectSchemaType(schema);
          if (type === 'object') {
            const available = getAvailableProperties(preceding.schemaPath);
            const completable = getCompletableFields(preceding.schemaPath);
            const existingKeys = collectExistingKeys(preceding, compound);
            const remaining = available
              .filter(p => !existingKeys.has(p.name))
              .filter(p => !completable || completable.has(p.name))
              .map(p => {
                const item: CompletionItem = { label: p.name, type: 'property', detail: p.description, scope: preceding.schemaPath };
                const tmpl = buildKwargSnippet(preceding.schemaPath, p.name);
                if (tmpl) item.snippetTemplate = tmpl;
                return item;
              });

            if (remaining.length > 0) {
              const nodeItems = nodePropertyCompletions(compound, cursorPastChildren, modelJson)
                .map(item => ({ ...item, scope: 'node' }));
              return [...remaining, ...nodeItems];
            }
          }
        }
      }
    }
    return nodePropertyCompletions(compound, cursorPastChildren, modelJson);
  }

  // Generic compound → suggest missing kwargs/flags (not positional)
  if (sp) {
    const schema = getPropertySchema(sp);
    if (schema) {
      const available = getAvailableProperties(sp);
      const completable = getCompletableFields(sp);
      const existingKeys = new Set(
        compound.children
          .filter(c => c.dslRole === 'keyword' || c.dslRole === 'kwarg-key' || c.dslRole === 'flag')
          .map(c => typeof c.value === 'string' ? c.value : '')
          .filter(Boolean),
      );
      return available
        .filter(p => !existingKeys.has(p.name))
        .filter(p => !completable || completable.has(p.name))
        .map(p => {
          const item: CompletionItem = { label: p.name, type: 'property', detail: p.description };
          const tmpl = buildKwargSnippet(sp, p.name);
          if (tmpl) item.snippetTemplate = tmpl;
          return item;
        });
    }
  }

  return [...NODE_PROPERTY_KEYWORDS];
}

// ─── Preceding Compound Finder ───────────────────────────────────

function findPrecedingCompound(compound: AstNode, pos: number): AstNode | null {
  for (let i = compound.children.length - 1; i >= 0; i--) {
    const child = compound.children[i];
    if (child.dslRole === 'compound' && child.to <= pos) {
      return child;
    }
  }
  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Check if a position is in a color context by examining the compound's schema type.
 */
function isColorContext(node: AstNode, compound: AstNode): boolean {
  // Check the compound's schema type
  const schema = getPropertySchema(compound.schemaPath);
  if (schema && detectSchemaType(schema) === 'color') return true;
  // Check the node's schema type
  const nodeSchema = getPropertySchema(node.schemaPath);
  if (nodeSchema && detectSchemaType(nodeSchema) === 'color') return true;
  return false;
}

/**
 * Collect existing kwarg/flag field names from a compound and its sibling kwargs
 * at the node-line level (parser may not nest kwargs inside the compound).
 */
function collectExistingKeys(preceding: AstNode, nodeLine: AstNode): Set<string> {
  const existingKeys = new Set<string>();
  // Inside the compound
  for (const c of preceding.children) {
    if ((c.dslRole === 'keyword' || c.dslRole === 'kwarg-key' || c.dslRole === 'flag') && typeof c.value === 'string') {
      existingKeys.add(c.value);
    }
  }
  // Sibling kwargs at node-line level
  const prefix = preceding.schemaPath + '.';
  const completable = getCompletableFields(preceding.schemaPath);
  const completableSet = completable ?? new Set<string>();
  for (const c of nodeLine.children) {
    if (c === preceding) continue;
    if (c.dslRole === 'kwarg-key' && typeof c.value === 'string') {
      if (completableSet.has(c.value)) existingKeys.add(c.value);
      if (c.schemaPath.startsWith(prefix)) {
        const fieldName = c.schemaPath.slice(prefix.length);
        if (fieldName) existingKeys.add(fieldName);
      }
    }
  }
  return existingKeys;
}

function isNodeLine(compound: AstNode): boolean {
  const mp = compound.modelPath;
  const parts = mp.split('.');
  return parts[0] === 'objects' && parts.length === 2;
}

/**
 * Get the kwarg and flag field names for a schema (excluding positional fields).
 */
function getCompletableFields(schemaPath: string): Set<string> | null {
  const schema = ANNOTATED_SCHEMAS[schemaPath];
  if (!schema) return null;
  const hints = getDsl(schema);
  if (!hints) return null;
  const fields = new Set<string>();
  if (hints.kwargs) for (const k of hints.kwargs) fields.add(k);
  if (hints.flags) for (const f of hints.flags) fields.add(f);
  return fields;
}

/**
 * Build a snippet template from DslHints positional definitions.
 */
function buildSnippetTemplate(schemaPath: string): string | null {
  const schema = ANNOTATED_SCHEMAS[schemaPath];
  if (!schema) return null;
  const hints = getDsl(schema);
  if (!hints || !hints.positional || hints.positional.length === 0) return null;

  const keyword = hints.keyword ?? schemaPath;
  let tabIndex = 1;
  const groups: string[] = [];

  for (const pos of hints.positional) {
    const format = pos.format;

    if (format === 'quoted') {
      const name = pos.keys[0];
      groups.push(`"\${${tabIndex++}:${name}}"`);
    } else {
      const placeholders = pos.keys.map(k => {
        const name = k.length <= 2 ? k.toUpperCase() : k;
        return `\${${tabIndex++}:${name}}`;
      });

      if (format === 'dimension') {
        groups.push(placeholders.join('x'));
      } else if (format === 'spaced') {
        groups.push(placeholders.join(' '));
      } else if (format === 'joined') {
        const sep = pos.separator ?? ',';
        groups.push(placeholders.join(sep));
      } else {
        groups.push(placeholders.join(' '));
      }
    }
  }

  return `${keyword} ${groups.join(' ')}`;
}

/**
 * Build a snippet for just the positional part (keyword already typed).
 * E.g., for 'transform' → { label: 'X,Y', detail: 'Position', template: '${1:X},${2:Y}' }
 */
function buildPositionalOnlySnippet(schemaPath: string): { label: string; detail: string; template: string } | null {
  const schema = ANNOTATED_SCHEMAS[schemaPath];
  if (!schema) return null;
  const hints = getDsl(schema);
  if (!hints?.positional?.length) return null;

  let tabIndex = 1;
  const groups: string[] = [];
  const labelParts: string[] = [];

  for (const pos of hints.positional) {
    const format = pos.format;
    if (format === 'quoted') {
      const name = pos.keys[0];
      groups.push(`"\${${tabIndex++}:${name}}"`);
      labelParts.push(`"${name}"`);
    } else {
      const names = pos.keys.map(k => k.length <= 2 ? k.toUpperCase() : k);
      const placeholders = names.map(n => `\${${tabIndex++}:${n}}`);

      if (format === 'dimension') {
        groups.push(placeholders.join('x'));
        labelParts.push(names.join('x'));
      } else if (format === 'spaced') {
        groups.push(placeholders.join(' '));
        labelParts.push(names.join(' '));
      } else if (format === 'joined') {
        const sep = pos.separator ?? ',';
        groups.push(placeholders.join(sep));
        labelParts.push(names.join(sep));
      } else {
        groups.push(placeholders.join(' '));
        labelParts.push(names.join(' '));
      }
    }
  }

  return {
    label: labelParts.join(' '),
    detail: `${hints.keyword ?? schemaPath} values`,
    template: groups.join(' '),
  };
}

/**
 * Build a kwarg snippet template using schema defaults and type detection.
 */
function buildKwargSnippet(schemaPath: string, fieldName: string): string | null {
  const fieldSchema = getPropertySchema(schemaPath + '.' + fieldName);
  if (!fieldSchema) return `${fieldName}=\${1:value}`;

  const defaultVal = getSchemaDefault(fieldSchema);
  if (defaultVal !== undefined) {
    return `${fieldName}=\${1:${defaultVal}}`;
  }

  const type = detectSchemaType(fieldSchema);
  if (type === 'number') return `${fieldName}=\${1:0}`;
  if (type === 'boolean') return `${fieldName}=\${1:true}`;
  if (type === 'enum') {
    const values = getEnumValues(fieldSchema);
    if (values && values.length > 0) return `${fieldName}=\${1:${values[0]}}`;
  }
  if (type === 'string') return `${fieldName}=\${1:value}`;

  return null;
}

function nodePropertyCompletions(compound: AstNode, cursorPastChildren: boolean, modelJson?: any): CompletionItem[] {
  const existingKeywords = new Set<string>();
  for (const child of compound.children) {
    if (child.dslRole === 'keyword' && typeof child.value === 'string') {
      existingKeywords.add(child.value);
    }
    if (child.dslRole === 'compound' && child.children.length > 0) {
      const firstChild = child.children[0];
      if (firstChild.dslRole === 'keyword' && typeof firstChild.value === 'string') {
        existingKeywords.add(firstChild.value);
      }
    }
    if (child.dslRole === 'flag' && typeof child.value === 'string') {
      existingKeywords.add(child.value);
    }
  }

  const hasGeometry = GEOMETRY_KEYWORDS.some(g => existingKeywords.has(g));
  const items: CompletionItem[] = [];

  // Geometry suggestions (if none present yet)
  if (!hasGeometry) {
    items.push(...GEOMETRY_KEYWORDS.map(g => {
      const item: CompletionItem = { label: g, type: 'keyword', detail: 'Geometry type' };
      const schemaKey = KEYWORD_TO_SCHEMA[g] ?? g;
      const tmpl = buildSnippetTemplate(schemaKey);
      if (tmpl) item.snippetTemplate = tmpl;
      return item;
    }));
  }

  // Property suggestions with snippet templates (derived from schema)
  items.push(...NODE_PROPERTY_KEYWORDS
    .filter(p => !existingKeywords.has(p.label))
    .map(p => {
      const item: CompletionItem = { ...p };
      // Color-positional keywords (fill, stroke) get a snippet with a color placeholder.
      // The user can type over it or press ctrl+space to see the color list.
      const schemaKey = KEYWORD_TO_SCHEMA[p.label];
      if (schemaKey) {
        const tmpl = buildSnippetTemplate(schemaKey);
        if (tmpl) item.snippetTemplate = tmpl;
      }
      // fill has no annotated schema (it's a direct ColorSchema value) — give it a snippet
      if (!item.snippetTemplate && COLOR_POSITIONAL_KEYWORDS.has(p.label)) {
        item.snippetTemplate = `${p.label} \${1:color}`;
      }
      return item;
    }));

  // Sigil (@style) — derived from NodeSchema's sigil hint
  if (NODE_HINTS?.sigil && !existingKeywords.has(NODE_HINTS.sigil.prefix) && modelJson?.styles) {
    const prefix = NODE_HINTS.sigil.prefix;
    items.push(...Object.keys(modelJson.styles).map(n => ({
      label: `${prefix}${n}`, type: 'value' as const, detail: 'Style reference',
    })));
  }

  return items;
}

function colorCompletions(): CompletionItem[] {
  const names = getAllColorNames();
  const items: CompletionItem[] = names.map(name => ({
    label: name, type: 'value', detail: 'Named color',
  }));
  // Add color format keywords from annotated schemas
  for (const colorSchema of [HslColorSchema, RgbColorSchema]) {
    const hints = getDsl(colorSchema);
    if (hints?.keyword) {
      const tmpl = buildSnippetTemplate(
        Object.entries(ANNOTATED_SCHEMAS).find(([, s]) => s === colorSchema)?.[0] ?? ''
      );
      items.push({
        label: hints.keyword,
        type: 'keyword',
        detail: `${hints.keyword.toUpperCase()} color`,
        snippetTemplate: tmpl ?? undefined,
      });
    }
  }
  return items;
}

function findNearestContext(ast: AstNode, pos: number): AstNode | null {
  let best: AstNode | null = null;
  for (const section of ast.children) {
    // Only actual sections provide a context — skip top-level metadata
    // compounds (name, background, viewport, description).
    if (section.dslRole !== 'section') continue;
    if (section.to <= pos) {
      const lastCompound = section.children.length > 0
        ? section.children[section.children.length - 1]
        : section;
      best = lastCompound;
    } else if (section.from <= pos) {
      for (const child of section.children) {
        if (child.to <= pos) {
          best = child;
        } else if (child.from <= pos) {
          best = child;
        }
      }
      if (!best) best = section;
    }
  }
  return best;
}

function extractNodeIds(modelJson: any): CompletionItem[] {
  if (!modelJson?.objects) return [];
  const ids: CompletionItem[] = [];
  const walk = (nodes: any[]) => {
    for (const n of nodes) {
      if (n.id) ids.push({ label: n.id, type: 'value', detail: 'Node ID' });
      if (n.children) walk(n.children);
    }
  };
  walk(modelJson.objects);
  return ids;
}
