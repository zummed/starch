import type { Node } from '../types/node';
import type { HslColor, Stroke } from '../types/properties';
import { geometryToSvg, type SvgAttrs } from './geometry';

export interface RenderNode {
  id: string;
  groupTransform: string;
  opacity: number;
  geometry: SvgAttrs | null;
  textContent?: string;
  children: RenderNode[];
}

function composeOpacity(parentOpacity: number, nodeOpacity: number | undefined): number {
  const own = nodeOpacity ?? 1;
  return parentOpacity * own;
}

function buildTransform(node: Node): string {
  const t = node.transform;
  if (!t) return '';
  const parts: string[] = [];
  if (t.x !== undefined || t.y !== undefined) {
    parts.push(`translate(${t.x ?? 0}, ${t.y ?? 0})`);
  }
  if (t.rotation !== undefined && t.rotation !== 0) {
    parts.push(`rotate(${t.rotation})`);
  }
  if (t.scale !== undefined && t.scale !== 1) {
    parts.push(`scale(${t.scale})`);
  }
  return parts.join(' ');
}

function renderNode(
  node: Node,
  parentOpacity: number,
  parentFill?: HslColor,
  parentStroke?: Stroke,
): RenderNode | null {
  if (!node.visible) return null;

  const opacity = composeOpacity(parentOpacity, node.opacity);
  const fill = node.fill ?? parentFill;
  const stroke = node.stroke ?? parentStroke;
  const geometry = geometryToSvg(node, fill, stroke);
  const groupTransform = buildTransform(node);

  // Sort children by depth
  const sortedChildren = [...node.children].sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0));

  const renderedChildren: RenderNode[] = [];
  for (const child of sortedChildren) {
    const rendered = renderNode(child, opacity, fill, stroke);
    if (rendered) renderedChildren.push(rendered);
  }

  return {
    id: node.id,
    groupTransform,
    opacity,
    geometry,
    textContent: node.text?.content,
    children: renderedChildren,
  };
}

export function renderTree(roots: Node[]): RenderNode[] {
  const result: RenderNode[] = [];
  // Sort top-level by depth
  const sorted = [...roots].sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0));
  for (const root of sorted) {
    const rendered = renderNode(root, 1);
    if (rendered) result.push(rendered);
  }
  return result;
}
