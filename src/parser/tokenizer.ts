/**
 * Simple line-based tokenizer for the starch DSL.
 * Strips comments and blank lines, returns clean lines for the parser.
 */
export interface TokenizedLine {
  text: string;
  lineNumber: number; // 1-based, for error reporting
}

export function tokenize(source: string): TokenizedLine[] {
  return source
    .split('\n')
    .map((text, i) => ({ text: text.trim(), lineNumber: i + 1 }))
    .filter((line) => line.text.length > 0 && !line.text.startsWith('#'));
}
