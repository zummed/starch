import { VALID_TYPES } from '../core/schemas';

/**
 * Resolve a style reference, handling composition via the `style` property
 * within styles themselves. Returns a flat merged object.
 * Resolution order: base style → composed styles → object's own props.
 */
function resolveStyle(
  name: string,
  registry: Record<string, Record<string, unknown>>,
  seen = new Set<string>(),
): Record<string, unknown> {
  if (seen.has(name)) return {}; // circular reference protection
  seen.add(name);
  const style = registry[name];
  if (!style) return {};

  let base: Record<string, unknown> = {};

  // Compose: if the style itself has a style reference, resolve it first
  if (typeof style.style === 'string' && registry[style.style]) {
    base = resolveStyle(style.style, registry, seen);
  }

  // Merge style props on top of base (excluding the `style` key itself)
  const { style: _, ...rest } = style;
  return { ...base, ...rest };
}

/**
 * Apply a named style to an object. Style props become defaults —
 * the object's own props take priority.
 */
function applyStyle(
  obj: Record<string, unknown>,
  styleName: string,
  registry: Record<string, Record<string, unknown>>,
): void {
  const resolved = resolveStyle(styleName, registry);
  // Style props are defaults — object's own props override
  for (const [key, value] of Object.entries(resolved)) {
    if (obj[key] === undefined) {
      obj[key] = value;
    }
  }
  delete obj.style;
}

/**
 * Expand shorthand syntax into canonical form.
 * Runs after JSON5.parse(), before Zod validation.
 * Idempotent: canonical input passes through unchanged.
 */
export function expandShorthands(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;

  const obj = raw as Record<string, unknown>;

  // Extract image registry and resolve references in objects
  const imageRegistry = (obj.images && typeof obj.images === 'object')
    ? obj.images as Record<string, string>
    : {};
  delete obj.images;

  // Extract styles registry
  const stylesRegistry = (obj.styles && typeof obj.styles === 'object')
    ? obj.styles as Record<string, Record<string, unknown>>
    : {};
  delete obj.styles;

  // Expand objects array
  if (Array.isArray(obj.objects)) {
    obj.objects = obj.objects.map((item: unknown) => {
      const expanded = expandObject(item);
      if (expanded && typeof expanded === 'object' && !Array.isArray(expanded)) {
        const o = expanded as Record<string, unknown>;
        // Resolve style references
        if (typeof o.style === 'string' && stylesRegistry[o.style]) {
          applyStyle(o, o.style as string, stylesRegistry);
        }
        // Resolve image references
        if (typeof o.image === 'string' && imageRegistry[o.image]) {
          o.image = imageRegistry[o.image];
        }
      }
      return expanded;
    });
  }

  // Expand animate.keyframes
  if (obj.animate && typeof obj.animate === 'object') {
    const anim = obj.animate as Record<string, unknown>;
    if (anim.keyframes !== undefined) {
      anim.keyframes = expandKeyframes(anim.keyframes);

      // Resolve relative times and delays
      if (Array.isArray(anim.keyframes)) {
        let prevTime = 0;
        const expanded: Array<Record<string, unknown>> = [];
        for (const kf of anim.keyframes as Array<Record<string, unknown>>) {
          // "plus: 1.0" — relative to previous keyframe
          if (kf.plus !== undefined) {
            kf.time = prevTime + ((kf.plus as number) || 0);
            delete kf.plus;
          }
          // "+1.0" string — legacy relative time
          if (typeof kf.time === 'string' && kf.time.startsWith('+')) {
            kf.time = prevTime + parseFloat(kf.time.slice(1));
          }

          // "delay: 1.0" — insert a hold BEFORE this keyframe, pushing it later
          if (kf.delay !== undefined) {
            const resolvedTime = (kf.time as number) || prevTime;
            expanded.push({ time: resolvedTime, changes: {} });
            kf.time = resolvedTime + ((kf.delay as number) || 0);
            delete kf.delay;
          }

          prevTime = (kf.time as number) || 0;
          expanded.push(kf);
        }
        anim.keyframes = expanded;
      }
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

  // code → textblock alias with code-friendly defaults
  if (obj.type === 'code') {
    obj.type = 'textblock';
    if (obj.mono === undefined) obj.mono = true;
    if (obj.align === undefined) obj.align = 'start';
    if (obj.background === undefined) obj.background = '#141720';
    if (obj.size === undefined) obj.size = 13;
    if (obj.padding === undefined) obj.padding = 16;
  }

  // Spelling aliases: support both British and American spellings.
  // For types that use "colour" as the fill/stroke shortcut (box, circle, line, path),
  // accept "color" as an alias. For labels/textblocks, "color" is the text colour
  // and "colour" maps to "color".
  const type = obj.type as string;
  const usesColourShortcut = !type || type === 'box' || type === 'circle' || type === 'line' || type === 'path';
  if (usesColourShortcut) {
    if (obj.color !== undefined && obj.colour === undefined) {
      obj.colour = obj.color;
      delete obj.color;
    }
  } else {
    // label, textblock, table: "colour" → "color"
    if (obj.colour !== undefined && obj.color === undefined) {
      obj.color = obj.colour;
      delete obj.colour;
    }
  }
  // textColour/textColor
  if (obj.textColour !== undefined && obj.textColor === undefined) {
    obj.textColor = obj.textColour;
    delete obj.textColour;
  }
  // labelColour/labelColor
  if (obj.labelColour !== undefined && obj.labelColor === undefined) {
    obj.labelColor = obj.labelColour;
    delete obj.labelColour;
  }
  // headerColour/headerColor
  if (obj.headerColour !== undefined && obj.headerColor === undefined) {
    obj.headerColor = obj.headerColour;
    delete obj.headerColour;
  }

  // Normalize lines: mixed string/object array → strings + _lineDefaults
  if (Array.isArray(obj.lines)) {
    const lines: string[] = [];
    const lineDefaults: Record<number, Record<string, unknown>> = {};
    for (let i = 0; i < (obj.lines as unknown[]).length; i++) {
      const item = (obj.lines as unknown[])[i];
      if (typeof item === 'string') {
        lines.push(item);
      } else if (item && typeof item === 'object') {
        const { text, ...rest } = item as Record<string, unknown>;
        lines.push((text as string) ?? '');
        if (Object.keys(rest).length > 0) {
          lineDefaults[i] = rest;
        }
      }
    }
    obj.lines = lines;
    if (Object.keys(lineDefaults).length > 0) {
      obj._lineDefaults = lineDefaults;
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
