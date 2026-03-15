import type {
  SceneObject,
  AnimConfig,
  ObjectType,
  Chapter,
} from '../core/types';

export interface ParseResult {
  objects: Record<string, SceneObject>;
  animConfig: AnimConfig;
}

function parseValue(val: string): number | boolean | string {
  val = val.trim();
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(val)) return parseFloat(val);
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  )
    return val.slice(1, -1);
  return val;
}

const VALID_TYPES = new Set<string>([
  'box', 'circle', 'text', 'table', 'line', 'path', 'group',
]);

export function parseDSL(src: string): ParseResult {
  const objects: Record<string, SceneObject> = {};
  const animConfig: AnimConfig = {
    duration: 5,
    loop: true,
    keyframes: [],
    chapters: [],
  };
  const lines = src.split('\n');
  let i = 0;

  const skipWhitespace = () => {
    while (
      i < lines.length &&
      (!lines[i].trim() || lines[i].trim().startsWith('#'))
    )
      i++;
  };

  while (i < lines.length) {
    skipWhitespace();
    if (i >= lines.length) break;
    const line = lines[i].trim();

    // ── @animate block ──────────────────────────
    if (line.startsWith('@animate')) {
      const durMatch = line.match(/duration:\s*(\d+(?:\.\d+)?)s/);
      const loopMatch = line.match(/loop:\s*(true|false)/);
      if (durMatch) animConfig.duration = parseFloat(durMatch[1]);
      if (loopMatch) animConfig.loop = loopMatch[1] === 'true';

      if (line.includes('{')) {
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('}')) {
          const kfLine = lines[i].trim();
          if (kfLine && !kfLine.startsWith('#')) {
            // Chapter directive: @chapter 2.0s "Title" "Description"
            const chapterMatch = kfLine.match(
              /^@chapter\s+(\d+(?:\.\d+)?)s\s+"([^"]+)"(?:\s+"([^"]+)")?/,
            );
            if (chapterMatch) {
              const time = parseFloat(chapterMatch[1]);
              const title = chapterMatch[2];
              const description = chapterMatch[3];
              animConfig.chapters.push({
                id: title.toLowerCase().replace(/\s+/g, '-'),
                time,
                title,
                description,
              });
              i++;
              continue;
            }

            // Keyframe: 0.5s: obj.prop = value ease:easing
            const timeMatch = kfLine.match(/^(\d+(?:\.\d+)?)s:\s*(.+)/);
            if (timeMatch) {
              const t = parseFloat(timeMatch[1]);
              const assignments = timeMatch[2].split(',');
              for (const assign of assignments) {
                const am = assign.trim().match(/(\w+)\.(\w+)\s*=\s*(.+)/);
                if (am) {
                  let rawVal = am[3].trim();
                  let easing = 'linear';
                  const easeMatch = rawVal.match(/\s+ease:(\w+)\s*$/);
                  if (easeMatch) {
                    easing = easeMatch[1];
                    rawVal = rawVal.slice(0, easeMatch.index).trim();
                  }
                  animConfig.keyframes.push({
                    time: t,
                    target: am[1],
                    prop: am[2],
                    value: parseValue(rawVal),
                    easing: easing as AnimConfig['keyframes'][0]['easing'],
                  });
                }
              }
            }
          }
          i++;
        }
      }
      i++;
      continue;
    }

    // ── Object block: type id { ... } ───────────
    const blockMatch = line.match(/^(\w+)\s+(\w+)\s*\{/);
    if (blockMatch) {
      const type = blockMatch[1];
      const id = blockMatch[2];

      if (!VALID_TYPES.has(type)) {
        i++;
        continue;
      }

      const props: Record<string, unknown> = {};

      // Collect body
      let body: string;
      const afterBrace = line.slice(line.indexOf('{') + 1);
      if (afterBrace.includes('}')) {
        body = afterBrace.slice(0, afterBrace.indexOf('}')).trim();
        i++;
      } else {
        const bodyLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('}')) {
          bodyLines.push(lines[i].trim());
          i++;
        }
        body = bodyLines.join('\n');
        i++; // skip }
      }

      // Parse properties
      const propEntries: string[] = [];
      if (body.includes('\n')) {
        for (const pl of body.split('\n')) {
          const trimmed = pl.trim();
          if (trimmed && !trimmed.startsWith('#')) propEntries.push(trimmed);
        }
      } else {
        const keyPattern = /(\w+)\s*:/g;
        const keys: Array<{ key: string; matchStart: number; valueStart: number }> = [];
        let m: RegExpExecArray | null;
        while ((m = keyPattern.exec(body)) !== null) {
          keys.push({
            key: m[1],
            matchStart: m.index,
            valueStart: m.index + m[0].length,
          });
        }
        for (let k = 0; k < keys.length; k++) {
          const valueEnd = k + 1 < keys.length ? keys[k + 1].matchStart : body.length;
          const rawVal = body.slice(keys[k].valueStart, valueEnd).trim();
          propEntries.push(`${keys[k].key}: ${rawVal}`);
        }
      }

      for (const propLine of propEntries) {
        const colonIdx = propLine.indexOf(':');
        if (colonIdx > 0) {
          const key = propLine.slice(0, colonIdx).trim();
          const rawVal = propLine.slice(colonIdx + 1).trim();

          if (key === 'pos') {
            const parts = rawVal.split(/\s+/).map(Number);
            props.x = parts[0];
            props.y = parts[1];
          } else if (key === 'size') {
            const parts = rawVal.split(/\s+/).map(Number);
            props.w = parts[0];
            props.h = parts[1];
          } else if (key === 'cols') {
            props.cols = rawVal.split('|').map((s) => s.trim());
          } else if (key === 'row') {
            if (!props.rows) props.rows = [];
            (props.rows as string[][]).push(rawVal.split('|').map((s) => s.trim()));
          } else if (key === 'children') {
            props.children = rawVal.split(/\s+/).filter(Boolean);
          } else if (key === 'points') {
            // Parse "100,100 200,150 300,100"
            props.points = rawVal.split(/\s+/).map((p) => {
              const [x, y] = p.split(',').map(Number);
              return { x, y };
            });
          } else if (key === 'fromAnchor' || key === 'toAnchor') {
            // Check if it's a float anchor like "0.5,0.25"
            if (rawVal.includes(',')) {
              const [x, y] = rawVal.split(',').map(Number);
              props[key] = { x, y };
            } else {
              props[key] = rawVal;
            }
          } else {
            props[key] = parseValue(rawVal);
          }
        }
      }

      objects[id] = { type: type as ObjectType, id, props: props as never };
      continue;
    }

    i++;
  }

  return { objects, animConfig };
}
