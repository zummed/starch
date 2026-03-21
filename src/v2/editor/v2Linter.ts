import { linter, type Diagnostic } from '@codemirror/lint';
import { parseScene } from '../parser/parser';

/**
 * V2 linter for CodeMirror — validates against the v2 parser (not v1).
 */
export const v2Linter = linter((view) => {
  const doc = view.state.doc.toString();
  if (!doc.trim()) return [];

  const diagnostics: Diagnostic[] = [];

  try {
    parseScene(doc);
  } catch (e: unknown) {
    const err = e as Error & { lineNumber?: number; columnNumber?: number };
    const msg = err.message
      .replace(/^JSON5 parse error:\s*/, '')
      .replace(/^JSON5:\s*/, '');

    if (err.lineNumber) {
      const lineNum = Math.min(err.lineNumber, view.state.doc.lines);
      const line = view.state.doc.line(lineNum);
      const col = Math.min((err.columnNumber || 1) - 1, line.length);
      const from = line.from + Math.max(0, col);
      const to = Math.min(from + 1, line.to);
      diagnostics.push({ from, to, severity: 'error', message: msg });
    } else {
      const posMatch = err.message.match(/at (\d+):(\d+)/);
      if (posMatch) {
        const lineNum = Math.min(parseInt(posMatch[1]), view.state.doc.lines);
        const line = view.state.doc.line(lineNum);
        const col = Math.min(parseInt(posMatch[2]) - 1, line.length);
        const from = line.from + Math.max(0, col);
        const to = Math.min(from + 1, line.to);
        diagnostics.push({ from, to, severity: 'error', message: msg });
      } else {
        diagnostics.push({ from: 0, to: Math.min(1, doc.length), severity: 'error', message: msg });
      }
    }
  }

  return diagnostics;
}, { delay: 300 });
