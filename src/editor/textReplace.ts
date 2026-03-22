/**
 * Surgical text replacement: find a value at a given path in JSON5 text
 * and replace just that value, preserving all formatting.
 */

interface ValueSpan {
  from: number;
  to: number;
}

/**
 * Find the character span of the value for a given key at a cursor position.
 * Searches backward from `pos` to find the key, then forward to find the value span.
 */
export function findValueSpan(text: string, pos: number, key: string): ValueSpan | null {
  // Search backward and forward from pos to find "key:" or "key :"
  const searchRegion = text.slice(Math.max(0, pos - 200), Math.min(text.length, pos + 200));
  const regionStart = Math.max(0, pos - 200);

  // Find all occurrences of the key in this region
  const keyPatterns = [
    new RegExp(`["']?${escapeRegex(key)}["']?\\s*:`, 'g'),
  ];

  let bestMatch: { keyEnd: number } | null = null;
  let bestDist = Infinity;

  for (const pattern of keyPatterns) {
    let m;
    while ((m = pattern.exec(searchRegion)) !== null) {
      const absKeyEnd = regionStart + m.index + m[0].length;
      const dist = Math.abs(absKeyEnd - pos);
      if (dist < bestDist) {
        bestDist = dist;
        bestMatch = { keyEnd: absKeyEnd };
      }
    }
  }

  if (!bestMatch) return null;

  // Skip whitespace after the colon
  let valueStart = bestMatch.keyEnd;
  while (valueStart < text.length && (text[valueStart] === ' ' || text[valueStart] === '\t')) {
    valueStart++;
  }

  // Determine the value end based on what the value starts with
  const valueEnd = findValueEnd(text, valueStart);
  if (valueEnd === null) return null;

  return { from: valueStart, to: valueEnd };
}

function findValueEnd(text: string, start: number): number | null {
  if (start >= text.length) return null;
  const ch = text[start];

  // String value
  if (ch === '"' || ch === "'") {
    let i = start + 1;
    while (i < text.length) {
      if (text[i] === ch && text[i - 1] !== '\\') return i + 1;
      i++;
    }
    return null;
  }

  // Object or array
  if (ch === '{' || ch === '[') {
    const close = ch === '{' ? '}' : ']';
    let depth = 1;
    let i = start + 1;
    let inStr = false;
    let strChar = '';
    while (i < text.length && depth > 0) {
      if (inStr) {
        if (text[i] === strChar && text[i - 1] !== '\\') inStr = false;
      } else {
        if (text[i] === '"' || text[i] === "'") { inStr = true; strChar = text[i]; }
        else if (text[i] === ch) depth++;
        else if (text[i] === close) depth--;
      }
      i++;
    }
    return i;
  }

  // Number, boolean, null, or unquoted identifier
  let i = start;
  while (i < text.length && ![',', '}', ']', '\n', '\r'].includes(text[i])) {
    i++;
  }
  // Trim trailing whitespace
  while (i > start && (text[i - 1] === ' ' || text[i - 1] === '\t')) i--;
  return i;
}

/**
 * Format a value for insertion into JSON5 text.
 */
export function formatValue(value: unknown): string {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
  }
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return `"${value}"`;
  if (Array.isArray(value)) {
    return `[${value.map(v => formatValue(v)).join(', ')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value);
    const parts = entries.map(([k, v]) => `${k}: ${formatValue(v)}`);
    return `{ ${parts.join(', ')} }`;
  }
  return String(value);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
