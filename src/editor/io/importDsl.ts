import type { Node as PmNode } from 'prosemirror-model';
import { starchSchema } from '../schema/starchSchema';
import { buildAstFromText } from '../../dsl/astParser';
import type { FormatHints } from '../../dsl/formatHints';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ImportResult {
  doc: PmNode;
  formatHints: FormatHints;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** These top-level model keys become metadata nodes in the ProseMirror doc. */
const METADATA_KEYS = new Set(['name', 'description', 'background', 'viewport']);

/**
 * Properties whose model values are always objects with sub-properties.
 * `fill` is handled separately (only compound when the value is an object).
 */
const COMPOUND_KEYS = new Set(['stroke', 'transform', 'dash', 'layout']);

// ---------------------------------------------------------------------------
// Geometry serialisation
// ---------------------------------------------------------------------------

/**
 * Convert a geometry object back into dimension text (used in geometry_slot).
 *
 * rect  : { w: 100, h: 200 }           → "100x200"
 * image : { src: "...", w: 100, h: 50 } → "100x50"  (src encoded separately)
 * ellipse: { rx: 50, ry: 30 }           → "50x30"
 * text  : { content: "hello" }          → "hello"
 */
function geometryText(keyword: string, geom: Record<string, any>): string {
  if (keyword === 'rect') return `${geom.w}x${geom.h}`;
  if (keyword === 'image') return `${geom.w}x${geom.h}`;
  if (keyword === 'ellipse') return `${geom.rx}x${geom.ry}`;
  // text node
  return String(geom.content ?? '');
}

// ---------------------------------------------------------------------------
// Value serialisation
// ---------------------------------------------------------------------------

/**
 * Serialise a scalar / compound value to a string for storage in a text node.
 *
 * Object values (hsl, rgb, hex+alpha, named+alpha, etc.) are serialised as
 * Scalar values just need to stringify correctly — compound values are
 * reconstructed via the compound_slot path.
 */
function valueToText(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  // Fallback for unexpected types
  return JSON.stringify(value);
}

// ---------------------------------------------------------------------------
// ProseMirror node builders
// ---------------------------------------------------------------------------

/**
 * Build a property_slot node.  Returns null when the value is empty so callers
 * can filter it out — ProseMirror does not allow empty text nodes.
 */
function makePropertySlot(key: string, value: any, schemaPath: string): PmNode {
  const text = valueToText(value);
  const content = text !== '' ? [starchSchema.text(text)] : [];
  return starchSchema.node('property_slot', { key, schemaPath }, content);
}

/**
 * Build a compound_slot node from an object value.
 * Each entry in the object becomes a property_slot child.
 */
function makeCompoundSlot(key: string, value: Record<string, any>, schemaPath: string): PmNode {
  const children: PmNode[] = [];
  for (const [subKey, subVal] of Object.entries(value)) {
    children.push(makePropertySlot(subKey, subVal, `${schemaPath}.${subKey}`));
  }
  // compound_slot requires property_slot+ — ensure at least one child
  if (children.length === 0) {
    children.push(makePropertySlot('_', '', `${schemaPath}._`));
  }
  return starchSchema.node('compound_slot', { key, schemaPath }, children);
}

/**
 * Decide whether to emit a compound_slot or a property_slot for the given
 * key/value pair, then return the resulting node.
 */
function makePropertyOrCompound(key: string, value: any, schemaPath: string): PmNode {
  const isCompound =
    COMPOUND_KEYS.has(key) ||
    (key === 'fill' && typeof value === 'object' && value !== null);

  if (isCompound && typeof value === 'object' && value !== null) {
    return makeCompoundSlot(key, value as Record<string, any>, schemaPath);
  }
  return makePropertySlot(key, value, schemaPath);
}

// ---------------------------------------------------------------------------
// Scene node builder
// ---------------------------------------------------------------------------

/**
 * Convert one object from the model into a scene_node ProseMirror node,
 * recursing into children.
 */
function buildSceneNode(
  obj: Record<string, any>,
  formatHints: FormatHints,
  parentSchemaPath: string,
): PmNode {
  const id: string = obj.id ?? '';
  const schemaPath = `${parentSchemaPath}.${id}`;
  const display: string = formatHints.nodes[id]?.display ?? 'inline';

  const children: PmNode[] = [];

  // --- Geometry slot --------------------------------------------------------
  const GEOM_KEYWORDS = ['rect', 'ellipse', 'text', 'image', 'camera', 'path'] as const;
  let geometryType = '';

  for (const keyword of GEOM_KEYWORDS) {
    if (obj[keyword] !== undefined) {
      geometryType = keyword;
      const geom = obj[keyword] as Record<string, any>;
      const dimText = geometryText(keyword, geom);

      children.push(
        starchSchema.node(
          'geometry_slot',
          { keyword, schemaPath: keyword },
          dimText !== '' ? [starchSchema.text(dimText)] : [],
        ),
      );

      // For image nodes, `src` lives inside the geometry object but needs to
      // be stored as a separate property_slot so extractModel can round-trip it
      if (keyword === 'image' && geom.src !== undefined) {
        children.push(makePropertySlot('src', geom.src, `${schemaPath}.src`));
      }

      // Carry any extra geometry sub-properties (radius, content extras, etc.)
      const GEOM_BASE_KEYS_BY_TYPE: Record<string, Set<string>> = {
        rect: new Set(['w', 'h']),
        ellipse: new Set(['rx', 'ry']),
        text: new Set(['content']),
        image: new Set(['src', 'w', 'h']),
        camera: new Set(),
        path: new Set(),
      };
      const baseKeys = GEOM_BASE_KEYS_BY_TYPE[keyword] ?? new Set();
      for (const [k, v] of Object.entries(geom)) {
        if (!baseKeys.has(k)) {
          children.push(makePropertySlot(k, v, `${schemaPath}.${k}`));
        }
      }

      break;
    }
  }

  // For camera/path nodes without a separate geometry object, geometryType
  // might remain ''. That's fine.

  // --- style_ref (@name) ----------------------------------------------------
  if (obj.style !== undefined) {
    children.push(starchSchema.node('style_ref', { name: String(obj.style) }));
  }

  // --- Regular properties ---------------------------------------------------
  const SKIP_KEYS = new Set([
    'id', 'style', 'children',
    ...GEOM_KEYWORDS,
  ]);

  for (const [key, value] of Object.entries(obj)) {
    if (SKIP_KEYS.has(key)) continue;
    children.push(makePropertyOrCompound(key, value, `${schemaPath}.${key}`));
  }

  // --- Nested children ------------------------------------------------------
  if (Array.isArray(obj.children)) {
    for (const child of obj.children as Record<string, any>[]) {
      children.push(buildSceneNode(child, formatHints, schemaPath));
    }
  }

  return starchSchema.node(
    'scene_node',
    { id, schemaPath, display, geometryType },
    children,
  );
}

// ---------------------------------------------------------------------------
// Style block builder
// ---------------------------------------------------------------------------

function buildStyleBlock(name: string, props: Record<string, any>): PmNode {
  const schemaPath = `styles.${name}`;
  const children: PmNode[] = [];

  for (const [key, value] of Object.entries(props)) {
    children.push(makePropertyOrCompound(key, value, `${schemaPath}.${key}`));
  }

  return starchSchema.node('style_block', { name, schemaPath }, children);
}

// ---------------------------------------------------------------------------
// Animate block builder
// ---------------------------------------------------------------------------

function buildAnimateBlock(animate: Record<string, any>): PmNode {
  const schemaPath = 'animate';
  const children: PmNode[] = [];

  // Top-level animate properties (duration, loop, easing, autoKey)
  const TOP_LEVEL_ANIMATE_KEYS = new Set(['duration', 'loop', 'easing', 'autoKey', 'keyframes', 'chapters']);
  for (const [key, value] of Object.entries(animate)) {
    if (TOP_LEVEL_ANIMATE_KEYS.has(key) && key !== 'keyframes' && key !== 'chapters') {
      children.push(makePropertySlot(key, value, `${schemaPath}.${key}`));
    }
  }

  // Keyframes
  if (Array.isArray(animate.keyframes)) {
    animate.keyframes.forEach((kf: any, idx: number) => {
      const kfSchemaPath = `${schemaPath}.keyframes.${idx}`;
      const entries: PmNode[] = [];

      if (kf.changes && typeof kf.changes === 'object') {
        for (const [changePath, changeValue] of Object.entries(kf.changes)) {
          // Split on last dot to get target + property
          const lastDot = changePath.lastIndexOf('.');
          const target = lastDot >= 0 ? changePath.slice(0, lastDot) : changePath;
          const property = lastDot >= 0 ? changePath.slice(lastDot + 1) : '';

          const valText = valueToText(changeValue);
          const entryContent = valText !== '' ? [starchSchema.text(valText)] : [];
          entries.push(
            starchSchema.node(
              'keyframe_entry',
              { target, property, schemaPath: `${kfSchemaPath}.changes` },
              entryContent,
            ),
          );
        }
      }

      children.push(
        starchSchema.node('keyframe_block', { time: kf.time ?? 0, easing: kf.easing ?? '', schemaPath: kfSchemaPath }, entries),
      );
    });
  }

  // Chapters
  if (Array.isArray(animate.chapters)) {
    for (const chapter of animate.chapters) {
      const chapterText = valueToText(chapter.name ?? '');
      const chapterContent = chapterText !== '' ? [starchSchema.text(chapterText)] : [];
      children.push(
        starchSchema.node('chapter', { schemaPath: `${schemaPath}.chapters` }, chapterContent),
      );
    }
  }

  return starchSchema.node('animate_block', { schemaPath }, children);
}

// ---------------------------------------------------------------------------
// Images block builder
// ---------------------------------------------------------------------------

function buildImagesBlock(images: Record<string, string>): PmNode {
  const schemaPath = 'images';
  const entries: PmNode[] = [];

  for (const [key, url] of Object.entries(images)) {
    const urlText = String(url);
    const content = urlText !== '' ? [starchSchema.text(urlText)] : [];
    entries.push(starchSchema.node('image_entry', { key, schemaPath: `${schemaPath}.${key}` }, content));
  }

  return starchSchema.node('images_block', { schemaPath }, entries);
}

// ---------------------------------------------------------------------------
// Main model → doc conversion
// ---------------------------------------------------------------------------

function modelToDoc(model: Record<string, any>, formatHints: FormatHints): PmNode {
  const topLevelNodes: PmNode[] = [];

  // 1. Metadata (name, description, background, viewport)
  for (const key of METADATA_KEYS) {
    const value = model[key];
    if (value === undefined) continue;

    let text: string;
    if (typeof value === 'object' && value !== null) {
      // viewport: { width, height } → "600x400"
      if ('width' in value && 'height' in value) {
        text = `${value.width}x${value.height}`;
      } else {
        text = JSON.stringify(value);
      }
    } else {
      text = String(value);
    }

    const content = text !== '' ? [starchSchema.text(text)] : [];
    topLevelNodes.push(starchSchema.node('metadata', { key, schemaPath: key }, content));
  }

  // 2. Images block
  if (model.images && typeof model.images === 'object') {
    topLevelNodes.push(buildImagesBlock(model.images));
  }

  // 3. Style blocks
  if (model.styles && typeof model.styles === 'object') {
    for (const [name, props] of Object.entries(model.styles as Record<string, any>)) {
      topLevelNodes.push(buildStyleBlock(name, props));
    }
  }

  // 4. Scene objects
  if (Array.isArray(model.objects)) {
    for (const obj of model.objects as Record<string, any>[]) {
      topLevelNodes.push(buildSceneNode(obj, formatHints, 'objects'));
    }
  }

  // 5. Animate block
  if (model.animate && typeof model.animate === 'object') {
    topLevelNodes.push(buildAnimateBlock(model.animate));
  }

  return starchSchema.node('doc', null, topLevelNodes);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function importDsl(text: string): ImportResult {
  const { model, formatHints } = buildAstFromText(text);
  const doc = modelToDoc(model, formatHints);
  return { doc, formatHints };
}
