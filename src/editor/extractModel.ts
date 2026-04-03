import type { Node } from 'prosemirror-model';

// ---------------------------------------------------------------------------
// Geometry parsing
// ---------------------------------------------------------------------------

/**
 * Convert dimension text to a geometry object.
 *
 * rect / image : "100x200"  → { w: 100, h: 200 }
 * ellipse      : "50x30"   → { rx: 50, ry: 30 }
 * text         : "hello"   → { content: 'hello' }
 */
export function parseGeometryText(
  keyword: string,
  text: string,
): Record<string, unknown> {
  if (keyword === 'rect' || keyword === 'image') {
    const [wStr, hStr] = text.split('x');
    return { w: Number(wStr), h: Number(hStr) };
  }
  if (keyword === 'ellipse') {
    const [rxStr, ryStr] = text.split('x');
    return { rx: Number(rxStr), ry: Number(ryStr) };
  }
  // text node or unknown — treat as content string
  return { content: text };
}

// ---------------------------------------------------------------------------
// Value parsing
// ---------------------------------------------------------------------------

/**
 * Convert a slot's text value to a typed JS value.
 *
 * "true" / "false" → boolean
 * Numeric strings  → number
 * Everything else  → string
 */
export function parseSlotValue(
  _schemaPath: string,
  text: string,
): boolean | number | string {
  if (text === 'true') return true;
  if (text === 'false') return false;
  const n = Number(text);
  if (text !== '' && !Number.isNaN(n)) return n;
  return text;
}

// ---------------------------------------------------------------------------
// Scene node extraction helpers
// ---------------------------------------------------------------------------

function extractSceneNode(node: Node): Record<string, unknown> {
  const { id } = node.attrs as { id: string; geometryType: string };
  const obj: Record<string, unknown> = { id };

  node.forEach((child) => {
    const type = child.type.name;

    if (type === 'geometry_slot') {
      const { keyword } = child.attrs as { keyword: string };
      obj[keyword] = parseGeometryText(keyword, child.textContent);
      return;
    }

    if (type === 'property_slot') {
      const { key, schemaPath } = child.attrs as { key: string; schemaPath: string };
      obj[key] = parseSlotValue(schemaPath, child.textContent);
      return;
    }

    if (type === 'compound_slot') {
      const { key } = child.attrs as { key: string };
      const compound: Record<string, unknown> = {};
      child.forEach((prop) => {
        if (prop.type.name === 'property_slot') {
          const { key: pk, schemaPath: psp } = prop.attrs as { key: string; schemaPath: string };
          compound[pk] = parseSlotValue(psp, prop.textContent);
        }
      });
      obj[key] = compound;
      return;
    }

    if (type === 'style_ref') {
      const { name } = child.attrs as { name: string };
      obj['style'] = name;
      return;
    }

    if (type === 'scene_node') {
      // nested child
      const children = (obj['children'] as Record<string, unknown>[] | undefined) ?? [];
      children.push(extractSceneNode(child));
      obj['children'] = children;
      return;
    }
  });

  return obj;
}

// ---------------------------------------------------------------------------
// Style block extraction
// ---------------------------------------------------------------------------

function extractStyleBlock(node: Node): Record<string, unknown> {
  const props: Record<string, unknown> = {};

  node.forEach((child) => {
    if (child.type.name === 'property_slot') {
      const { key, schemaPath } = child.attrs as { key: string; schemaPath: string };
      props[key] = parseSlotValue(schemaPath, child.textContent);
    } else if (child.type.name === 'compound_slot') {
      const { key } = child.attrs as { key: string };
      const compound: Record<string, unknown> = {};
      child.forEach((prop) => {
        if (prop.type.name === 'property_slot') {
          const { key: pk, schemaPath: psp } = prop.attrs as { key: string; schemaPath: string };
          compound[pk] = parseSlotValue(psp, prop.textContent);
        }
      });
      props[key] = compound;
    }
  });

  return props;
}

// ---------------------------------------------------------------------------
// Animate block extraction
// ---------------------------------------------------------------------------

function extractAnimateBlock(node: Node): Record<string, unknown> {
  const animate: Record<string, unknown> = {};
  const keyframes: Array<{ time: number; changes: Record<string, unknown> }> = [];

  node.forEach((child) => {
    const type = child.type.name;

    if (type === 'property_slot') {
      const { key, schemaPath } = child.attrs as { key: string; schemaPath: string };
      animate[key] = parseSlotValue(schemaPath, child.textContent);
      return;
    }

    if (type === 'keyframe_block') {
      const { time } = child.attrs as { time: number };
      const changes: Record<string, unknown> = {};
      child.forEach((entry) => {
        if (entry.type.name === 'keyframe_entry') {
          const { target, property, schemaPath } = entry.attrs as {
            target: string;
            property: string;
            schemaPath: string;
          };
          const changePath = `${target}.${property}`;
          changes[changePath] = parseSlotValue(schemaPath, entry.textContent);
        }
      });
      keyframes.push({ time, changes });
      return;
    }
  });

  if (keyframes.length > 0) {
    animate['keyframes'] = keyframes;
  }

  return animate;
}

// ---------------------------------------------------------------------------
// Images block extraction
// ---------------------------------------------------------------------------

function extractImagesBlock(node: Node): Record<string, string> {
  const images: Record<string, string> = {};

  node.forEach((child) => {
    if (child.type.name === 'image_entry') {
      const { key } = child.attrs as { key: string };
      images[key] = child.textContent;
    }
  });

  return images;
}

// ---------------------------------------------------------------------------
// Main extractModel function
// ---------------------------------------------------------------------------

/**
 * Walk a ProseMirror doc and produce the JSON model the renderer expects.
 * Pure function — no side effects.
 */
export function extractModel(doc: Node): Record<string, any> {
  const result: Record<string, any> = {};

  doc.forEach((node) => {
    const type = node.type.name;

    if (type === 'metadata') {
      const { key } = node.attrs as { key: string };
      result[key] = node.textContent;
      return;
    }

    if (type === 'scene_node') {
      if (!result['objects']) result['objects'] = [];
      (result['objects'] as Record<string, unknown>[]).push(extractSceneNode(node));
      return;
    }

    if (type === 'style_block') {
      const { name } = node.attrs as { name: string };
      if (!result['styles']) result['styles'] = {};
      result['styles'][name] = extractStyleBlock(node);
      return;
    }

    if (type === 'animate_block') {
      result['animate'] = extractAnimateBlock(node);
      return;
    }

    if (type === 'images_block') {
      result['images'] = extractImagesBlock(node);
      return;
    }
  });

  return result;
}
