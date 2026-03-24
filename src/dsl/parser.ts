import JSON5 from 'json5';
import { tokenize } from './tokenizer';
import { resolveNamedColor } from '../types/color';
import type { Color } from '../types/properties';
import type { Token, TokenType } from './types';
import type { FormatHints } from './formatHints';
import { emptyFormatHints } from './formatHints';

// ─── Token Stream ────────────────────────────────────────────────

class TokenStream {
  private tokens: Token[];
  private pos: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek(offset = 0): Token {
    const idx = this.pos + offset;
    if (idx >= this.tokens.length) return this.tokens[this.tokens.length - 1]; // eof
    return this.tokens[idx];
  }

  next(): Token {
    const tok = this.tokens[this.pos];
    if (this.pos < this.tokens.length - 1) this.pos++;
    return tok;
  }

  is(type: TokenType, value?: string): boolean {
    const tok = this.peek();
    if (tok.type !== type) return false;
    if (value !== undefined && tok.value !== value) return false;
    return true;
  }

  eat(type: TokenType, value?: string): Token | null {
    if (this.is(type, value)) return this.next();
    return null;
  }

  expect(type: TokenType, value?: string): Token {
    const tok = this.next();
    if (tok.type !== type || (value !== undefined && tok.value !== value)) {
      throw new Error(
        `Expected ${type}${value ? ` "${value}"` : ''} but got ${tok.type} "${tok.value}" at line ${tok.line}:${tok.col}`
      );
    }
    return tok;
  }

  atEnd(): boolean {
    return this.peek().type === 'eof';
  }

  skipNewlines(): void {
    while (this.is('newline')) this.next();
  }
}

// ─── Known block-property keywords ──────────────────────────────

const BLOCK_PROP_KEYWORDS = new Set([
  'fill', 'stroke', 'layout', 'dash',
]);

// Known geometry keywords
const GEOM_KEYWORDS = new Set([
  'rect', 'ellipse', 'text', 'image', 'camera', 'path',
]);

// Known boolean keywords that apply to text geometry
const TEXT_BOOLEANS = new Set(['bold', 'mono']);

// Known boolean keywords that apply to path geometry
const PATH_BOOLEANS = new Set(['closed', 'smooth']);

// Known boolean keywords at node level
const NODE_BOOLEANS = new Set(['active']);

// Properties that go into transform
const TRANSFORM_PROPS = new Set(['rotation', 'scale', 'anchor', 'pathFollow', 'pathProgress']);

// Properties that go into camera
const CAMERA_PROPS = new Set(['look', 'zoom', 'ratio', 'active']);

// Free-floating key=value properties allowed at the node level
const FREE_FLOATING_PROPS = new Set(['opacity', 'depth', 'visible']);

// Geometry-scoped key=value properties
const RECT_PROPS = new Set(['radius']);
const TEXT_PROPS = new Set(['size', 'lineHeight', 'align']);
const IMAGE_PROPS = new Set(['fit']);
const PATH_PROPS = new Set(['radius', 'bend', 'drawProgress', 'gap', 'fromGap', 'toGap']);

// Top-level document keywords (not node IDs)
const DOC_KEYWORDS = new Set([
  'name', 'description', 'background', 'viewport', 'images', 'style', 'animate',
]);

// ─── Color Parsing ──────────────────────────────────────────────

function tryParseAlpha(s: TokenStream): number | null {
  if (s.is('identifier', 'a') && s.peek(1).type === 'equals') {
    s.next(); // 'a'
    s.next(); // '='
    return parseFloat(s.expect('number').value);
  }
  return null;
}

function tryParseColor(s: TokenStream): Color | null {
  // HSL prefix: hsl N N N
  if (s.is('identifier', 'hsl') && s.peek(1).type === 'number' && s.peek(2).type === 'number' && s.peek(3).type === 'number') {
    s.next(); // consume 'hsl'
    const h = parseFloat(s.next().value);
    const sat = parseFloat(s.next().value);
    const l = parseFloat(s.next().value);
    const alpha = tryParseAlpha(s);
    if (alpha !== null) return { h, s: sat, l, a: alpha };
    return { h, s: sat, l };
  }

  // RGB prefix: rgb N N N
  if (s.is('identifier', 'rgb') && s.peek(1).type === 'number' && s.peek(2).type === 'number' && s.peek(3).type === 'number') {
    s.next(); // consume 'rgb'
    const r = parseFloat(s.next().value);
    const g = parseFloat(s.next().value);
    const b = parseFloat(s.next().value);
    const alpha = tryParseAlpha(s);
    if (alpha !== null) return { r, g, b, a: alpha };
    return { r, g, b };
  }

  // Named color (must check AFTER hsl/rgb prefixes)
  if (s.is('identifier')) {
    const name = s.peek().value;
    if (resolveNamedColor(name)) {
      s.next();
      const alpha = tryParseAlpha(s);
      if (alpha !== null) return { name, a: alpha };
      return name;
    }
    return null;
  }

  // Hex color
  if (s.is('hexColor')) {
    const hex = s.next().value;
    const alpha = tryParseAlpha(s);
    if (alpha !== null) return { hex, a: alpha };
    return hex;
  }

  // Bare three numbers → RGB (BREAKING CHANGE: was HSL)
  if (s.is('number') && s.peek(1).type === 'number' && s.peek(2).type === 'number') {
    const r = parseFloat(s.next().value);
    const g = parseFloat(s.next().value);
    const b = parseFloat(s.next().value);
    const alpha = tryParseAlpha(s);
    if (alpha !== null) return { r, g, b, a: alpha };
    return { r, g, b };
  }

  return null;
}

// ─── Key=Value Parsing ──────────────────────────────────────────

function parseKeyValue(s: TokenStream): [string, any] | null {
  if (!s.is('identifier') || s.peek(1).type !== 'equals') return null;
  const key = s.next().value;
  s.next(); // '='

  // JSON escape hatch: key={...}
  if (s.is('braceOpen')) {
    const json = parseJsonEscapeHatch(s);
    return [key, json];
  }

  // Tuple value: key=(x,y)
  if (s.is('parenOpen')) {
    const tuple = parseTuple(s);
    return [key, tuple];
  }

  // Boolean values
  if (s.is('identifier', 'true')) {
    s.next();
    return [key, true];
  }
  if (s.is('identifier', 'false')) {
    s.next();
    return [key, false];
  }

  // Number value
  if (s.is('number')) {
    return [key, parseFloat(s.next().value)];
  }

  // String value
  if (s.is('string')) {
    return [key, s.next().value];
  }

  // Bare identifier as string value
  if (s.is('identifier')) {
    return [key, s.next().value];
  }

  throw new Error(`Expected value after "${key}=" at line ${s.peek().line}`);
}

// ─── JSON Escape Hatch ──────────────────────────────────────────

function parseJsonEscapeHatch(s: TokenStream): any {
  // Collect all tokens from { to matching }
  let depth = 0;
  let jsonStr = '';
  while (!s.atEnd()) {
    const tok = s.peek();
    if (tok.type === 'braceOpen') {
      depth++;
      jsonStr += '{';
      s.next();
    } else if (tok.type === 'braceClose') {
      depth--;
      jsonStr += '}';
      s.next();
      if (depth === 0) break;
    } else {
      // Reconstruct the token as text
      if (tok.type === 'string') {
        jsonStr += `"${tok.value}"`;
      } else if (tok.type === 'colon') {
        jsonStr += ':';
      } else if (tok.type === 'comma') {
        jsonStr += ',';
      } else if (tok.type === 'parenOpen') {
        jsonStr += '(';
      } else if (tok.type === 'parenClose') {
        jsonStr += ')';
      } else {
        jsonStr += tok.value;
      }
      s.next();
      // Add space between tokens
      jsonStr += ' ';
    }
  }
  return JSON5.parse(jsonStr.trim());
}

// ─── Tuple Parsing ──────────────────────────────────────────────

function parseTuple(s: TokenStream): any[] {
  s.expect('parenOpen');
  const values: any[] = [];
  while (!s.is('parenClose') && !s.atEnd()) {
    if (s.is('string')) {
      values.push(s.next().value);
    } else if (s.is('number')) {
      values.push(parseFloat(s.next().value));
    } else if (s.is('identifier')) {
      values.push(s.next().value);
    } else {
      break;
    }
    s.eat('comma');
  }
  s.expect('parenClose');
  return values;
}

// ─── PointRef Parsing (for connections) ──────────────────────────

function parsePointRef(s: TokenStream): any {
  // Parenthesized: absolute coord or node+offset
  if (s.is('parenOpen')) {
    const tuple = parseTuple(s);
    if (tuple.length === 2 && typeof tuple[0] === 'number') {
      return [tuple[0], tuple[1]]; // [x, y]
    }
    if (tuple.length === 3 && typeof tuple[0] === 'string') {
      return [tuple[0], tuple[1], tuple[2]]; // [id, dx, dy]
    }
    return tuple;
  }

  // Bare identifier = node ID
  if (s.is('identifier')) {
    return s.next().value;
  }

  throw new Error(`Expected point reference at line ${s.peek().line}`);
}

// ─── Inline Property Parsing ─────────────────────────────────────

/**
 * Parse remaining properties on a node line (after geometry).
 * Modifies the node object in place.
 */
function parseInlineProps(s: TokenStream, node: any): void {
  while (!s.atEnd() && !s.is('newline') && !s.is('dedent') && !s.is('eof')) {
    // Style reference: @name
    if (s.is('atSign')) {
      s.next();
      node.style = s.expect('identifier').value;
      continue;
    }

    // fill keyword
    if (s.is('identifier', 'fill')) {
      s.next();
      const color = tryParseColor(s);
      if (color) {
        node.fill = color;
      }
      continue;
    }

    // stroke keyword
    if (s.is('identifier', 'stroke')) {
      s.next();
      const color = tryParseColor(s);
      if (color) {
        const stroke: any = { color };
        // Check for width=
        while (s.is('identifier') && s.peek(1).type === 'equals') {
          const key = s.peek().value;
          if (key === 'width') {
            s.next(); s.next(); // key, =
            stroke.width = parseFloat(s.expect('number').value);
          } else {
            break;
          }
        }
        node.stroke = stroke;
      }
      continue;
    }

    // at keyword (position) + transform key=value pairs
    if (s.is('identifier', 'at')) {
      s.next();
      if (!node.transform) node.transform = {};
      // Check for partial: at x=N or at y=N
      if (s.is('identifier') && s.peek(1).type === 'equals') {
        // partial form: at y=-20 or at x=100
        while (s.is('identifier') && s.peek(1).type === 'equals') {
          const axis = s.next().value;
          s.next(); // =
          const val = parseFloat(s.expect('number').value);
          node.transform[axis] = val;
        }
      } else if (s.is('number')) {
        // at x,y
        const x = parseFloat(s.next().value);
        s.expect('comma');
        const y = parseFloat(s.next().value);
        node.transform.x = x;
        node.transform.y = y;
      }
      // Consume trailing transform key=value pairs (rotation=, scale=, etc.)
      while (s.is('identifier') && s.peek(1).type === 'equals' && TRANSFORM_PROPS.has(s.peek().value)) {
        const kv = parseKeyValue(s);
        if (kv) node.transform[kv[0]] = kv[1];
      }
      continue;
    }

    // layout keyword (inline form: layout slot=X, layout grow=1, etc.)
    // Also handles layout={...} JSON escape hatch
    if (s.is('identifier', 'layout') && !(s.peek(1).type === 'colon')) {
      // Check if it's layout=... (JSON escape hatch)
      if (s.peek(1).type === 'equals') {
        const kv = parseKeyValue(s);
        if (kv) { node.layout = kv[1]; continue; }
      }
      s.next();
      if (!node.layout) node.layout = {};
      // JSON escape hatch: layout {...}
      if (s.is('braceOpen')) {
        node.layout = parseJsonEscapeHatch(s);
        continue;
      }
      // Optional type identifier
      if (s.is('identifier') && s.peek(1).type !== 'equals') {
        const val = s.peek().value;
        // Only consume if it's a known layout type, not a keyword for something else
        if (val !== 'fill' && val !== 'stroke' && val !== 'at' && !GEOM_KEYWORDS.has(val)) {
          node.layout.type = s.next().value;
          // Optional direction
          if (s.is('identifier') && s.peek(1).type !== 'equals') {
            const dir = s.peek().value;
            if (dir === 'row' || dir === 'column') {
              node.layout.direction = s.next().value;
            }
          }
        }
      }
      // Key=value pairs for layout properties
      while (!s.atEnd() && !s.is('newline') && !s.is('dedent') && !s.is('eof')) {
        const kv = parseKeyValue(s);
        if (kv) {
          node.layout[kv[0]] = kv[1];
        } else {
          break;
        }
      }
      continue;
    }

    // Boolean keywords
    if (s.is('identifier')) {
      const word = s.peek().value;
      if (TEXT_BOOLEANS.has(word) && node.text) {
        s.next();
        node.text[word] = true;
        continue;
      }
      if (PATH_BOOLEANS.has(word) && node.path) {
        s.next();
        node.path[word] = true;
        continue;
      }
      if (NODE_BOOLEANS.has(word)) {
        s.next();
        if (node.camera !== undefined) {
          node.camera[word] = true;
        } else {
          node[word] = true;
        }
        continue;
      }
      if (word === 'closed' || word === 'smooth') {
        // Also handle these for path even when not yet set
        if (node.path) {
          s.next();
          node.path[word] = true;
          continue;
        }
      }
    }

    // Whitelisted free-floating key=value properties
    if (s.is('identifier') && s.peek(1).type === 'equals') {
      const key = s.peek().value;
      if (FREE_FLOATING_PROPS.has(key)) {
        const kv = parseKeyValue(s);
        if (kv) {
          node[kv[0]] = kv[1];
          continue;
        }
      }
      // Geometry-scoped key=value (e.g., radius=, size=, etc.)
      if (node.rect && RECT_PROPS.has(key)) {
        const kv = parseKeyValue(s);
        if (kv) { node.rect[kv[0]] = kv[1]; continue; }
      }
      if (node.text && TEXT_PROPS.has(key)) {
        const kv = parseKeyValue(s);
        if (kv) { node.text[kv[0]] = kv[1]; continue; }
      }
      if (node.image && IMAGE_PROPS.has(key)) {
        const kv = parseKeyValue(s);
        if (kv) { node.image[kv[0]] = kv[1]; continue; }
      }
      if (node.path && PATH_PROPS.has(key)) {
        const kv = parseKeyValue(s);
        if (kv) { node.path[kv[0]] = kv[1]; continue; }
      }
      if (node.camera !== undefined && CAMERA_PROPS.has(key)) {
        const kv = parseKeyValue(s);
        if (kv) { node.camera[kv[0]] = kv[1]; continue; }
      }
      // Transform props without 'at' prefix
      if (TRANSFORM_PROPS.has(key)) {
        const kv = parseKeyValue(s);
        if (kv) {
          if (!node.transform) node.transform = {};
          node.transform[kv[0]] = kv[1];
          continue;
        }
      }
    }

    // If nothing matched, break
    break;
  }
}

// ─── Connection Parsing ──────────────────────────────────────────

function isConnectionLine(s: TokenStream, startPos: number): boolean {
  // Save position and scan ahead to see if there's an arrow
  let pos = startPos;
  const tokens = (s as any).tokens;
  while (pos < tokens.length) {
    const tok = tokens[pos];
    if (tok.type === 'newline' || tok.type === 'eof' || tok.type === 'indent' || tok.type === 'dedent') break;
    if (tok.type === 'arrow') return true;
    pos++;
  }
  return false;
}

function parseConnection(s: TokenStream, node: any): void {
  const route: any[] = [];

  // Parse first point ref
  route.push(parsePointRef(s));

  // Parse -> ref pairs
  while (s.is('arrow')) {
    s.next(); // ->
    route.push(parsePointRef(s));
  }

  node.path = { route };

  // Parse remaining inline props
  parseInlineProps(s, node);
}

// ─── Explicit Path Points Parsing ────────────────────────────────

function parseExplicitPath(s: TokenStream, node: any): void {
  const points: [number, number][] = [];
  while (s.is('parenOpen')) {
    const tuple = parseTuple(s);
    if (tuple.length === 2 && typeof tuple[0] === 'number') {
      points.push([tuple[0], tuple[1]]);
    }
  }
  node.path = { points };

  // Parse remaining inline props (closed, smooth, fill, etc.)
  parseInlineProps(s, node);
}

// ─── Block Property Parsing ──────────────────────────────────────

function parseBlockProperty(s: TokenStream, node: any): void {
  const keyword = s.next().value; // fill, stroke, layout, dash

  if (keyword === 'fill') {
    const color = tryParseColor(s);
    if (color) node.fill = color;
    return;
  }

  if (keyword === 'stroke') {
    const color = tryParseColor(s);
    if (color) {
      const stroke: any = { color };
      while (s.is('identifier') && s.peek(1).type === 'equals') {
        const key = s.peek().value;
        if (key === 'width') {
          s.next(); s.next();
          stroke.width = parseFloat(s.expect('number').value);
        } else {
          break;
        }
      }
      node.stroke = stroke;
    }
    return;
  }

  if (keyword === 'layout') {
    // layout can be: layout flex row gap=10
    // or layout={...}
    if (s.is('braceOpen')) {
      // JSON escape hatch already handled at key=value level
      node.layout = parseJsonEscapeHatch(s);
      return;
    }
    const layout: any = {};
    // First identifier is the type
    if (s.is('identifier')) {
      layout.type = s.next().value;
    }
    // Optional direction
    if (s.is('identifier')) {
      const val = s.peek().value;
      if (val === 'row' || val === 'column') {
        layout.direction = s.next().value;
      }
    }
    // Key=value pairs
    while (!s.atEnd() && !s.is('newline') && !s.is('dedent') && !s.is('eof')) {
      const kv = parseKeyValue(s);
      if (kv) {
        layout[kv[0]] = kv[1];
      } else {
        break;
      }
    }
    node.layout = layout;
    return;
  }

  if (keyword === 'dash') {
    const dash: any = {};
    // First identifier is the pattern
    if (s.is('identifier')) {
      dash.pattern = s.next().value;
    }
    // Key=value pairs
    while (!s.atEnd() && !s.is('newline') && !s.is('dedent') && !s.is('eof')) {
      const kv = parseKeyValue(s);
      if (kv) {
        dash[kv[0]] = kv[1];
      } else {
        break;
      }
    }
    node.dash = dash;
    return;
  }
}

// ─── Is this line a block property? ──────────────────────────────

function isBlockPropertyLine(s: TokenStream): boolean {
  if (!s.is('identifier')) return false;
  const word = s.peek().value;
  return BLOCK_PROP_KEYWORDS.has(word) && s.peek(1).type !== 'colon';
}

// ─── Is this line a child node (has colon after id)? ─────────────

function isChildNodeLine(s: TokenStream): boolean {
  if (!s.is('identifier')) return false;
  return s.peek(1).type === 'colon';
}

// ─── Node Parsing ────────────────────────────────────────────────

function parseNodeLine(s: TokenStream): any {
  // Read id
  const id = s.expect('identifier').value;
  s.expect('colon');

  const node: any = { id };

  // Check for connection syntax: first token after colon is an identifier
  // and somewhere on this line there's an arrow
  const savedPos = (s as any).pos;
  if (isConnectionLine(s, savedPos)) {
    parseConnection(s, node);
    return node;
  }

  // Check for explicit path: path keyword followed by parens
  if (s.is('identifier', 'path')) {
    s.next();
    if (s.is('parenOpen')) {
      parseExplicitPath(s, node);
      return node;
    }
  }

  // Geometry type
  if (s.is('identifier')) {
    const geom = s.peek().value;
    if (GEOM_KEYWORDS.has(geom)) {
      s.next();

      if (geom === 'rect') {
        node.rect = { w: 0, h: 0 };
        if (s.is('dimensions')) {
          const [w, h] = s.next().value.split('x').map(Number);
          node.rect.w = w;
          node.rect.h = h;
        }
      } else if (geom === 'ellipse') {
        if (s.is('dimensions')) {
          const [w, h] = s.next().value.split('x').map(Number);
          node.ellipse = { rx: w / 2, ry: h / 2 };
        } else {
          node.ellipse = { rx: 0, ry: 0 };
        }
      } else if (geom === 'text') {
        node.text = { content: '' };
        if (s.is('string')) {
          node.text.content = s.next().value;
        }
      } else if (geom === 'image') {
        node.image = { src: '', w: 0, h: 0 };
        if (s.is('string')) {
          node.image.src = s.next().value;
        }
        if (s.is('dimensions')) {
          const [w, h] = s.next().value.split('x').map(Number);
          node.image.w = w;
          node.image.h = h;
        }
      } else if (geom === 'camera') {
        node.camera = {};
      }
    } else if (geom === 'at') {
      // Container: just position, no geometry. Fall through to inline props.
    }
  }

  // Parse remaining inline properties
  parseInlineProps(s, node);

  return node;
}

// ─── Children Parsing ────────────────────────────────────────────

function parseChildren(s: TokenStream, parent: any): void {
  s.expect('indent');

  while (!s.atEnd() && !s.is('dedent') && !s.is('eof')) {
    s.skipNewlines();
    if (s.is('dedent') || s.is('eof')) break;

    // Block property?
    if (isBlockPropertyLine(s)) {
      parseBlockProperty(s, parent);
      s.skipNewlines();
      continue;
    }

    // Child node?
    if (isChildNodeLine(s)) {
      const child = parseNodeLine(s);
      s.skipNewlines();
      // Check for grandchildren
      if (s.is('indent')) {
        parseChildren(s, child);
      }
      if (!parent.children) parent.children = [];
      parent.children.push(child);
      continue;
    }

    // Unknown — skip
    s.next();
  }

  if (s.is('dedent')) s.next();
}

// ─── Style Block Parsing ─────────────────────────────────────────

function parseStyleBlock(s: TokenStream): [string, any] {
  const name = s.expect('identifier').value;
  s.skipNewlines();

  const style: any = {};

  if (s.is('indent')) {
    s.next();
    while (!s.atEnd() && !s.is('dedent') && !s.is('eof')) {
      s.skipNewlines();
      if (s.is('dedent') || s.is('eof')) break;

      if (s.is('identifier', 'fill')) {
        s.next();
        const color = tryParseColor(s);
        if (color) style.fill = color;
      } else if (s.is('identifier', 'stroke')) {
        s.next();
        const color = tryParseColor(s);
        if (color) {
          const stroke: any = { color };
          while (s.is('identifier') && s.peek(1).type === 'equals') {
            const key = s.peek().value;
            if (key === 'width') {
              s.next(); s.next();
              stroke.width = parseFloat(s.expect('number').value);
            } else {
              break;
            }
          }
          style.stroke = stroke;
        }
      } else if (s.is('identifier', 'dash')) {
        s.next();
        const dash: any = {};
        if (s.is('identifier')) dash.pattern = s.next().value;
        while (!s.atEnd() && !s.is('newline') && !s.is('dedent') && !s.is('eof')) {
          const kv = parseKeyValue(s);
          if (kv) { dash[kv[0]] = kv[1]; } else break;
        }
        style.dash = dash;
      } else if (s.is('identifier', 'layout')) {
        s.next();
        const layout: any = {};
        if (s.is('identifier')) layout.type = s.next().value;
        if (s.is('identifier')) {
          const val = s.peek().value;
          if (val === 'row' || val === 'column') layout.direction = s.next().value;
        }
        while (!s.atEnd() && !s.is('newline') && !s.is('dedent') && !s.is('eof')) {
          const kv = parseKeyValue(s);
          if (kv) { layout[kv[0]] = kv[1]; } else break;
        }
        style.layout = layout;
      } else if (s.is('identifier')) {
        // Generic key=value style property
        const kv = parseKeyValue(s);
        if (kv) {
          style[kv[0]] = kv[1];
        } else {
          s.next(); // skip unknown
        }
      } else {
        s.next(); // skip
      }

      s.skipNewlines();
    }
    if (s.is('dedent')) s.next();
  }

  return [name, style];
}

// ─── Images Block Parsing ────────────────────────────────────────

function parseImagesBlock(s: TokenStream): Record<string, string> {
  s.skipNewlines();
  const images: Record<string, string> = {};

  if (s.is('indent')) {
    s.next();
    while (!s.atEnd() && !s.is('dedent') && !s.is('eof')) {
      s.skipNewlines();
      if (s.is('dedent') || s.is('eof')) break;

      if (s.is('identifier')) {
        const key = s.next().value;
        s.expect('colon');
        const url = s.expect('string').value;
        images[key] = url;
      } else {
        s.next();
      }
      s.skipNewlines();
    }
    if (s.is('dedent')) s.next();
  }

  return images;
}

// ─── Flat Reference Application ──────────────────────────────────

function findNodeById(objects: any[], id: string): any | null {
  for (const obj of objects) {
    if (obj.id === id) return obj;
    if (obj.children) {
      const found = findNodeById(obj.children, id);
      if (found) return found;
    }
  }
  return null;
}

function applyFlatReference(objects: any[], pathParts: string[], value: any): void {
  // pathParts is like ['card', 'badge', 'fill'] with value being the parsed color
  // Walk to find the target: first we navigate through node IDs, then set the property
  if (pathParts.length < 2) return;

  // Find the deepest node in the path
  let current = findNodeById(objects, pathParts[0]);
  if (!current) return;

  for (let i = 1; i < pathParts.length - 1; i++) {
    const part = pathParts[i];
    // Try to find a child with this ID
    const child = current.children?.find((c: any) => c.id === part);
    if (child) {
      current = child;
    } else {
      // It's a property path like 'fill.h' — set deep property
      let target = current;
      for (let j = i; j < pathParts.length - 1; j++) {
        if (!target[pathParts[j]]) target[pathParts[j]] = {};
        target = target[pathParts[j]];
      }
      target[pathParts[pathParts.length - 1]] = value;
      return;
    }
  }

  // Set the final property on the deepest node
  const lastKey = pathParts[pathParts.length - 1];
  current[lastKey] = value;
}

// ─── Flat Reference Value Parsing ────────────────────────────────

function parseFlatReferenceValue(s: TokenStream): any {
  // Could be a color (HSL numbers), a single value, etc.
  const color = tryParseColor(s);
  if (color) return color;

  if (s.is('number')) return parseFloat(s.next().value);
  if (s.is('string')) return s.next().value;
  if (s.is('identifier', 'true')) { s.next(); return true; }
  if (s.is('identifier', 'false')) { s.next(); return false; }
  if (s.is('identifier')) return s.next().value;
  if (s.is('braceOpen')) return parseJsonEscapeHatch(s);

  throw new Error(`Unexpected token in flat reference value at line ${s.peek().line}`);
}

// ─── Animation Parsing ───────────────────────────────────────────

function parseAnimateBlock(s: TokenStream): any {
  const animate: any = { keyframes: [] };

  // Parse duration: "3s" is an identifier like "3s"
  if (s.is('identifier')) {
    const durStr = s.peek().value;
    const match = durStr.match(/^(\d+(?:\.\d+)?)s$/);
    if (match) {
      s.next();
      animate.duration = parseFloat(match[1]);
    }
  } else if (s.is('number')) {
    animate.duration = parseFloat(s.next().value);
    // Optional 's' suffix
    if (s.is('identifier', 's')) s.next();
  }

  // Parse top-level animate keywords on same line
  while (!s.atEnd() && !s.is('newline') && !s.is('eof')) {
    if (s.is('identifier', 'loop')) {
      s.next();
      animate.loop = true;
      continue;
    }
    if (s.is('identifier', 'autoKey')) {
      s.next();
      animate.autoKey = true;
      continue;
    }
    const kv = parseKeyValue(s);
    if (kv) {
      animate[kv[0]] = kv[1];
      continue;
    }
    break;
  }

  s.skipNewlines();

  // Parse indented keyframe content
  if (s.is('indent')) {
    s.next();
    parseAnimateContent(s, animate, '');
    if (s.is('dedent')) s.next();
  }

  return animate;
}

function parseAnimateContent(s: TokenStream, animate: any, scopePrefix: string): void {
  while (!s.atEnd() && !s.is('dedent') && !s.is('eof')) {
    s.skipNewlines();
    if (s.is('dedent') || s.is('eof')) break;

    // Chapter: "chapter" "Name" at N
    if (s.is('identifier', 'chapter')) {
      s.next();
      const name = s.expect('string').value;
      s.expect('identifier'); // 'at'
      const time = parseFloat(s.expect('number').value);
      if (!animate.chapters) animate.chapters = [];
      animate.chapters.push({ name, time });
      s.skipNewlines();
      continue;
    }

    // Relative time: +N
    if (s.is('plus')) {
      s.next();
      const timeVal = parseFloat(s.expect('number').value);
      const kf = parseKeyframeLine(s, scopePrefix);
      kf.plus = timeVal;
      // Set time to 0 as placeholder; the plus field indicates relative
      if (kf.time === undefined) kf.time = 0;
      animate.keyframes.push(kf);
      s.skipNewlines();
      // Check for continuation lines
      parseContinuationLines(s, kf, scopePrefix);
      continue;
    }

    // Timestamp: a number at the start
    if (s.is('number')) {
      const time = parseFloat(s.next().value);
      const kf = parseKeyframeLine(s, scopePrefix);
      kf.time = time;
      animate.keyframes.push(kf);
      s.skipNewlines();
      // Check for continuation lines
      parseContinuationLines(s, kf, scopePrefix);
      continue;
    }

    // Scoped block: identifier + optional dots + colon, no timestamp
    // e.g. "card.badge:" — identified by having a colon but no preceding timestamp
    if (s.is('identifier')) {
      const scopeResult = tryParseScopeBlock(s, animate, scopePrefix);
      if (scopeResult) {
        continue;
      }
    }

    // Skip unknown
    s.next();
    s.skipNewlines();
  }
}

function tryParseScopeBlock(s: TokenStream, animate: any, parentScope: string): boolean {
  if (!s.is('identifier')) return false;

  // Look ahead: identifier (dot identifier)* colon newline
  const tokens = (s as any).tokens;
  let pos = (s as any).pos;
  const scopeParts: string[] = [];

  // Gather identifier.dot.identifier... pattern
  while (pos < tokens.length) {
    if (tokens[pos].type !== 'identifier') break;
    scopeParts.push(tokens[pos].value);
    pos++;
    if (pos < tokens.length && tokens[pos].type === 'dot') {
      pos++;
    } else {
      break;
    }
  }

  if (pos >= tokens.length || tokens[pos].type !== 'colon') return false;
  pos++; // skip colon
  // A scope block has a colon followed by newline/eof (no inline content)
  if (pos < tokens.length && tokens[pos].type !== 'newline' && tokens[pos].type !== 'eof') {
    return false;
  }

  // It IS a scope block. Consume the tokens.
  const parts: string[] = [];
  parts.push(s.next().value); // first identifier
  while (s.is('dot')) {
    s.next(); // dot
    parts.push(s.expect('identifier').value);
  }
  s.expect('colon');

  const newScope = parentScope ? parentScope + '.' + parts.join('.') : parts.join('.');

  s.skipNewlines();

  // Parse indented content with the new scope
  if (s.is('indent')) {
    s.next();
    parseAnimateContent(s, animate, newScope);
    if (s.is('dedent')) s.next();
  }

  return true;
}

function parseKeyframeLine(s: TokenStream, scopePrefix: string): any {
  const kf: any = { changes: {} };

  // Check if there is a colon on this line (property change vs effect)
  const hasColon = lineHasColon(s);

  if (hasColon) {
    // Property change: track.path: value
    const trackPath = parseTrackPath(s, scopePrefix);
    s.expect('colon');
    const value = parseKeyframeValue(s);

    // Check for per-change easing: easing=X
    let easing: string | undefined;
    if (s.is('identifier', 'easing') && s.peek(1).type === 'equals') {
      s.next(); s.next();
      easing = s.expect('identifier').value;
    }

    if (easing) {
      kf.changes[trackPath] = { value, easing };
    } else {
      kf.changes[trackPath] = value;
    }

    // Check for keyframe-level easing too
    while (!s.atEnd() && !s.is('newline') && !s.is('eof') && !s.is('dedent')) {
      if (s.is('identifier', 'easing') && s.peek(1).type === 'equals') {
        s.next(); s.next();
        kf.easing = s.expect('identifier').value;
      } else {
        break;
      }
    }
  } else {
    // Effect syntax: nodeId effectName [params]
    const targetId = parseTrackPath(s, scopePrefix);

    if (s.is('identifier') && !s.is('identifier', 'easing')) {
      const effectName = s.next().value;

      // Check for effect params (key=value)
      const params: any = {};
      let hasParams = false;
      while (!s.atEnd() && !s.is('newline') && !s.is('eof') && !s.is('dedent')) {
        const kv = parseKeyValue(s);
        if (kv) {
          params[kv[0]] = kv[1];
          hasParams = true;
        } else {
          break;
        }
      }

      if (hasParams) {
        kf.changes[targetId] = { effect: effectName, ...params };
      } else {
        kf.changes[targetId] = effectName;
      }
    }

    // Check for per-keyframe easing
    if (s.is('identifier', 'easing') && s.peek(1).type === 'equals') {
      s.next(); s.next();
      kf.easing = s.expect('identifier').value;
    }
  }

  return kf;
}

function parseContinuationLines(s: TokenStream, kf: any, scopePrefix: string): void {
  // Continuation lines are indented past the timestamp column
  if (s.is('indent')) {
    s.next();
    while (!s.atEnd() && !s.is('dedent') && !s.is('eof')) {
      s.skipNewlines();
      if (s.is('dedent') || s.is('eof')) break;

      if (lineHasColon(s)) {
        const trackPath = parseTrackPath(s, scopePrefix);
        s.expect('colon');
        const value = parseKeyframeValue(s);

        let easing: string | undefined;
        if (s.is('identifier', 'easing') && s.peek(1).type === 'equals') {
          s.next(); s.next();
          easing = s.expect('identifier').value;
        }

        if (easing) {
          kf.changes[trackPath] = { value, easing };
        } else {
          kf.changes[trackPath] = value;
        }
      } else {
        break;
      }
      s.skipNewlines();
    }
    if (s.is('dedent')) s.next();
  }
}

function lineHasColon(s: TokenStream): boolean {
  const tokens = (s as any).tokens;
  let pos = (s as any).pos;
  while (pos < tokens.length) {
    const tok = tokens[pos];
    if (tok.type === 'newline' || tok.type === 'eof' || tok.type === 'indent' || tok.type === 'dedent') break;
    if (tok.type === 'colon') return true;
    pos++;
  }
  return false;
}

function parseTrackPath(s: TokenStream, scopePrefix: string): string {
  let path = '';
  if (scopePrefix) {
    path = scopePrefix + '.';
  }
  path += s.expect('identifier').value;
  while (s.is('dot')) {
    s.next();
    path += '.' + s.expect('identifier').value;
  }
  return path;
}

function parseKeyframeValue(s: TokenStream): any {
  if (s.is('number')) {
    // Three consecutive numbers = RGB color literal
    const color = tryParseColor(s);
    if (color) return color;
    return parseFloat(s.next().value);
  }
  if (s.is('string')) return s.next().value;
  if (s.is('identifier', 'true')) { s.next(); return true; }
  if (s.is('identifier', 'false')) { s.next(); return false; }
  if (s.is('parenOpen')) return parseTuple(s);
  if (s.is('braceOpen')) return parseJsonEscapeHatch(s);
  if (s.is('hexColor')) {
    const color = tryParseColor(s);
    if (color) return color;
    return s.next().value;
  }
  if (s.is('identifier')) {
    const color = tryParseColor(s);
    if (color) return color;
    return s.next().value;
  }

  throw new Error(`Expected keyframe value at line ${s.peek().line}`);
}

// ─── Flat Reference Detection ────────────────────────────────────

function isFlatReference(s: TokenStream): boolean {
  // A flat reference is: identifier dot identifier (dot identifier)* colon
  const tokens = (s as any).tokens;
  let pos = (s as any).pos;

  if (tokens[pos]?.type !== 'identifier') return false;
  pos++;
  if (tokens[pos]?.type !== 'dot') return false;

  // Continue scanning: identifier dot identifier... until colon
  while (pos < tokens.length) {
    if (tokens[pos]?.type !== 'dot') break;
    pos++;
    if (tokens[pos]?.type !== 'identifier') return false;
    pos++;
  }

  return tokens[pos]?.type === 'colon';
}

// ─── Main Parser ─────────────────────────────────────────────────

export function parseDsl(input: string): any {
  const tokens = tokenize(input);
  const s = new TokenStream(tokens);

  const result: any = {
    objects: [],
  };

  const flatRefs: Array<{ parts: string[]; value: any }> = [];

  s.skipNewlines();

  while (!s.atEnd()) {
    s.skipNewlines();
    if (s.atEnd()) break;

    // Document-level keywords
    if (s.is('identifier', 'name')) {
      s.next();
      result.name = s.expect('string').value;
      s.skipNewlines();
      continue;
    }

    if (s.is('identifier', 'description')) {
      s.next();
      result.description = s.expect('string').value;
      s.skipNewlines();
      continue;
    }

    if (s.is('identifier', 'background')) {
      s.next();
      if (s.is('string')) {
        result.background = s.next().value;
      } else if (s.is('hexColor')) {
        result.background = s.next().value;
      }
      s.skipNewlines();
      continue;
    }

    if (s.is('identifier', 'viewport')) {
      s.next();
      if (s.is('dimensions')) {
        const [w, h] = s.next().value.split('x').map(Number);
        result.viewport = { width: w, height: h };
      }
      s.skipNewlines();
      continue;
    }

    if (s.is('identifier', 'images')) {
      s.next();
      result.images = parseImagesBlock(s);
      s.skipNewlines();
      continue;
    }

    if (s.is('identifier', 'style')) {
      s.next();
      const [name, style] = parseStyleBlock(s);
      if (!result.styles) result.styles = {};
      result.styles[name] = style;
      s.skipNewlines();
      continue;
    }

    if (s.is('identifier', 'animate')) {
      s.next();
      result.animate = parseAnimateBlock(s);
      s.skipNewlines();
      continue;
    }

    // Flat reference: identifier.identifier...: value
    if (isFlatReference(s)) {
      const parts: string[] = [];
      parts.push(s.next().value); // first id
      while (s.is('dot')) {
        s.next();
        parts.push(s.expect('identifier').value);
      }
      s.expect('colon');
      const value = parseFlatReferenceValue(s);
      flatRefs.push({ parts, value });
      s.skipNewlines();
      continue;
    }

    // Node line: id: ...
    if (s.is('identifier') && s.peek(1).type === 'colon') {
      const node = parseNodeLine(s);
      s.skipNewlines();
      // Check for indented children/block props
      if (s.is('indent')) {
        parseChildren(s, node);
      }
      result.objects.push(node);
      s.skipNewlines();
      continue;
    }

    // Unknown — skip
    s.next();
  }

  // Apply flat references
  for (const ref of flatRefs) {
    applyFlatReference(result.objects, ref.parts, ref.value);
  }

  // Initialize defaults
  if (!result.styles) result.styles = {};

  return result;
}

export function parseDslWithHints(input: string): { scene: any; formatHints: FormatHints } {
  const scene = parseDsl(input);
  const formatHints = extractFormatHints(input);
  return { scene, formatHints };
}

function extractFormatHints(input: string): FormatHints {
  const hints = emptyFormatHints();
  const tokens = tokenize(input);

  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.type === 'indent') { depth++; continue; }
    if (tok.type === 'dedent') { depth--; continue; }

    // Only classify top-level identifier:colon patterns as node definitions
    if (depth !== 0) continue;

    if (tok.type === 'identifier' && tokens[i + 1]?.type === 'colon') {
      const id = tok.value;
      // Skip document-level keywords
      if (DOC_KEYWORDS.has(id)) continue;

      // Scan forward past the colon to find the next newline or eof
      let j = i + 2;
      while (j < tokens.length && tokens[j].type !== 'newline' && tokens[j].type !== 'eof') {
        j++;
      }
      // After the newline (or eof), check if next token is indent
      if (j < tokens.length && tokens[j].type === 'newline') {
        const afterNewline = tokens[j + 1];
        if (afterNewline && afterNewline.type === 'indent') {
          hints.nodes[id] = { display: 'block' };
        } else {
          hints.nodes[id] = { display: 'inline' };
        }
      } else {
        hints.nodes[id] = { display: 'inline' };
      }
    }
  }

  return hints;
}
