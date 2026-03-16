import { VALID_TYPES } from '../core/schemas';

/**
 * Expand shorthand syntax into canonical form.
 * Runs after JSON5.parse(), before Zod validation.
 * Idempotent: canonical input passes through unchanged.
 */
export function expandShorthands(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;

  const obj = raw as Record<string, unknown>;

  // Expand objects array
  if (Array.isArray(obj.objects)) {
    obj.objects = obj.objects.map((item: unknown) => expandObject(item));
  }

  // Expand animate.keyframes
  if (obj.animate && typeof obj.animate === 'object') {
    const anim = obj.animate as Record<string, unknown>;
    if (anim.keyframes !== undefined) {
      anim.keyframes = expandKeyframes(anim.keyframes);
    }
  }

  return obj;
}

/**
 * Expand a single object definition and recurse into children.
 */
function expandObject(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;

  const obj = { ...(raw as Record<string, unknown>) };

  // Type-as-key shorthand: { box: "myId", ... } → { type: "box", id: "myId", ... }
  if (!obj.type) {
    for (const key of Object.keys(obj)) {
      if (VALID_TYPES.has(key) && typeof obj[key] === 'string') {
        obj.type = key;
        obj.id = obj[key];
        delete obj[key];
        break;
      }
    }
  } else {
    // Check for conflicting type-as-key
    for (const key of Object.keys(obj)) {
      if (key !== 'type' && VALID_TYPES.has(key) && typeof obj[key] === 'string' && key !== 'label') {
        throw new Error(
          `Ambiguous object: has both "type: ${obj.type}" and "${key}: ${obj[key]}". Use one or the other.`,
        );
      }
    }
  }

  // at: [x, y] shorthand
  if (Array.isArray(obj.at)) {
    const [x, y] = obj.at as number[];
    if (obj.x !== undefined || obj.y !== undefined) {
      throw new Error(`Cannot use "at" shorthand alongside "x" or "y" properties.`);
    }
    obj.x = x;
    obj.y = y;
    delete obj.at;
  }

  // size: [w, h] shorthand
  if (Array.isArray(obj.size)) {
    const [w, h] = obj.size as number[];
    if (obj.w !== undefined || obj.h !== undefined) {
      throw new Error(`Cannot use "size" shorthand alongside "w" or "h" properties.`);
    }
    obj.w = w;
    obj.h = h;
    delete obj.size;
  }

  // Recurse into children
  if (Array.isArray(obj.children)) {
    obj.children = (obj.children as unknown[]).map((child) =>
      typeof child === 'object' && child !== null ? expandObject(child) : child,
    );
  }

  return obj;
}

/**
 * Expand keyframes from shorthand formats to canonical keyframe-block form.
 *
 * Canonical: [{ time, changes: { targetId: { prop: value, easing? } }, easing? }]
 * Format A (flat tuples): [[time, target, prop, value, easing?]]
 * Format B (target-grouped): { targetId: [[time, prop, value, easing?]] }
 * Legacy canonical: [{ time, target, prop, value, easing? }]
 */
function expandKeyframes(keyframes: unknown): unknown[] {
  // Collect all entries as { time, target, prop, value, easing? }
  const entries: Array<{ time: number; target: string; prop: string; value: unknown; easing?: string }> = [];

  // Format B: target-grouped object
  if (keyframes && typeof keyframes === 'object' && !Array.isArray(keyframes)) {
    for (const [targetId, tuples] of Object.entries(keyframes as Record<string, unknown>)) {
      if (!Array.isArray(tuples)) {
        throw new Error(`Keyframes for target "${targetId}" must be an array.`);
      }
      for (const tuple of tuples) {
        if (!Array.isArray(tuple)) {
          throw new Error(`Each keyframe for target "${targetId}" must be a tuple array.`);
        }
        const [time, prop, value, easing] = tuple as [number, string, unknown, string?];
        entries.push({ time, target: targetId, prop, value, ...(easing !== undefined ? { easing } : {}) });
      }
    }
  } else if (Array.isArray(keyframes) && keyframes.length > 0) {
    const first = keyframes[0];

    if (Array.isArray(first)) {
      // Format A: flat tuples
      for (const tuple of keyframes as unknown[][]) {
        const [time, target, prop, value, easing] = tuple as [number, string, string, unknown, string?];
        entries.push({ time, target, prop, value, ...(easing !== undefined ? { easing } : {}) });
      }
    } else if (first && typeof first === 'object') {
      const f = first as Record<string, unknown>;
      if ('changes' in f) {
        // Already canonical keyframe-block format, pass through
        return keyframes;
      }
      if ('target' in f && 'prop' in f) {
        // Legacy canonical: { time, target, prop, value, easing? }
        for (const kf of keyframes as Array<Record<string, unknown>>) {
          entries.push({
            time: kf.time as number,
            target: kf.target as string,
            prop: kf.prop as string,
            value: kf.value,
            ...(kf.easing !== undefined ? { easing: kf.easing as string } : {}),
          });
        }
      } else {
        // Unknown object format, pass through
        return keyframes;
      }
    }
  } else {
    return [];
  }

  // Group entries by time into keyframe blocks
  const blockMap = new Map<number, Record<string, Record<string, unknown>>>();
  for (const entry of entries) {
    if (!blockMap.has(entry.time)) {
      blockMap.set(entry.time, {});
    }
    const changes = blockMap.get(entry.time)!;
    if (!changes[entry.target]) {
      changes[entry.target] = {};
    }
    changes[entry.target][entry.prop] = entry.value;
    if (entry.easing) {
      changes[entry.target].easing = entry.easing;
    }
  }

  // Convert to sorted keyframe blocks
  const times = [...blockMap.keys()].sort((a, b) => a - b);
  return times.map((time) => ({
    time,
    changes: blockMap.get(time)!,
  }));
}
