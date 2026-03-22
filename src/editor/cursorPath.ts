/**
 * Cursor-to-path mapping: given a cursor position in JSON5 text,
 * determine the model path (e.g., "objects.0.rect.radius").
 *
 * Uses a character-by-character state machine to track which
 * object/array/key the cursor is inside.
 */

interface PathSegment {
  key: string;
  start: number;
  end: number;
}

export interface CursorContext {
  /** Dotted path from root to cursor position, e.g. "objects.0.rect" */
  path: string;
  /** Whether the cursor is at a property name position (vs value position) */
  isPropertyName: boolean;
  /** The partial text being typed at cursor (for completion filtering) */
  prefix: string;
  /** The current property name if cursor is at a value position */
  currentKey: string | null;
}

export function getCursorContext(text: string, cursorOffset: number): CursorContext {
  const segments: string[] = [];
  let isPropertyName = false;
  let prefix = '';
  let currentKey: string | null = null;

  // State machine
  let i = 0;
  const stack: Array<{ type: 'object' | 'array'; index: number; lastKey: string | null }> = [];
  let inString = false;
  let stringChar = '';
  let currentToken = '';
  let afterColon = false;

  while (i < text.length) {
    // Stop BEFORE processing the character at/past cursor
    if (i >= cursorOffset) break;
    const ch = text[i];

    // String handling
    if (inString) {
      if (ch === stringChar && text[i - 1] !== '\\') {
        inString = false;
        // Keep currentToken — it holds the string content which may be used as a key
      } else {
        currentToken += ch;
      }
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      currentToken = ''; // will accumulate string contents
      i++;
      continue;
    }

    // Whitespace and comments
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    // Line comments
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }

    // Block comments
    if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length - 1 && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    if (ch === '{') {
      stack.push({ type: 'object', index: 0, lastKey: null });
      afterColon = false;
      currentToken = '';
      i++;
      continue;
    }

    if (ch === '[') {
      stack.push({ type: 'array', index: 0, lastKey: null });
      afterColon = false;
      currentToken = '';
      i++;
      continue;
    }

    if (ch === '}' || ch === ']') {
      stack.pop();
      afterColon = false;
      currentToken = '';
      i++;
      continue;
    }

    if (ch === ':') {
      // The currentToken before this was a property key
      const key = currentToken.trim();
      if (key && stack.length > 0) {
        stack[stack.length - 1].lastKey = key;
      }
      afterColon = true;
      currentToken = '';
      i++;
      continue;
    }

    if (ch === ',') {
      if (stack.length > 0 && stack[stack.length - 1].type === 'array') {
        stack[stack.length - 1].index++;
      }
      afterColon = false;
      currentToken = '';
      stack[stack.length - 1].lastKey = null;
      i++;
      continue;
    }

    // Accumulate token characters (unquoted keys in JSON5, numbers, etc.)
    currentToken += ch;
    i++;
  }

  // Build path from stack
  const pathParts: string[] = [];
  for (const frame of stack) {
    if (frame.type === 'array') {
      pathParts.push(String(frame.index));
    }
    if (frame.lastKey) {
      pathParts.push(frame.lastKey);
    }
  }

  const path = pathParts.join('.');

  // Determine if we're at a property name or value position
  if (stack.length > 0) {
    const top = stack[stack.length - 1];
    if (top.type === 'object' && !afterColon) {
      isPropertyName = true;
      prefix = currentToken.trim();
    } else if (top.type === 'object' && afterColon) {
      isPropertyName = false;
      prefix = currentToken.trim();
      currentKey = top.lastKey;
    } else {
      // Array context
      isPropertyName = false;
      prefix = currentToken.trim();
      currentKey = null;
    }
  }

  return {
    path,
    isPropertyName,
    prefix,
    currentKey,
  };
}
