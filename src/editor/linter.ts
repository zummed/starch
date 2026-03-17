import { linter, type Diagnostic } from '@codemirror/lint';
import { parseDSL } from '../parser/parser';
import { isValidColour } from '../core/colours';

/**
 * Try to find the source position for a validation error by searching
 * for identifiers or property names mentioned in the error message.
 */
function findErrorPosition(doc: string, message: string): { from: number; to: number } {
  // Try to extract quoted identifiers from the error message
  const quoted = message.match(/"([^"]+)"/g);
  if (quoted) {
    for (const q of quoted) {
      const term = q.slice(1, -1);
      const idx = doc.indexOf(term);
      if (idx >= 0) {
        return { from: idx, to: idx + term.length };
      }
    }
  }

  // Try to find property names like "w", "type", etc.
  const propMatch = message.match(/\b(type|id|w|h|r|x|y|from|to|group|direction)\b/);
  if (propMatch) {
    const idx = doc.lastIndexOf(propMatch[1]);
    if (idx >= 0) {
      return { from: idx, to: idx + propMatch[1].length };
    }
  }

  // Fallback: mark the first character
  return { from: 0, to: Math.min(1, doc.length) };
}

/**
 * CodeMirror linter that parses the starch DSL and reports diagnostics
 * for JSON5 syntax errors and starch validation errors.
 */
export const starchLinter = linter((view) => {
  const doc = view.state.doc.toString();
  if (!doc.trim()) return [];

  const diagnostics: Diagnostic[] = [];

  try {
    parseDSL(doc);

    // Check for invalid colour values (warnings, not errors)
    const colourProps = ['colour', 'color', 'fill', 'stroke', 'textColor', 'textColour', 'labelColor', 'headerColor', 'headerFill', 'background'];
    const colourPattern = new RegExp(
      `(?:${colourProps.join('|')})\\s*:\\s*["']([^"']+)["']`,
      'g',
    );
    let match;
    while ((match = colourPattern.exec(doc))) {
      const val = match[1];
      if (val && !isValidColour(val) && !val.startsWith('url(')) {
        const from = match.index + match[0].indexOf(val);
        diagnostics.push({
          from,
          to: from + val.length,
          severity: 'warning',
          message: `Unknown colour: "${val}"`,
        });
      }
    }

    // Check for self-referencing groups
    const groupPattern = /(?:box|circle|label|table|textblock|code)\s*:\s*["']([^"']+)["'][^}]*group\s*:\s*["']([^"']+)["']/g;
    let groupMatch;
    while ((groupMatch = groupPattern.exec(doc))) {
      if (groupMatch[1] === groupMatch[2]) {
        const from = groupMatch.index + groupMatch[0].lastIndexOf(groupMatch[2]);
        diagnostics.push({
          from,
          to: from + groupMatch[2].length,
          severity: 'error',
          message: `Self-referencing group: "${groupMatch[1]}" cannot be its own container`,
        });
      }
    }
  } catch (e: unknown) {
    const err = e as Error & { lineNumber?: number; columnNumber?: number };
    const msg = err.message
      .replace(/^JSON5 parse error:\s*/, '')
      .replace(/^JSON5:\s*/, '');

    if (err.lineNumber) {
      // JSON5 parse error with line/column
      const lineNum = Math.min(err.lineNumber, view.state.doc.lines);
      const line = view.state.doc.line(lineNum);
      const col = Math.min((err.columnNumber || 1) - 1, line.length);
      const from = line.from + Math.max(0, col);
      const to = Math.min(from + 1, line.to);
      diagnostics.push({ from, to, severity: 'error', message: msg });
    } else if (err.message.includes('JSON5 parse error')) {
      // JSON5 error without position — extract from message
      const posMatch = err.message.match(/at (\d+):(\d+)/);
      if (posMatch) {
        const lineNum = Math.min(parseInt(posMatch[1]), view.state.doc.lines);
        const line = view.state.doc.line(lineNum);
        const col = Math.min(parseInt(posMatch[2]) - 1, line.length);
        const from = line.from + Math.max(0, col);
        const to = Math.min(from + 1, line.to);
        diagnostics.push({ from, to, severity: 'error', message: msg });
      } else {
        diagnostics.push({ from: 0, to: 1, severity: 'error', message: msg });
      }
    } else {
      // Starch validation error — find approximate position
      const pos = findErrorPosition(doc, err.message);
      diagnostics.push({ from: pos.from, to: pos.to, severity: 'error', message: msg });
    }
  }

  return diagnostics;
}, { delay: 300 });
