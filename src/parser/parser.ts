import type { Node } from '../types/node';
import { createNode } from '../types/node';
import type { AnimConfig } from '../types/animation';
import { expandTemplates } from '../templates/registry';
import type { TextMeasurer } from '../text/measure';
import { validateTree, findEmptyNodes } from '../tree/validate';
import { generateTrackPaths } from '../tree/walker';
import { registerBuiltinTemplates } from '../templates/index';
import { walkDocument } from '../dsl/schemaWalker';
import { validateLayoutUsage } from '../layout';
import { buildTimeline } from '../animation/timeline';

export interface ParsedScene {
  name?: string;
  description?: string;
  nodes: Node[];
  styles: Record<string, any>;
  animate?: AnimConfig;
  background?: string;
  viewport?: string | { width: number; height: number };
  images?: Record<string, string>;
  use?: string[];
  trackPaths: string[];
  warnings: string[];
}

/**
 * Convert style definitions into real nodes with _isStyle: true.
 * These nodes sit at the top level of the tree and are walked by the
 * tree walker like any other node, generating animatable track paths.
 */
function stylesToNodes(styles: Record<string, any>): Node[] {
  const nodes: Node[] = [];
  for (const [name, def] of Object.entries(styles)) {
    const { style: _parentStyle, ...props } = def;
    const node = createNode({ id: name, ...props });
    node._isStyle = true;
    nodes.push(node);
  }
  return nodes;
}


/**
 * Migrate old flat stroke format { h, s, l, width } to new { color: { h, s, l }, width }.
 */
function migrateStroke(stroke: any): any {
  if (stroke && typeof stroke === 'object' && 'h' in stroke && 's' in stroke && 'l' in stroke) {
    const { h, s, l, a, width, ...rest } = stroke;
    const color: any = { h, s, l };
    if (a !== undefined) color.a = a;
    return { color, ...(width !== undefined ? { width } : {}), ...rest };
  }
  return stroke;
}

/**
 * Recursively migrate old stroke formats in a node tree (JSON path only).
 */
function migrateNode(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(migrateNode);
  const result = { ...obj };
  if (result.stroke) {
    result.stroke = migrateStroke(result.stroke);
  }
  if (result.children) {
    result.children = result.children.map(migrateNode);
  }
  return result;
}

export function parseScene(input: string, measure?: TextMeasurer): ParsedScene {
  registerBuiltinTemplates();

  const trimmed = input.trim();
  const walked = walkDocument(trimmed);
  const raw = walked.model;

  const name = typeof raw.name === 'string' ? raw.name : undefined;
  const description = typeof raw.description === 'string' ? raw.description : undefined;
  const background = raw.background as string | undefined;
  const viewport = raw.viewport;
  const images = raw.images as Record<string, string> | undefined;

  // Migrate old stroke format in styles and animate
  const styles = raw.styles ?? {};
  for (const key of Object.keys(styles)) {
    if (styles[key]?.stroke) {
      styles[key] = { ...styles[key], stroke: migrateStroke(styles[key].stroke) };
    }
  }

  const animate = raw.animate as AnimConfig | undefined;

  // Expand templates, then migrate old stroke format in objects
  const searchPath = (raw.use as string[] | undefined) ?? ['core'];
  // Text the walker couldn't account for — a mistyped property, a stray token.
  // It drops those rather than failing (the editor re-parses every keystroke,
  // so half-typed lines must not throw), which is only acceptable if it says so.
  const warnings: string[] = [...walked.ast.warnings];
  const expanded = expandTemplates((raw.objects ?? []).map(migrateNode), searchPath, measure, warnings);

  // Convert styles to first-class nodes
  const styleNodes = stylesToNodes(styles);

  // Combine: style nodes first, then object nodes
  const allNodes = [...styleNodes, ...expanded];

  // Validate (style nodes share namespace with object nodes)
  validateTree(allNodes);

  // Generate track paths (walks all nodes including style nodes)
  const trackPaths = generateTrackPaths(allNodes);

  // Misapplied layout props (e.g. a grid hint on a flex child) don't fail
  // parsing — they warn, same policy as timeline warnings.
  warnings.push(...validateLayoutUsage(allNodes));

  // Timeline diagnostics. buildTimeline has always detected animation
  // aimed at a node that doesn't exist, but nothing merged its warnings
  // here, so `starch check` and parseScene both passed a document whose
  // entire animate block was silently dropped. Building the timeline costs
  // a fraction of the parse it follows. A throw here is not the document's
  // structure failing, so it degrades to a warning rather than losing the
  // tree the caller asked for.
  if (animate) {
    try {
      warnings.push(...buildTimeline(animate, allNodes).warnings);
    } catch (err) {
      warnings.push(`Animation could not be built: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Silent-failure guards. The walker drops what it can't match rather than
  // erroring, so without these a typo'd property, an unknown template or an
  // entirely non-starch document all parse "successfully" and render blank.
  for (const id of findEmptyNodes(allNodes)) {
    warnings.push(`Node "${id}" has no properties — check for a typo in its shape or property name`);
  }
  if (trimmed.length > 0 && allNodes.length === 0) {
    warnings.push('Document parsed to zero nodes — nothing here was recognised as starch');
  }

  return {
    name,
    description,
    nodes: allNodes,
    styles,
    animate,
    background,
    viewport,
    images,
    use: searchPath,
    trackPaths,
    warnings,
  };
}
