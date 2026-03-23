/**
 * CodeMirror 6 language extension for the Starch DSL.
 *
 * ALL token names use the `dsl-` prefix so StreamLanguage generates
 * predictable `.tok-dsl-*` CSS classes (standard names like "keyword"
 * would be mapped to Lezer tags with auto-generated class names,
 * making them impossible to target for selective hover affordance).
 */
import { StreamLanguage, type StringStream } from '@codemirror/language';
import { EditorView } from '@codemirror/view';

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

  if (stream.match('//')) { stream.skipToEnd(); return 'dsl-comment'; }

  if (stream.peek() === '"') {
    stream.next();
    while (!stream.eol()) { const ch = stream.next(); if (ch === '"') break; if (ch === '\\') stream.next(); }
    return 'dsl-string';
  }

  if (stream.match(/#[0-9a-fA-F]{3,6}\b/)) return 'dsl-color';

  if (stream.peek() === '@') { stream.next(); stream.eatWhile(/[\w]/); return 'dsl-styleRef'; }

  if (stream.match('->')) return 'dsl-arrow';

  if (stream.match(/^\d+x\d+/)) return 'dsl-dimension';

  if (stream.peek() === '+' && stream.match(/^\+\d+(\.\d+)?/)) return 'dsl-timestamp';

  if (stream.match(/^-?\d+(\.\d+)?/)) {
    if (state.afterFillStroke && state.hslCount < 3) { state.hslCount++; return 'dsl-number'; }
    if (state.lineStart && state.inAnimate) { state.lineStart = false; return 'dsl-timestamp'; }
    return 'dsl-number';
  }

  if (stream.peek() === '=') { stream.next(); return 'dsl-operator'; }

  if (stream.match(/^[(){}\[\],;:]/)) return 'dsl-punctuation';

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
      return 'dsl-keyword';
    }

    if (DOC_KEYWORDS.has(word)) {
      if (word === 'animate') state.inAnimate = true;
      return 'dsl-meta';
    }

    if (BOOL_KEYWORDS.has(word)) return 'dsl-bool';

    if (NAMED_COLORS.has(word) && state.afterFillStroke) { state.afterFillStroke = false; return 'dsl-color'; }

    if (stream.peek() === '=') return 'dsl-propName';

    return 'dsl-ident';
  }

  stream.next();
  return null;
}

// ─── Language definition ─────────────────────────────────────────

// No tokenTable — custom names generate .tok-dsl-* CSS classes which we
// target directly in dslHighlight. StreamLanguage logs "Unknown highlighting tag"
// warnings for custom names but these are harmless (dev-only, no production impact).
export const dslLanguage = StreamLanguage.define<DslState>({
  startState,
  token,
  languageData: { commentTokens: { line: '//' } },
});

// ─── All styling via .tok-dsl-* CSS classes ──────────────────────

export const dslHighlight = EditorView.theme({
  // ── Colors ────────────────────────────────────────────
  '.tok-dsl-keyword':   { color: '#7aa2f7', fontWeight: 'bold' },
  '.tok-dsl-meta':      { color: '#7aa2f7' },
  '.tok-dsl-string':    { color: '#9ece6a' },
  '.tok-dsl-number':    { color: '#e0af68' },
  '.tok-dsl-bool':      { color: '#bb9af7' },
  '.tok-dsl-operator':  { color: '#6b7280' },
  '.tok-dsl-propName':  { color: '#73daca' },
  '.tok-dsl-ident':     { color: '#c0caf5' },
  '.tok-dsl-comment':   { color: '#4a4f59', fontStyle: 'italic' },
  '.tok-dsl-punctuation': { color: '#545a6a' },
  '.tok-dsl-dimension': { color: '#ff9e64', fontWeight: 'bold' },
  '.tok-dsl-color':     { color: '#f7768e' },
  '.tok-dsl-styleRef':  { color: '#bb9af7', fontStyle: 'italic' },
  '.tok-dsl-nodeId':    { color: '#c0caf5', fontWeight: 'bold' },
  '.tok-dsl-arrow':     { color: '#89ddff', fontWeight: 'bold' },
  '.tok-dsl-timestamp': { color: '#e0af68', fontStyle: 'italic' },

  // ── Hover affordance (clickable tokens only) ──────────
  // These tokens open popups when clicked:
  '.tok-dsl-keyword:hover, .tok-dsl-number:hover, .tok-dsl-dimension:hover, .tok-dsl-color:hover, .tok-dsl-bool:hover, .tok-dsl-propName:hover, .tok-dsl-styleRef:hover': {
    cursor: 'pointer',
    textDecoration: 'underline',
    textDecorationColor: 'rgba(122, 162, 247, 0.4)',
    textDecorationThickness: '1px',
    textUnderlineOffset: '3px',
  },
});

// Kept for backward compat (empty)
export const dslInteractiveTheme = EditorView.theme({});
