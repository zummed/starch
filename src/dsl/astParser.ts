import { tokenize } from './tokenizer';
import { resolveNamedColor } from '../types/color';
import type { Color } from '../types/properties';
import type { Token, TokenType } from './types';
import type { FormatHints } from './formatHints';
import { emptyFormatHints } from './formatHints';
import type { AstNode } from './astTypes';
import { createAstNode } from './astTypes';

// ─── Token Stream ────────────────────────────────────────────────

class TokenStream {
  tokens: Token[];
  pos: number;

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

// ─── Known Sets ──────────────────────────────────────────────────

const BLOCK_PROP_KEYWORDS = new Set([
  'fill', 'stroke', 'layout', 'dash',
  'rect', 'ellipse', 'text', 'image', 'camera', 'path',
]);

const GEOM_KEYWORDS = new Set([
  'rect', 'ellipse', 'text', 'image', 'camera', 'path',
]);

const TEXT_BOOLEANS = new Set(['bold', 'mono']);
const PATH_BOOLEANS = new Set(['closed', 'smooth']);
const NODE_BOOLEANS = new Set(['active']);
const TRANSFORM_PROPS = new Set(['rotation', 'scale', 'anchor', 'pathFollow', 'pathProgress']);
const CAMERA_PROPS = new Set(['look', 'zoom', 'ratio', 'active']);
const FREE_FLOATING_PROPS = new Set(['opacity', 'depth', 'visible']);
const RECT_PROPS = new Set(['radius']);
const TEXT_PROPS = new Set(['size', 'lineHeight', 'align']);
const IMAGE_PROPS = new Set(['fit']);
const PATH_PROPS = new Set(['radius', 'bend', 'drawProgress', 'gap', 'fromGap', 'toGap']);

const DOC_KEYWORDS = new Set([
  'name', 'description', 'background', 'viewport', 'images', 'style', 'animate',
]);

// ─── Parse Result ────────────────────────────────────────────────

interface ParseResult {
  ast: AstNode;
  model: any;
  formatHints: FormatHints;
}

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

  // Bare three numbers → RGB
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
  if (s.is('identifier', 'true')) { s.next(); return [key, true]; }
  if (s.is('identifier', 'false')) { s.next(); return [key, false]; }

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
      } else if (tok.type === 'identifier') {
        const v = tok.value;
        if (v === 'true' || v === 'false' || v === 'null') {
          jsonStr += v;
        } else {
          jsonStr += `"${v}"`;
        }
      } else if (tok.type === 'number') {
        jsonStr += tok.value;
      } else {
        jsonStr += tok.value;
      }
      s.next();
      jsonStr += ' ';
    }
  }
  return JSON.parse(jsonStr.trim());
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

// ─── PointRef Parsing ────────────────────────────────────────────

function parsePointRef(s: TokenStream): any {
  if (s.is('parenOpen')) {
    const tuple = parseTuple(s);
    if (tuple.length === 2 && typeof tuple[0] === 'number') {
      return [tuple[0], tuple[1]];
    }
    if (tuple.length === 3 && typeof tuple[0] === 'string') {
      return [tuple[0], tuple[1], tuple[2]];
    }
    return tuple;
  }

  if (s.is('identifier')) {
    return s.next().value;
  }

  throw new Error(`Expected point reference at line ${s.peek().line}`);
}

// ─── Inline Property Parsing ─────────────────────────────────────

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
      continue;
    }

    // at keyword (position) + transform key=value pairs
    if (s.is('identifier', 'at')) {
      s.next();
      if (!node.transform) node.transform = {};
      if (s.is('identifier') && s.peek(1).type === 'equals') {
        while (s.is('identifier') && s.peek(1).type === 'equals') {
          const key = s.peek().value;
          if (TRANSFORM_PROPS.has(key) || key === 'x' || key === 'y') {
            const kv = parseKeyValue(s);
            if (kv) node.transform[kv[0]] = kv[1];
          } else {
            break;
          }
        }
      } else if (s.is('number')) {
        const x = parseFloat(s.next().value);
        s.expect('comma');
        const y = parseFloat(s.next().value);
        node.transform.x = x;
        node.transform.y = y;
      }
      // Consume trailing transform key=value pairs
      while (s.is('identifier') && s.peek(1).type === 'equals' && TRANSFORM_PROPS.has(s.peek().value)) {
        const kv = parseKeyValue(s);
        if (kv) node.transform[kv[0]] = kv[1];
      }
      continue;
    }

    // layout keyword
    if (s.is('identifier', 'layout') && !(s.peek(1).type === 'colon')) {
      if (s.peek(1).type === 'equals') {
        const kv = parseKeyValue(s);
        if (kv) { node.layout = kv[1]; continue; }
      }
      s.next();
      if (!node.layout) node.layout = {};
      if (s.is('braceOpen')) {
        node.layout = parseJsonEscapeHatch(s);
        continue;
      }
      if (s.is('identifier') && s.peek(1).type !== 'equals') {
        const val = s.peek().value;
        if (val !== 'fill' && val !== 'stroke' && val !== 'at' && !GEOM_KEYWORDS.has(val)) {
          node.layout.type = s.next().value;
          if (s.is('identifier') && s.peek(1).type !== 'equals') {
            const dir = s.peek().value;
            if (dir === 'row' || dir === 'column') {
              node.layout.direction = s.next().value;
            }
          }
        }
      }
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
      if ((word === 'closed' || word === 'smooth') && node.path) {
        s.next();
        node.path[word] = true;
        continue;
      }
    }

    // Whitelisted free-floating key=value properties
    if (s.is('identifier') && s.peek(1).type === 'equals') {
      const key = s.peek().value;
      if (FREE_FLOATING_PROPS.has(key)) {
        const kv = parseKeyValue(s);
        if (kv) { node[kv[0]] = kv[1]; continue; }
      }
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

// ─── Connection Detection ────────────────────────────────────────

function isConnectionLine(s: TokenStream, startPos: number): boolean {
  let pos = startPos;
  const tokens = s.tokens;
  while (pos < tokens.length) {
    const tok = tokens[pos];
    if (tok.type === 'newline' || tok.type === 'eof' || tok.type === 'indent' || tok.type === 'dedent') break;
    if (tok.type === 'arrow') return true;
    pos++;
  }
  return false;
}

// ─── Connection Parsing ──────────────────────────────────────────

function parseConnection(s: TokenStream, node: any): void {
  const route: any[] = [];
  route.push(parsePointRef(s));
  while (s.is('arrow')) {
    s.next();
    route.push(parsePointRef(s));
  }
  node.path = { route };
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
  parseInlineProps(s, node);
}

// ─── Block Property Parsing ──────────────────────────────────────

function parseBlockProperty(s: TokenStream, node: any): void {
  const keyword = s.next().value;

  if (GEOM_KEYWORDS.has(keyword)) {
    if (keyword === 'rect') {
      node.rect = { w: 0, h: 0 };
      if (s.is('dimensions')) {
        const [w, h] = s.next().value.split('x').map(Number);
        node.rect.w = w;
        node.rect.h = h;
      }
    } else if (keyword === 'ellipse') {
      if (s.is('dimensions')) {
        const [w, h] = s.next().value.split('x').map(Number);
        node.ellipse = { rx: w / 2, ry: h / 2 };
      } else {
        node.ellipse = { rx: 0, ry: 0 };
      }
    } else if (keyword === 'text') {
      node.text = { content: '' };
      if (s.is('string')) {
        node.text.content = s.next().value;
      }
    } else if (keyword === 'image') {
      node.image = { src: '', w: 0, h: 0 };
      if (s.is('string')) {
        node.image.src = s.next().value;
      }
      if (s.is('dimensions')) {
        const [w, h] = s.next().value.split('x').map(Number);
        node.image.w = w;
        node.image.h = h;
      }
    } else if (keyword === 'camera') {
      node.camera = {};
    }
    return;
  }

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
    if (s.is('braceOpen')) {
      node.layout = parseJsonEscapeHatch(s);
      return;
    }
    const layout: any = {};
    if (s.is('identifier') && s.peek(1).type !== 'equals') {
      layout.type = s.next().value;
    }
    if (s.is('identifier') && s.peek(1).type !== 'equals') {
      const val = s.peek().value;
      if (val === 'row' || val === 'column') {
        layout.direction = s.next().value;
      }
    }
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
    if (s.is('identifier')) {
      dash.pattern = s.next().value;
    }
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

// ─── Block property detection ────────────────────────────────────

function isBlockPropertyLine(s: TokenStream): boolean {
  if (!s.is('identifier')) return false;
  const word = s.peek().value;
  return BLOCK_PROP_KEYWORDS.has(word) && s.peek(1).type !== 'colon';
}

function isChildNodeLine(s: TokenStream): boolean {
  if (!s.is('identifier')) return false;
  if (s.peek(1).type === 'colon') return true;
  // Support dotted IDs: identifier.identifier: (e.g. a.bg:)
  let offset = 1;
  while (s.peek(offset).type === 'dot') {
    offset++;
    if (s.peek(offset).type !== 'identifier') return false;
    offset++;
    if (s.peek(offset).type === 'colon') return true;
  }
  return false;
}

// ─── Node Parsing ────────────────────────────────────────────────

function parseNodeLine(s: TokenStream): any {
  let id = s.expect('identifier').value;
  // Support dotted IDs: identifier.identifier.identifier:
  while (s.is('dot')) {
    s.next(); // consume '.'
    id += '.' + s.expect('identifier').value;
  }
  s.expect('colon');

  const node: any = { id };

  // Check for connection syntax
  const savedPos = s.pos;
  if (isConnectionLine(s, savedPos)) {
    parseConnection(s, node);
    return node;
  }

  // Check for explicit path
  if (s.is('identifier', 'path')) {
    s.next();
    if (s.is('parenOpen')) {
      parseExplicitPath(s, node);
      return node;
    }
  }

  // Template: id: template templateName key=val key=val
  // Template name may be a string literal (for names with hyphens) or an identifier
  if (s.is('identifier', 'template')) {
    s.next(); // consume 'template'
    if (s.is('string')) {
      node.template = s.next().value;
    } else if (s.is('identifier')) {
      node.template = s.next().value;
    }
    const props: any = {};
    while (!s.atEnd() && !s.is('newline') && !s.is('eof')) {
      const kv = parseKeyValue(s);
      if (kv) {
        props[kv[0]] = kv[1];
      } else {
        break;
      }
    }
    if (Object.keys(props).length > 0) node.props = props;
    return node;
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

    if (isBlockPropertyLine(s)) {
      parseBlockProperty(s, parent);
      s.skipNewlines();
      continue;
    }

    if (isChildNodeLine(s)) {
      const child = parseNodeLine(s);
      s.skipNewlines();
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
        if (s.is('identifier') && s.peek(1).type !== 'equals') layout.type = s.next().value;
        if (s.is('identifier') && s.peek(1).type !== 'equals') {
          const val = s.peek().value;
          if (val === 'row' || val === 'column') layout.direction = s.next().value;
        }
        while (!s.atEnd() && !s.is('newline') && !s.is('dedent') && !s.is('eof')) {
          const kv = parseKeyValue(s);
          if (kv) { layout[kv[0]] = kv[1]; } else break;
        }
        style.layout = layout;
      } else if (s.is('identifier')) {
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

// ─── Flat Reference Helpers ──────────────────────────────────────

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
  if (pathParts.length < 2) return;

  let current = findNodeById(objects, pathParts[0]);
  if (!current) return;

  for (let i = 1; i < pathParts.length - 1; i++) {
    const part = pathParts[i];
    const child = current.children?.find((c: any) => c.id === part);
    if (child) {
      current = child;
    } else {
      let target = current;
      for (let j = i; j < pathParts.length - 1; j++) {
        if (!target[pathParts[j]]) target[pathParts[j]] = {};
        target = target[pathParts[j]];
      }
      target[pathParts[pathParts.length - 1]] = value;
      return;
    }
  }

  const lastKey = pathParts[pathParts.length - 1];
  current[lastKey] = value;
}

function parseFlatReferenceValue(s: TokenStream): any {
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

function isFlatReference(s: TokenStream): boolean {
  const tokens = s.tokens;
  let pos = s.pos;
  if (tokens[pos]?.type !== 'identifier') return false;
  pos++;
  if (tokens[pos]?.type !== 'dot') return false;
  while (pos < tokens.length) {
    if (tokens[pos]?.type !== 'dot') break;
    pos++;
    if (tokens[pos]?.type !== 'identifier') return false;
    pos++;
  }
  return tokens[pos]?.type === 'colon';
}

// ─── Animation Parsing ───────────────────────────────────────────

function parseAnimateBlock(s: TokenStream): any {
  const animate: any = { keyframes: [] };

  if (s.is('identifier')) {
    const durStr = s.peek().value;
    const match = durStr.match(/^(\d+(?:\.\d+)?)s$/);
    if (match) {
      s.next();
      animate.duration = parseFloat(match[1]);
    }
  } else if (s.is('number')) {
    animate.duration = parseFloat(s.next().value);
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

    // Chapter
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
      if (kf.time === undefined) kf.time = 0;
      animate.keyframes.push(kf);
      s.skipNewlines();
      parseContinuationLines(s, kf, scopePrefix);
      continue;
    }

    // Timestamp
    if (s.is('number')) {
      const time = parseFloat(s.next().value);
      const kf: any = { changes: {} };
      kf.time = time;
      // Standalone timestamp line (number alone, changes indented below)
      if (s.is('newline') || s.is('eof')) {
        animate.keyframes.push(kf);
        s.skipNewlines();
        parseContinuationLines(s, kf, scopePrefix);
      } else {
        const parsedKf = parseKeyframeLine(s, scopePrefix);
        kf.changes = parsedKf.changes;
        if (parsedKf.easing) kf.easing = parsedKf.easing;
        animate.keyframes.push(kf);
        s.skipNewlines();
        parseContinuationLines(s, kf, scopePrefix);
      }
      continue;
    }

    // Scoped block
    if (s.is('identifier')) {
      const scopeResult = tryParseScopeBlock(s, animate, scopePrefix);
      if (scopeResult) continue;
    }

    s.next();
    s.skipNewlines();
  }
}

function tryParseScopeBlock(s: TokenStream, animate: any, parentScope: string): boolean {
  if (!s.is('identifier')) return false;

  const tokens = s.tokens;
  let pos = s.pos;
  const scopeParts: string[] = [];

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
  pos++;
  if (pos < tokens.length && tokens[pos].type !== 'newline' && tokens[pos].type !== 'eof') {
    return false;
  }

  const parts: string[] = [];
  parts.push(s.next().value);
  while (s.is('dot')) {
    s.next();
    parts.push(s.expect('identifier').value);
  }
  s.expect('colon');

  const newScope = parentScope ? parentScope + '.' + parts.join('.') : parts.join('.');

  s.skipNewlines();

  if (s.is('indent')) {
    s.next();
    parseAnimateContent(s, animate, newScope);
    if (s.is('dedent')) s.next();
  }

  return true;
}

function lineHasColon(s: TokenStream): boolean {
  const tokens = s.tokens;
  let pos = s.pos;
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

function parseKeyframeLine(s: TokenStream, scopePrefix: string): any {
  const kf: any = { changes: {} };

  const hasColon = lineHasColon(s);

  if (hasColon) {
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

    while (!s.atEnd() && !s.is('newline') && !s.is('eof') && !s.is('dedent')) {
      if (s.is('identifier', 'easing') && s.peek(1).type === 'equals') {
        s.next(); s.next();
        kf.easing = s.expect('identifier').value;
      } else {
        break;
      }
    }
  } else {
    const targetId = parseTrackPath(s, scopePrefix);

    if (s.is('identifier') && !s.is('identifier', 'easing')) {
      const effectName = s.next().value;

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

    if (s.is('identifier', 'easing') && s.peek(1).type === 'equals') {
      s.next(); s.next();
      kf.easing = s.expect('identifier').value;
    }
  }

  return kf;
}

function parseContinuationLines(s: TokenStream, kf: any, scopePrefix: string): void {
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

// ─── Format Hints Extraction ─────────────────────────────────────

function extractFormatHints(tokens: Token[]): FormatHints {
  const hints = emptyFormatHints();

  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.type === 'indent') { depth++; continue; }
    if (tok.type === 'dedent') { depth--; continue; }

    if (depth !== 0) continue;

    if (tok.type === 'identifier' && tokens[i + 1]?.type === 'colon') {
      const id = tok.value;
      if (DOC_KEYWORDS.has(id)) continue;

      // Scan forward past the colon to find the next newline or eof
      let j = i + 2;
      while (j < tokens.length && tokens[j].type !== 'newline' && tokens[j].type !== 'eof') {
        j++;
      }
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

// ─── AST Building ────────────────────────────────────────────────
// Build a minimal AST from the token stream with correct positions.
// We build the AST by tracking token positions during parsing.

function buildAst(tokens: Token[], model: any, text: string): AstNode {
  const docNode = createAstNode({
    dslRole: 'document',
    from: 0,
    to: text.length,
    schemaPath: '',
    modelPath: '',
  });

  // We'll create section nodes and populate them.
  // For now, build a lightweight AST by walking the token positions.
  // The detailed AST construction parallels the emitter's structure.

  buildAstFromTokens(tokens, model, docNode, text);

  return docNode;
}

function buildAstFromTokens(tokens: Token[], model: any, docNode: AstNode, text: string): void {
  // Build a section-level AST that mirrors what the emitter produces.
  // We need to identify tokens that correspond to each model element.

  // Use a second pass approach: re-walk the tokens and the parsed model
  // to create AST nodes at the correct positions.

  let i = 0;
  const len = tokens.length;

  function skipWs(): void {
    while (i < len && (tokens[i].type === 'newline' || tokens[i].type === 'indent' || tokens[i].type === 'dedent')) {
      i++;
    }
  }

  // Track which sections we've seen
  let objectIdx = 0;

  while (i < len && tokens[i].type !== 'eof') {
    skipWs();
    if (i >= len || tokens[i].type === 'eof') break;
    const tok = tokens[i];

    // Metadata keywords
    if (tok.type === 'identifier' && DOC_KEYWORDS.has(tok.value) && tok.value !== 'images' && tok.value !== 'style' && tok.value !== 'animate') {
      const sectionStart = tok.offset;
      // Skip to end of line
      while (i < len && tokens[i].type !== 'newline' && tokens[i].type !== 'eof') i++;
      const sectionEnd = i < len ? tokens[i].offset : text.length;
      const section = createAstNode({
        dslRole: 'section',
        from: sectionStart,
        to: sectionEnd,
        schemaPath: 'metadata',
        modelPath: 'metadata',
      });
      section.parent = docNode;
      docNode.children.push(section);
      continue;
    }

    // Images section
    if (tok.type === 'identifier' && tok.value === 'images') {
      const sectionStart = tok.offset;
      i++; // skip 'images'
      // Skip through indent block
      while (i < len && tokens[i].type !== 'eof') {
        if (tokens[i].type === 'dedent') { i++; break; }
        i++;
      }
      const sectionEnd = i < len ? tokens[i]?.offset ?? text.length : text.length;
      const section = createAstNode({
        dslRole: 'section',
        from: sectionStart,
        to: sectionEnd,
        schemaPath: 'images',
        modelPath: 'images',
      });
      section.parent = docNode;
      docNode.children.push(section);
      continue;
    }

    // Style section
    if (tok.type === 'identifier' && tok.value === 'style') {
      const sectionStart = tok.offset;
      i++; // skip 'style'
      // Get style name
      skipWs();
      const nameToken = tokens[i];
      const styleName = nameToken?.value ?? '';
      // Skip through indent block
      while (i < len && tokens[i].type !== 'eof') {
        if (tokens[i].type === 'dedent') { i++; break; }
        if (tokens[i].type === 'newline' && i + 1 < len && tokens[i + 1].type !== 'indent' && tokens[i + 1].type !== 'dedent') {
          // Check if next line is not indented (end of style block)
          const next = tokens[i + 1];
          if (next.type === 'identifier' && (DOC_KEYWORDS.has(next.value) || (next.type === 'identifier' && tokens[i + 2]?.type === 'colon'))) {
            i++; // skip newline
            break;
          }
        }
        i++;
      }
      const sectionEnd = i < len ? tokens[i]?.offset ?? text.length : text.length;
      const section = createAstNode({
        dslRole: 'section',
        from: sectionStart,
        to: sectionEnd,
        schemaPath: 'style',
        modelPath: `styles.${styleName}`,
      });
      section.parent = docNode;
      docNode.children.push(section);
      continue;
    }

    // Animate section
    if (tok.type === 'identifier' && tok.value === 'animate') {
      const sectionStart = tok.offset;
      // Skip to end
      while (i < len && tokens[i].type !== 'eof') {
        i++;
      }
      const sectionEnd = i < len ? tokens[i]?.offset ?? text.length : text.length;
      const section = createAstNode({
        dslRole: 'section',
        from: sectionStart,
        to: sectionEnd,
        schemaPath: 'animate',
        modelPath: 'animate',
      });
      section.parent = docNode;
      docNode.children.push(section);
      continue;
    }

    // Flat reference: skip detection here (handled in model parsing)
    // Check if this is a flat reference: identifier.identifier...:
    if (tok.type === 'identifier' && i + 1 < len && tokens[i + 1].type === 'dot') {
      // Skip to end of line
      while (i < len && tokens[i].type !== 'newline' && tokens[i].type !== 'eof') i++;
      continue;
    }

    // Node line: identifier : ...
    if (tok.type === 'identifier' && i + 1 < len && tokens[i + 1].type === 'colon') {
      const nodeId = tok.value;
      if (DOC_KEYWORDS.has(nodeId)) {
        // Skip to end of line
        while (i < len && tokens[i].type !== 'newline' && tokens[i].type !== 'eof') i++;
        continue;
      }
      const modelPrefix = `objects.${nodeId}`;
      const sectionStart = tok.offset;

      // Find end of node (including children)
      const nodeEnd = findNodeEnd(tokens, i);
      const sectionEnd = nodeEnd < len ? tokens[nodeEnd]?.offset ?? text.length : text.length;

      const compound = createAstNode({
        dslRole: 'compound',
        from: sectionStart,
        to: sectionEnd,
        schemaPath: '',
        modelPath: modelPrefix,
      });

      // Add node ID leaf
      const idNode = createAstNode({
        dslRole: 'value',
        from: tok.offset,
        to: tok.offset + tok.value.length,
        schemaPath: '',
        modelPath: modelPrefix,
        value: nodeId,
      });
      idNode.parent = compound;
      compound.children.push(idNode);

      // Build inner AST nodes for this node's tokens
      buildNodeAstChildren(tokens, i + 2, nodeEnd, compound, modelPrefix, text);

      // Attach to either an objects section or create one
      let objectsSection = docNode.children.find(c => c.schemaPath === 'objects');
      if (!objectsSection) {
        objectsSection = createAstNode({
          dslRole: 'section',
          from: sectionStart,
          to: sectionEnd,
          schemaPath: 'objects',
          modelPath: 'objects',
        });
        objectsSection.parent = docNode;
        docNode.children.push(objectsSection);
      }
      objectsSection.to = Math.max(objectsSection.to, sectionEnd);
      compound.parent = objectsSection;
      objectsSection.children.push(compound);

      i = nodeEnd;
      continue;
    }

    // Unknown — skip
    i++;
  }
}

function findNodeEnd(tokens: Token[], startIdx: number): number {
  let i = startIdx;
  const len = tokens.length;

  // Skip to end of the header line
  while (i < len && tokens[i].type !== 'newline' && tokens[i].type !== 'eof') i++;

  // If next is indent, skip the entire indented block
  if (i < len && tokens[i].type === 'newline') {
    i++;
    if (i < len && tokens[i].type === 'indent') {
      let depth = 1;
      i++;
      while (i < len && depth > 0) {
        if (tokens[i].type === 'indent') depth++;
        else if (tokens[i].type === 'dedent') depth--;
        if (depth > 0) i++;
        else { i++; break; }
      }
    }
  }

  return i;
}

function buildNodeAstChildren(
  tokens: Token[],
  startIdx: number,
  endIdx: number,
  compound: AstNode,
  modelPrefix: string,
  text: string,
): void {
  // Walk tokens from startIdx to endIdx, creating leaf AST nodes for
  // geometry keywords, values, kwarg keys/values, etc.
  let i = startIdx;

  while (i < endIdx && i < tokens.length) {
    const tok = tokens[i];

    // Skip structural tokens
    if (tok.type === 'newline' || tok.type === 'indent' || tok.type === 'dedent') {
      i++;
      continue;
    }

    // Geometry keyword
    if (tok.type === 'identifier' && GEOM_KEYWORDS.has(tok.value)) {
      const geomKey = tok.value;
      const geomCompound = createAstNode({
        dslRole: 'compound',
        from: tok.offset,
        to: tok.offset + tok.value.length,
        schemaPath: geomKey,
        modelPath: `${modelPrefix}.${geomKey}`,
      });
      geomCompound.parent = compound;
      compound.children.push(geomCompound);

      const kwNode = createAstNode({
        dslRole: 'keyword',
        from: tok.offset,
        to: tok.offset + tok.value.length,
        schemaPath: geomKey,
        modelPath: `${modelPrefix}.${geomKey}`,
        value: geomKey,
      });
      kwNode.parent = geomCompound;
      geomCompound.children.push(kwNode);
      i++;

      // Parse dimension or string tokens that follow
      if (i < endIdx && tokens[i].type === 'dimensions') {
        const dimTok = tokens[i];
        const parts = dimTok.value.split('x');
        const wFrom = dimTok.offset;
        const xPos = dimTok.offset + parts[0].length;
        const hTo = dimTok.offset + dimTok.value.length;

        const schemaW = geomKey === 'ellipse' ? 'ellipse.rx' : `${geomKey}.w`;
        const schemaH = geomKey === 'ellipse' ? 'ellipse.ry' : `${geomKey}.h`;

        const wNode = createAstNode({
          dslRole: 'value',
          from: wFrom,
          to: xPos,
          schemaPath: schemaW,
          modelPath: `${modelPrefix}.${schemaW}`,
          value: parseFloat(parts[0]),
        });
        wNode.parent = geomCompound;
        geomCompound.children.push(wNode);

        const sepNode = createAstNode({
          dslRole: 'separator',
          from: xPos,
          to: xPos + 1,
          schemaPath: '',
          modelPath: '',
        });
        sepNode.parent = geomCompound;
        geomCompound.children.push(sepNode);

        const hNode = createAstNode({
          dslRole: 'value',
          from: xPos + 1,
          to: hTo,
          schemaPath: schemaH,
          modelPath: `${modelPrefix}.${schemaH}`,
          value: parseFloat(parts[1]),
        });
        hNode.parent = geomCompound;
        geomCompound.children.push(hNode);
        geomCompound.to = hTo;
        i++;
      } else if (i < endIdx && tokens[i].type === 'string') {
        const strTok = tokens[i];
        const strNode = createAstNode({
          dslRole: 'value',
          from: strTok.offset,
          to: strTok.offset + strTok.value.length + 2, // +2 for quotes
          schemaPath: `${geomKey}.content`,
          modelPath: `${modelPrefix}.${geomKey}.content`,
          value: strTok.value,
        });
        strNode.parent = geomCompound;
        geomCompound.children.push(strNode);
        geomCompound.to = strTok.offset + strTok.value.length + 2;
        i++;
      }

      continue;
    }

    // fill/stroke keywords — wrap in compound AST node (matches emitter)
    if (tok.type === 'identifier' && (tok.value === 'fill' || tok.value === 'stroke')) {
      const propKey = tok.value;
      const propCompound = createAstNode({
        dslRole: 'compound',
        from: tok.offset,
        to: tok.offset + tok.value.length,
        schemaPath: propKey,
        modelPath: `${modelPrefix}.${propKey}`,
      });
      propCompound.parent = compound;
      compound.children.push(propCompound);

      const kwNode = createAstNode({
        dslRole: 'keyword',
        from: tok.offset,
        to: tok.offset + tok.value.length,
        schemaPath: propKey,
        modelPath: `${modelPrefix}.${propKey}`,
        value: propKey,
      });
      kwNode.parent = propCompound;
      propCompound.children.push(kwNode);
      i++;

      // Color value follows — find the next meaningful token
      while (i < endIdx && tokens[i].type !== 'newline' && tokens[i].type !== 'eof') {
        const ct = tokens[i];
        if (ct.type === 'identifier' && (ct.value === 'fill' || ct.value === 'stroke' || ct.value === 'at' ||
          ct.value === 'layout' || GEOM_KEYWORDS.has(ct.value) || (ct.value !== 'hsl' && ct.value !== 'rgb' &&
          ct.value !== 'a' && !resolveNamedColor(ct.value) && ct.value !== 'width' &&
          !TEXT_BOOLEANS.has(ct.value) && !PATH_BOOLEANS.has(ct.value) &&
          ct.value !== 'bold' && ct.value !== 'mono' && ct.value !== 'smooth' && ct.value !== 'closed' &&
          !FREE_FLOATING_PROPS.has(ct.value) && !TRANSFORM_PROPS.has(ct.value) &&
          !RECT_PROPS.has(ct.value) && !TEXT_PROPS.has(ct.value) && !IMAGE_PROPS.has(ct.value) &&
          !PATH_PROPS.has(ct.value) && !CAMERA_PROPS.has(ct.value) && !NODE_BOOLEANS.has(ct.value) &&
          tokens[i + 1]?.type !== 'equals'))) {
          break;
        }
        const valNode = createAstNode({
          dslRole: 'value',
          from: ct.offset,
          to: ct.offset + ct.value.length,
          schemaPath: propKey,
          modelPath: `${modelPrefix}.${propKey}`,
          value: ct.value,
        });
        valNode.parent = propCompound;
        propCompound.children.push(valNode);
        propCompound.to = ct.offset + ct.value.length;
        i++;
        // After color components, check for kwarg (width=, a=)
        if (tokens[i]?.type === 'equals') {
          break;
        }
        // Stop after one identifier that is a color name
        if (ct.type === 'identifier' && resolveNamedColor(ct.value)) break;
        if (ct.type === 'hexColor') break;
        // Stop after 3 numbers for HSL/RGB
        break;
      }

      // For stroke: consume trailing kwarg pairs (width=N) into the compound
      if (propKey === 'stroke') {
        while (i < endIdx && tokens[i]?.type === 'identifier' && i + 1 < endIdx && tokens[i + 1]?.type === 'equals') {
          const kTok = tokens[i];
          if (kTok.value !== 'width' && kTok.value !== 'a') break;
          const keyNode = createAstNode({
            dslRole: 'kwarg-key',
            from: kTok.offset,
            to: kTok.offset + kTok.value.length,
            schemaPath: `stroke.${kTok.value}`,
            modelPath: `${modelPrefix}.stroke.${kTok.value}`,
            value: kTok.value,
          });
          keyNode.parent = propCompound;
          propCompound.children.push(keyNode);
          i += 2; // skip key and =
          if (i < endIdx) {
            const vTok = tokens[i];
            const valNode = createAstNode({
              dslRole: 'kwarg-value',
              from: vTok.offset,
              to: vTok.offset + vTok.value.length,
              schemaPath: `stroke.${kTok.value}`,
              modelPath: `${modelPrefix}.stroke.${kTok.value}`,
              value: vTok.value,
            });
            valNode.parent = propCompound;
            propCompound.children.push(valNode);
            propCompound.to = vTok.offset + vTok.value.length;
            i++;
          }
        }
      }

      // For fill: consume trailing alpha kwarg (a=N) into the compound
      if (propKey === 'fill') {
        while (i < endIdx && tokens[i]?.type === 'identifier' && tokens[i]?.value === 'a' && i + 1 < endIdx && tokens[i + 1]?.type === 'equals') {
          const kTok = tokens[i];
          const keyNode = createAstNode({
            dslRole: 'kwarg-key',
            from: kTok.offset,
            to: kTok.offset + kTok.value.length,
            schemaPath: `fill.a`,
            modelPath: `${modelPrefix}.fill.a`,
            value: kTok.value,
          });
          keyNode.parent = propCompound;
          propCompound.children.push(keyNode);
          i += 2; // skip key and =
          if (i < endIdx) {
            const vTok = tokens[i];
            const valNode = createAstNode({
              dslRole: 'kwarg-value',
              from: vTok.offset,
              to: vTok.offset + vTok.value.length,
              schemaPath: `fill.a`,
              modelPath: `${modelPrefix}.fill.a`,
              value: vTok.value,
            });
            valNode.parent = propCompound;
            propCompound.children.push(valNode);
            propCompound.to = vTok.offset + vTok.value.length;
            i++;
          }
        }
      }

      continue;
    }

    // kwarg: key=value
    if (tok.type === 'identifier' && i + 1 < endIdx && tokens[i + 1].type === 'equals') {
      const keyNode = createAstNode({
        dslRole: 'kwarg-key',
        from: tok.offset,
        to: tok.offset + tok.value.length,
        schemaPath: tok.value,
        modelPath: `${modelPrefix}.${tok.value}`,
        value: tok.value,
      });
      keyNode.parent = compound;
      compound.children.push(keyNode);
      i += 2; // skip key and =

      if (i < endIdx) {
        const valTok = tokens[i];
        const valNode = createAstNode({
          dslRole: 'kwarg-value',
          from: valTok.offset,
          to: valTok.offset + valTok.value.length,
          schemaPath: tok.value,
          modelPath: `${modelPrefix}.${tok.value}`,
          value: valTok.value,
        });
        valNode.parent = compound;
        compound.children.push(valNode);
        i++;
      }
      continue;
    }

    // atSign sigil
    if (tok.type === 'atSign') {
      i++;
      if (i < endIdx && tokens[i].type === 'identifier') {
        const sigilTok = tokens[i];
        const sigilNode = createAstNode({
          dslRole: 'sigil',
          from: tok.offset,
          to: sigilTok.offset + sigilTok.value.length,
          schemaPath: 'style',
          modelPath: `${modelPrefix}.style`,
          value: sigilTok.value,
        });
        sigilNode.parent = compound;
        compound.children.push(sigilNode);
        i++;
      }
      continue;
    }

    // 'at' keyword — wrap in compound AST node (matches emitter)
    if (tok.type === 'identifier' && tok.value === 'at') {
      const transformCompound = createAstNode({
        dslRole: 'compound',
        from: tok.offset,
        to: tok.offset + tok.value.length,
        schemaPath: 'transform',
        modelPath: `${modelPrefix}.transform`,
      });
      transformCompound.parent = compound;
      compound.children.push(transformCompound);

      const kwNode = createAstNode({
        dslRole: 'keyword',
        from: tok.offset,
        to: tok.offset + tok.value.length,
        schemaPath: 'transform',
        modelPath: `${modelPrefix}.transform`,
        value: 'at',
      });
      kwNode.parent = transformCompound;
      transformCompound.children.push(kwNode);
      i++;

      // Consume position values and transform kwargs into the compound
      // Position: x,y or x=N y=N
      while (i < endIdx && tokens[i].type !== 'newline' && tokens[i].type !== 'eof') {
        const ct = tokens[i];
        // Stop at next property keyword
        if (ct.type === 'identifier' && (ct.value === 'fill' || ct.value === 'stroke' || ct.value === 'at' ||
          ct.value === 'layout' || ct.value === 'dash' || GEOM_KEYWORDS.has(ct.value))) break;
        // Stop at non-transform kwargs
        if (ct.type === 'identifier' && i + 1 < endIdx && tokens[i + 1]?.type === 'equals') {
          if (!TRANSFORM_PROPS.has(ct.value) && ct.value !== 'x' && ct.value !== 'y') break;
          // Transform kwarg
          const kTok = ct;
          const keyNode = createAstNode({
            dslRole: 'kwarg-key',
            from: kTok.offset,
            to: kTok.offset + kTok.value.length,
            schemaPath: `transform.${kTok.value}`,
            modelPath: `${modelPrefix}.transform.${kTok.value}`,
            value: kTok.value,
          });
          keyNode.parent = transformCompound;
          transformCompound.children.push(keyNode);
          i += 2; // skip key and =
          if (i < endIdx) {
            const vTok = tokens[i];
            const valNode = createAstNode({
              dslRole: 'kwarg-value',
              from: vTok.offset,
              to: vTok.offset + vTok.value.length,
              schemaPath: `transform.${kTok.value}`,
              modelPath: `${modelPrefix}.transform.${kTok.value}`,
              value: vTok.value,
            });
            valNode.parent = transformCompound;
            transformCompound.children.push(valNode);
            transformCompound.to = vTok.offset + vTok.value.length;
            i++;
          }
          continue;
        }
        // Stop at boolean flags that aren't transform-related
        if (ct.type === 'identifier' && (TEXT_BOOLEANS.has(ct.value) || PATH_BOOLEANS.has(ct.value) || NODE_BOOLEANS.has(ct.value))) break;
        // Stop at atSign
        if (ct.type === 'atSign') break;
        // Number or comma (position components)
        if (ct.type === 'number' || ct.type === 'comma') {
          const valNode = createAstNode({
            dslRole: ct.type === 'comma' ? 'separator' : 'value',
            from: ct.offset,
            to: ct.offset + ct.value.length,
            schemaPath: 'transform',
            modelPath: `${modelPrefix}.transform`,
            value: ct.type === 'number' ? parseFloat(ct.value) : ct.value,
          });
          valNode.parent = transformCompound;
          transformCompound.children.push(valNode);
          transformCompound.to = ct.offset + ct.value.length;
          i++;
          continue;
        }
        break;
      }
      continue;
    }

    // dash keyword — wrap in compound AST node (matches emitter)
    if (tok.type === 'identifier' && tok.value === 'dash') {
      const dashCompound = createAstNode({
        dslRole: 'compound',
        from: tok.offset,
        to: tok.offset + tok.value.length,
        schemaPath: 'dash',
        modelPath: `${modelPrefix}.dash`,
      });
      dashCompound.parent = compound;
      compound.children.push(dashCompound);

      const kwNode = createAstNode({
        dslRole: 'keyword',
        from: tok.offset,
        to: tok.offset + tok.value.length,
        schemaPath: 'dash',
        modelPath: `${modelPrefix}.dash`,
        value: 'dash',
      });
      kwNode.parent = dashCompound;
      dashCompound.children.push(kwNode);
      i++;

      // Consume pattern identifier and kwargs
      while (i < endIdx && tokens[i].type !== 'newline' && tokens[i].type !== 'eof' && tokens[i].type !== 'dedent') {
        const ct = tokens[i];
        if (ct.type === 'identifier' && (ct.value === 'fill' || ct.value === 'stroke' || ct.value === 'at' ||
          ct.value === 'layout' || ct.value === 'dash' || GEOM_KEYWORDS.has(ct.value))) break;
        if (ct.type === 'identifier' && i + 1 < endIdx && tokens[i + 1]?.type === 'equals') {
          const kTok = ct;
          const keyNode = createAstNode({
            dslRole: 'kwarg-key',
            from: kTok.offset,
            to: kTok.offset + kTok.value.length,
            schemaPath: `dash.${kTok.value}`,
            modelPath: `${modelPrefix}.dash.${kTok.value}`,
            value: kTok.value,
          });
          keyNode.parent = dashCompound;
          dashCompound.children.push(keyNode);
          i += 2;
          if (i < endIdx) {
            const vTok = tokens[i];
            const valNode = createAstNode({
              dslRole: 'kwarg-value',
              from: vTok.offset,
              to: vTok.offset + vTok.value.length,
              schemaPath: `dash.${kTok.value}`,
              modelPath: `${modelPrefix}.dash.${kTok.value}`,
              value: vTok.value,
            });
            valNode.parent = dashCompound;
            dashCompound.children.push(valNode);
            dashCompound.to = vTok.offset + vTok.value.length;
            i++;
          }
          continue;
        }
        if (ct.type === 'identifier') {
          // Pattern value
          const valNode = createAstNode({
            dslRole: 'value',
            from: ct.offset,
            to: ct.offset + ct.value.length,
            schemaPath: 'dash.pattern',
            modelPath: `${modelPrefix}.dash.pattern`,
            value: ct.value,
          });
          valNode.parent = dashCompound;
          dashCompound.children.push(valNode);
          dashCompound.to = ct.offset + ct.value.length;
          i++;
          continue;
        }
        break;
      }
      continue;
    }

    // layout keyword — wrap in compound AST node (matches emitter)
    if (tok.type === 'identifier' && tok.value === 'layout') {
      const layoutCompound = createAstNode({
        dslRole: 'compound',
        from: tok.offset,
        to: tok.offset + tok.value.length,
        schemaPath: 'layout',
        modelPath: `${modelPrefix}.layout`,
      });
      layoutCompound.parent = compound;
      compound.children.push(layoutCompound);

      const kwNode = createAstNode({
        dslRole: 'keyword',
        from: tok.offset,
        to: tok.offset + tok.value.length,
        schemaPath: 'layout',
        modelPath: `${modelPrefix}.layout`,
        value: 'layout',
      });
      kwNode.parent = layoutCompound;
      layoutCompound.children.push(kwNode);
      i++;

      // Consume type, direction, and kwargs
      while (i < endIdx && tokens[i].type !== 'newline' && tokens[i].type !== 'eof' && tokens[i].type !== 'dedent') {
        const ct = tokens[i];
        if (ct.type === 'identifier' && (ct.value === 'fill' || ct.value === 'stroke' || ct.value === 'at' ||
          ct.value === 'dash' || GEOM_KEYWORDS.has(ct.value))) break;
        if (ct.type === 'identifier' && i + 1 < endIdx && tokens[i + 1]?.type === 'equals') {
          const kTok = ct;
          const keyNode = createAstNode({
            dslRole: 'kwarg-key',
            from: kTok.offset,
            to: kTok.offset + kTok.value.length,
            schemaPath: `layout.${kTok.value}`,
            modelPath: `${modelPrefix}.layout.${kTok.value}`,
            value: kTok.value,
          });
          keyNode.parent = layoutCompound;
          layoutCompound.children.push(keyNode);
          i += 2;
          if (i < endIdx) {
            const vTok = tokens[i];
            const valNode = createAstNode({
              dslRole: 'kwarg-value',
              from: vTok.offset,
              to: vTok.offset + vTok.value.length,
              schemaPath: `layout.${kTok.value}`,
              modelPath: `${modelPrefix}.layout.${kTok.value}`,
              value: vTok.value,
            });
            valNode.parent = layoutCompound;
            layoutCompound.children.push(valNode);
            layoutCompound.to = vTok.offset + vTok.value.length;
            i++;
          }
          continue;
        }
        if (ct.type === 'identifier') {
          // Type or direction value
          const valNode = createAstNode({
            dslRole: 'value',
            from: ct.offset,
            to: ct.offset + ct.value.length,
            schemaPath: 'layout',
            modelPath: `${modelPrefix}.layout`,
            value: ct.value,
          });
          valNode.parent = layoutCompound;
          layoutCompound.children.push(valNode);
          layoutCompound.to = ct.offset + ct.value.length;
          i++;
          continue;
        }
        break;
      }
      continue;
    }

    // Boolean flags
    if (tok.type === 'identifier' && (TEXT_BOOLEANS.has(tok.value) || PATH_BOOLEANS.has(tok.value) || NODE_BOOLEANS.has(tok.value))) {
      const flagNode = createAstNode({
        dslRole: 'flag',
        from: tok.offset,
        to: tok.offset + tok.value.length,
        schemaPath: tok.value,
        modelPath: `${modelPrefix}.${tok.value}`,
        value: tok.value,
      });
      flagNode.parent = compound;
      compound.children.push(flagNode);
      i++;
      continue;
    }

    // Number value
    if (tok.type === 'number') {
      const valNode = createAstNode({
        dslRole: 'value',
        from: tok.offset,
        to: tok.offset + tok.value.length,
        schemaPath: '',
        modelPath: '',
        value: parseFloat(tok.value),
      });
      valNode.parent = compound;
      compound.children.push(valNode);
      i++;
      continue;
    }

    // Arrow
    if (tok.type === 'arrow') {
      const sepNode = createAstNode({
        dslRole: 'separator',
        from: tok.offset,
        to: tok.offset + 2,
        schemaPath: '',
        modelPath: '',
      });
      sepNode.parent = compound;
      compound.children.push(sepNode);
      i++;
      continue;
    }

    // Comma
    if (tok.type === 'comma') {
      const sepNode = createAstNode({
        dslRole: 'separator',
        from: tok.offset,
        to: tok.offset + 1,
        schemaPath: '',
        modelPath: '',
      });
      sepNode.parent = compound;
      compound.children.push(sepNode);
      i++;
      continue;
    }

    // String values
    if (tok.type === 'string') {
      const valNode = createAstNode({
        dslRole: 'value',
        from: tok.offset,
        to: tok.offset + tok.value.length + 2, // +2 for quotes
        schemaPath: '',
        modelPath: '',
        value: tok.value,
      });
      valNode.parent = compound;
      compound.children.push(valNode);
      i++;
      continue;
    }

    // Identifier values (colors, node refs in connections, etc.)
    if (tok.type === 'identifier') {
      const valNode = createAstNode({
        dslRole: 'value',
        from: tok.offset,
        to: tok.offset + tok.value.length,
        schemaPath: '',
        modelPath: '',
        value: tok.value,
      });
      valNode.parent = compound;
      compound.children.push(valNode);
      i++;
      continue;
    }

    // Parens, hex colors, etc.
    if (tok.type === 'hexColor') {
      const valNode = createAstNode({
        dslRole: 'value',
        from: tok.offset,
        to: tok.offset + tok.value.length,
        schemaPath: '',
        modelPath: '',
        value: tok.value,
      });
      valNode.parent = compound;
      compound.children.push(valNode);
      i++;
      continue;
    }

    // Skip everything else
    i++;
  }
}

// ─── Main Entry Point ────────────────────────────────────────────

export function buildAstFromText(input: string): ParseResult {
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
      } else if (s.is('identifier')) {
        const color = tryParseColor(s);
        if (color !== null) result.background = color;
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

    // Flat reference
    if (isFlatReference(s)) {
      const parts: string[] = [];
      parts.push(s.next().value);
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

    // Node line
    if (s.is('identifier') && s.peek(1).type === 'colon') {
      const node = parseNodeLine(s);
      s.skipNewlines();
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

  // Extract format hints
  const formatHints = extractFormatHints(tokens);

  // Build AST
  const ast = buildAst(tokens, result, input);

  return { ast, model: result, formatHints };
}
