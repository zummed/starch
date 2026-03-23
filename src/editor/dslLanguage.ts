/**
 * CodeMirror 6 language extension for the Starch DSL.
 * Provides syntax highlighting with hover affordance on clickable tokens only.
 *
 * Uses StreamLanguage WITHOUT tokenTable so that .tok-* CSS classes are
 * generated, giving us precise control over which tokens get hover effects.
 */
import { StreamLanguage, type StringStream } from '@codemirror/language';
import { EditorView } from '@codemirror/view';

// ─── Token names ─────────────────────────────────────────────────
// Clickable tokens (get hover affordance):
//   keyword        — clickable keywords: rect, ellipse, fill, stroke, at, etc.
//   number         — numeric values (HSL, key=value, coordinates)
//   dsl-dimension  — WxH shorthand (140x80)
//   dsl-color      — named/hex colors
//   atom           — boolean keywords (bold, smooth, active)
//   propertyName   — key in key=value (radius=, width=)
//   dsl-styleRef   — @stylename
//
// Non-clickable tokens (no hover):
//   dsl-meta       — document/section keywords (name, style, animate)
//   dsl-nodeId     — node ID before colon (box:)
//   dsl-arrow      — connection arrow (->)
//   dsl-timestamp  — animation timestamps (0.0, +2.0)
//   string         — quoted strings
//   comment        — line comments
//   variableName   — identifiers (animation refs, easing names)
//   operator       — equals sign
//   punctuation    — colons, parens, braces, commas

// ─── Known keyword sets ──────────────────────────────────────────

const CLICKABLE_KEYWORDS = new Set([
  'rect', 'ellipse', 'text', 'image', 'camera',  // geometry → compound popup
  'fill', 'stroke', 'at',                          // property → compound popup
]);

const DOC_KEYWORDS = new Set([
  'name', 'description', 'background', 'viewport', 'images',
  'style', 'animate', 'template', 'chapter',
  'path', 'layout', 'dash', 'slot',  // these don't open popups
]);

const BOOL_KEYWORDS = new Set([
  'bold', 'mono', 'closed', 'smooth', 'active', 'loop', 'autoKey',
]);

const NAMED_COLORS = new Set([
  'white', 'black', 'red', 'green', 'blue', 'yellow',
  'cyan', 'magenta', 'orange', 'purple', 'gray', 'grey',
]);

// ─── Stream tokenizer state ─────────────────────────────────────

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

  // Comments
  if (stream.match('//')) {
    stream.skipToEnd();
    return 'comment';
  }

  // Strings
  if (stream.peek() === '"') {
    stream.next();
    while (!stream.eol()) {
      const ch = stream.next();
      if (ch === '"') break;
      if (ch === '\\') stream.next();
    }
    return 'string';
  }

  // Hex colors
  if (stream.match(/#[0-9a-fA-F]{3,6}\b/)) {
    return 'dsl-color';
  }

  // Style reference @name
  if (stream.peek() === '@') {
    stream.next();
    stream.eatWhile(/[\w]/);
    return 'dsl-styleRef';
  }

  // Arrow ->
  if (stream.match('->')) {
    return 'dsl-arrow';
  }

  // Dimensions NxN
  if (stream.match(/^\d+x\d+/)) {
    return 'dsl-dimension';
  }

  // Relative time +N
  if (stream.peek() === '+' && stream.match(/^\+\d+(\.\d+)?/)) {
    return 'dsl-timestamp';
  }

  // Numbers
  if (stream.match(/^-?\d+(\.\d+)?/)) {
    if (state.afterFillStroke && state.hslCount < 3) {
      state.hslCount++;
      return 'number';
    }
    if (state.lineStart && state.inAnimate) {
      state.lineStart = false;
      return 'dsl-timestamp';
    }
    return 'number';
  }

  // Equals
  if (stream.peek() === '=') {
    stream.next();
    return 'operator';
  }

  // Punctuation
  if (stream.match(/^[(){}\[\],;:]/)) {
    return 'punctuation';
  }

  // Words
  if (stream.match(/^[\w]+/)) {
    const word = stream.current();

    // Node ID (word before colon at line start)
    if (state.lineStart && stream.peek() === ':') {
      state.lineStart = false;
      if (word === 'animate') state.inAnimate = true;
      if (DOC_KEYWORDS.has(word) || CLICKABLE_KEYWORDS.has(word)) {
        return 'dsl-meta';
      }
      return 'dsl-nodeId';
    }

    state.lineStart = false;

    // Clickable keywords
    if (CLICKABLE_KEYWORDS.has(word)) {
      if (word === 'fill' || word === 'stroke') {
        state.afterFillStroke = true;
        state.hslCount = 0;
      }
      return 'keyword';
    }

    // Document/section keywords (not clickable)
    if (DOC_KEYWORDS.has(word)) {
      if (word === 'animate') state.inAnimate = true;
      return 'dsl-meta';
    }

    // Boolean keywords (clickable)
    if (BOOL_KEYWORDS.has(word)) {
      return 'atom';
    }

    // Named colors after fill/stroke (clickable)
    if (NAMED_COLORS.has(word) && state.afterFillStroke) {
      state.afterFillStroke = false;
      return 'dsl-color';
    }

    // Key in key=value (clickable)
    if (stream.peek() === '=') {
      return 'propertyName';
    }

    // Other identifiers (not clickable)
    return 'variableName';
  }

  stream.next();
  return null;
}

// ─── Language definition (no tokenTable → generates .tok-* classes) ───

export const dslLanguage = StreamLanguage.define<DslState>({
  startState,
  token,
  languageData: {
    commentTokens: { line: '//' },
  },
});

// ─── All styling via CSS (colors + selective hover) ──────────────

export const dslHighlight = EditorView.theme({
  // ── Token colors ──────────────────────────────────────
  '.tok-keyword':       { color: '#7aa2f7', fontWeight: 'bold' },
  '.tok-dsl-meta':      { color: '#7aa2f7' },                      // same blue, no bold
  '.tok-string':        { color: '#9ece6a' },
  '.tok-number':        { color: '#e0af68' },
  '.tok-atom':          { color: '#bb9af7' },
  '.tok-operator':      { color: '#6b7280' },
  '.tok-propertyName':  { color: '#73daca' },
  '.tok-variableName':  { color: '#c0caf5' },
  '.tok-comment':       { color: '#4a4f59', fontStyle: 'italic' },
  '.tok-punctuation':   { color: '#545a6a' },
  '.tok-dsl-dimension': { color: '#ff9e64', fontWeight: 'bold' },
  '.tok-dsl-color':     { color: '#f7768e' },
  '.tok-dsl-styleRef':  { color: '#bb9af7', fontStyle: 'italic' },
  '.tok-dsl-nodeId':    { color: '#c0caf5', fontWeight: 'bold' },
  '.tok-dsl-arrow':     { color: '#89ddff', fontWeight: 'bold' },
  '.tok-dsl-timestamp': { color: '#e0af68', fontStyle: 'italic' },

  // ── Hover affordance (clickable tokens only) ──────────
  '.tok-keyword:hover, .tok-number:hover, .tok-dsl-dimension:hover, .tok-dsl-color:hover, .tok-atom:hover, .tok-propertyName:hover, .tok-dsl-styleRef:hover': {
    cursor: 'pointer',
    textDecoration: 'underline',
    textDecorationColor: 'rgba(122, 162, 247, 0.4)',
    textDecorationThickness: '1px',
    textUnderlineOffset: '3px',
  },
});

// Kept as a named export for backward compat (now empty — styles are in dslHighlight)
export const dslInteractiveTheme = EditorView.theme({});
