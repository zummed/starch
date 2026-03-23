/**
 * DSL click target resolution: given a cursor position in DSL text,
 * resolve exactly what was clicked and how to replace it.
 *
 * Replaces the old dslTextReplace.ts which tried to reuse JSON popup
 * infrastructure with an ambiguous `key` field, leading to 8+ bugs.
 * This module resolves everything once at click time, with no ambiguity.
 */

import { nameToHsl, hexToHsl } from '../dsl/colorNames';
import { parseDsl } from '../dsl/parser';
import { generateDsl } from '../dsl/generator';

// ─── Types ───────────────────────────────────────────────────────

export interface DslClickTarget {
  kind: 'dimension' | 'hsl-component' | 'color-compound' | 'key-value' | 'at-coordinate' | 'boolean' | 'compound';
  schemaPath: string;      // for popup widget selection (e.g., "rect.w", "fill.h", "stroke.width")
  span: { from: number; to: number };  // exact text range to replace
  value: unknown;          // current extracted value
  dimHalf?: 'w' | 'h';    // which half for dimension write-back
  fullDimSpan?: { from: number; to: number }; // full NxN token span for dimensions
  nodeIndex?: number;      // for compound targets: which node in the objects array
  compoundProp?: string;   // for compound targets: which top-level property (e.g., 'rect', 'transform')
}

// ─── Geometry detection ──────────────────────────────────────────

const GEOM_KEYWORDS = new Set(['rect', 'ellipse', 'text', 'image', 'camera', 'path']);
const GEOM_RE = /\b(rect|ellipse|text|image|camera|path)\b/;

/** Walk backwards from a line to find the nearest node header with geometry type */
function detectGeomType(doc: string, lineStart: number): string | undefined {
  // First check the current line
  const lineEnd = doc.indexOf('\n', lineStart);
  const line = doc.slice(lineStart, lineEnd === -1 ? doc.length : lineEnd);
  const m = line.match(GEOM_RE);
  if (m) return m[1];

  // Check if this is an indented continuation line — walk up to find the header
  const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
  if (indent > 0) {
    let searchFrom = lineStart - 1;
    while (searchFrom > 0) {
      const prevLineStart = doc.lastIndexOf('\n', searchFrom - 1) + 1;
      const prevLineEnd = doc.indexOf('\n', prevLineStart);
      const prevLine = doc.slice(prevLineStart, prevLineEnd === -1 ? doc.length : prevLineEnd);
      const prevIndent = prevLine.match(/^(\s*)/)?.[1]?.length ?? 0;
      if (prevIndent < indent) {
        const gm = prevLine.match(GEOM_RE);
        if (gm) return gm[1];
        break; // went past the parent
      }
      searchFrom = prevLineStart - 1;
      if (prevLineStart === 0) break;
    }
  }
  return undefined;
}

/** Detect whether a fill/stroke keyword is present earlier on the current line.
 * Returns 'fill' or 'stroke' if one of them has HSL numbers before the cursor position. */
function detectColorContext(line: string, posInLine: number): 'fill' | 'stroke' | null {
  // Find all fill/stroke with HSL pattern
  const re = /\b(fill|stroke)\s+(\d+)\s+(\d+)\s+(\d+)/g;
  let m;
  let result: 'fill' | 'stroke' | null = null;
  while ((m = re.exec(line)) !== null) {
    const matchEnd = m.index + m[0].length;
    if (posInLine >= m.index && posInLine <= matchEnd) {
      result = m[1] as 'fill' | 'stroke';
    }
  }
  return result;
}

// ─── Key to schema path mapping ─────────────────────────────────

const TRANSFORM_KEYS = new Set(['rotation', 'scale', 'anchor', 'pathFollow', 'pathProgress']);
const TEXT_KEYS = new Set(['size', 'lineHeight', 'align', 'content']);
const TEXT_BOOL_KEYS = new Set(['bold', 'mono']);
const RECT_KEYS = new Set(['radius']);
const PATH_KEYS = new Set(['gap', 'fromGap', 'toGap', 'bend', 'drawProgress']);
const PATH_BOOL_KEYS = new Set(['closed', 'smooth']);
const IMAGE_KEYS = new Set(['fit', 'src']);
const CAMERA_KEYS = new Set(['look', 'zoom', 'ratio']);
const CAMERA_BOOL_KEYS = new Set(['active']);
const DIRECT_KEYS = new Set(['opacity', 'depth', 'slot', 'visible', 'style']);

function keyToSchemaPath(key: string, geomType: string | undefined): string {
  if (TRANSFORM_KEYS.has(key)) return `transform.${key}`;
  if (TEXT_KEYS.has(key)) return `text.${key}`;
  if (TEXT_BOOL_KEYS.has(key)) return `text.${key}`;
  if (key === 'width') return 'stroke.width';
  if (RECT_KEYS.has(key) && (!geomType || geomType === 'rect')) return `rect.${key}`;
  if (RECT_KEYS.has(key) && geomType === 'path') return `path.${key}`;
  if (PATH_KEYS.has(key)) return `path.${key}`;
  if (PATH_BOOL_KEYS.has(key)) return `path.${key}`;
  if (IMAGE_KEYS.has(key) && (!geomType || geomType === 'image')) return `image.${key}`;
  if (CAMERA_KEYS.has(key) && (!geomType || geomType === 'camera')) return `camera.${key}`;
  if (CAMERA_BOOL_KEYS.has(key)) return `camera.${key}`;
  if (DIRECT_KEYS.has(key)) return key;
  return key;
}

// ─── Boolean keyword set ─────────────────────────────────────────

const BOOLEAN_KEYWORDS = new Set(['bold', 'mono', 'closed', 'smooth', 'active']);

// ─── Non-clickable keywords ──────────────────────────────────────

const NON_CLICKABLE = new Set([
  'name', 'description', 'background', 'viewport', 'images', 'style', 'animate',
  'path', // path keyword doesn't have a useful compound popup
]);

// ─── Compound value extraction helpers ──────────────────────────

/** Count how many top-level node declarations appear before a line offset */
function countNodesBefore(doc: string, lineStart: number): number {
  const before = doc.slice(0, lineStart);
  const DOC_KW = /^(name|description|background|viewport|images|style|animate)\b/;
  let count = 0;
  for (const line of before.split('\n')) {
    const trimmed = line.trimStart();
    const m = trimmed.match(/^(\w+)\s*:/);
    if (m && !DOC_KW.test(trimmed) && line.length > 0 && line[0] !== ' ') {
      count++;
    }
  }
  return count;
}

/** Extract compound geometry values from a DSL line */
function extractCompoundValue(line: string, geomType: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Dimensions
  const dimMatch = line.match(/(\d+)x(\d+)/);
  if (dimMatch) {
    if (geomType === 'ellipse') {
      result.rx = parseInt(dimMatch[1], 10);
      result.ry = parseInt(dimMatch[2], 10);
    } else {
      result.w = parseInt(dimMatch[1], 10);
      result.h = parseInt(dimMatch[2], 10);
    }
  }

  // Text content
  const textMatch = line.match(/"([^"]*)"/);
  if (geomType === 'text' && textMatch) {
    result.content = textMatch[1];
  }

  // Key=value properties that belong to this geometry
  const kvRe = /\b(\w+)\s*=\s*([^\s,)]+)/g;
  let m;
  while ((m = kvRe.exec(line)) !== null) {
    const key = m[1];
    const val = m[2];
    // Only include props that belong to this geometry type
    if (geomType === 'rect' && key === 'radius') {
      result.radius = parseFloat(val);
    } else if (geomType === 'text' && ['size', 'lineHeight'].includes(key)) {
      result[key] = parseFloat(val);
    } else if (geomType === 'text' && key === 'align') {
      result.align = val;
    } else if (geomType === 'image' && key === 'fit') {
      result.fit = val;
    } else if (geomType === 'camera' && ['zoom', 'ratio'].includes(key)) {
      result[key] = parseFloat(val);
    } else if (geomType === 'camera' && key === 'look') {
      result.look = val;
    }
  }

  // Boolean keywords
  if (geomType === 'text') {
    if (/\bbold\b/.test(line) && !/bold\s*=/.test(line)) result.bold = true;
    if (/\bmono\b/.test(line) && !/mono\s*=/.test(line)) result.mono = true;
  }
  if (geomType === 'camera') {
    if (/\bactive\b/.test(line) && !/active\s*=/.test(line)) result.active = true;
  }

  return result;
}

/** Extract transform values from a DSL line */
function extractTransformValue(line: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // at X,Y
  const atMatch = line.match(/\bat\s+(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (atMatch) {
    result.x = parseFloat(atMatch[1]);
    result.y = parseFloat(atMatch[2]);
  }

  // at x=N or at y=N
  const partialX = line.match(/\bat\s+x\s*=\s*(-?\d+(?:\.\d+)?)/);
  const partialY = line.match(/\bat\s+y\s*=\s*(-?\d+(?:\.\d+)?)/);
  if (partialX) result.x = parseFloat(partialX[1]);
  if (partialY) result.y = parseFloat(partialY[1]);

  // Transform key=value props
  const kvRe = /\b(rotation|scale)\s*=\s*(-?\d+(?:\.\d+)?)/g;
  let m;
  while ((m = kvRe.exec(line)) !== null) {
    result[m[1]] = parseFloat(m[2]);
  }

  return result;
}

// ─── Main resolution function ────────────────────────────────────

export function resolveDslClick(doc: string, pos: number): DslClickTarget | null {
  // Find current line boundaries
  const lineStart = doc.lastIndexOf('\n', pos - 1) + 1;
  const lineEnd = doc.indexOf('\n', pos);
  const line = doc.slice(lineStart, lineEnd === -1 ? doc.length : lineEnd);
  const posInLine = pos - lineStart;

  // Detect geometry type for schema path routing
  const geomType = detectGeomType(doc, lineStart);

  // Check if cursor is on the node ID (before the colon)
  const nodeDefMatch = line.match(/^(\s*)(\w+)\s*:/);
  if (nodeDefMatch) {
    const idStart = nodeDefMatch[1].length;
    const idEnd = idStart + nodeDefMatch[2].length;
    if (posInLine >= idStart && posInLine <= idEnd) {
      return null; // clicking on node id
    }
  }

  // (pre-a) Geometry/transform keyword click → compound popup
  {
    // Geometry keywords: show compound popup with all sub-properties
    const geomKwRe = /\b(rect|ellipse|image|text|camera)\b/g;
    let gm;
    while ((gm = geomKwRe.exec(line)) !== null) {
      if (posInLine >= gm.index && posInLine <= gm.index + gm[0].length) {
        const kw = gm[1];
        const nodeIdx = countNodesBefore(doc, lineStart);
        const value = extractCompoundValue(line, kw);
        return {
          kind: 'compound',
          schemaPath: kw,
          span: { from: lineStart, to: lineEnd === -1 ? doc.length : lineEnd },
          value,
          nodeIndex: nodeIdx,
          compoundProp: kw,
        };
      }
    }

    // "at" keyword → compound transform popup
    const atKwRe = /\bat\b/g;
    let am;
    while ((am = atKwRe.exec(line)) !== null) {
      if (posInLine >= am.index && posInLine <= am.index + 2) {
        const nodeIdx = countNodesBefore(doc, lineStart);
        const value = extractTransformValue(line);
        return {
          kind: 'compound',
          schemaPath: 'transform',
          span: { from: lineStart, to: lineEnd === -1 ? doc.length : lineEnd },
          value,
          nodeIndex: nodeIdx,
          compoundProp: 'transform',
        };
      }
    }
  }

  // (a) Dimensions NxN
  {
    const dimRe = /(\d+)x(\d+)/g;
    let m;
    while ((m = dimRe.exec(line)) !== null) {
      const matchStart = m.index;
      const matchEnd = matchStart + m[0].length;
      if (posInLine >= matchStart && posInLine <= matchEnd) {
        const xPos = m[0].indexOf('x');
        const posInMatch = posInLine - matchStart;
        const half: 'w' | 'h' = posInMatch <= xPos ? 'w' : 'h';

        let schemaPrefix: string;
        if (geomType === 'ellipse') schemaPrefix = 'ellipse';
        else if (geomType === 'image') schemaPrefix = 'image';
        else schemaPrefix = 'rect';

        let schemaKey: string;
        if (geomType === 'ellipse') {
          schemaKey = half === 'w' ? 'rx' : 'ry';
        } else {
          schemaKey = half === 'w' ? 'w' : 'h';
        }

        const w = parseInt(m[1], 10);
        const h = parseInt(m[2], 10);

        // Span of the specific number
        let numFrom: number, numTo: number;
        if (half === 'w') {
          numFrom = lineStart + matchStart;
          numTo = lineStart + matchStart + m[1].length;
        } else {
          numFrom = lineStart + matchStart + xPos + 1;
          numTo = lineStart + matchEnd;
        }

        return {
          kind: 'dimension',
          schemaPath: `${schemaPrefix}.${schemaKey}`,
          span: { from: numFrom, to: numTo },
          value: half === 'w' ? w : h,
          dimHalf: half,
          fullDimSpan: { from: lineStart + matchStart, to: lineStart + matchEnd },
        };
      }
    }
  }

  // (b) HSL number after fill/stroke
  {
    const re = /\b(fill|stroke)\s+(\d+)\s+(\d+)\s+(\d+)/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      const prop = m[1];
      const searchFrom = m.index + prop.length;

      const n1Start = line.indexOf(m[2], searchFrom);
      const n1End = n1Start + m[2].length;
      const n2Start = line.indexOf(m[3], n1End);
      const n2End = n2Start + m[3].length;
      const n3Start = line.indexOf(m[4], n2End);
      const n3End = n3Start + m[4].length;

      if (posInLine >= n1Start && posInLine <= n1End) {
        return {
          kind: 'hsl-component',
          schemaPath: `${prop}.h`,
          span: { from: lineStart + n1Start, to: lineStart + n1End },
          value: parseInt(m[2], 10),
        };
      }
      if (posInLine >= n2Start && posInLine <= n2End) {
        return {
          kind: 'hsl-component',
          schemaPath: `${prop}.s`,
          span: { from: lineStart + n2Start, to: lineStart + n2End },
          value: parseInt(m[3], 10),
        };
      }
      if (posInLine >= n3Start && posInLine <= n3End) {
        return {
          kind: 'hsl-component',
          schemaPath: `${prop}.l`,
          span: { from: lineStart + n3Start, to: lineStart + n3End },
          value: parseInt(m[4], 10),
        };
      }
    }
  }

  // (c) `at X,Y` coordinates
  {
    // Full at X,Y form
    const atRe = /\bat\s+(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/g;
    let m;
    while ((m = atRe.exec(line)) !== null) {
      // Skip the "at " keyword itself
      const atKeyEnd = m.index + 2; // length of "at"
      if (posInLine >= m.index && posInLine <= atKeyEnd) {
        // Cursor is on "at" keyword — return null
        return null;
      }

      // Find positions of X and Y numbers
      const xStr = m[1];
      const yStr = m[2];
      const xStart = line.indexOf(xStr, m.index + 2);
      const xEnd = xStart + xStr.length;
      const commaPos = line.indexOf(',', xEnd);
      const yStart = commaPos + 1;
      // Skip whitespace after comma
      let yActualStart = yStart;
      while (yActualStart < line.length && line[yActualStart] === ' ') yActualStart++;
      const yEnd = yActualStart + yStr.length;

      if (posInLine >= xStart && posInLine <= xEnd) {
        return {
          kind: 'at-coordinate',
          schemaPath: 'transform.x',
          span: { from: lineStart + xStart, to: lineStart + xEnd },
          value: parseFloat(xStr),
        };
      }
      if (posInLine >= yActualStart && posInLine <= yEnd) {
        return {
          kind: 'at-coordinate',
          schemaPath: 'transform.y',
          span: { from: lineStart + yActualStart, to: lineStart + yEnd },
          value: parseFloat(yStr),
        };
      }
    }

    // Partial at x=N or at y=N form
    const atPartialRe = /\bat\s+([xy])\s*=\s*(-?\d+(?:\.\d+)?)/g;
    let mp;
    while ((mp = atPartialRe.exec(line)) !== null) {
      const atKeyEnd = mp.index + 2;
      if (posInLine >= mp.index && posInLine <= atKeyEnd) {
        return null;
      }

      const axis = mp[1]; // 'x' or 'y'
      const numStr = mp[2];
      const numStart = line.indexOf(numStr, mp.index + 3);
      const numEnd = numStart + numStr.length;

      if (posInLine >= mp.index + 3 && posInLine <= numEnd) {
        return {
          kind: 'at-coordinate',
          schemaPath: `transform.${axis}`,
          span: { from: lineStart + numStart, to: lineStart + numEnd },
          value: parseFloat(numStr),
        };
      }
    }
  }

  // (d) key=value
  {
    const kvRe = /\b(\w+)\s*=\s*([^\s,)]+)/g;
    let m;
    while ((m = kvRe.exec(line)) !== null) {
      const keyStr = m[1];
      const valStr = m[2];
      const keyStart = m.index;
      const keyEnd = keyStart + keyStr.length;
      const eqPos = line.indexOf('=', keyEnd);
      const valStart = eqPos + 1;
      // Skip whitespace after =
      let valActualStart = valStart;
      while (valActualStart < line.length && line[valActualStart] === ' ') valActualStart++;
      const valEnd = valActualStart + valStr.length;

      // Cursor on the key part or the value part
      if (posInLine >= keyStart && posInLine <= valEnd) {
        const schemaPath = keyToSchemaPath(keyStr, geomType);

        // Parse the value
        let value: unknown;
        if (valStr === 'true') value = true;
        else if (valStr === 'false') value = false;
        else {
          const num = parseFloat(valStr);
          value = isNaN(num) ? valStr : num;
        }

        return {
          kind: 'key-value',
          schemaPath,
          span: { from: lineStart + valActualStart, to: lineStart + valEnd },
          value,
        };
      }
    }
  }

  // (e) fill/stroke keyword — color compound
  {
    // Match fill/stroke followed by HSL numbers, or a named color, or hex color
    const colorRe = /\b(fill|stroke)\s+(\d+\s+\d+\s+\d+(?:\s+a=[\d.]+)?|\w+|#[0-9a-fA-F]+)/g;
    let m;
    while ((m = colorRe.exec(line)) !== null) {
      const keyword = m[1];
      const kwStart = m.index;
      const kwEnd = kwStart + keyword.length;
      const colorValStr = m[2];
      const colorValStart = line.indexOf(colorValStr, kwEnd);
      const colorValEnd = colorValStart + colorValStr.length;

      // Check if cursor is on the keyword itself or on the color value (named color)
      const onKeyword = posInLine >= kwStart && posInLine < kwEnd + 1;
      const onColorVal = posInLine >= colorValStart && posInLine <= colorValEnd;

      if (onKeyword || onColorVal) {
        // Parse the color value
        let hslValue: { h: number; s: number; l: number };
        const hslMatch = colorValStr.match(/^(\d+)\s+(\d+)\s+(\d+)/);
        if (hslMatch) {
          hslValue = {
            h: parseInt(hslMatch[1], 10),
            s: parseInt(hslMatch[2], 10),
            l: parseInt(hslMatch[3], 10),
          };
        } else if (colorValStr.startsWith('#')) {
          hslValue = hexToHsl(colorValStr);
        } else {
          const named = nameToHsl(colorValStr);
          if (named) {
            hslValue = named;
          } else {
            // Unknown color name, skip
            continue;
          }
        }

        // Stroke has extra properties (width, a) beyond HSL — use compound
        // target so write-back goes through parse → modify → generate,
        // correctly handling disjoint tokens (e.g., "210 80 30 width=2").
        if (keyword === 'stroke') {
          const nodeIdx = countNodesBefore(doc, lineStart);
          const strokeValue: Record<string, unknown> = { ...hslValue };
          // Extract width and alpha from the line
          const widthMatch = line.match(/\bwidth\s*=\s*(\d+(?:\.\d+)?)/);
          if (widthMatch) strokeValue.width = parseFloat(widthMatch[1]);
          const alphaMatch = colorValStr.match(/a=([\d.]+)/);
          if (alphaMatch) strokeValue.a = parseFloat(alphaMatch[1]);
          return {
            kind: 'compound',
            schemaPath: 'stroke',
            span: { from: lineStart, to: lineEnd === -1 ? doc.length : lineEnd },
            value: strokeValue,
            nodeIndex: nodeIdx,
            compoundProp: 'stroke',
          };
        }

        return {
          kind: 'color-compound',
          schemaPath: keyword as string,
          span: { from: lineStart + colorValStart, to: lineStart + colorValEnd },
          value: hslValue,
        };
      }
    }
  }

  // (f) Boolean keywords
  {
    for (const kw of BOOLEAN_KEYWORDS) {
      const boolRe = new RegExp(`\\b${kw}\\b`, 'g');
      let m;
      while ((m = boolRe.exec(line)) !== null) {
        const kwStart = m.index;
        const kwEnd = kwStart + kw.length;
        if (posInLine >= kwStart && posInLine <= kwEnd) {
          // Make sure this isn't inside a key=value (e.g., "bold=true")
          const afterKw = line.slice(kwEnd).match(/^\s*=/);
          if (afterKw) continue; // it's a key=value, handled in (d)

          return {
            kind: 'boolean',
            schemaPath: keyToSchemaPath(kw, geomType),
            span: { from: lineStart + kwStart, to: lineStart + kwEnd },
            value: true,
          };
        }
      }
    }
  }

  // (g) Otherwise: null
  return null;
}

// ─── Apply a popup change ────────────────────────────────────────

export function applyDslPopupChange(doc: string, target: DslClickTarget, newValue: unknown): string {
  const before = doc.slice(0, target.span.from);
  const after = doc.slice(target.span.to);

  switch (target.kind) {
    case 'dimension': {
      // Replace the full NxN token, keeping the other half
      if (!target.fullDimSpan) {
        // Fallback: just replace the number
        return before + String(Math.round(newValue as number)) + after;
      }
      const fullBefore = doc.slice(0, target.fullDimSpan.from);
      const fullAfter = doc.slice(target.fullDimSpan.to);
      const fullText = doc.slice(target.fullDimSpan.from, target.fullDimSpan.to);
      const dimMatch = fullText.match(/(\d+)x(\d+)/);
      if (!dimMatch) {
        return before + String(Math.round(newValue as number)) + after;
      }
      const oldW = parseInt(dimMatch[1], 10);
      const oldH = parseInt(dimMatch[2], 10);
      const numVal = Math.round(newValue as number);
      const newDim = target.dimHalf === 'w'
        ? `${numVal}x${oldH}`
        : `${oldW}x${numVal}`;
      return fullBefore + newDim + fullAfter;
    }

    case 'hsl-component': {
      const numStr = String(Math.round(newValue as number));
      return before + numStr + after;
    }

    case 'at-coordinate': {
      const numVal = newValue as number;
      const formatted = Number.isInteger(numVal) ? String(numVal) : numVal.toFixed(2).replace(/\.?0+$/, '');
      return before + formatted + after;
    }

    case 'key-value': {
      let replacement: string;
      if (typeof newValue === 'number') {
        replacement = Number.isInteger(newValue) ? String(newValue) : (Math.round(newValue * 100) / 100).toString();
      } else if (typeof newValue === 'boolean') {
        replacement = String(newValue);
      } else if (typeof newValue === 'string') {
        replacement = newValue;
      } else {
        replacement = String(newValue ?? '');
      }
      return before + replacement + after;
    }

    case 'color-compound': {
      if (typeof newValue === 'object' && newValue !== null && 'h' in newValue && 's' in newValue && 'l' in newValue) {
        const c = newValue as { h: number; s: number; l: number; a?: number };
        let replacement = `${Math.round(c.h)} ${Math.round(c.s)} ${Math.round(c.l)}`;
        if (c.a !== undefined && c.a !== 1) {
          replacement += ` a=${c.a}`;
        }
        return before + replacement + after;
      }
      // Fallback: stringify
      return before + String(newValue) + after;
    }

    case 'boolean': {
      // DSL booleans are bare keywords: "bold" = true, absent = false.
      // Toggling off removes the keyword; toggling on re-inserts it.
      if (newValue) {
        // Already present (the span IS the keyword) — no change needed
        return doc;
      } else {
        // Remove the keyword and clean up surrounding whitespace
        // (avoid leaving double spaces)
        let from = target.span.from;
        let to = target.span.to;
        if (from > 0 && doc[from - 1] === ' ') from--;
        else if (to < doc.length && doc[to] === ' ') to++;
        return doc.slice(0, from) + doc.slice(to);
      }
    }

    case 'compound': {
      // Full re-parse → modify property → re-generate approach.
      // This handles compound targets (rect, transform, etc.) where the popup
      // sends the full merged object and the DSL tokens are disjoint.
      try {
        const raw = parseDsl(doc);
        if (!raw.objects || target.nodeIndex === undefined) return doc;
        const node = raw.objects[target.nodeIndex];
        if (!node) return doc;

        // Apply the new value to the correct property
        const prop = target.compoundProp!;
        const newObj = newValue as Record<string, unknown>;

        if (prop === 'transform') {
          node.transform = { ...(node.transform || {}), ...newObj };
        } else {
          // Geometry property (rect, ellipse, text, image, camera)
          node[prop] = { ...(node[prop] || {}), ...newObj };
        }

        return generateDsl(raw);
      } catch {
        return doc;
      }
    }

    default:
      return doc;
  }
}
