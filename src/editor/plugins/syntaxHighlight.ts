/**
 * Syntax highlighting for DSL text via ProseMirror decorations.
 * Tokenizes the document text and creates inline decorations with CSS classes.
 */
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { tokenize } from '../../dsl/tokenizer';
import type { Token } from '../../dsl/types';

export const highlightKey = new PluginKey('syntaxHighlight');

const TOKEN_CLASS: Record<string, string> = {
  identifier: 'dsl-identifier',
  number: 'dsl-number',
  string: 'dsl-string',
  arrow: 'dsl-arrow',
  colon: 'dsl-colon',
  equals: 'dsl-operator',
  dot: 'dsl-operator',
  atSign: 'dsl-style-ref',
  plus: 'dsl-operator',
  dimensions: 'dsl-dimension',
  hexColor: 'dsl-color',
  comma: 'dsl-operator',
};

/** Keywords that get special highlighting. */
const KEYWORDS = new Set([
  'rect', 'ellipse', 'text', 'path', 'image', 'camera',
  'fill', 'stroke', 'opacity', 'visible', 'depth',
  'at', 'layout', 'dash', 'style', 'animate', 'template',
  'objects', 'styles', 'images',
  'name', 'description', 'background', 'viewport',
  'loop', 'easing', 'autoKey',
  'bold', 'mono', 'closed', 'smooth', 'active',
  'chapter',
]);

const GEOMETRY_KEYWORDS = new Set([
  'rect', 'ellipse', 'text', 'path', 'image', 'camera',
]);

function buildDecorations(doc: any): DecorationSet {
  const text = doc.textContent;
  if (!text) return DecorationSet.empty;

  let tokens: Token[];
  try {
    tokens = tokenize(text);
  } catch {
    return DecorationSet.empty;
  }

  // Text starts at PM position 1 inside the code_block.
  const offset = 1;

  const decorations: Decoration[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.type === 'newline' || tok.type === 'indent' || tok.type === 'dedent' || tok.type === 'eof') {
      continue;
    }

    const from = tok.offset + offset;
    const to = from + tok.value.length;
    if (from >= to) continue;

    let cls: string;

    if (tok.type === 'identifier') {
      if (GEOMETRY_KEYWORDS.has(tok.value)) {
        cls = 'dsl-keyword dsl-geometry';
      } else if (KEYWORDS.has(tok.value)) {
        cls = 'dsl-keyword';
      } else {
        // Check if this identifier is followed by a colon (node ID)
        const next = tokens[i + 1];
        if (next && next.type === 'colon') {
          cls = 'dsl-node-id';
        } else {
          cls = 'dsl-identifier';
        }
      }
    } else if (tok.type === 'string') {
      // String tokens don't include quotes in value, but we want to highlight the quotes too.
      // The token offset points to the opening quote. value length doesn't include quotes.
      cls = 'dsl-string';
      // Extend range to cover quotes
      decorations.push(Decoration.inline(from, to + 2, { class: cls }));
      continue;
    } else if (tok.type === 'hexColor') {
      cls = 'dsl-color';
    } else if (tok.type === 'atSign') {
      // Highlight @styleName — the @ and the following identifier
      const next = tokens[i + 1];
      if (next && next.type === 'identifier') {
        const end = next.offset + next.value.length + offset;
        decorations.push(Decoration.inline(from, end, { class: 'dsl-style-ref' }));
        i++; // skip the identifier
        continue;
      }
      cls = 'dsl-style-ref';
    } else {
      cls = TOKEN_CLASS[tok.type] ?? '';
    }

    if (cls) {
      decorations.push(Decoration.inline(from, to, { class: cls }));
    }
  }

  return DecorationSet.create(doc, decorations);
}

export function syntaxHighlightPlugin(): Plugin {
  return new Plugin({
    key: highlightKey,
    state: {
      init(_, state) {
        return buildDecorations(state.doc);
      },
      apply(tr, decos) {
        if (tr.docChanged) {
          return buildDecorations(tr.doc);
        }
        return decos.map(tr.mapping, tr.doc);
      },
    },
    props: {
      decorations(state) {
        return highlightKey.getState(state);
      },
    },
  });
}
