import type { WalkContext } from './walkContext';
import type { PositionalHint } from './dslMeta';
import { getDsl } from './dslMeta';
import type { z } from 'zod';
import { HslColorSchema, RgbColorSchema } from '../types/properties';

/**
 * Consume tokens for a positional hint. Returns an object populating the
 * hint's keys with parsed values. Tokens are consumed from the walker context.
 * Emits AST leaves as values are parsed.
 */
export function executePositional(
  ctx: WalkContext,
  hint: PositionalHint,
  schemaPath: string,
): Record<string, unknown> | null {
  const result: Record<string, unknown> = {};
  const format = hint.format;

  // dimension: "WxH" as a single dimensions token
  if (format === 'dimension') {
    if (!ctx.is('dimensions')) return null;
    const tok = ctx.next()!;
    const [a, b] = tok.value.split('x').map(Number);
    const [k1, k2] = hint.keys;
    const transform = (v: number) =>
      hint.transform === 'double' ? v / 2 : v;
    result[k1] = transform(a);
    if (k2) result[k2] = transform(b);
    ctx.emitLeaf({
      schemaPath: `${schemaPath}.${k1}`,
      from: tok.offset,
      to: tok.offset + tok.value.length,
      value: result[k1],
      dslRole: 'value',
    });
    return result;
  }

  // quoted: single string literal
  if (format === 'quoted') {
    if (!ctx.is('string')) return null;
    const tok = ctx.next()!;
    const [k] = hint.keys;
    result[k] = tok.value;
    ctx.emitLeaf({
      schemaPath: `${schemaPath}.${k}`,
      from: tok.offset,
      to: tok.offset + tok.value.length + 2, // include quotes
      value: tok.value,
      dslRole: 'value',
    });
    return result;
  }

  // joined: values separated by a specific separator (e.g., X,Y)
  if (format === 'joined') {
    const sep = hint.separator ?? ',';
    for (let i = 0; i < hint.keys.length; i++) {
      if (i > 0) {
        // Expect separator token
        if (sep === ',' && !ctx.is('comma')) return result;
        ctx.next();
      }
      if (!ctx.is('number')) return result;
      const tok = ctx.next()!;
      const k = hint.keys[i];
      result[k] = parseFloat(tok.value);
      ctx.emitLeaf({
        schemaPath: `${schemaPath}.${k}`,
        from: tok.offset,
        to: tok.offset + tok.value.length,
        value: result[k],
        dslRole: 'value',
      });
    }
    return result;
  }

  // spaced: values separated by whitespace
  if (format === 'spaced') {
    for (const k of hint.keys) {
      if (!ctx.is('number')) return result;
      const tok = ctx.next()!;
      result[k] = parseFloat(tok.value);
      ctx.emitLeaf({
        schemaPath: `${schemaPath}.${k}`,
        from: tok.offset,
        to: tok.offset + tok.value.length,
        value: result[k],
        dslRole: 'value',
      });
    }
    return result;
  }

  // tuples: list of (x,y) points
  if (format === 'tuples') {
    const [k] = hint.keys;
    const points: Array<[number, number]> = [];
    while (ctx.is('parenOpen')) {
      ctx.next(); // consume (
      if (!ctx.is('number')) break;
      const x = parseFloat(ctx.next()!.value);
      if (ctx.is('comma')) ctx.next();
      if (!ctx.is('number')) break;
      const y = parseFloat(ctx.next()!.value);
      if (ctx.is('parenClose')) ctx.next();
      points.push([x, y]);
    }
    result[k] = points;
    return result;
  }

  // arrow: identifier/(x,y)/(id,dx,dy) chain separated by arrows
  if (format === 'arrow') {
    const [k] = hint.keys;
    const route: unknown[] = [];

    const parseWaypoint = (): unknown | null => {
      if (ctx.is('identifier')) {
        return ctx.next()!.value;
      }
      if (ctx.is('parenOpen')) {
        ctx.next();
        // Could be (x,y) or (id,dx,dy)
        const first = ctx.peek();
        if (first?.type === 'number') {
          const x = parseFloat(ctx.next()!.value);
          if (ctx.is('comma')) ctx.next();
          const y = parseFloat(ctx.next()!.value);
          if (ctx.is('parenClose')) ctx.next();
          return [x, y];
        }
        if (first?.type === 'identifier') {
          const id = ctx.next()!.value;
          if (ctx.is('comma')) ctx.next();
          const dx = parseFloat(ctx.next()!.value);
          if (ctx.is('comma')) ctx.next();
          const dy = parseFloat(ctx.next()!.value);
          if (ctx.is('parenClose')) ctx.next();
          return [id, dx, dy];
        }
      }
      return null;
    };

    const first = parseWaypoint();
    if (first == null) return null;
    route.push(first);

    while (ctx.is('arrow')) {
      ctx.next();
      const wp = parseWaypoint();
      if (wp == null) break;
      route.push(wp);
    }
    result[k] = route;
    return result;
  }

  // Default: single value (identifier/number/hexColor/string)
  const tok = ctx.peek();
  if (!tok) return null;
  const [k] = hint.keys;
  if (tok.type === 'number') {
    result[k] = parseFloat(tok.value);
  } else if (tok.type === 'string' || tok.type === 'identifier' || tok.type === 'hexColor') {
    result[k] = tok.value;
  } else {
    return null;
  }
  ctx.next();
  ctx.emitLeaf({
    schemaPath: `${schemaPath}.${k}`,
    from: tok.offset,
    to: tok.offset + tok.value.length,
    value: result[k],
    dslRole: 'value',
  });
  return result;
}

/**
 * Consume key=value pairs where key is in the allowed list.
 * Stops when next token is not an allowed kwarg key.
 * Emits kwarg-key and kwarg-value AST leaves.
 */
export function executeKwargs(
  ctx: WalkContext,
  allowed: string[],
  schemaPath: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const allowedSet = new Set(allowed);

  while (!ctx.atEnd() && ctx.is('identifier')) {
    const keyTok = ctx.peek()!;
    if (!allowedSet.has(keyTok.value)) break;
    if (ctx.peek(1)?.type !== 'equals') break;
    ctx.next(); // consume key
    ctx.next(); // consume =

    const valTok = ctx.peek();
    if (!valTok) break;
    let value: unknown;
    if (valTok.type === 'number') value = parseFloat(valTok.value);
    else if (valTok.type === 'string') value = valTok.value;
    else if (valTok.type === 'identifier') value = valTok.value;
    else if (valTok.type === 'hexColor') value = valTok.value;
    else break;
    ctx.next();

    result[keyTok.value] = value;
    ctx.emitLeaf({
      schemaPath: `${schemaPath}.${keyTok.value}`,
      from: keyTok.offset,
      to: keyTok.offset + keyTok.value.length,
      value: keyTok.value,
      dslRole: 'kwarg-key',
    });
    ctx.emitLeaf({
      schemaPath: `${schemaPath}.${keyTok.value}`,
      from: valTok.offset,
      to: valTok.offset + valTok.value.length,
      value,
      dslRole: 'kwarg-value',
    });
  }
  return result;
}

/**
 * Consume bare flag identifiers from the allowed list.
 * Stops when next token is not an allowed flag, or when a kwarg (key=) is encountered.
 * Emits flag AST leaves.
 */
export function executeFlags(
  ctx: WalkContext,
  allowed: string[],
  schemaPath: string,
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  const allowedSet = new Set(allowed);

  while (!ctx.atEnd() && ctx.is('identifier')) {
    const tok = ctx.peek()!;
    if (!allowedSet.has(tok.value)) break;
    // Must not be a kwarg (not followed by =)
    if (ctx.peek(1)?.type === 'equals') break;
    ctx.next();
    result[tok.value] = true;
    ctx.emitLeaf({
      schemaPath: `${schemaPath}.${tok.value}`,
      from: tok.offset,
      to: tok.offset + tok.value.length,
      value: true,
      dslRole: 'flag',
    });
  }
  return result;
}

/**
 * Parse a construct driven by a schema's DslHints.
 * Consumes: keyword → positional args → kwargs/flags (interleaved).
 * Returns null if the keyword doesn't match, otherwise the parsed object.
 */
export function executeSchema(
  ctx: WalkContext,
  schema: z.ZodType,
  schemaPath: string,
): Record<string, unknown> | null {
  const hints = getDsl(schema);
  if (!hints) return null;

  // Match keyword if declared
  if (hints.keyword) {
    if (!ctx.is('identifier', hints.keyword)) return null;
    const kwTok = ctx.next()!;
    ctx.emitLeaf({
      schemaPath,
      from: kwTok.offset,
      to: kwTok.offset + kwTok.value.length,
      value: kwTok.value,
      dslRole: 'keyword',
    });
  }

  const result: Record<string, unknown> = {};

  // Positional args
  if (hints.positional) {
    for (const posHint of hints.positional) {
      const posResult = executePositional(ctx, posHint, schemaPath);
      if (posResult) Object.assign(result, posResult);
    }
  }

  // Kwargs and flags interleaved
  while (!ctx.atEnd() && ctx.is('identifier')) {
    const tok = ctx.peek()!;
    const isKwarg = ctx.peek(1)?.type === 'equals';
    if (isKwarg && hints.kwargs?.includes(tok.value)) {
      const kw = executeKwargs(ctx, hints.kwargs, schemaPath);
      Object.assign(result, kw);
    } else if (!isKwarg && hints.flags?.includes(tok.value)) {
      const fl = executeFlags(ctx, hints.flags, schemaPath);
      Object.assign(result, fl);
    } else {
      break;
    }
  }

  return result;
}

/**
 * Parse a single instance declaration: `id: body` or `id body`.
 * The idKey is assigned from the identifier. The body is parsed
 * against the instance schema's hints (geometry, inlineProps, sigil).
 */
export function executeInstance(
  ctx: WalkContext,
  instanceSchema: z.ZodType,
  idKey: string,
  colonMode: 'required' | 'optional',
  schemaPath: string,
): Record<string, unknown> | null {
  if (!ctx.is('identifier')) return null;
  const idTok = ctx.peek()!;
  const id = idTok.value;

  // Check for colon
  const hasColon = ctx.peek(1)?.type === 'colon';
  if (colonMode === 'required' && !hasColon) return null;

  ctx.next(); // consume identifier
  if (hasColon) ctx.next(); // consume colon

  ctx.emitLeaf({
    schemaPath: `${schemaPath}.${idKey}`,
    from: idTok.offset,
    to: idTok.offset + id.length,
    value: id,
    dslRole: 'value',
  });

  const result: Record<string, unknown> = { [idKey]: id };

  // Parse the body using the instance schema (NodeSchema-like)
  const body = executeNodeBody(ctx, instanceSchema, schemaPath);
  if (body) Object.assign(result, body);

  return result;
}

/**
 * Parse the body of a node: geometry keyword + its args, followed by
 * inline properties. Uses the schema's hints (geometry, inlineProps) to
 * determine what to look for.
 */
export function executeNodeBody(
  ctx: WalkContext,
  schema: z.ZodType,
  schemaPath: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const hints = getDsl(schema);
  if (!hints) return result;

  const geometry = hints.geometry ?? [];
  const inlineProps = hints.inlineProps ?? [];

  while (!ctx.atEnd() && (ctx.is('identifier') || ctx.is('atSign' as any))) {
    const tok = ctx.peek()!;

    // Sigil: @styleName
    if (hints.sigil && ctx.is('atSign' as any)) {
      const atTok = ctx.next()!;
      if (ctx.is('identifier')) {
        const nameTok = ctx.next()!;
        result[hints.sigil.key] = nameTok.value;
        ctx.emitLeaf({
          schemaPath: `${schemaPath}.${hints.sigil.key}`,
          from: atTok.offset,
          to: nameTok.offset + nameTok.value.length,
          value: nameTok.value,
          dslRole: 'sigil',
        });
        continue;
      }
      // atSign but no identifier following — stop
      break;
    }

    // Try geometry keywords (rect, ellipse, etc.)
    if (geometry.includes(tok.value)) {
      const geomSchema = resolveFieldSchema(schema, tok.value);
      if (geomSchema) {
        const geom = executeSchema(ctx, geomSchema, `${schemaPath}.${tok.value}`);
        if (geom != null) {
          result[tok.value] = geom;
          continue;
        }
      }
      // Geometry keyword found but schema couldn't parse — stop inline parsing
      break;
    }

    // Try inline props by matching field name or schema keyword
    // e.g. 'fill' matches field 'fill', 'stroke' matches field 'stroke',
    // 'at' matches field 'transform' (which has keyword 'at')
    const inlinePropField = findInlinePropField(schema, inlineProps, tok.value);
    if (inlinePropField !== null) {
      const { fieldName } = inlinePropField;
      // Special handling for 'fill' — color union, no wrapping schema
      if (fieldName === 'fill') {
        ctx.next(); // consume 'fill'
        ctx.emitLeaf({
          schemaPath: `${schemaPath}.fill`,
          from: tok.offset,
          to: tok.offset + tok.value.length,
          value: 'fill',
          dslRole: 'keyword',
        });
        const color = executeColor(ctx, `${schemaPath}.fill`);
        if (color != null) result.fill = color;
        continue;
      }
      const propSchema = resolveFieldSchema(schema, fieldName);
      if (propSchema) {
        const parsed = executeSchema(ctx, propSchema, `${schemaPath}.${fieldName}`);
        if (parsed != null && Object.keys(parsed).length > 0) {
          result[fieldName] = parsed;
          continue;
        }
      }
      // Inline prop keyword recognized but couldn't parse — stop
      break;
    }

    // Not a recognized token — break (inline parsing stops)
    break;
  }

  // Children: indented block
  ctx.skipNewlines();
  if (ctx.is('indent' as any) && hints.children?.children === 'block') {
    ctx.next(); // consume indent
    const children: Array<Record<string, unknown>> = [];
    while (!ctx.atEnd() && !ctx.is('dedent' as any)) {
      ctx.skipNewlines();
      if (ctx.is('dedent' as any)) break;
      // Recursively parse child instance using the same schema
      const child = executeInstance(ctx, schema, 'id', 'required', `${schemaPath}.children`);
      if (child) {
        children.push(child);
        ctx.skipNewlines();
      } else {
        // Can't parse as instance — skip token to avoid infinite loop
        ctx.next();
      }
    }
    if (ctx.is('dedent' as any)) ctx.next();
    if (children.length > 0) result.children = children;
  }

  return result;
}

/** Unwrap Zod optional/default wrappers to get the inner schema. */
function unwrap(schema: z.ZodType): z.ZodType {
  let s: any = schema;
  while (s?._def?.innerType) {
    s = s._def.innerType;
  }
  return s as z.ZodType;
}

/**
 * Walk the schema chain (including Zod v4 `_zod.parent`) to find a version
 * that has DSL hints registered. `.describe()` in Zod v4 creates a new schema
 * object while keeping the original in `_zod.parent`, so the DSL WeakMap
 * entry is on the original.
 */
function findDslSchema(schema: z.ZodType): z.ZodType {
  let s: any = schema;
  while (s) {
    if (getDsl(s as z.ZodType)) return s as z.ZodType;
    s = s?._zod?.parent ?? null;
  }
  return schema;
}

/** Look up a field schema within an object schema, unwrapping wrappers. */
function resolveFieldSchema(schema: z.ZodType, fieldName: string): z.ZodType | null {
  const unwrapped = unwrap(schema);
  const shape = (unwrapped as any).shape;
  if (!shape?.[fieldName]) return null;
  // Find the DSL-registered version of the schema (surviving .describe() wrapping)
  return findDslSchema(unwrap(shape[fieldName]));
}

/**
 * Find which inline prop field matches the current token value.
 * First checks if the token matches a field name directly (e.g. 'fill', 'stroke').
 * Then checks if any field's DSL keyword matches (e.g. 'at' → 'transform').
 * Returns { fieldName } or null if no match.
 */
function findInlinePropField(
  schema: z.ZodType,
  inlineProps: string[],
  tokenValue: string,
): { fieldName: string } | null {
  // Direct field name match
  if (inlineProps.includes(tokenValue)) {
    return { fieldName: tokenValue };
  }
  // Check if any inline prop field's schema has keyword matching the token
  for (const fieldName of inlineProps) {
    const fs = resolveFieldSchema(schema, fieldName);
    if (!fs) continue;
    const fHints = getDsl(fs);
    if (fHints?.keyword === tokenValue) {
      return { fieldName };
    }
  }
  return null;
}

/**
 * Parse a color value — named, hex, hsl, or rgb form.
 * Returns the parsed value (string for named/hex, object for hsl/rgb).
 * Returns null if the next token is not a color.
 */
export function executeColor(ctx: WalkContext, schemaPath: string): unknown {
  const tok = ctx.peek();
  if (!tok) return null;

  if (tok.type === 'hexColor') {
    ctx.next();
    ctx.emitLeaf({
      schemaPath,
      from: tok.offset,
      to: tok.offset + tok.value.length,
      value: tok.value,
      dslRole: 'value',
    });
    return tok.value;
  }

  if (tok.type === 'identifier') {
    if (tok.value === 'hsl') {
      return executeSchema(ctx, HslColorSchema, schemaPath);
    }
    if (tok.value === 'rgb') {
      return executeSchema(ctx, RgbColorSchema, schemaPath);
    }
    // Named color
    ctx.next();
    ctx.emitLeaf({
      schemaPath,
      from: tok.offset,
      to: tok.offset + tok.value.length,
      value: tok.value,
      dslRole: 'value',
    });
    return tok.value;
  }

  return null;
}
