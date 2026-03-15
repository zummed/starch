import type {
  SceneObject,
  AnimConfig,
  ObjectType,
  Chapter,
} from '../core/types';
import type { StateMachineState, StateMachineTransition, StateMachineProps } from '../core/composites';
import { expandStateMachine } from '../core/composites';

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

function parseStateMachineBody(bodyLines: string[]): StateMachineProps {
  const props: Partial<StateMachineProps> = {
    x: 0,
    y: 0,
    states: {},
    transitions: [],
  };

  for (let j = 0; j < bodyLines.length; j++) {
    const bl = bodyLines[j].trim();
    if (!bl || bl.startsWith('#')) continue;

    // ── state name { ... } ──────────────────
    const stateMatch = bl.match(/^state\s+(\w+)\s*\{(.*)$/);
    if (stateMatch) {
      const name = stateMatch[1];
      let stateBody = stateMatch[2];
      if (!stateBody.includes('}')) {
        // Multi-line state block
        j++;
        const parts: string[] = [stateBody];
        while (j < bodyLines.length && !bodyLines[j].trim().startsWith('}')) {
          parts.push(bodyLines[j].trim());
          j++;
        }
        stateBody = parts.join('; ');
      } else {
        stateBody = stateBody.slice(0, stateBody.indexOf('}')).trim();
      }
      const state: StateMachineState = { label: name };
      for (const seg of stateBody.split(';')) {
        const colonIdx = seg.indexOf(':');
        if (colonIdx < 0) continue;
        const key = seg.slice(0, colonIdx).trim();
        const val = seg.slice(colonIdx + 1).trim();
        if (key === 'label') state.label = parseValue(val) as string;
        else if (key === 'fill') state.fill = val;
        else if (key === 'stroke') state.stroke = val;
        else if (key === 'textColor') state.textColor = val;
        else if (key === 'textSize') state.textSize = parseFloat(val);
        else if (key === 'radius') state.radius = parseFloat(val);
      }
      props.states![name] = state;
      continue;
    }

    // ── transition from -> to { ... } ───────
    const transMatch = bl.match(/^transition\s+(\w+)\s*->\s*(\w+)\s*(?:\{(.*))?$/);
    if (transMatch) {
      const from = transMatch[1];
      const to = transMatch[2];
      let transBody = transMatch[3] ?? '';
      if (transBody && !transBody.includes('}')) {
        j++;
        const parts: string[] = [transBody];
        while (j < bodyLines.length && !bodyLines[j].trim().startsWith('}')) {
          parts.push(bodyLines[j].trim());
          j++;
        }
        transBody = parts.join('; ');
      } else if (transBody) {
        transBody = transBody.slice(0, transBody.indexOf('}')).trim();
      }
      const t: StateMachineTransition = { from, to };
      for (const seg of transBody.split(';')) {
        const colonIdx = seg.indexOf(':');
        if (colonIdx < 0) continue;
        const key = seg.slice(0, colonIdx).trim();
        const val = seg.slice(colonIdx + 1).trim();
        if (key === 'label') t.label = parseValue(val) as string;
        else if (key === 'stroke') t.stroke = val;
        else if (key === 'strokeWidth') t.strokeWidth = parseFloat(val);
        else if (key === 'dashed') t.dashed = val === 'true';
      }
      props.transitions!.push(t);
      continue;
    }

    // ── Top-level properties ────────────────
    const colonIdx = bl.indexOf(':');
    if (colonIdx > 0) {
      const key = bl.slice(0, colonIdx).trim();
      const val = bl.slice(colonIdx + 1).trim();

      if (key === 'x') props.x = parseFloat(val);
      else if (key === 'y') props.y = parseFloat(val);
      else if (key === 'pos') {
        const parts = val.split(/\s+/).map(Number);
        props.x = parts[0];
        props.y = parts[1];
      }
      else if (key === 'direction') props.direction = val as 'horizontal' | 'vertical';
      else if (key === 'spacing') props.spacing = parseFloat(val);
      else if (key === 'initialState') props.initialState = val;
      else if (key === 'finalStates') props.finalStates = val.split(/\s+/).filter(Boolean);
      else if (key === 'stateFill') props.stateFill = val;
      else if (key === 'stateStroke') props.stateStroke = val;
      else if (key === 'stateTextColor') props.stateTextColor = val;
      else if (key === 'stateWidth') props.stateWidth = parseFloat(val);
      else if (key === 'stateHeight') props.stateHeight = parseFloat(val);
      else if (key === 'stateRadius') props.stateRadius = parseFloat(val);
      else if (key === 'transitionStroke') props.transitionStroke = val;
      else if (key === 'markerRadius') props.markerRadius = parseFloat(val);
      else if (key === 'markerFill') props.markerFill = val;
      else if (key === 'markerStroke') props.markerStroke = val;
    }
  }

  return props as StateMachineProps;
}

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

    // ── Composite: state_machine id { ... } ──────
    const smMatch = line.match(/^state_machine\s+(\w+)\s*\{/);
    if (smMatch) {
      const smId = smMatch[1];
      const bodyLines: string[] = [];
      i++;
      let depth = 1;
      while (i < lines.length && depth > 0) {
        const bl = lines[i];
        for (const ch of bl) {
          if (ch === '{') depth++;
          if (ch === '}') depth--;
        }
        if (depth > 0) bodyLines.push(bl);
        i++;
      }

      const smProps = parseStateMachineBody(bodyLines);
      const expanded = expandStateMachine(smId, smProps);
      for (const [objId, obj] of Object.entries(expanded)) {
        objects[objId] = obj;
      }
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
