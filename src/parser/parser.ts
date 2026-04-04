import type { Node } from '../types/node';
import { createNode } from '../types/node';
import type { AnimConfig } from '../types/animation';
import { expandTemplates } from '../templates/registry';
import { validateTree } from '../tree/validate';
import { generateTrackPaths } from '../tree/walker';
import { registerBuiltinTemplates } from '../templates/index';
import { buildAstFromText } from '../dsl/astParser';

export interface ParsedScene {
  name?: string;
  description?: string;
  nodes: Node[];
  styles: Record<string, any>;
  animate?: AnimConfig;
  background?: string;
  viewport?: string | { width: number; height: number };
  images?: Record<string, string>;
  trackPaths: string[];
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

export function parseScene(input: string): ParsedScene {
  registerBuiltinTemplates();

  const trimmed = input.trim();
  const raw = buildAstFromText(trimmed).model;

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
  const expanded = expandTemplates((raw.objects ?? []).map(migrateNode));

  // Convert styles to first-class nodes
  const styleNodes = stylesToNodes(styles);

  // Combine: style nodes first, then object nodes
  const allNodes = [...styleNodes, ...expanded];

  // Validate (style nodes share namespace with object nodes)
  validateTree(allNodes);

  // Generate track paths (walks all nodes including style nodes)
  const trackPaths = generateTrackPaths(allNodes);

  return {
    name,
    description,
    nodes: allNodes,
    styles,
    animate,
    background,
    viewport,
    images,
    trackPaths,
  };
}
