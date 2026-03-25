/**
 * AST-based completions: use the AST tree to determine context-aware suggestions.
 *
 * `completionsAt(ast, pos, modelJson?)` finds the deepest node at cursor,
 * determines context, and generates suggestions using AST tree structure.
 */
import type { AstNode } from './astTypes';
import { nodeAt, findCompound } from './astTypes';
import { getAllColorNames } from '../types/color';
import {
  getPropertySchema, detectSchemaType, getEnumValues,
  getAvailableProperties, EasingNameSchema,
} from '../types/schemaRegistry';

export interface CompletionItem {
  label: string;
  type?: string;    // 'keyword' | 'value' | 'property'
  detail?: string;
}

// ─── Geometry / Section Keywords ─────────────────────────────────

const GEOMETRY_KEYWORDS = ['rect', 'ellipse', 'text', 'image', 'path', 'camera'];

const TOP_LEVEL_KEYWORDS: CompletionItem[] = [
  { label: 'name', type: 'keyword', detail: 'Document name' },
  { label: 'description', type: 'keyword', detail: 'Document description' },
  { label: 'background', type: 'keyword', detail: 'Background color' },
  { label: 'viewport', type: 'keyword', detail: 'Viewport dimensions' },
  { label: 'images', type: 'keyword', detail: 'Image definitions' },
  { label: 'style', type: 'keyword', detail: 'Named style block' },
  { label: 'animate', type: 'keyword', detail: 'Animation block' },
];

const NODE_PROPERTY_KEYWORDS: CompletionItem[] = [
  { label: 'fill', type: 'keyword', detail: 'Fill color' },
  { label: 'stroke', type: 'keyword', detail: 'Stroke color & width' },
  { label: 'opacity', type: 'keyword', detail: 'Opacity (0-1)' },
  { label: 'visible', type: 'keyword', detail: 'Visibility flag' },
  { label: 'depth', type: 'keyword', detail: 'Z-depth' },
  { label: 'dash', type: 'keyword', detail: 'Stroke dash pattern' },
  { label: 'at', type: 'keyword', detail: 'Position transform' },
  { label: 'layout', type: 'keyword', detail: 'Layout container' },
];

// ─── Main Entry Point ────────────────────────────────────────────

/**
 * Generate context-aware completions at the given cursor position.
 *
 * @param ast The root AST node (from buildAstFromModel or buildAstFromText)
 * @param pos Cursor position in the text
 * @param lineText Text from line start to cursor (for content-dependent completions)
 * @param modelJson Optional model JSON (for node IDs, style names)
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

function lineTextCompletions(lineText: string, modelJson?: any): CompletionItem[] {
  // After = sign: value completions (easing=, look=, etc.)
  const equalsMatch = lineText.match(/(\w+)\s*=\s*(\w*)$/);
  if (equalsMatch) {
    const key = equalsMatch[1];
    if (key === 'easing') {
      const values = getEnumValues(EasingNameSchema) ?? [];
      return values.map(v => ({ label: v, type: 'value', detail: 'Easing function' }));
    }
    if (key === 'look' && modelJson) {
      return extractNodeIds(modelJson);
    }
  }

  // After fill/stroke keyword: color completions
  if (lineText.match(/\b(fill|stroke)\s+\w*$/)) {
    return colorCompletions();
  }

  // After @ sign: style names
  if (lineText.match(/@\w*$/) && modelJson?.styles) {
    return Object.keys(modelJson.styles).map(n => ({
      label: n, type: 'value', detail: 'Style name',
    }));
  }

  // After -> : node IDs for connections
  if (lineText.includes('->') && modelJson) {
    return extractNodeIds(modelJson);
  }

  return [];
}

// ─── Top-Level Completions ───────────────────────────────────────

function topLevelCompletions(ast: AstNode, modelJson?: any): CompletionItem[] {
  const items: CompletionItem[] = [...TOP_LEVEL_KEYWORDS];

  // Add node IDs as potential targets if in objects area
  if (modelJson) {
    const ids = extractNodeIds(modelJson);
    items.push(...ids);
  }

  return items;
}

// ─── Section Completions ─────────────────────────────────────────

function sectionCompletions(node: AstNode, modelJson?: any): CompletionItem[] {
  const sp = node.schemaPath;

  if (sp === 'objects' || sp === '') {
    // Inside objects section → suggest node IDs + geometry keywords
    const items: CompletionItem[] = GEOMETRY_KEYWORDS.map(g => ({
      label: g, type: 'keyword', detail: 'Geometry type',
    }));
    if (modelJson) {
      items.push(...extractNodeIds(modelJson));
    }
    return items;
  }

  if (sp === 'animate') {
    // Inside animate section → keyframe time, chapter, easing
    return [
      { label: 'chapter', type: 'keyword', detail: 'Named chapter marker' },
      { label: 'loop', type: 'keyword', detail: 'Loop animation' },
      { label: 'autoKey', type: 'keyword', detail: 'Auto-keyframe mode' },
    ];
  }

  if (sp === 'styles') {
    return [
      { label: 'style', type: 'keyword', detail: 'Named style block' },
    ];
  }

  return [];
}

// ─── Node Context Completions ────────────────────────────────────

function nodeContextCompletions(node: AstNode, pos: number, modelJson?: any): CompletionItem[] {
  // Walk up to the nearest compound to understand context
  const compound = findCompound(node);

  if (!compound) {
    // Leaf not in a compound — offer node property keywords
    return [...NODE_PROPERTY_KEYWORDS];
  }

  const sp = compound.schemaPath;

  // Check if cursor is past the last child → suggest missing fields
  const lastChild = compound.children.length > 0
    ? compound.children[compound.children.length - 1]
    : null;
  const cursorPastChildren = !lastChild || pos >= lastChild.to;

  // Color context (fill, stroke color, or color value position)
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

  // Node-line compound → suggest missing properties
  if (isNodeLine(compound)) {
    return nodePropertyCompletions(compound, cursorPastChildren, modelJson);
  }

  // Generic compound → suggest missing fields from its schema
  if (sp) {
    const schema = getPropertySchema(sp);
    if (schema) {
      const available = getAvailableProperties(sp);
      const existingKeys = new Set(
        compound.children
          .filter(c => c.dslRole === 'keyword' || c.dslRole === 'kwarg-key' || c.dslRole === 'flag')
          .map(c => typeof c.value === 'string' ? c.value : '')
          .filter(Boolean),
      );
      return available
        .filter(p => !existingKeys.has(p.name))
        .map(p => ({ label: p.name, type: 'property', detail: p.description }));
    }
  }

  return [...NODE_PROPERTY_KEYWORDS];
}

// ─── Helpers ─────────────────────────────────────────────────────

function isColorContext(node: AstNode, compound: AstNode): boolean {
  const sp = node.schemaPath;
  if (sp === 'fill' || sp.endsWith('.color') || sp === 'stroke.color') return true;
  if (compound.schemaPath === 'fill' || compound.schemaPath === 'stroke') return true;
  // Check if the compound is a color compound
  const schema = getPropertySchema(compound.schemaPath);
  if (schema && detectSchemaType(schema) === 'color') return true;
  return false;
}

function isNodeLine(compound: AstNode): boolean {
  // A node line compound has modelPath like "objects.<id>" and no dots after the first two segments
  const mp = compound.modelPath;
  const parts = mp.split('.');
  return parts[0] === 'objects' && parts.length === 2;
}

function nodePropertyCompletions(compound: AstNode, cursorPastChildren: boolean, modelJson?: any): CompletionItem[] {
  // Find which properties already exist on this node
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

  // Check if geometry is already present
  const hasGeometry = GEOMETRY_KEYWORDS.some(g => existingKeywords.has(g));

  const items: CompletionItem[] = [];

  // Geometry suggestions (if none present yet)
  if (!hasGeometry) {
    items.push(...GEOMETRY_KEYWORDS.map(g => ({
      label: g, type: 'keyword', detail: 'Geometry type',
    })));
  }

  // Property suggestions (filter existing)
  items.push(...NODE_PROPERTY_KEYWORDS.filter(p => !existingKeywords.has(p.label)));

  // Sigil (@style)
  if (!existingKeywords.has('@') && modelJson?.styles) {
    items.push(...Object.keys(modelJson.styles).map(n => ({
      label: `@${n}`, type: 'value', detail: 'Style reference',
    })));
  }

  return items;
}

function colorCompletions(): CompletionItem[] {
  const names = getAllColorNames();
  const items: CompletionItem[] = names.map(name => ({
    label: name, type: 'value', detail: 'Named color',
  }));
  items.push(
    { label: 'hsl', type: 'keyword', detail: 'HSL color' },
    { label: 'rgb', type: 'keyword', detail: 'RGB color' },
  );
  return items;
}

/**
 * When cursor is in a gap (e.g., at the newline after a node line), find the
 * nearest preceding compound or section node to provide contextual completions.
 */
function findNearestContext(ast: AstNode, pos: number): AstNode | null {
  // Walk all top-level sections and their children; find the one closest to
  // but at or before `pos`.
  let best: AstNode | null = null;
  for (const section of ast.children) {
    if (section.to <= pos) {
      // Section ends at or before pos — use the last compound in it
      const lastCompound = section.children.length > 0
        ? section.children[section.children.length - 1]
        : section;
      best = lastCompound;
    } else if (section.from <= pos) {
      // We're inside this section's range — look for the last compound before pos
      for (const child of section.children) {
        if (child.to <= pos) {
          best = child;
        } else if (child.from <= pos) {
          // We're inside this child (but nodeAt didn't find us, because the
          // position is at the boundary). Use this child.
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
