/**
 * DSL linter: validates DSL text using parseDsl() and returns diagnostics.
 * Compatible with CodeMirror's linter format.
 */
import { parseDsl } from '../dsl/parser';

export interface DslDiagnostic {
  line: number;
  col: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

/**
 * Lint DSL text by attempting to parse it.
 * Returns an array of diagnostics if parsing fails.
 */
export function lintDsl(text: string): DslDiagnostic[] {
  if (!text.trim()) return [];

  try {
    parseDsl(text);
    return [];
  } catch (e: unknown) {
    const err = e as Error;
    const message = err.message || 'Parse error';

    // Try to extract line:col from the error message
    // The DSL parser throws errors like "... at line 3:5" or "at line 3"
    const lineColMatch = message.match(/at line (\d+):(\d+)/);
    if (lineColMatch) {
      return [{
        line: parseInt(lineColMatch[1]),
        col: parseInt(lineColMatch[2]),
        message: cleanMessage(message),
        severity: 'error',
      }];
    }

    const lineMatch = message.match(/at line (\d+)/);
    if (lineMatch) {
      return [{
        line: parseInt(lineMatch[1]),
        col: 1,
        message: cleanMessage(message),
        severity: 'error',
      }];
    }

    // Also try "line N" without "at"
    const plainLineMatch = message.match(/line (\d+)/);
    if (plainLineMatch) {
      return [{
        line: parseInt(plainLineMatch[1]),
        col: 1,
        message: cleanMessage(message),
        severity: 'error',
      }];
    }

    // No position info — report at line 1
    return [{
      line: 1,
      col: 1,
      message: cleanMessage(message),
      severity: 'error',
    }];
  }
}

/**
 * Clean up the error message for display.
 */
function cleanMessage(msg: string): string {
  // Remove redundant position info from the message since it's in the diagnostic
  return msg
    .replace(/\s+at line \d+(:\d+)?/, '')
    .trim();
}
