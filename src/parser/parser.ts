import JSON5 from 'json5';
import type {
  SceneObject,
  AnimConfig,
  ObjectType,
  EasingName,
} from '../core/types';
import { parseShape, VALID_TYPES } from '../core/schemas';
import { applyGroupLayouts } from '../engine/layout';
import { expandShorthands } from './shorthands';

export interface ParseResult {
  objects: Record<string, SceneObject>;
  animConfig: AnimConfig;
}

interface RawObject {
  type: string;
  id: string;
  children?: RawObject[];
  [key: string]: unknown;
}

interface RawKeyframe {
  time: number;
  target: string;
  prop: string;
  value: number | string | boolean;
  easing?: string;
}

interface RawChapter {
  time: number;
  id?: string;
  title: string;
  description?: string;
}

interface RawDiagram {
  objects?: RawObject[];
  animate?: {
    duration?: number;
    loop?: boolean;
    keyframes?: RawKeyframe[];
    chapters?: RawChapter[];
  };
}

/**
 * Recursively parse an object and its children, flattening into
 * the objects record. Returns the list of child IDs for the parent.
 */
function parseObject(
  raw: RawObject,
  objects: Record<string, SceneObject>,
  parentId?: string,
): void {
  const { type, id, children: rawChildren, ...rest } = raw;

  if (!type || !id) {
    throw new Error(`Object missing required "type" or "id" field`);
  }
  if (!VALID_TYPES.has(type)) {
    throw new Error(`Unknown object type: "${type}". Valid types: ${[...VALID_TYPES].join(', ')}`);
  }
  if (objects[id]) {
    throw new Error(`Duplicate object ID: "${id}"`);
  }

  // Collect inline child IDs — children can be string IDs or inline objects
  const childIds: string[] = [];
  if (rawChildren && Array.isArray(rawChildren)) {
    for (const child of rawChildren) {
      if (typeof child === 'string') {
        // String ID reference to an existing object
        childIds.push(child);
      } else if (child && typeof child === 'object' && child.id) {
        // Inline nested object
        childIds.push(child.id);
        parseObject(child as RawObject, objects, id);
      }
    }
  }

  // Build props — if there are children, add them to props
  const props: Record<string, unknown> = { ...rest };
  if (childIds.length > 0) {
    props.children = childIds;
    // Default to column layout if direction not specified for non-group types
    if (type !== 'group' && !props.direction) {
      props.direction = 'column';
    }
  }

  // Track which keys the user explicitly provided (before Zod adds defaults)
  const inputKeys = new Set(Object.keys(props));

  // Run through Zod schema for defaults + colour resolution
  const parsed = parseShape(type as ObjectType, props);

  const obj: SceneObject = {
    type: type as ObjectType,
    id,
    props: parsed as never,
    _inputKeys: inputKeys,
  };

  if (parentId) {
    obj.groupId = parentId;
  }

  objects[id] = obj;
}

/**
 * Parse a JSON5 diagram string (or pre-parsed object) into a ParseResult.
 */
export function parseDSL(src: string): ParseResult {
  let raw: RawDiagram;

  try {
    raw = expandShorthands(JSON5.parse(src)) as RawDiagram;
  } catch (e) {
    throw new Error(`JSON5 parse error: ${(e as Error).message}`);
  }

  const objects: Record<string, SceneObject> = {};

  // Parse objects
  if (raw.objects && Array.isArray(raw.objects)) {
    for (const rawObj of raw.objects) {
      parseObject(rawObj, objects);
    }
  }

  // Parse animation config
  const animConfig: AnimConfig = {
    duration: raw.animate?.duration ?? 5,
    loop: raw.animate?.loop ?? true,
    keyframes: [],
    chapters: [],
  };

  if (raw.animate?.keyframes) {
    for (const kf of raw.animate.keyframes) {
      animConfig.keyframes.push({
        time: kf.time,
        target: kf.target,
        prop: kf.prop,
        value: kf.value,
        easing: (kf.easing || 'linear') as EasingName,
      });
    }
  }

  if (raw.animate?.chapters) {
    for (const ch of raw.animate.chapters) {
      animConfig.chapters.push({
        id: ch.id || ch.title.toLowerCase().replace(/\s+/g, '-'),
        time: ch.time,
        title: ch.title,
        description: ch.description,
      });
    }
  }

  // Apply flexbox-like group layouts
  applyGroupLayouts(objects);

  return { objects, animConfig };
}

/**
 * Parse a pre-built object (not a string) into a ParseResult.
 */
export function parseJSON(input: RawDiagram): ParseResult {
  const raw = expandShorthands(input) as RawDiagram;
  const objects: Record<string, SceneObject> = {};

  if (raw.objects && Array.isArray(raw.objects)) {
    for (const rawObj of raw.objects) {
      parseObject(rawObj, objects);
    }
  }

  const animConfig: AnimConfig = {
    duration: raw.animate?.duration ?? 5,
    loop: raw.animate?.loop ?? true,
    keyframes: [],
    chapters: [],
  };

  if (raw.animate?.keyframes) {
    for (const kf of raw.animate.keyframes) {
      animConfig.keyframes.push({
        time: kf.time,
        target: kf.target,
        prop: kf.prop,
        value: kf.value,
        easing: (kf.easing || 'linear') as EasingName,
      });
    }
  }

  if (raw.animate?.chapters) {
    for (const ch of raw.animate.chapters) {
      animConfig.chapters.push({
        id: ch.id || ch.title.toLowerCase().replace(/\s+/g, '-'),
        time: ch.time,
        title: ch.title,
        description: ch.description,
      });
    }
  }

  applyGroupLayouts(objects);
  return { objects, animConfig };
}
