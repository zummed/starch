/**
 * CodeMirror 6 language extension for the Starch DSL.
 *
 * Uses StreamLanguage with tokenTable mapping to Lezer tags,
 * styled via HighlightStyle. Custom dsl-* token names are mapped
 * to distinct tag combinations for differentiated styling.
 */
import { StreamLanguage, type StringStream, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

// ─── Known keyword sets ──────────────────────────────────────────

const CLICKABLE_KEYWORDS = new Set([
  'rect', 'ellipse', 'text', 'image', 'camera',
  'fill', 'stroke', 'at',
]);

const DOC_KEYWORDS = new Set([
  'name', 'description', 'background', 'viewport', 'images',
  'style', 'animate', 'template', 'chapter',
  'path', 'layout', 'dash', 'slot',
]);

const BOOL_KEYWORDS = new Set([
  'bold', 'mono', 'closed', 'smooth', 'active', 'loop', 'autoKey',
]);

const NAMED_COLORS = new Set([
  'white', 'black', 'red', 'green', 'blue', 'yellow',
  'cyan', 'magenta', 'orange', 'purple', 'gray', 'grey',
]);

// ─── Tokenizer state ─────────────────────────────────────────────

interface DslState {
  inAnimate: boolean;
  lineStart: boolean;
  afterFillStroke: boolean;
  hslCount: number;
}

function startState(): DslState {
  return { inAnimate: false, lineStart: true, afterFillStroke: false, hslCount: 0 };
}

function token(stream: StringStream, state: DslState): string | null {
  if (stream.sol()) {
    state.lineStart = true;
    state.afterFillStroke = false;
    state.hslCount = 0;
  }

  if (stream.eatSpace()) return null;

  if (stream.match('//')) { stream.skipToEnd(); return 'comment'; }

  if (stream.peek() === '"') {
    stream.next();
    while (!stream.eol()) { const ch = stream.next(); if (ch === '"') break; if (ch === '\\') stream.next(); }
    return 'string';
  }

  if (stream.match(/#[0-9a-fA-F]{3,6}\b/)) return 'dsl-color';
  if (stream.peek() === '@') { stream.next(); stream.eatWhile(/[\w]/); return 'dsl-styleRef'; }
  if (stream.match('->')) return 'dsl-arrow';
  if (stream.match(/^\d+x\d+/)) return 'dsl-dimension';
  if (stream.peek() === '+' && stream.match(/^\+\d+(\.\d+)?/)) return 'dsl-timestamp';

  if (stream.match(/^-?\d+(\.\d+)?/)) {
    if (state.afterFillStroke && state.hslCount < 3) { state.hslCount++; return 'number'; }
    if (state.lineStart && state.inAnimate) { state.lineStart = false; return 'dsl-timestamp'; }
    return 'number';
  }

  if (stream.peek() === '=') { stream.next(); return 'operator'; }
  if (stream.match(/^[(){}\[\],;:]/)) return 'punctuation';

  if (stream.match(/^[\w]+/)) {
    const word = stream.current();

    if (state.lineStart && stream.peek() === ':') {
      state.lineStart = false;
      if (word === 'animate') state.inAnimate = true;
      if (DOC_KEYWORDS.has(word) || CLICKABLE_KEYWORDS.has(word)) return 'dsl-meta';
      return 'dsl-nodeId';
    }

    state.lineStart = false;

    if (CLICKABLE_KEYWORDS.has(word)) {
      if (word === 'fill' || word === 'stroke') { state.afterFillStroke = true; state.hslCount = 0; }
      return 'keyword';
    }
    if (DOC_KEYWORDS.has(word)) { if (word === 'animate') state.inAnimate = true; return 'dsl-meta'; }
    if (BOOL_KEYWORDS.has(word)) return 'atom';
    if (NAMED_COLORS.has(word) && state.afterFillStroke) { state.afterFillStroke = false; return 'dsl-color'; }
    if (stream.peek() === '=') return 'propertyName';
    return 'variableName';
  }

  stream.next();
  return null;
}

// ─── Language + tag mapping ──────────────────────────────────────

export const dslLanguage = StreamLanguage.define<DslState>({
  startState,
  token,
  tokenTable: {
    'dsl-dimension': tags.special(tags.number),
    'dsl-color': tags.color,
    'dsl-styleRef': tags.special(tags.variableName),
    'dsl-nodeId': tags.definition(tags.variableName),
    'dsl-arrow': tags.special(tags.operator),
    'dsl-timestamp': tags.special(tags.integer),
    'dsl-meta': tags.processingInstruction,
  },
  languageData: { commentTokens: { line: '//' } },
});

// ─── Highlight styles ────────────────────────────────────────────

export const dslHighlight = syntaxHighlighting(
  HighlightStyle.define([
    // Standard tokens (mapped automatically by StreamLanguage)
    { tag: tags.keyword, color: '#7aa2f7', fontWeight: 'bold' },
    { tag: tags.string, color: '#9ece6a' },
    { tag: tags.number, color: '#e0af68' },
    { tag: tags.atom, color: '#bb9af7' },
    { tag: tags.operator, color: '#6b7280' },
    { tag: tags.propertyName, color: '#73daca' },
    { tag: tags.variableName, color: '#c0caf5' },
    { tag: tags.comment, color: '#4a4f59', fontStyle: 'italic' },
    { tag: tags.punctuation, color: '#545a6a' },
    // Custom tokens (via tokenTable)
    { tag: tags.special(tags.number), color: '#ff9e64', fontWeight: 'bold' },          // dimensions
    { tag: tags.special(tags.integer), color: '#e0af68', fontStyle: 'italic' },        // timestamps
    { tag: tags.color, color: '#f7768e' },                                              // named/hex colors
    { tag: tags.special(tags.variableName), color: '#bb9af7', fontStyle: 'italic' },   // @style refs
    { tag: tags.definition(tags.variableName), color: '#c0caf5', fontWeight: 'bold' }, // node IDs
    { tag: tags.special(tags.operator), color: '#89ddff', fontWeight: 'bold' },        // arrows
    { tag: tags.processingInstruction, color: '#7aa2f7' },                              // doc keywords (no bold)
  ]),
);

// Empty — hover affordance removed since CM6 HighlightStyle uses
// auto-generated class names that can't be selectively targeted via CSS.
export const dslInteractiveTheme = {};
