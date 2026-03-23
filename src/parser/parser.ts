import JSON5 from 'json5';
import type { Node } from '../types/node';
import { createNode } from '../types/node';
import type { AnimConfig } from '../types/animation';
import { expandTemplates } from '../templates/registry';
import { validateTree } from '../tree/validate';
import { generateTrackPaths } from '../tree/walker';
import { registerBuiltinTemplates } from '../templates/index';
import { parseDsl } from '../dsl/parser';

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
 * Normalize path from/to into unified route arrays.
 * If a path has from/to, constructs route = [from, ...oldRoute, to] and deletes from/to.
 * Walks all nodes recursively.
 */
export function normalizeRoutes(nodes: Node[]): Node[] {
  for (const node of nodes) {
    if (node.path) {
      const { from, to, route: oldRoute } = node.path;
      if (from !== undefined || to !== undefined) {
        const newRoute: any[] = [];
        if (from !== undefined) newRoute.push(from);
        if (oldRoute) newRoute.push(...oldRoute);
        if (to !== undefined) newRoute.push(to);
        node.path.route = newRoute;
        delete (node.path as any).from;
        delete (node.path as any).to;
      }
    }
    if (node.children.length > 0) {
      normalizeRoutes(node.children);
    }
  }
  return nodes;
}

export function parseScene(input: string): ParsedScene {
  registerBuiltinTemplates();

  const trimmed = input.trim();
  const isDsl = trimmed.length === 0 || trimmed[0] !== '{';
  const raw = isDsl ? parseDsl(trimmed) : JSON5.parse(trimmed);

  const name = typeof raw.name === 'string' ? raw.name : undefined;
  const description = typeof raw.description === 'string' ? raw.description : undefined;
  const styles = raw.styles ?? {};
  const animate = raw.animate as AnimConfig | undefined;
  const background = raw.background as string | undefined;
  const viewport = raw.viewport;
  const images = raw.images as Record<string, string> | undefined;

  // Expand templates
  const expanded = expandTemplates(raw.objects ?? []);

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
