/**
 * CodeMirror 6 language extension for the Starch DSL.
 * Provides syntax highlighting with interactive affordance (hover underlines).
 */
import { StreamLanguage, type StringStream, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags, Tag } from '@lezer/highlight';
import { EditorView } from '@codemirror/view';

// ─── Custom tags for DSL-specific tokens ─────────────────────────

const dslTags = {
  dimension: Tag.define(),   // 140x80
  colorValue: Tag.define(),  // named color or hex
  styleRef: Tag.define(),    // @primary
  nodeId: Tag.define(),      // box: (the id before colon)
  arrow: Tag.define(),       // ->
  timestamp: Tag.define(),   // 0.0, +2.0 in animate blocks
};

// ─── Known keyword sets ──────────────────────────────────────────

const DOC_KEYWORDS = new Set([
  'name', 'description', 'background', 'viewport', 'images', 'style', 'animate', 'template', 'chapter',
]);

const GEOM_KEYWORDS = new Set([
  'rect', 'ellipse', 'text', 'image', 'camera', 'path',
]);

const PROP_KEYWORDS = new Set([
  'fill', 'stroke', 'at', 'layout', 'dash', 'slot',
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
  inString: boolean;
  inComment: boolean;
  inAnimate: boolean;
  lineStart: boolean;
  afterColon: boolean;
  afterFillStroke: boolean;
  hslCount: number; // how many HSL numbers consumed after fill/stroke
}

function startState(): DslState {
  return {
    inString: false,
    inComment: false,
    inAnimate: false,
    lineStart: true,
    afterColon: false,
    afterFillStroke: false,
    hslCount: 0,
  };
}

function token(stream: StringStream, state: DslState): string | null {
  // Track line start
  if (stream.sol()) {
    state.lineStart = true;
    state.afterColon = false;
    state.afterFillStroke = false;
    state.hslCount = 0;
  }

  // Skip whitespace
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
      if (ch === '\\') stream.next(); // skip escaped char
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

  // Dimensions NxN (must check before numbers to avoid consuming the first digit)
  if (stream.match(/^\d+x\d+/)) {
    return 'dsl-dimension';
  }

  // Numbers (including negative, floats)
  // Check for +N (relative time in animate)
  if (stream.peek() === '+' && stream.match(/^\+\d+(\.\d+)?/)) {
    return 'dsl-timestamp';
  }

  if (stream.match(/^-?\d+(\.\d+)?/)) {
    if (state.afterFillStroke && state.hslCount < 3) {
      state.hslCount++;
      return 'number';
    }
    // Check if this looks like a timestamp at line start in animate context
    if (state.lineStart && state.inAnimate) {
      state.lineStart = false;
      return 'dsl-timestamp';
    }
    return 'number';
  }

  // Equals sign (for key=value)
  if (stream.peek() === '=') {
    stream.next();
    return 'operator';
  }

  // Punctuation
  if (stream.match(/^[(){}\[\],;:]/)) {
    const ch = stream.current();
    if (ch === ':') state.afterColon = true;
    return 'punctuation';
  }

  // Words (identifiers, keywords)
  if (stream.match(/^[\w]+/)) {
    const word = stream.current();

    // Node ID: word followed by colon (at line start or indented)
    if (state.lineStart && stream.peek() === ':') {
      state.lineStart = false;
      if (DOC_KEYWORDS.has(word)) {
        if (word === 'animate') state.inAnimate = true;
        return 'keyword';
      }
      return 'dsl-nodeId';
    }

    state.lineStart = false;

    // Document/section keywords
    if (DOC_KEYWORDS.has(word)) {
      if (word === 'animate') state.inAnimate = true;
      return 'keyword';
    }

    // Geometry keywords
    if (GEOM_KEYWORDS.has(word)) {
      return 'keyword';
    }

    // Property keywords
    if (PROP_KEYWORDS.has(word)) {
      if (word === 'fill' || word === 'stroke') {
        state.afterFillStroke = true;
        state.hslCount = 0;
      }
      return 'keyword';
    }

    // Boolean keywords
    if (BOOL_KEYWORDS.has(word)) {
      return 'atom';
    }

    // Named colors (after fill/stroke)
    if (NAMED_COLORS.has(word) && state.afterFillStroke) {
      state.afterFillStroke = false;
      return 'dsl-color';
    }

    // Key in key=value
    if (stream.peek() === '=') {
      return 'propertyName';
    }

    // Easing names, other identifiers
    return 'variableName';
  }

  // Consume any other character
  stream.next();
  return null;
}

// ─── Language definition ─────────────────────────────────────────

export const dslLanguage = StreamLanguage.define<DslState>({
  startState,
  token,
  tokenTable: {
    'dsl-dimension': tags.special(tags.number),
    'dsl-color': tags.color,
    'dsl-styleRef': tags.special(tags.variableName),
    'dsl-nodeId': tags.definition(tags.variableName),
    'dsl-arrow': tags.special(tags.operator),
    'dsl-timestamp': tags.special(tags.number),
  },
  languageData: {
    commentTokens: { line: '//' },
  },
});

// ─── DSL-specific highlight styles ──────────────────────────────

export const dslHighlight = syntaxHighlighting(
  HighlightStyle.define([
    // Standard token types
    { tag: tags.keyword, color: '#7aa2f7', fontWeight: 'bold' },
    { tag: tags.string, color: '#9ece6a' },
    { tag: tags.number, color: '#e0af68' },
    { tag: tags.atom, color: '#bb9af7' },                        // booleans
    { tag: tags.operator, color: '#6b7280' },                     // = sign
    { tag: tags.propertyName, color: '#73daca' },                 // key in key=value
    { tag: tags.variableName, color: '#c0caf5' },                 // identifiers
    { tag: tags.comment, color: '#4a4f59', fontStyle: 'italic' },
    { tag: tags.punctuation, color: '#545a6a' },
    // Custom DSL tokens (via tokenTable mapping)
    { tag: tags.special(tags.number), color: '#ff9e64', fontWeight: 'bold' },  // dimensions, timestamps
    { tag: tags.color, color: '#f7768e' },                                      // named/hex colors
    { tag: tags.special(tags.variableName), color: '#bb9af7', fontStyle: 'italic' }, // @style refs
    { tag: tags.definition(tags.variableName), color: '#c0caf5', fontWeight: 'bold' }, // node IDs
    { tag: tags.special(tags.operator), color: '#89ddff', fontWeight: 'bold' }, // arrows
  ]),
);

// ─── Interactive hover affordance (CSS) ─────────────────────────

// (Custom token styles are now handled via tokenTable + HighlightStyle tags above)

export const dslInteractiveTheme = EditorView.theme({
  // All syntax-highlighted spans in DSL mode get hover affordance.
  // StreamLanguage wraps tokens in <span class="ͼ..."> elements.
  // We target any span with a class inside .cm-line.
  '.cm-line span[class]:hover': {
    textDecoration: 'underline',
    textDecorationColor: 'rgba(122, 162, 247, 0.35)',
    textDecorationThickness: '1px',
    textUnderlineOffset: '3px',
    cursor: 'pointer',
  },
  // Slightly stronger affordance for numbers, dimensions, colors
  '.cm-line .tok-number:hover, .cm-line .tok-dsl-dimension:hover, .cm-line .tok-dsl-color:hover': {
    textDecorationColor: 'rgba(224, 175, 104, 0.5)',
  },
  '.cm-line .tok-keyword:hover': {
    textDecorationColor: 'rgba(122, 162, 247, 0.5)',
  },
});
