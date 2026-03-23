/**
 * Context-aware completions for the DSL editor mode.
 * Provides keyword completions based on the cursor position within DSL text.
 */
import { getDslCursorContext } from './dslCursorPath';
import { getAllColorNames } from '../types/color';
import { getEnumValues, EasingNameSchema } from '../types/schemaRegistry';

export interface DslCompletionItem {
  label: string;
  type?: string;
  detail?: string;
}

// ─── Geometry types ──────────────────────────────────────────────

const GEOMETRY_TYPES: DslCompletionItem[] = [
  { label: 'rect', type: 'keyword', detail: 'Rectangle (w x h)' },
  { label: 'ellipse', type: 'keyword', detail: 'Ellipse (rx, ry)' },
  { label: 'text', type: 'keyword', detail: 'Text node ("content")' },
  { label: 'path', type: 'keyword', detail: 'Path with points or route' },
  { label: 'camera', type: 'keyword', detail: 'Camera node' },
  { label: 'image', type: 'keyword', detail: 'Image node ("src" w x h)' },
];

// ─── Node property keywords ─────────────────────────────────────

const NODE_PROPERTIES: DslCompletionItem[] = [
  { label: 'fill', type: 'property', detail: 'Fill color' },
  { label: 'stroke', type: 'property', detail: 'Stroke color + width' },
  { label: 'at', type: 'property', detail: 'Position (x,y)' },
  { label: 'opacity=', type: 'property', detail: 'Opacity (0-1)' },
  { label: 'radius=', type: 'property', detail: 'Corner radius' },
  { label: 'rotation=', type: 'property', detail: 'Rotation in degrees' },
  { label: 'scale=', type: 'property', detail: 'Scale factor' },
  { label: 'depth=', type: 'property', detail: 'Z-index depth' },
  { label: 'visible=', type: 'property', detail: 'Visibility (true/false)' },
  { label: 'size=', type: 'property', detail: 'Text size' },
  { label: 'bold', type: 'property', detail: 'Bold text' },
  { label: 'mono', type: 'property', detail: 'Monospace text' },
  { label: 'closed', type: 'property', detail: 'Close path' },
  { label: 'smooth', type: 'property', detail: 'Smooth path' },
  { label: 'dash', type: 'property', detail: 'Dash pattern' },
  { label: 'layout', type: 'property', detail: 'Layout (flex)' },
  { label: 'slot=', type: 'property', detail: 'Layout slot name' },
  { label: 'active', type: 'property', detail: 'Mark camera as active' },
];

// ─── Dash patterns ───────────────────────────────────────────────

const DASH_PATTERNS: DslCompletionItem[] = [
  { label: 'dashed', type: 'value', detail: 'Dashed line' },
  { label: 'dotted', type: 'value', detail: 'Dotted line' },
  { label: 'solid', type: 'value', detail: 'Solid line' },
];

// ─── Top-level keywords ─────────────────────────────────────────

const TOP_LEVEL_KEYWORDS: DslCompletionItem[] = [
  { label: 'name', type: 'keyword', detail: 'Document name' },
  { label: 'description', type: 'keyword', detail: 'Document description' },
  { label: 'background', type: 'keyword', detail: 'Background color' },
  { label: 'viewport', type: 'keyword', detail: 'Viewport dimensions (WxH)' },
  { label: 'images', type: 'keyword', detail: 'Image definitions' },
  { label: 'style', type: 'keyword', detail: 'Named style block' },
  { label: 'animate', type: 'keyword', detail: 'Animation block' },
];

// ─── Helpers ─────────────────────────────────────────────────────

/** Extract all node IDs from DSL text */
function extractNodeIds(text: string): string[] {
  const ids: string[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trimStart();
    const m = trimmed.match(/^(\w+)\s*:/);
    if (m) {
      const id = m[1];
      // Exclude top-level keywords
      const skip = new Set(['name', 'description', 'background', 'viewport', 'images', 'style', 'animate']);
      if (!skip.has(id)) {
        ids.push(id);
      }
    }
  }
  return ids;
}

/** Extract all style names from DSL text */
function extractStyleNames(text: string): string[] {
  const names: string[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const m = line.match(/^style\s+(\w+)/);
    if (m) names.push(m[1]);
  }
  return names;
}

/**
 * Get DSL completions at a cursor position.
 */
export function getDslCompletions(
  text: string,
  cursorOffset: number,
): DslCompletionItem[] {
  const ctx = getDslCursorContext(text, cursorOffset);

  // Get the current line text up to cursor
  const lineStart = text.lastIndexOf('\n', cursorOffset - 1) + 1;
  const lineTextToCursor = text.slice(lineStart, cursorOffset);
  const line = lineTextToCursor;

  // ── After = sign: value completions ─────────────────────────

  const equalsMatch = line.match(/(\w+)\s*=\s*(\w*)$/);
  if (equalsMatch) {
    const key = equalsMatch[1];
    const prefix = equalsMatch[2] || '';

    if (key === 'easing') {
      return getEasingCompletions(prefix);
    }
    if (key === 'dash') {
      return filterByPrefix(DASH_PATTERNS, prefix);
    }
    if (key === 'look') {
      // Camera look= accepts "all" or node IDs
      const ids = extractNodeIds(text);
      const items: DslCompletionItem[] = [
        { label: 'all', type: 'value', detail: 'Look at all nodes' },
        ...ids.map(id => ({ label: id, type: 'value' as const, detail: 'Node ID' })),
      ];
      return filterByPrefix(items, prefix);
    }

    // No specific value completions
    return [];
  }

  // ── After fill/stroke keyword: color completions ────────────

  const fillStrokeMatch = line.match(/\b(fill|stroke)\s+(\w*)$/);
  if (fillStrokeMatch) {
    const prefix = fillStrokeMatch[2] || '';
    return getColorCompletions(prefix);
  }

  // ── After @ sign: style names ──────────────────────────────

  const atMatch = line.match(/@(\w*)$/);
  if (atMatch) {
    const prefix = atMatch[1] || '';
    const names = extractStyleNames(text);
    return filterByPrefix(
      names.map(n => ({ label: n, type: 'value', detail: 'Style name' })),
      prefix,
    );
  }

  // ── After -> : node IDs ────────────────────────────────────

  if (line.includes('->')) {
    const ids = extractNodeIds(text);
    return filterByPrefix(
      ids.map(id => ({ label: id, type: 'value', detail: 'Node ID' })),
      ctx.prefix,
    );
  }

  // ── After dash keyword: pattern values ─────────────────────

  const dashMatch = line.match(/\bdash\s+(\w*)$/);
  if (dashMatch) {
    return filterByPrefix(DASH_PATTERNS, dashMatch[1] || '');
  }

  // ── After id: (geometry position) ──────────────────────────

  if (ctx.path.match(/^objects\.\d+$/) && ctx.isPropertyName) {
    // Check if we're right after the colon (geometry type position)
    const colonMatch = line.match(/\w+\s*:\s*(\w*)$/);
    if (colonMatch) {
      const prefix = colonMatch[1] || '';
      // If prefix is a known geometry type, show property completions
      if (prefix && ['rect', 'ellipse', 'text', 'image', 'camera', 'path'].some(g => g.startsWith(prefix))) {
        return filterByPrefix(GEOMETRY_TYPES, prefix);
      }
      // Show both geometry types and property keywords
      return filterByPrefix([...GEOMETRY_TYPES, ...NODE_PROPERTIES], prefix);
    }

    // Otherwise, property keyword position
    return filterByPrefix(NODE_PROPERTIES, ctx.prefix);
  }

  // ── In animate block ───────────────────────────────────────

  if (ctx.path.startsWith('animate') && ctx.isPropertyName) {
    const ids = extractNodeIds(text);
    const items: DslCompletionItem[] = [
      { label: 'loop', type: 'keyword', detail: 'Loop animation' },
      { label: 'autoKey', type: 'keyword', detail: 'Auto-keyframe' },
      { label: 'easing=', type: 'property', detail: 'Default easing' },
      { label: 'chapter', type: 'keyword', detail: 'Chapter marker' },
      ...ids.map(id => ({ label: id, type: 'value' as const, detail: 'Node ID (track)' })),
    ];
    return filterByPrefix(items, ctx.prefix);
  }

  // ── In style block ────────────────────────────────────────

  if (ctx.path.startsWith('styles') && ctx.isPropertyName) {
    const items: DslCompletionItem[] = [
      { label: 'fill', type: 'property', detail: 'Fill color' },
      { label: 'stroke', type: 'property', detail: 'Stroke color' },
      { label: 'dash', type: 'property', detail: 'Dash pattern' },
      { label: 'layout', type: 'property', detail: 'Layout' },
      { label: 'opacity=', type: 'property', detail: 'Opacity' },
    ];
    return filterByPrefix(items, ctx.prefix);
  }

  // ── Top level ──────────────────────────────────────────────

  if (ctx.path === '' && ctx.isPropertyName) {
    return filterByPrefix(TOP_LEVEL_KEYWORDS, ctx.prefix);
  }

  return [];
}

// ─── Internal Helpers ────────────────────────────────────────────

function getColorCompletions(prefix: string): DslCompletionItem[] {
  const names = getAllColorNames();
  const items: DslCompletionItem[] = names.map(name => ({
    label: name,
    type: 'value',
    detail: 'Named color',
  }));
  // Add HSL hint
  items.push({ label: 'H S L', type: 'value', detail: 'HSL values (e.g. 210 80 50)' });
  return filterByPrefix(items, prefix);
}

function getEasingCompletions(prefix: string): DslCompletionItem[] {
  const values = getEnumValues(EasingNameSchema) || [];
  return filterByPrefix(
    values.map(v => ({ label: v, type: 'value', detail: 'Easing function' })),
    prefix,
  );
}

function filterByPrefix(items: DslCompletionItem[], prefix: string): DslCompletionItem[] {
  if (!prefix) return items;
  const lower = prefix.toLowerCase();
  return items.filter(item => item.label.toLowerCase().startsWith(lower));
}
