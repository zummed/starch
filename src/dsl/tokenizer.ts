import type { Token, TokenType } from './types';

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  const len = input.length;
  let pos = 0;
  let line = 1;
  let col = 1;
  const indentStack: number[] = [0];

  // Whether we're at the start of a new line (need to handle indentation)
  let atLineStart = true;

  function peek(offset = 0): string {
    return pos + offset < len ? input[pos + offset] : '';
  }

  function advance(): string {
    const ch = input[pos];
    pos++;
    if (ch === '\n') {
      line++;
      col = 1;
    } else {
      col++;
    }
    return ch;
  }

  function makeToken(type: TokenType, value: string, startLine: number, startCol: number, startOffset: number): Token {
    return { type, value, line: startLine, col: startCol, offset: startOffset };
  }

  function emit(type: TokenType, value: string, startLine: number, startCol: number, startOffset: number): void {
    tokens.push(makeToken(type, value, startLine, startCol, startOffset));
  }

  function isDigit(ch: string): boolean {
    return ch >= '0' && ch <= '9';
  }

  function isAlpha(ch: string): boolean {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
  }

  function isAlphaNum(ch: string): boolean {
    return isAlpha(ch) || isDigit(ch);
  }

  function isHexChar(ch: string): boolean {
    return isDigit(ch) || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F');
  }

  function isWhitespace(ch: string): boolean {
    return ch === ' ' || ch === '\t' || ch === '\r';
  }

  /**
   * Determine if a minus sign at the current position should be treated as
   * a negative number sign rather than a standalone operator.
   *
   * Negative number: minus followed by a digit, and preceded by nothing
   * meaningful (start of input, after whitespace, after '(', after ',',
   * after '=', after newline/indent, at line start).
   */
  function isNegativeNumber(): boolean {
    if (peek() !== '-') return false;
    if (!isDigit(peek(1))) return false;

    // Check what comes before
    if (tokens.length === 0) return true;
    const prev = tokens[tokens.length - 1];
    const negPreceders: TokenType[] = [
      'newline', 'indent', 'dedent', 'parenOpen', 'comma', 'equals',
      'colon', 'arrow', 'braceOpen',
    ];
    return negPreceders.includes(prev.type);
  }

  /**
   * Read a number token (integer or float).
   * Assumes pos is at the first digit (or '-' for negative).
   */
  function readNumber(): void {
    const startLine = line;
    const startCol = col;
    const startOffset = pos;
    let value = '';

    if (peek() === '-') {
      value += advance();
    }

    while (pos < len && isDigit(peek())) {
      value += advance();
    }

    // Decimal part
    if (peek() === '.' && isDigit(peek(1))) {
      value += advance(); // '.'
      while (pos < len && isDigit(peek())) {
        value += advance();
      }
    }

    // Check for dimension pattern: NUMBERxNUMBER
    if (peek() === 'x' && isDigit(peek(1))) {
      value += advance(); // 'x'
      while (pos < len && isDigit(peek())) {
        value += advance();
      }
      emit('dimensions', value, startLine, startCol, startOffset);
      return;
    }

    // Check if immediately followed by alpha chars (like '3s' for "3 seconds")
    // This makes it an identifier instead of a number
    if (isAlpha(peek())) {
      while (pos < len && isAlphaNum(peek())) {
        value += advance();
      }
      emit('identifier', value, startLine, startCol, startOffset);
      return;
    }

    emit('number', value, startLine, startCol, startOffset);
  }

  /**
   * Read a string literal. Assumes pos is at the opening '"'.
   */
  function readString(): void {
    const startLine = line;
    const startCol = col;
    const startOffset = pos;
    advance(); // skip opening "

    let value = '';
    while (pos < len && peek() !== '"') {
      if (peek() === '\\') {
        advance(); // skip backslash
        const esc = advance();
        switch (esc) {
          case '"': value += '"'; break;
          case '\\': value += '\\'; break;
          case 'n': value += '\n'; break;
          case 't': value += '\t'; break;
          default: value += esc; break;
        }
      } else {
        value += advance();
      }
    }
    if (pos < len) {
      advance(); // skip closing "
    }
    emit('string', value, startLine, startCol, startOffset);
  }

  /**
   * Read an identifier. Assumes pos is at a letter or underscore.
   */
  function readIdentifier(): void {
    const startLine = line;
    const startCol = col;
    const startOffset = pos;
    let value = '';
    while (pos < len) {
      const ch = peek();
      if (isAlphaNum(ch)) {
        value += advance();
        continue;
      }
      // Allow hyphens inside identifiers (e.g., hint-bg, easing-name)
      // — but only when followed by another alpha char (not end of ident, not `->` arrow)
      if (ch === '-' && isAlpha(peek(1))) {
        value += advance();
        continue;
      }
      break;
    }
    emit('identifier', value, startLine, startCol, startOffset);
  }

  /**
   * Read a hex color. Assumes pos is at '#'.
   */
  function readHexColor(): void {
    const startLine = line;
    const startCol = col;
    const startOffset = pos;
    let value = advance(); // '#'

    // Read hex chars
    let count = 0;
    while (pos < len && isHexChar(peek()) && count < 6) {
      value += advance();
      count++;
    }
    emit('hexColor', value, startLine, startCol, startOffset);
  }

  /**
   * Process the start of a line: measure indentation and emit indent/dedent/newline.
   * Returns true if the line is non-empty (has content to tokenize).
   */
  function processLineStart(): boolean {
    // Measure leading spaces
    let spaces = 0;
    while (pos < len && peek() === ' ') {
      advance();
      spaces++;
    }

    // Skip blank lines
    if (pos >= len || peek() === '\n') {
      if (pos < len) {
        advance(); // consume the newline
      }
      return false; // line was blank, skip
    }

    // Skip comment-only lines
    if (peek() === '/' && peek(1) === '/') {
      while (pos < len && peek() !== '\n') {
        advance();
      }
      if (pos < len) {
        advance(); // consume newline
      }
      return false;
    }

    const currentIndent = indentStack[indentStack.length - 1];

    if (spaces > currentIndent) {
      indentStack.push(spaces);
      emit('indent', '  ', line, 1, pos);
    } else if (spaces < currentIndent) {
      // Pop indent levels until we find a match
      while (indentStack.length > 1 && indentStack[indentStack.length - 1] > spaces) {
        indentStack.pop();
        emit('dedent', '', line, 1, pos);
      }
    }

    return true;
  }

  // ── Main loop ──────────────────────────────────────────────────

  // Process first line's indentation (usually 0)
  if (len > 0) {
    atLineStart = true;
  }

  while (pos < len) {
    // Handle line starts (indentation)
    if (atLineStart) {
      atLineStart = false;
      const hasContent = processLineStart();
      if (!hasContent) {
        atLineStart = true;
        continue;
      }
      continue;
    }

    const ch = peek();

    // Newline
    if (ch === '\n') {
      const sl = line; const sc = col; const so = pos;
      advance();
      // Emit newline token (will be followed by possible indent/dedent)
      emit('newline', '\n', sl, sc, so);
      atLineStart = true;
      continue;
    }

    // Skip whitespace (non-newline)
    if (isWhitespace(ch)) {
      advance();
      continue;
    }

    // Comments
    if (ch === '/' && peek(1) === '/') {
      while (pos < len && peek() !== '\n') {
        advance();
      }
      continue;
    }

    // String
    if (ch === '"') {
      readString();
      continue;
    }

    // Arrow
    if (ch === '-' && peek(1) === '>') {
      const sl = line; const sc = col; const so = pos;
      advance(); advance();
      emit('arrow', '->', sl, sc, so);
      continue;
    }

    // Negative number
    if (ch === '-' && isNegativeNumber()) {
      readNumber();
      continue;
    }

    // Number (or dimensions like 160x100)
    if (isDigit(ch)) {
      readNumber();
      continue;
    }

    // Hex color
    if (ch === '#') {
      // Check if followed by hex characters
      if (isHexChar(peek(1))) {
        readHexColor();
        continue;
      }
    }

    // Double dot
    if (ch === '.' && peek(1) === '.') {
      const sl = line; const sc = col; const so = pos;
      advance(); advance();
      emit('doubleDot', '..', sl, sc, so);
      continue;
    }

    // Single dot
    if (ch === '.') {
      const sl = line; const sc = col; const so = pos;
      advance();
      emit('dot', '.', sl, sc, so);
      continue;
    }

    // Colon
    if (ch === ':') {
      const sl = line; const sc = col; const so = pos;
      advance();
      emit('colon', ':', sl, sc, so);
      continue;
    }

    // Equals
    if (ch === '=') {
      const sl = line; const sc = col; const so = pos;
      advance();
      emit('equals', '=', sl, sc, so);
      continue;
    }

    // At sign
    if (ch === '@') {
      const sl = line; const sc = col; const so = pos;
      advance();
      emit('atSign', '@', sl, sc, so);
      continue;
    }

    // Plus
    if (ch === '+') {
      const sl = line; const sc = col; const so = pos;
      advance();
      emit('plus', '+', sl, sc, so);
      continue;
    }

    // Parentheses
    if (ch === '(') {
      const sl = line; const sc = col; const so = pos;
      advance();
      emit('parenOpen', '(', sl, sc, so);
      continue;
    }
    if (ch === ')') {
      const sl = line; const sc = col; const so = pos;
      advance();
      emit('parenClose', ')', sl, sc, so);
      continue;
    }

    // Braces
    if (ch === '{') {
      const sl = line; const sc = col; const so = pos;
      advance();
      emit('braceOpen', '{', sl, sc, so);
      continue;
    }
    if (ch === '}') {
      const sl = line; const sc = col; const so = pos;
      advance();
      emit('braceClose', '}', sl, sc, so);
      continue;
    }

    // Brackets
    if (ch === '[') {
      const sl = line; const sc = col; const so = pos;
      advance();
      emit('bracketOpen', '[', sl, sc, so);
      continue;
    }
    if (ch === ']') {
      const sl = line; const sc = col; const so = pos;
      advance();
      emit('bracketClose', ']', sl, sc, so);
      continue;
    }

    // Comma
    if (ch === ',') {
      const sl = line; const sc = col; const so = pos;
      advance();
      emit('comma', ',', sl, sc, so);
      continue;
    }

    // Identifier
    if (isAlpha(ch)) {
      readIdentifier();
      continue;
    }

    // Unknown character — skip it
    advance();
  }

  // Emit remaining dedents
  while (indentStack.length > 1) {
    indentStack.pop();
    emit('dedent', '', line, col, pos);
  }

  // Emit EOF
  emit('eof', '', line, col, pos);

  return tokens;
}
