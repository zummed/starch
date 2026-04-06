import { describe, it, expect } from 'vitest';
import { tokenize } from '../../dsl/tokenizer';
import type { Token, TokenType } from '../../dsl/types';

/** Helper: extract just [type, value] pairs, filtering out eof */
function tv(tokens: Token[]): [TokenType, string][] {
  return tokens
    .filter((t) => t.type !== 'eof')
    .map((t) => [t.type, t.value]);
}

/** Helper: extract just types, filtering out eof */
function types(tokens: Token[]): TokenType[] {
  return tokens.filter((t) => t.type !== 'eof').map((t) => t.type);
}

describe('tokenizer', () => {
  // ── Simple node ───────────────────────────────────────────────
  it('tokenizes a simple node declaration', () => {
    const tokens = tokenize('box: rect 160x100 at 200,150');
    expect(tv(tokens)).toEqual([
      ['identifier', 'box'],
      ['colon', ':'],
      ['identifier', 'rect'],
      ['dimensions', '160x100'],
      ['identifier', 'at'],
      ['number', '200'],
      ['comma', ','],
      ['number', '150'],
    ]);
  });

  // ── Arrow ─────────────────────────────────────────────────────
  it('tokenizes arrows', () => {
    const tokens = tokenize('link: a -> b');
    expect(tv(tokens)).toEqual([
      ['identifier', 'link'],
      ['colon', ':'],
      ['identifier', 'a'],
      ['arrow', '->'],
      ['identifier', 'b'],
    ]);
  });

  // ── Style reference (@) ───────────────────────────────────────
  it('tokenizes style references with @', () => {
    const tokens = tokenize('@primary');
    expect(tv(tokens)).toEqual([
      ['atSign', '@'],
      ['identifier', 'primary'],
    ]);
  });

  // ── Fill with HSL numbers ─────────────────────────────────────
  it('tokenizes fill with HSL numbers', () => {
    const tokens = tokenize('fill 210 70 45');
    expect(tv(tokens)).toEqual([
      ['identifier', 'fill'],
      ['number', '210'],
      ['number', '70'],
      ['number', '45'],
    ]);
  });

  // ── Hex color ─────────────────────────────────────────────────
  it('tokenizes hex colors', () => {
    const tokens = tokenize('fill #3B82F6');
    expect(tv(tokens)).toEqual([
      ['identifier', 'fill'],
      ['hexColor', '#3B82F6'],
    ]);
  });

  it('tokenizes 3-char hex colors', () => {
    const tokens = tokenize('#FFF');
    expect(tv(tokens)).toEqual([
      ['hexColor', '#FFF'],
    ]);
  });

  // ── Key=value ─────────────────────────────────────────────────
  it('tokenizes key=value pairs', () => {
    const tokens = tokenize('radius=8');
    expect(tv(tokens)).toEqual([
      ['identifier', 'radius'],
      ['equals', '='],
      ['number', '8'],
    ]);
  });

  // ── Indentation ───────────────────────────────────────────────
  it('produces indent/dedent tokens for indentation changes', () => {
    const input = [
      'style primary',
      '  fill 210 70 45',
      '  stroke 210 80 30',
    ].join('\n');
    const tokens = tokenize(input);
    const t = types(tokens);
    // After newline following "style primary", we get indent
    expect(t).toContain('indent');
    // At EOF, we get a dedent to close
    expect(t).toContain('dedent');
  });

  it('handles nested indentation', () => {
    const input = [
      'a',
      '  b',
      '    c',
      'd',
    ].join('\n');
    const tokens = tokenize(input);
    const t = types(tokens);
    // Two indent increases, two dedents at the end
    const indents = t.filter((x) => x === 'indent').length;
    const dedents = t.filter((x) => x === 'dedent').length;
    expect(indents).toBe(2);
    expect(dedents).toBe(2);
  });

  // ── Double-dot ────────────────────────────────────────────────
  it('tokenizes double-dot for property traversal', () => {
    const tokens = tokenize('card..h');
    expect(tv(tokens)).toEqual([
      ['identifier', 'card'],
      ['doubleDot', '..'],
      ['identifier', 'h'],
    ]);
  });

  // ── Single dot ────────────────────────────────────────────────
  it('tokenizes single dot for property access', () => {
    const tokens = tokenize('card.badge');
    expect(tv(tokens)).toEqual([
      ['identifier', 'card'],
      ['dot', '.'],
      ['identifier', 'badge'],
    ]);
  });

  // ── String with escapes ───────────────────────────────────────
  it('tokenizes strings with escape sequences', () => {
    const tokens = tokenize('"hello \\"world\\""');
    expect(tv(tokens)).toEqual([
      ['string', 'hello "world"'],
    ]);
  });

  it('handles \\n and \\t escapes in strings', () => {
    const tokens = tokenize('"line1\\nline2\\ttab"');
    expect(tv(tokens)).toEqual([
      ['string', 'line1\nline2\ttab'],
    ]);
  });

  // ── Coordinate tuples ─────────────────────────────────────────
  it('tokenizes coordinate tuples', () => {
    const tokens = tokenize('(250,100)');
    expect(tv(tokens)).toEqual([
      ['parenOpen', '('],
      ['number', '250'],
      ['comma', ','],
      ['number', '100'],
      ['parenClose', ')'],
    ]);
  });

  // ── Relative time ─────────────────────────────────────────────
  it('tokenizes relative time with +', () => {
    const tokens = tokenize('+2.0');
    expect(tv(tokens)).toEqual([
      ['plus', '+'],
      ['number', '2.0'],
    ]);
  });

  // ── Comments ──────────────────────────────────────────────────
  it('skips comments', () => {
    const tokens = tokenize('// comment\nbox: rect');
    expect(tv(tokens)).toEqual([
      ['identifier', 'box'],
      ['colon', ':'],
      ['identifier', 'rect'],
    ]);
  });

  it('skips inline comments', () => {
    const tokens = tokenize('box: rect // a box');
    expect(tv(tokens)).toEqual([
      ['identifier', 'box'],
      ['colon', ':'],
      ['identifier', 'rect'],
    ]);
  });

  // ── Dimensions ────────────────────────────────────────────────
  it('tokenizes dimensions as a single token', () => {
    const tokens = tokenize('160x100');
    expect(tokens.length).toBe(2); // dimensions + eof
    expect(tokens[0].type).toBe('dimensions');
    expect(tokens[0].value).toBe('160x100');
  });

  it('does not treat identifier-x-number as dimensions', () => {
    // 'ax100' should be identifier, not dimensions
    const tokens = tokenize('ax100');
    expect(tokens[0].type).toBe('identifier');
  });

  // ── Negative numbers ──────────────────────────────────────────
  it('tokenizes negative numbers', () => {
    const tokens = tokenize('-10');
    expect(tv(tokens)).toEqual([
      ['number', '-10'],
    ]);
  });

  it('tokenizes negative float numbers', () => {
    const tokens = tokenize('-3.14');
    expect(tv(tokens)).toEqual([
      ['number', '-3.14'],
    ]);
  });

  // ── Multiple dedents ──────────────────────────────────────────
  it('emits multiple dedents when going from deep indent to zero', () => {
    const input = [
      'a',
      '  b',
      '    c',
      '      d',
      'e',
    ].join('\n');
    const tokens = tokenize(input);
    const t = types(tokens);
    const dedents = t.filter((x) => x === 'dedent').length;
    expect(dedents).toBe(3);
  });

  // ── EOF produces remaining dedents + eof ──────────────────────
  it('emits remaining dedents at EOF', () => {
    const input = [
      'a',
      '  b',
      '    c',
    ].join('\n');
    const tokens = tokenize(input);
    // Last token should be eof
    expect(tokens[tokens.length - 1].type).toBe('eof');
    // Second-to-last and third-to-last should be dedents
    const lastFew = tokens.slice(-3);
    expect(lastFew[0].type).toBe('dedent');
    expect(lastFew[1].type).toBe('dedent');
    expect(lastFew[2].type).toBe('eof');
  });

  // ── Blank lines are skipped ───────────────────────────────────
  it('skips blank lines', () => {
    const input = 'a\n\n\nb';
    const tokens = tokenize(input);
    expect(tv(tokens)).toEqual([
      ['identifier', 'a'],
      ['newline', '\n'],
      ['identifier', 'b'],
    ]);
  });

  // ── JSON brace blocks ─────────────────────────────────────────
  it('tokenizes JSON brace blocks', () => {
    const tokens = tokenize('layout={ type: "flex" }');
    const typeList = types(tokens);
    expect(typeList).toContain('braceOpen');
    expect(typeList).toContain('braceClose');
    // Should have the string "flex" inside
    const strToken = tokens.find((t) => t.type === 'string');
    expect(strToken).toBeDefined();
    expect(strToken!.value).toBe('flex');
  });

  // ── Position tracking ─────────────────────────────────────────
  it('tracks line and column numbers', () => {
    const tokens = tokenize('a b\nc d');
    // 'a' at line 1, col 1
    expect(tokens[0].line).toBe(1);
    expect(tokens[0].col).toBe(1);
    // 'b' at line 1, col 3
    expect(tokens[1].line).toBe(1);
    expect(tokens[1].col).toBe(3);
    // 'c' at line 2, col 1
    // There's a newline token between
    const cToken = tokens.find((t) => t.value === 'c');
    expect(cToken).toBeDefined();
    expect(cToken!.line).toBe(2);
    expect(cToken!.col).toBe(1);
  });

  // ── Comprehensive DSL snippet ─────────────────────────────────
  it('tokenizes a realistic DSL snippet', () => {
    const input = [
      'name "My Diagram"',
      'viewport 600x400',
      '',
      'style primary',
      '  fill 210 70 45',
      '  stroke 210 80 30 width=2',
    ].join('\n');
    const tokens = tokenize(input);
    const t = tv(tokens);

    // First line: name "My Diagram"
    expect(t[0]).toEqual(['identifier', 'name']);
    expect(t[1]).toEqual(['string', 'My Diagram']);

    // Newline
    expect(t[2]).toEqual(['newline', '\n']);

    // Second line: viewport 600x400
    expect(t[3]).toEqual(['identifier', 'viewport']);
    expect(t[4]).toEqual(['dimensions', '600x400']);

    // After blank line and "style primary", then indent
    // Find 'style' token
    const styleIdx = t.findIndex(([type, val]) => type === 'identifier' && val === 'style');
    expect(styleIdx).toBeGreaterThan(0);
    expect(t[styleIdx + 1]).toEqual(['identifier', 'primary']);
  });

  // ── Complex path expression ───────────────────────────────────
  it('tokenizes path coordinates', () => {
    const tokens = tokenize('tri: path (0,-40) (40,30) (-40,30) closed');
    const t = tv(tokens);
    expect(t[0]).toEqual(['identifier', 'tri']);
    expect(t[1]).toEqual(['colon', ':']);
    expect(t[2]).toEqual(['identifier', 'path']);
    expect(t[3]).toEqual(['parenOpen', '(']);
    expect(t[4]).toEqual(['number', '0']);
    expect(t[5]).toEqual(['comma', ',']);
    expect(t[6]).toEqual(['number', '-40']);
    expect(t[7]).toEqual(['parenClose', ')']);
  });

  // ── Animate block ─────────────────────────────────────────────
  it('tokenizes animate block with property paths', () => {
    const input = [
      'animate 3s loop easing=easeInOut',
      '  card.badge:',
      '    0.0  fill.h: 120',
    ].join('\n');
    const tokens = tokenize(input);
    const t = tv(tokens);

    // Should contain identifier 'animate', identifier '3s', etc.
    expect(t[0]).toEqual(['identifier', 'animate']);
    // '3s' is an identifier (not a number because of the 's' suffix)
    expect(t[1]).toEqual(['identifier', '3s']);
  });

  // ── Negative number after comma (not standalone minus) ────────
  it('tokenizes negative number after comma in tuple', () => {
    const tokens = tokenize('(10,-20)');
    expect(tv(tokens)).toEqual([
      ['parenOpen', '('],
      ['number', '10'],
      ['comma', ','],
      ['number', '-20'],
      ['parenClose', ')'],
    ]);
  });

  // ── Dot inside property path ──────────────────────────────────
  it('tokenizes dotted property paths', () => {
    const tokens = tokenize('fill.h:');
    expect(tv(tokens)).toEqual([
      ['identifier', 'fill'],
      ['dot', '.'],
      ['identifier', 'h'],
      ['colon', ':'],
    ]);
  });

  // ── Plus with space before number ─────────────────────────────
  it('tokenizes plus as separate token', () => {
    const tokens = tokenize('+2.0  cam..zoom: 2');
    const t = tv(tokens);
    expect(t[0]).toEqual(['plus', '+']);
    expect(t[1]).toEqual(['number', '2.0']);
    expect(t[2]).toEqual(['identifier', 'cam']);
    expect(t[3]).toEqual(['doubleDot', '..']);
    expect(t[4]).toEqual(['identifier', 'zoom']);
    expect(t[5]).toEqual(['colon', ':']);
    expect(t[6]).toEqual(['number', '2']);
  });

  // ── Link with multiple waypoints ──────────────────────────────
  it('tokenizes links with waypoints', () => {
    const tokens = tokenize('link: a -> (250,100) -> b smooth radius=15');
    const t = tv(tokens);
    expect(t).toContainEqual(['arrow', '->']);
    expect(t).toContainEqual(['parenOpen', '(']);
    expect(t).toContainEqual(['identifier', 'smooth']);
    expect(t).toContainEqual(['equals', '=']);
  });

  // ── Edge: identifier starting with number-like prefix ─────────
  it('does not confuse identifiers with number prefixes', () => {
    // '3s' should be an identifier (has letters)
    const tokens = tokenize('3s');
    // Actually '3s' starts with a digit — tokenizer should read '3' as number
    // and 's' as identifier. Let's verify the correct behavior:
    // '3s' — the 3 is a number, the s is a separate identifier? Or is it one token?
    // In our DSL, things like '3s' (3 seconds) appear. We treat identifiers as
    // starting with [a-zA-Z_], so '3' would be a number and 's' an identifier.
    // But the spec says "3s" appears as a unit. Let's handle it: if a number is
    // immediately followed by letters, it should be an identifier.
    // Actually the test above for animate says '3s' is an identifier. Let's match.
    expect(tokens[0].type).toBe('identifier');
    expect(tokens[0].value).toBe('3s');
  });
});
