import JSON5 from 'json5';
import type {
  SceneObject,
  AnimConfig,
  ObjectType,
  EasingName,
} from '../core/types';
import { parseShape, VALID_TYPES } from '../core/schemas';
import { expandShorthands } from './shorthands';

export interface Viewport {
  width: number;
  height: number;
}

export interface ParseResult {
  name?: string;
  description?: string;
  background?: string;
  viewport?: Viewport;
  objects: Record<string, SceneObject>;
  animConfig: AnimConfig;
  styles: Record<string, Record<string, unknown>>;
}

interface RawObject {
  type: string;
  id: string;
  [key: string]: unknown;
}

interface RawKeyframeBlock {
  time: number;
  easing?: string;
  autoKey?: boolean;
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
  name?: string;
  description?: string;
  background?: string;
  viewport?: unknown;
  styles?: Record<string, Record<string, unknown>>;
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

function parseKeyframeBlock(raw: RawKeyframeBlock): { time: number; easing?: EasingName; autoKey?: boolean; changes: Record<string, Record<string, unknown>> } {
  const { time, easing, autoKey, changes: rawChanges, ...rest } = raw;

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
    ...(autoKey !== undefined && { autoKey }),
    changes,
  };
}

/**
 * Shared helper to build AnimConfig from raw animate block.
 * Used by both parseDSL and parseJSON to avoid duplication.
 */

const RATIO_PRESETS: Record<string, [number, number]> = {
  '16:9': [800, 450],
  '4:3': [800, 600],
  '1:1': [600, 600],
  '21:9': [840, 360],
};

function parseViewport(raw: unknown): Viewport | undefined {
  if (!raw) return undefined;
  if (typeof raw === 'string') {
    const preset = RATIO_PRESETS[raw];
    if (preset) return { width: preset[0], height: preset[1] };
    // Try "W:H" ratio format (any numbers, not just presets)
    const ratioMatch = (raw as string).match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
    if (ratioMatch) {
      const rw = parseFloat(ratioMatch[1]);
      const rh = parseFloat(ratioMatch[2]);
      // Scale so the larger dimension is ~800
      const scale = 800 / Math.max(rw, rh);
      return { width: Math.round(rw * scale), height: Math.round(rh * scale) };
    }
    // Try "WxH" format
    const match = (raw as string).match(/^(\d+)\s*[x×]\s*(\d+)$/);
    if (match) return { width: parseInt(match[1]), height: parseInt(match[2]) };
    return undefined;
  }
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    const w = obj.width as number;
    const h = obj.height as number;
    if (w && h) return { width: w, height: h };
    // Support ratio property: { ratio: "16:9" } or { ratio: 1.78 }
    if (obj.ratio) {
      if (typeof obj.ratio === 'string' && RATIO_PRESETS[obj.ratio]) {
        const [pw, ph] = RATIO_PRESETS[obj.ratio];
        return { width: pw, height: ph };
      }
      if (typeof obj.ratio === 'number') {
        return { width: Math.round(500 * (obj.ratio as number)), height: 500 };
      }
    }
  }
  return undefined;
}

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
        ...(parsed.autoKey !== undefined && { autoKey: parsed.autoKey }),
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

  return {
    name: raw.name as string | undefined,
    description: raw.description as string | undefined,
    background: raw.background as string | undefined,
    viewport: parseViewport(raw.viewport),
    objects,
    animConfig,
    styles: (raw.styles as Record<string, Record<string, unknown>>) ?? {},
  };
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

  return {
    name: raw.name as string | undefined,
    description: raw.description as string | undefined,
    background: raw.background as string | undefined,
    viewport: parseViewport(raw.viewport),
    objects,
    animConfig,
    styles: (raw.styles as Record<string, Record<string, unknown>>) ?? {},
  };
}
