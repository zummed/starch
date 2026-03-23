/**
 * DSL-specific value span finding and extraction.
 * Counterpart to textReplace.ts for JSON — handles positional DSL syntax
 * like "fill 210 70 45", "rect 55x100", "radius=8", etc.
 */

export interface DslValueSpan {
  from: number;  // absolute offset in the document
  to: number;    // absolute offset end
}

/**
 * Find the text span of a DSL value at the cursor position.
 * Used by the popup system to know what text to replace.
 */
export function findDslValueSpan(
  doc: string,
  cursorPos: number,
  key: string,
  schemaPath: string,
): DslValueSpan | null {
  const lineStart = doc.lastIndexOf('\n', cursorPos - 1) + 1;
  const lineEnd = doc.indexOf('\n', cursorPos);
  const line = doc.slice(lineStart, lineEnd === -1 ? doc.length : lineEnd);
  const posInLine = cursorPos - lineStart;

  // Case 1: Dimensions (WxH) — key is 'w', 'h', 'rx', 'ry'
  if (['w', 'h', 'rx', 'ry'].includes(key)) {
    const dimRe = /(\d+)x(\d+)/g;
    let m;
    while ((m = dimRe.exec(line)) !== null) {
      const fullStart = m.index;
      const fullEnd = fullStart + m[0].length;
      if (posInLine >= fullStart && posInLine <= fullEnd) {
        // Return span of the entire WxH token — we'll replace the whole thing
        return { from: lineStart + fullStart, to: lineStart + fullEnd };
      }
    }
  }

  // Case 2: HSL component (h, s, l) after fill/stroke
  if (['h', 's', 'l'].includes(key) && (schemaPath.includes('.fill.') || schemaPath.includes('.stroke.'))) {
    const re = /\b(fill|stroke)\s+(\d+)\s+(\d+)\s+(\d+)/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      const prop = m[1];
      let searchFrom = m.index + prop.length;

      const n1Start = line.indexOf(m[2], searchFrom);
      const n1End = n1Start + m[2].length;
      const n2Start = line.indexOf(m[3], n1End);
      const n2End = n2Start + m[3].length;
      const n3Start = line.indexOf(m[4], n2End);
      const n3End = n3Start + m[4].length;

      if (key === 'h' && posInLine >= n1Start && posInLine <= n1End) {
        return { from: lineStart + n1Start, to: lineStart + n1End };
      }
      if (key === 's' && posInLine >= n2Start && posInLine <= n2End) {
        return { from: lineStart + n2Start, to: lineStart + n2End };
      }
      if (key === 'l' && posInLine >= n3Start && posInLine <= n3End) {
        return { from: lineStart + n3Start, to: lineStart + n3End };
      }
    }
  }

  // Case 3: key=value
  const kvRe = new RegExp(`\\b${escapeRegex(key)}\\s*=\\s*([^\\s,)]+)`);
  const kvMatch = line.match(kvRe);
  if (kvMatch) {
    const valStart = line.indexOf(kvMatch[1], kvMatch.index!);
    return { from: lineStart + valStart, to: lineStart + valStart + kvMatch[1].length };
  }

  // Case 4: Compound fill/stroke — entire "fill H S L" or "fill colorname"
  if (key === 'fill' || key === 'stroke') {
    const compoundRe = new RegExp(`\\b${key}\\s+(\\d+\\s+\\d+\\s+\\d+(?:\\s+a=[\\d.]+)?|\\w+|#[0-9a-fA-F]+)`);
    const cm = line.match(compoundRe);
    if (cm) {
      const valStart = line.indexOf(cm[1], cm.index!);
      return { from: lineStart + valStart, to: lineStart + valStart + cm[1].length };
    }
  }

  // Case 5: Fall back to the number/word directly under the cursor
  const tokenRe = /[\w.#]+/g;
  let tm;
  while ((tm = tokenRe.exec(line)) !== null) {
    if (posInLine >= tm.index && posInLine <= tm.index + tm[0].length) {
      return { from: lineStart + tm.index, to: lineStart + tm.index + tm[0].length };
    }
  }

  return null;
}

/**
 * Extract the current value at a DSL cursor position.
 * Returns a value suitable for initializing a popup widget.
 */
export function extractDslValue(
  doc: string,
  cursorPos: number,
  key: string,
  schemaPath: string,
  type: string,
): unknown {
  const lineStart = doc.lastIndexOf('\n', cursorPos - 1) + 1;
  const lineEnd = doc.indexOf('\n', cursorPos);
  const line = doc.slice(lineStart, lineEnd === -1 ? doc.length : lineEnd);

  // Dimensions — extract both w and h
  if (['w', 'h', 'rx', 'ry'].includes(key)) {
    const dimRe = /(\d+)x(\d+)/g;
    let m;
    while ((m = dimRe.exec(line)) !== null) {
      const posInLine = cursorPos - lineStart;
      if (posInLine >= m.index && posInLine <= m.index + m[0].length) {
        const w = parseInt(m[1], 10);
        const h = parseInt(m[2], 10);
        return (key === 'w' || key === 'rx') ? w : h;
      }
    }
  }

  // HSL component
  if (['h', 's', 'l'].includes(key) && (schemaPath.includes('.fill.') || schemaPath.includes('.stroke.'))) {
    const re = /\b(fill|stroke)\s+(\d+)\s+(\d+)\s+(\d+)/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      if (key === 'h') return parseInt(m[2], 10);
      if (key === 's') return parseInt(m[3], 10);
      if (key === 'l') return parseInt(m[4], 10);
    }
  }

  // Compound fill/stroke — return full HSL object
  if ((key === 'fill' || key === 'stroke') && type === 'color') {
    const re = new RegExp(`\\b${key}\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)`);
    const m = line.match(re);
    if (m) {
      return { h: parseInt(m[1], 10), s: parseInt(m[2], 10), l: parseInt(m[3], 10) };
    }
  }

  // key=value
  const kvRe = new RegExp(`\\b${escapeRegex(key)}\\s*=\\s*([^\\s,)]+)`);
  const kvMatch = line.match(kvRe);
  if (kvMatch) {
    const val = kvMatch[1];
    if (type === 'number') {
      const n = parseFloat(val);
      return isNaN(n) ? 0 : n;
    }
    if (type === 'boolean') return val === 'true';
    if (type === 'enum') return val.replace(/^["']|["']$/g, '');
    return val;
  }

  // Defaults
  if (type === 'number') return 0;
  if (type === 'boolean') return false;
  if (type === 'color') return { h: 210, s: 80, l: 50 };
  return null;
}

/**
 * Format a value for insertion into DSL text.
 * Unlike JSON formatValue, DSL values are bare (no quotes on most strings,
 * no braces on objects).
 */
export function formatDslValue(value: unknown, key: string, schemaPath: string): string {
  if (typeof value === 'number') {
    return String(Math.round(value * 100) / 100);
  }
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return value;
  return String(value);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
