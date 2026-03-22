import type { Node } from '../types/node';

/** Property keys that are sub-objects with enumerable leaf fields */
const SUB_OBJECT_KEYS = ['fill', 'stroke', 'transform', 'dash', 'size', 'layout', 'layoutHint'] as const;

/** Property keys that are geometry sub-objects */
const GEOMETRY_KEYS = ['rect', 'ellipse', 'text', 'path', 'image'] as const;

/** Scalar property keys directly on the node */
const SCALAR_KEYS = ['opacity', 'depth', 'visible'] as const;

function collectLeafPaths(obj: Record<string, unknown>, prefix: string, paths: string[]): void {
  for (const [key, value] of Object.entries(obj)) {
    const path = `${prefix}.${key}`;
    if (value !== undefined && value !== null && typeof value === 'object' && !Array.isArray(value)) {
      collectLeafPaths(value as Record<string, unknown>, path, paths);
    } else if (value !== undefined) {
      paths.push(path);
    }
  }
}

function walkNode(node: Node, parentPath: string | null, paths: string[]): void {
  const nodePath = parentPath ? `${parentPath}.${node.id}` : node.id;
  const ownKeys = node._ownKeys ?? new Set<string>();

  // Scalar properties — only if explicitly declared
  for (const key of SCALAR_KEYS) {
    if (ownKeys.has(key) && node[key] !== undefined) {
      paths.push(`${nodePath}.${key}`);
    }
  }

  // Sub-object properties — only if explicitly declared
  for (const key of SUB_OBJECT_KEYS) {
    if (!ownKeys.has(key)) continue;
    const value = node[key];
    if (value !== undefined && value !== null && typeof value === 'object') {
      collectLeafPaths(value as Record<string, unknown>, `${nodePath}.${key}`, paths);
    }
  }

  // Geometry fields — always emit (these define the node's rendering)
  for (const key of GEOMETRY_KEYS) {
    const value = node[key];
    if (value !== undefined && value !== null && typeof value === 'object') {
      collectLeafPaths(value as Record<string, unknown>, `${nodePath}.${key}`, paths);
    }
  }

  // Recurse into children
  for (const child of node.children) {
    walkNode(child, nodePath, paths);
  }
}

export function generateTrackPaths(roots: Node[]): string[] {
  const paths: string[] = [];
  for (const root of roots) {
    walkNode(root, null, paths);
  }
  return paths;
}
