import JSON5 from 'json5';
import { tokenize } from './tokenizer';
import { nameToHsl, hexToHsl } from './colorNames';
import type { Token, TokenType } from './types';

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

// Top-level document keywords (not node IDs)
const DOC_KEYWORDS = new Set([
  'name', 'description', 'background', 'viewport', 'images', 'style', 'animate',
]);

// ─── Color Parsing ──────────────────────────────────────────────

function tryParseColor(s: TokenStream): Record<string, number> | null {
  // Named color
  if (s.is('identifier')) {
    const name = s.peek().value;
    const hsl = nameToHsl(name);
    if (hsl) {
      s.next();
      const result: Record<string, number> = { ...hsl };
      // Check for a= after named color
      if (s.is('identifier', 'a') && s.peek(1).type === 'equals') {
        s.next(); // 'a'
        s.next(); // '='
        result.a = parseFloat(s.expect('number').value);
      }
      return result;
    }
    return null;
  }

  // Hex color
  if (s.is('hexColor')) {
    const hex = s.next().value;
    const hsl = hexToHsl(hex);
    const result: Record<string, number> = { ...hsl };
    // Check for a= after hex color
    if (s.is('identifier', 'a') && s.peek(1).type === 'equals') {
      s.next(); // 'a'
      s.next(); // '='
      result.a = parseFloat(s.expect('number').value);
    }
    return result;
  }

  // HSL: three numbers
  if (s.is('number') && s.peek(1).type === 'number' && s.peek(2).type === 'number') {
    const h = parseFloat(s.next().value);
    const sat = parseFloat(s.next().value);
    const l = parseFloat(s.next().value);
    const result: Record<string, number> = { h, s: sat, l };
    // Check for a= after HSL
    if (s.is('identifier', 'a') && s.peek(1).type === 'equals') {
      s.next(); // 'a'
      s.next(); // '='
      result.a = parseFloat(s.expect('number').value);
    }
    return result;
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

// ─── Property Application ────────────────────────────────────────

function applyKeyValueToNode(node: any, key: string, value: any): void {
  if (TRANSFORM_PROPS.has(key)) {
    if (!node.transform) node.transform = {};
    node.transform[key] = value;
  } else if (key === 'x' || key === 'y') {
    if (!node.transform) node.transform = {};
    node.transform[key] = value;
  } else if (CAMERA_PROPS.has(key) && node.camera !== undefined) {
    node.camera[key] = value;
  } else if (node.text && (key === 'size' || key === 'lineHeight' || key === 'align')) {
    node.text[key] = value;
  } else if (node.rect && key === 'radius') {
    node.rect[key] = value;
  } else if (node.image && key === 'fit') {
    node.image[key] = value;
  } else if (node.path && (key === 'radius' || key === 'bend' || key === 'drawProgress' || key === 'gap' || key === 'fromGap' || key === 'toGap')) {
    node.path[key] = value;
  } else {
    node[key] = value;
  }
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
        node.stroke = color;
        // Check for width= and a=
        while (s.is('identifier') && s.peek(1).type === 'equals') {
          const key = s.peek().value;
          if (key === 'width' || key === 'a') {
            s.next(); s.next(); // key, =
            (node.stroke as any)[key] = parseFloat(s.expect('number').value);
          } else {
            break;
          }
        }
      }
      continue;
    }

    // at keyword (position)
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

    // key=value
    const kv = parseKeyValue(s);
    if (kv) {
      applyKeyValueToNode(node, kv[0], kv[1]);
      continue;
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
      node.stroke = color;
      while (s.is('identifier') && s.peek(1).type === 'equals') {
        const key = s.peek().value;
        if (key === 'width' || key === 'a') {
          s.next(); s.next();
          (node.stroke as any)[key] = parseFloat(s.expect('number').value);
        } else {
          break;
        }
      }
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
          style.stroke = color;
          while (s.is('identifier') && s.peek(1).type === 'equals') {
            const key = s.peek().value;
            if (key === 'width' || key === 'a') {
              s.next(); s.next();
              (style.stroke as any)[key] = parseFloat(s.expect('number').value);
            } else {
              break;
            }
          }
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

// ─── Animation Parsing (placeholder — implemented in Task 7) ────

function parseAnimateBlock(_s: TokenStream): any {
  // Skip animate block for now; fully implemented in Task 7
  return { keyframes: [] };
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
