import JSON5 from 'json5';
import type {
  SceneObject,
  AnimConfig,
  ObjectType,
  EasingName,
} from '../core/types';
import { parseShape, VALID_TYPES } from '../core/schemas';
import { expandShorthands } from './shorthands';

export interface ParseResult {
  objects: Record<string, SceneObject>;
  animConfig: AnimConfig;
}

interface RawObject {
  type: string;
  id: string;
  [key: string]: unknown;
}

interface RawKeyframeBlock {
  time: number;
  easing?: string;
  changes?: Record<string, Record<string, unknown>>;
  // Also allow flat format for convenience: any other keys are treated as target IDs
  [key: string]: unknown;
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
    easing?: string;
    keyframes?: RawKeyframeBlock[];
    chapters?: RawChapter[];
  };
}

let _definitionCounter = 0;

function parseObject(
  raw: RawObject,
  objects: Record<string, SceneObject>,
): void {
  const { type, id, ...rest } = raw;

  if (!type || !id) {
    throw new Error(`Object missing required "type" or "id" field`);
  }
  if (!VALID_TYPES.has(type)) {
    throw new Error(`Unknown object type: "${type}". Valid types: ${[...VALID_TYPES].join(', ')}`);
  }
  if (objects[id]) {
    throw new Error(`Duplicate object ID: "${id}"`);
  }

  const inputKeys = new Set(Object.keys(rest));
  const parsed = parseShape(type as ObjectType, rest);

  objects[id] = {
    type: type as ObjectType,
    id,
    props: parsed as never,
    _inputKeys: inputKeys,
    _definitionOrder: _definitionCounter++,
  };
}

function parseKeyframeBlock(raw: RawKeyframeBlock): { time: number; easing?: EasingName; changes: Record<string, Record<string, unknown>> } {
  const { time, easing, changes: rawChanges, ...rest } = raw;

  // If `changes` is provided, use it directly
  // Otherwise, remaining keys are target IDs (flat format)
  const changes: Record<string, Record<string, unknown>> = {};

  if (rawChanges && typeof rawChanges === 'object') {
    for (const [targetId, props] of Object.entries(rawChanges)) {
      changes[targetId] = props;
    }
  }

  // Flat format: any key that isn't time/easing/changes is a target ID
  for (const [key, value] of Object.entries(rest)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      changes[key] = value as Record<string, unknown>;
    }
  }

  return {
    time,
    easing: easing as EasingName | undefined,
    changes,
  };
}

/**
 * Shared helper to build AnimConfig from raw animate block.
 * Used by both parseDSL and parseJSON to avoid duplication.
 */
function buildAnimConfigFromRaw(rawAnimate?: RawDiagram['animate']): AnimConfig {
  const animConfig: AnimConfig = {
    duration: rawAnimate?.duration ?? 5,
    loop: rawAnimate?.loop ?? true,
    easing: (rawAnimate?.easing as EasingName) || undefined,
    keyframes: [],
    chapters: [],
  };

  if (rawAnimate?.keyframes) {
    for (const kf of rawAnimate.keyframes) {
      const parsed = parseKeyframeBlock(kf);
      animConfig.keyframes.push({
        time: parsed.time,
        easing: parsed.easing,
        changes: parsed.changes as Record<string, { easing?: EasingName; [k: string]: unknown }>,
      });
    }
  }

  if (rawAnimate?.chapters) {
    for (const ch of rawAnimate.chapters) {
      animConfig.chapters.push({
        id: ch.id || ch.title.toLowerCase().replace(/\s+/g, '-'),
        time: ch.time,
        title: ch.title,
        description: ch.description,
      });
    }
  }

  return animConfig;
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

  _definitionCounter = 0;
  const objects: Record<string, SceneObject> = {};

  if (raw.objects && Array.isArray(raw.objects)) {
    for (const rawObj of raw.objects) {
      parseObject(rawObj, objects);
    }
  }

  const animConfig = buildAnimConfigFromRaw(raw.animate);

  return { objects, animConfig };
}

/**
 * Parse a pre-built object (not a string) into a ParseResult.
 */
export function parseJSON(input: RawDiagram): ParseResult {
  const raw = expandShorthands(input) as RawDiagram;
  _definitionCounter = 0;
  const objects: Record<string, SceneObject> = {};

  if (raw.objects && Array.isArray(raw.objects)) {
    for (const rawObj of raw.objects) {
      parseObject(rawObj, objects);
    }
  }

  const animConfig = buildAnimConfigFromRaw(raw.animate);

  return { objects, animConfig };
}
