import type { Node as PmNode } from 'prosemirror-model';

/**
 * Build a single-line DSL-like summary of a scene node's properties.
 * Used in inline display mode to show the node compactly.
 */
export function buildInlineSummary(node: PmNode): string {
  const parts: string[] = [];

  node.forEach((child) => {
    switch (child.type.name) {
      case 'geometry_slot': {
        const keyword = child.attrs.keyword as string;
        const text = child.textContent;
        parts.push(text ? `${keyword} ${text}` : keyword);
        break;
      }
      case 'property_slot': {
        const key = child.attrs.key as string;
        const val = child.textContent;
        if (!val) break;
        // Transform renders as "at X,Y"
        if (key === 'x' || key === 'y') break; // handled by compound_slot
        parts.push(KWARG_KEYS.has(key) ? `${key}=${val}` : `${key} ${val}`);
        break;
      }
      case 'compound_slot': {
        const key = child.attrs.key as string;
        if (key === 'transform') {
          parts.push(formatTransform(child));
        } else if (key === 'stroke') {
          parts.push(formatStroke(child));
        } else {
          parts.push(formatGenericCompound(key, child));
        }
        break;
      }
      case 'style_ref': {
        parts.push(`@${child.attrs.name}`);
        break;
      }
      // scene_node children are omitted from inline summary
    }
  });

  return parts.join(' ');
}

/** Keys that use = syntax in DSL (kwargs). */
const KWARG_KEYS = new Set([
  'radius', 'opacity', 'depth', 'size', 'lineHeight',
  'align', 'fit', 'padding', 'bend', 'gap', 'fromGap', 'toGap',
  'drawProgress', 'zoom', 'ratio', 'rotation', 'scale',
  'pathFollow', 'pathProgress',
]);

function getChildValue(node: PmNode, key: string): string {
  let val = '';
  node.forEach((child) => {
    if (child.type.name === 'property_slot' && child.attrs.key === key) {
      val = child.textContent;
    }
  });
  return val;
}

function formatTransform(node: PmNode): string {
  const x = getChildValue(node, 'x');
  const y = getChildValue(node, 'y');
  const parts: string[] = [];
  if (x || y) parts.push(`at ${x || '0'},${y || '0'}`);

  node.forEach((child) => {
    if (child.type.name === 'property_slot') {
      const k = child.attrs.key as string;
      if (k !== 'x' && k !== 'y') {
        parts.push(`${k}=${child.textContent}`);
      }
    }
  });

  return parts.join(' ');
}

function formatStroke(node: PmNode): string {
  const color = getChildValue(node, 'color');
  const parts: string[] = [`stroke ${color || 'black'}`];

  node.forEach((child) => {
    if (child.type.name === 'property_slot') {
      const k = child.attrs.key as string;
      if (k !== 'color') {
        parts.push(`${k}=${child.textContent}`);
      }
    }
  });

  return parts.join(' ');
}

function formatGenericCompound(key: string, node: PmNode): string {
  const subParts: string[] = [];
  node.forEach((child) => {
    if (child.type.name === 'property_slot') {
      subParts.push(`${child.attrs.key}=${child.textContent}`);
    }
  });
  return `${key} ${subParts.join(' ')}`;
}
