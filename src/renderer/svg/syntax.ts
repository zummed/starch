import Prism from 'prismjs';

// Import bundled language grammars
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-markup'; // HTML/XML
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-markdown';

// ── Dark theme colours ──

const THEME: Record<string, string> = {
  keyword:      '#c678dd',
  string:       '#98c379',
  comment:      '#4a4f59',
  number:       '#d19a66',
  function:     '#61afef',
  operator:     '#56b6c2',
  punctuation:  '#5a5f69',
  boolean:      '#d19a66',
  'class-name': '#e5c07b',
  builtin:      '#e06c75',
  property:     '#e06c75',
  regex:        '#98c379',
  tag:          '#e06c75',
  'attr-name':  '#d19a66',
  'attr-value': '#98c379',
  selector:     '#e06c75',
  constant:     '#d19a66',
  symbol:       '#61afef',
  parameter:    '#e06c75',
  'template-string': '#98c379',
  'template-punctuation': '#98c379',
};

const DEFAULT_COLOR = '#b0b5be';

// ── Language aliases ──

const ALIASES: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  yml: 'yaml',
  sh: 'bash',
  shell: 'bash',
  html: 'markup',
  xml: 'markup',
  htm: 'markup',
  svg: 'markup',
  md: 'markdown',
};

// ── Token interface ──

export interface SyntaxToken {
  text: string;
  color: string;
}

/**
 * Resolve a token type to a colour from the theme.
 * Prism token types can be nested (e.g., "token string").
 */
function tokenColor(type: string): string {
  if (THEME[type]) return THEME[type];
  // Try last segment (e.g., "token string" → "string")
  const last = type.split(' ').pop();
  if (last && THEME[last]) return THEME[last];
  return DEFAULT_COLOR;
}

/**
 * Flatten Prism tokens into a flat list of { text, color } segments.
 */
function flattenTokens(
  tokens: (string | Prism.Token)[],
  parentType?: string,
): SyntaxToken[] {
  const result: SyntaxToken[] = [];
  for (const token of tokens) {
    if (typeof token === 'string') {
      result.push({ text: token, color: parentType ? tokenColor(parentType) : DEFAULT_COLOR });
    } else {
      const type = parentType ? `${parentType} ${token.type}` : token.type;
      if (Array.isArray(token.content)) {
        result.push(...flattenTokens(token.content as (string | Prism.Token)[], type));
      } else if (typeof token.content === 'string') {
        result.push({ text: token.content, color: tokenColor(type) });
      } else {
        result.push(...flattenTokens([token.content as Prism.Token], type));
      }
    }
  }
  return result;
}

/**
 * Tokenize a line of code into coloured segments.
 * Returns a flat array of { text, color } tokens.
 * Falls back to plain text if the language is unknown.
 */
export function tokenizeLine(line: string, syntax: string, defaultColor = DEFAULT_COLOR): SyntaxToken[] {
  const lang = ALIASES[syntax] || syntax;
  const grammar = Prism.languages[lang];
  if (!grammar) {
    return [{ text: line, color: defaultColor }];
  }
  const tokens = Prism.tokenize(line, grammar);
  const flat = flattenTokens(tokens);
  // Ensure we return at least something
  return flat.length > 0 ? flat : [{ text: line, color: defaultColor }];
}

/**
 * Get list of supported syntax languages.
 */
export function supportedLanguages(): string[] {
  return Object.keys(Prism.languages).filter(k => typeof Prism.languages[k] === 'object');
}
