import type { WalkContext } from './walkContext';
import type { Token } from './types';
import type { PositionalHint } from './dslMeta';
import { getDsl } from './dslMeta';
import { z } from 'zod';
import { HslColorSchema, RgbColorSchema } from '../types/properties';
import { ChapterSchema } from '../types/animation';
import { getSetNames, getShapeNames, getShapePropsSchema } from '../templates/registry';
import { unwrap, findDslSchema, resolveFieldSchema, blockEntryField } from './schemaIntrospect';

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

  // Intermediate keyword (e.g. `at` between name and time in
  // `chapter "Intro" at 3.5`). Consume it before reading the value.
  if (hint.keyword) {
    if (!ctx.is('identifier', hint.keyword)) return null;
    ctx.next();
  }

  // dimension: "WxH" — a size as a single identifier token (e.g. "140x80").
  // Keyword-led and never in a list/kwarg/after->, so it stays paren-free and
  // keeps the domain "by" glyph. Ellipse uses transform:'double' (diameter).
  if (format === 'dimension') {
    if (!ctx.is('identifier')) return null;
    const tok = ctx.peek()!;
    const m = /^(-?\d+(?:\.\d+)?)x(-?\d+(?:\.\d+)?)$/.exec(tok.value);
    if (!m) return null;
    ctx.next();
    const transform = (v: number) =>
      hint.transform === 'double' ? v / 2 : v;
    const [k1, k2] = hint.keys;
    result[k1] = transform(parseFloat(m[1]));
    if (k2) result[k2] = transform(parseFloat(m[2]));
    // One leaf per number, each spanning only its own digits. A single leaf
    // over the whole `200x120` token claimed to be the width, so an editor
    // writing a new width through it replaced the height as well.
    ctx.emitLeaf({
      schemaPath: `${schemaPath}.${k1}`,
      from: tok.offset,
      to: tok.offset + m[1].length,
      value: result[k1],
      dslRole: 'value',
    });
    if (k2) {
      ctx.emitLeaf({
        schemaPath: `${schemaPath}.${k2}`,
        from: tok.offset + m[1].length + 1, // past the 'x'
        to: tok.end,
        value: result[k2],
        dslRole: 'value',
      });
    }
    return result;
  }

  // number: a single bare numeric token (rejects non-numeric identifiers so
  // e.g. `animate s` does not assign the string "s" to a numeric field).
  if (format === 'number') {
    if (!ctx.is('number')) return null;
    const tok = ctx.next()!;
    const [k] = hint.keys;
    result[k] = parseFloat(tok.value);
    ctx.emitLeaf({
      schemaPath: `${schemaPath}.${k}`,
      from: tok.offset,
      to: tok.end,
      value: result[k],
      dslRole: 'value',
    });
    return result;
  }

  // color: named/hex/hsl/rgb variant
  if (format === 'color') {
    const [k] = hint.keys;
    const color = executeColor(ctx, `${schemaPath}.${k}`);
    if (color == null) return null;
    result[k] = color;
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
      to: tok.end, // the token's span, quotes included
      value: tok.value,
      dslRole: 'value',
    });
    return result;
  }

  // joined: a bare comma pair "X,Y" — keyword-led (e.g. `at 200,150`), so it
  // stays paren-free. When no number follows (e.g. `at rotation=45`), returns
  // the partial result so the caller's kwarg loop handles the remaining keys.
  if (format === 'joined') {
    const sep = hint.separator ?? ',';
    for (let i = 0; i < hint.keys.length; i++) {
      if (i > 0) {
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
        to: tok.end,
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
        to: tok.end,
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
        // If the identifier is followed by '=', it is a kwarg, not a waypoint.
        if (ctx.peek(1)?.type === 'equals') return null;
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

  // bracketList: [id, id, ...] — array of identifier strings
  if (format === 'bracketList') {
    const [k] = hint.keys;
    const items: string[] = [];
    if (!ctx.is('bracketOpen')) return null;
    const openTok = ctx.next()!; // consume [
    while (!ctx.atEnd() && !ctx.is('bracketClose')) {
      // Quoted members as well as bare, so a list can hold anything with a
      // space or punctuation in it — `cols=["First name", "Age"]`.
      if (ctx.is('identifier') || ctx.is('string')) {
        const itemTok = ctx.next()!;
        items.push(itemTok.value);
        ctx.emitLeaf({
          schemaPath: `${schemaPath}.${k}`,
          from: itemTok.offset,
          to: itemTok.end,
          value: itemTok.value,
          dslRole: 'value',
        });
      } else if (ctx.is('comma')) {
        ctx.next(); // consume comma
      } else {
        ctx.next(); // skip unknown
      }
    }
    let closeTo = openTok.offset + 1;
    if (ctx.is('bracketClose')) {
      const closeTok = ctx.next()!;
      closeTo = closeTok.offset + 1;
    }
    result[k] = items;
    ctx.emitLeaf({
      schemaPath,
      from: openTok.offset,
      to: closeTo,
      value: items,
      dslRole: 'value',
    });
    return result;
  }

  // Default: single value (identifier/number/hexColor/string)
  const tok = ctx.peek();
  if (!tok) return null;
  const [k] = hint.keys;
  if (tok.type === 'number') {
    result[k] = parseFloat(tok.value);
    ctx.next();
    ctx.emitLeaf({
      schemaPath: `${schemaPath}.${k}`,
      from: tok.offset,
      to: tok.end,
      value: result[k],
      dslRole: 'value',
    });
    return result;
  }
  if (tok.type === 'identifier') {
    // If the identifier is followed by '=', it is a kwarg, not a positional.
    // Return null so the caller's kwarg loop handles it.
    if (ctx.peek(1)?.type === 'equals') return null;

    result[k] = tok.value;
  } else if (tok.type === 'string' || tok.type === 'hexColor') {
    result[k] = tok.value;
  } else {
    return null;
  }
  ctx.next();
  ctx.emitLeaf({
    schemaPath: `${schemaPath}.${k}`,
    from: tok.offset,
    to: tok.end,
    value: result[k],
    dslRole: 'value',
  });
  return result;
}

/**
 * Coerce an identifier-token kwarg value using the target field's Zod
 * schema. Currently only boolean fields need this: 'true'/'false' identifier
 * tokens become real booleans (e.g. `layout skip=true`) when the field
 * resolves to z.boolean() — the schema is the single source of truth for
 * what a kwarg's type is, rather than hand-listing which kwargs are boolean.
 * Any other identifier (or a non-boolean field) stays a string.
 */
function coerceKwargValue(raw: string, ownerSchema: z.ZodType | undefined, fieldName: string): unknown {
  if ((raw === 'true' || raw === 'false') && ownerSchema) {
    const fieldSchema = resolveFieldSchema(ownerSchema, fieldName);
    if (fieldSchema instanceof z.ZodBoolean) return raw === 'true';
  }
  return raw;
}

/**
 * Read the value half of a `key=value` pair, whatever its token shape.
 *
 * One value grammar, two callers: node-level kwargs and template props. They
 * used to be separate copies, and drifted — the template copy never coerced
 * booleans, so `dashed=false` stored the string "false" and drew a dashed
 * line. Returns null when the next token cannot open a value.
 */
function readKwargValue(
  ctx: WalkContext,
  ownerSchema: z.ZodType | undefined,
  key: string,
): { value: unknown; tok: Token; to: number } | null {
  const valTok = ctx.peek();
  if (!valTok) return null;
  const to = valTok.end;
  if (valTok.type === 'number') { ctx.next(); return { value: parseFloat(valTok.value), tok: valTok, to }; }
  if (valTok.type === 'string') { ctx.next(); return { value: valTok.value, tok: valTok, to }; }
  if (valTok.type === 'identifier') { ctx.next(); return { value: coerceKwargValue(valTok.value, ownerSchema, key), tok: valTok, to }; }
  if (valTok.type === 'hexColor') { ctx.next(); return { value: valTok.value, tok: valTok, to }; }
  // Parenthesized value: (x,y) → [x, y] or (id) → ['id'] or (id,dx,dy) → [id, dx, dy]
  if (valTok.type === 'parenOpen') {
    const items = parseKwargTuple(ctx);
    // Span the whole tuple, not just the `(` — the anchor widget writes
    // `(x,y)` back over this range and would otherwise leave the tail behind.
    return { value: items, tok: valTok, to: ctx.peek(-1)?.end ?? to };
  }
  // Bracket list: ["Name", "Age"] → ['Name', 'Age']. A list-valued prop had no
  // spelling at all before, so `cols` could only be set from JSON.
  if (valTok.type === ('bracketOpen' as typeof valTok.type)) {
    const items = parseKwargList(ctx);
    const closed = ctx.peek(-1);
    return { value: items, tok: valTok, to: closed?.end ?? to };
  }
  return null;
}

/** Parse a bracket list value: `[a, "b c", 3]` → ['a', 'b c', 3]. */
function parseKwargList(ctx: WalkContext): unknown[] {
  const items: unknown[] = [];
  if (!ctx.is('bracketOpen' as any)) return items;
  ctx.next(); // consume [
  while (!ctx.atEnd() && !ctx.is('bracketClose' as any)) {
    const tok = ctx.peek();
    if (!tok) break;
    if (tok.type === 'number') items.push(parseFloat(ctx.next()!.value));
    else if (tok.type === 'identifier' || tok.type === 'string') items.push(ctx.next()!.value);
    else if (tok.type === 'comma') ctx.next();
    else break;
  }
  if (ctx.is('bracketClose' as any)) ctx.next(); // consume ]
  return items;
}

/**
 * Consume key=value pairs where key is in the allowed list.
 * Stops when next token is not an allowed kwarg key.
 * Emits kwarg-key and kwarg-value AST leaves.
 *
 * `ownerSchema`, when given, resolves each kwarg's field type for value
 * coercion (see coerceKwargValue) — pass the object schema that declares
 * these kwargs (e.g. LayoutSchema for `layout ...`, NodeSchema for node-level
 * kwargs like `opacity=`).
 */
export function executeKwargs(
  ctx: WalkContext,
  allowed: string[],
  schemaPath: string,
  ownerSchema?: z.ZodType,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const allowedSet = new Set(allowed);

  while (!ctx.atEnd() && ctx.is('identifier')) {
    const keyTok = ctx.peek()!;
    if (!allowedSet.has(keyTok.value)) break;
    if (ctx.peek(1)?.type !== 'equals') break;
    ctx.next(); // consume key
    ctx.next(); // consume =

    const read = readKwargValue(ctx, ownerSchema, keyTok.value);
    if (!read) break;
    const { value, tok: valTok, to: valTo } = read;

    result[keyTok.value] = value;
    ctx.emitLeaf({
      schemaPath: `${schemaPath}.${keyTok.value}`,
      from: keyTok.offset,
      to: keyTok.end,
      value: keyTok.value,
      dslRole: 'kwarg-key',
    });
    ctx.emitLeaf({
      schemaPath: `${schemaPath}.${keyTok.value}`,
      from: valTok.offset,
      to: valTo,
      value,
      dslRole: 'kwarg-value',
    });
  }
  return result;
}

/**
 * Parse a parenthesized kwarg tuple: `(x,y)` → [x,y] or `(id)` → ['id'] or `(id,dx,dy)` → [id,dx,dy].
 * Used for camera `look=(300,200)` style kwarg values.
 */
function parseKwargTuple(ctx: WalkContext): unknown[] {
  const items: unknown[] = [];
  if (!ctx.is('parenOpen')) return items;
  ctx.next(); // consume (

  while (!ctx.atEnd() && !ctx.is('parenClose')) {
    const tok = ctx.peek();
    if (!tok) break;
    if (tok.type === 'number') { items.push(parseFloat(ctx.next()!.value)); }
    else if (tok.type === 'identifier') { items.push(ctx.next()!.value); }
    else if (tok.type === 'comma') { ctx.next(); } // skip comma
    else break;
  }
  if (ctx.is('parenClose')) ctx.next(); // consume )

  return items;
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
      to: tok.end,
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
 *
 * Supports `variants` on DslHints: picks the matching variant by peeking
 * tokens, then uses that variant's hints for parsing.
 */
export function executeSchema(
  ctx: WalkContext,
  schema: z.ZodType,
  schemaPath: string,
): Record<string, unknown> | null {
  const hints = getDsl(schema);
  if (!hints) return null;

  // Variant dispatch: if the schema has variants, pick the matching one.
  // Variant selection is done by peeking tokens:
  //   - 'points' variant: keyword='path', next token is parenOpen
  //   - 'route' variant: no keyword, next token is identifier or parenOpen
  // The variant's hints override the top-level hints for this parse.
  const activeHints = hints.variants
    ? selectVariantHints(ctx, hints)
    : hints;
  if (!activeHints) return null;

  // Match keyword if declared
  if (activeHints.keyword) {
    if (!ctx.is('identifier', activeHints.keyword)) return null;
    const kwTok = ctx.next()!;
    ctx.emitLeaf({
      schemaPath,
      from: kwTok.offset,
      to: kwTok.end,
      value: kwTok.value,
      dslRole: 'keyword',
    });
  }

  const result: Record<string, unknown> = {};

  // Positional args
  if (activeHints.positional) {
    for (const posHint of activeHints.positional) {
      const posResult = executePositional(ctx, posHint, schemaPath);
      if (posResult) Object.assign(result, posResult);
    }
  }

  // Kwargs and flags interleaved — merge both variant and top-level lists.
  // Positional keys with fallbackToKwarg are also accepted as kwargs.
  const fallbackKwargs: string[] = [];
  for (const posHint of activeHints.positional ?? []) {
    if (posHint.fallbackToKwarg) fallbackKwargs.push(...posHint.keys);
  }
  const allKwargs = [...(activeHints.kwargs ?? []), ...(hints.kwargs ?? []), ...fallbackKwargs];
  const allFlags = [...(activeHints.flags ?? []), ...(hints.flags ?? [])];
  const kwargsSet = new Set(allKwargs);
  const flagsSet = new Set(allFlags);

  while (!ctx.atEnd() && ctx.is('identifier')) {
    const tok = ctx.peek()!;
    const isKwarg = ctx.peek(1)?.type === 'equals';
    if (isKwarg && kwargsSet.has(tok.value)) {
      const kw = executeKwargs(ctx, allKwargs, schemaPath, schema);
      Object.assign(result, kw);
    } else if (isKwarg && flagsSet.has(tok.value)) {
      // `bold=true` — the explicit spelling of a flag. Only the bare form
      // parsed here, so `text "hi" bold=true` dropped the rest of the line
      // into phantom objects, while templates accepted only the explicit
      // form. Both levels now take both spellings, and executeKwargs
      // coerces against the schema so `=false` genuinely means false.
      Object.assign(result, executeKwargs(ctx, allFlags, schemaPath, schema));
    } else if (!isKwarg && flagsSet.has(tok.value)) {
      const fl = executeFlags(ctx, allFlags, schemaPath);
      Object.assign(result, fl);
    } else {
      break;
    }
  }

  return result;
}

/**
 * Pick the matching variant hints by peeking at the token stream.
 * Keyword-gated variants are tried first (they match when the current token
 * is the variant's keyword). No-keyword variants are used as fallback.
 * Returns null if no variants are available.
 *
 * For PathGeomSchema:
 *   - 'points' variant: keyword='path', matched when current token is 'path'
 *   - 'route' variant:  no keyword, used as fallback for arrow-based connections
 */
function selectVariantHints(
  ctx: WalkContext,
  hints: ReturnType<typeof getDsl>,
): ReturnType<typeof getDsl> {
  if (!hints?.variants?.length) return hints;

  // First pass: try keyword-gated variants (more specific)
  for (const variant of hints.variants) {
    const vHints = variant.hints;
    if (vHints.keyword && ctx.is('identifier', vHints.keyword)) {
      return vHints;
    }
  }

  // Second pass: use the first no-keyword variant as fallback
  for (const variant of hints.variants) {
    if (!variant.hints.keyword) {
      return variant.hints;
    }
  }

  return hints.variants[0].hints;
}

/**
 * Parse a single instance declaration: `id: body` or `id body`.
 * Supports dotted IDs like `a.bg:` where the full dotted string becomes the id.
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

  // Peek ahead to determine if this is a valid instance declaration.
  // Handles dotted IDs: a.bg: or a.bg.sub:
  let peekOffset = 0;
  let idParts = [ctx.peek(peekOffset)!.value];
  peekOffset++;
  while (ctx.peek(peekOffset)?.type === 'dot') {
    peekOffset++; // consume dot
    const next = ctx.peek(peekOffset);
    if (next?.type !== 'identifier') break;
    idParts.push(next.value);
    peekOffset++;
  }
  const id = idParts.join('.');

  // Check for colon at the current peek position
  const hasColon = ctx.peek(peekOffset)?.type === 'colon';
  if (colonMode === 'required' && !hasColon) return null;

  // Also verify this looks like an instance line (avoid treating arrow lines as instances)
  // An instance requires: id (possibly dotted) followed by colon, OR id followed by geometry keyword
  // For 'required' mode, the colon check above is sufficient.
  // For 'optional' mode, we need to be careful not to consume non-instance lines.

  const idTok = ctx.peek()!;

  // Consume id tokens (with dots)
  let lastIdTok = ctx.next()!; // consume first identifier
  while (ctx.is('dot' as any)) {
    ctx.next(); // consume dot
    lastIdTok = ctx.next() ?? lastIdTok; // consume next identifier
  }
  if (hasColon) ctx.next(); // consume colon

  ctx.emitLeaf({
    schemaPath: `${schemaPath}.${idKey}`,
    from: idTok.offset,
    to: lastIdTok.end,
    value: id,
    dslRole: 'value',
  });

  const result: Record<string, unknown> = { [idKey]: id };

  // Parse the body using the instance schema (NodeSchema-like)
  const body = executeNodeBody(ctx, instanceSchema, schemaPath, id);
  if (body) Object.assign(result, body);

  return result;
}

/**
 * Parse the positional props that follow a shape name (from DslHints on the
 * shape's props schema) — `box "Label"`, `arrow a -> b`.
 *
 * Everything after the positionals (`key=value` and bare flags) is read by
 * executeNodeBody's single inline loop, alongside node-level properties.
 * This used to be a second flags/kwargs loop here, which terminated at the
 * first token it didn't recognise: `box "X" at 150,40 color=red` parsed the
 * transform and then dropped `color=red` on the floor, because template-prop
 * parsing had already finished and never resumed.
 *
 * For arrow-format positionals, the route array is split into
 * from (first), to (last), and route (intermediates).
 */
function parseTemplatePositionals(
  ctx: WalkContext,
  templateName: string,
  schemaPath: string,
): Record<string, unknown> {
  const props: Record<string, unknown> = {};

  // Look up DslHints from the shape's props schema
  const propsSchema = getShapePropsSchema(templateName);
  const hints = propsSchema ? getDsl(propsSchema) : undefined;

  // Parse positionals if the schema declares them
  if (hints?.positional) {
    for (const posHint of hints.positional) {
      // An `arrow`-format positional reads a route, and its waypoint parser
      // accepts any bare identifier. Without an actual `->` on the line it
      // would swallow the next token — `arrow dashed from=a to=b` set
      // route=['dashed'] and lost the flag with no warning at all.
      if (posHint.format === 'arrow' && !hasArrowAhead(ctx)) break;
      const posResult = executePositional(ctx, posHint, `${schemaPath}.tplprops:${templateName}`);
      if (posResult) {
        Object.assign(props, posResult);
      } else {
        break; // Stop at first non-matching positional
      }
    }
    // Post-process arrow format: split route into from/to/intermediates
    if (props.route && Array.isArray(props.route)) {
      const route = props.route as unknown[];
      props.from = route[0];
      props.to = route[route.length - 1];
      if (route.length > 2) {
        props.route = route.slice(1, -1);
      } else {
        delete props.route;
      }
    }
  }

  return props;
}

/**
 * Read one template prop — `key=value` or a bare boolean flag — into `props`.
 * Returns false when the token is not a template prop, leaving the cursor
 * untouched so the caller can try something else or stop.
 *
 * A prop the shape's schema doesn't declare is still stored (templates read a
 * few keys they never declared, and a document shouldn't stop working because
 * of that) but it warns, because the overwhelmingly likelier cause is a typo
 * that would otherwise vanish without trace.
 */
function readTemplateProp(
  ctx: WalkContext,
  templateName: string,
  props: Record<string, unknown>,
  schemaPath: string,
): boolean {
  const keyTok = ctx.peek();
  if (!keyTok || keyTok.type !== 'identifier') return false;

  const propsSchema = getShapePropsSchema(templateName);
  const hints = propsSchema ? getDsl(propsSchema) : undefined;
  const declared = propsSchema ? Object.keys((propsSchema as z.ZodObject<any>).shape ?? {}) : [];
  const leafPath = `${schemaPath}.tplprops:${templateName}.${keyTok.value}`;

  // Bare flag: `dashed`, `mono`. Boolean-ness comes from the schema, so a
  // shape gets flags by declaring z.boolean() — no second list to maintain.
  if (ctx.peek(1)?.type !== 'equals') {
    const isFlag = hints?.flags?.includes(keyTok.value)
      || (propsSchema ? resolveFieldSchema(propsSchema, keyTok.value) instanceof z.ZodBoolean : false);
    if (!isFlag) return false;
    ctx.next();
    props[keyTok.value] = true;
    ctx.emitLeaf({
      schemaPath: leafPath,
      from: keyTok.offset,
      to: keyTok.end,
      value: true,
      dslRole: 'flag',
    });
    return true;
  }

  ctx.next(); // consume key
  ctx.next(); // consume =
  // Coerced against the props schema, so a `z.boolean()` prop written
  // `dashed=false` becomes the boolean false rather than the string "false" —
  // which every template truthiness-checks, and so drew a dashed line.
  const read = readKwargValue(ctx, propsSchema, keyTok.value);
  if (!read) {
    ctx.warn(`${templateName} "${keyTok.value}=" has no value`);
    ctx.skipToNewline(); // else the unread tail warns again, less usefully
    return true;
  }
  if (declared.length > 0 && !declared.includes(keyTok.value)) {
    ctx.warn(`Unknown property "${keyTok.value}" for shape "${templateName}" — it will be passed through unused`);
  }
  props[keyTok.value] = read.value;
  ctx.emitLeaf({
    schemaPath: leafPath,
    from: keyTok.offset,
    to: keyTok.end,
    value: keyTok.value,
    dslRole: 'kwarg-key',
  });
  ctx.emitLeaf({
    schemaPath: leafPath,
    from: read.tok.offset,
    to: read.to,
    value: read.value,
    dslRole: 'kwarg-value',
  });
  return true;
}

/**
 * Parse the body of a node: geometry keyword + its args, followed by
 * inline properties. Uses the schema's hints (geometry, inlineProps) to
 * determine what to look for.
 *
 * Also handles:
 * - Arrow/route syntax: `a -> b` (path with route variant, no keyword)
 * - Template syntax: `template name key=val ...`
 * - Indented block properties (blockProps) alongside children
 */
export function executeNodeBody(
  ctx: WalkContext,
  schema: z.ZodType,
  schemaPath: string,
  nodeId?: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const hints = getDsl(schema);
  if (!hints) return result;

  // Template props accumulate here rather than on `result` directly: the
  // positionals land before the inline loop runs and the rest during it.
  const templateProps: Record<string, unknown> = {};
  const geometry = hints.geometry ?? [];
  const inlineProps = hints.inlineProps ?? [];
  const blockProps = hints.blockProps ?? [];

  // ── Arrow/route detection ──────────────────────────────────────
  // Check if current line starts with an arrow-based route.
  // Handles: `a -> b`, `(a,10,20) -> (b,-5,0)`, `(250,100) -> b`, etc.
  // This must be checked BEFORE geometry keywords so that node IDs like 'a'
  // are not misidentified as geometry.
  // A shape name opening the line means the template form — `c: arrow a -> b
  // label="x"`, whose own hints know how to read the route into from/to.
  // Without this the route branch consumed the word `arrow` as the first
  // waypoint, and the rest of the line re-parsed as a second object, which
  // surfaced as a baffling `Duplicate ID: "a"`.
  if ((ctx.is('identifier') || ctx.is('parenOpen' as any)) && hasArrowAhead(ctx) && !startsWithShapeName(ctx, geometry)) {
    const pathSchema = resolveFieldSchema(schema, 'path');
    if (pathSchema) {
      // Use the route variant hints directly (no keyword, format: 'arrow')
      const pathHints = getDsl(pathSchema);
      const routeVariant = pathHints?.variants?.find(v => v.when === 'route');
      if (routeVariant) {
        // Parse route positional (arrow format)
        const routeResult = executePositional(ctx, routeVariant.hints.positional![0], `${schemaPath}.path`);
        const pathObj: Record<string, unknown> = {};
        if (routeResult) Object.assign(pathObj, routeResult);
        // Parse kwargs/flags from the route variant
        const allKwargs = [...(routeVariant.hints.kwargs ?? []), ...(pathHints?.kwargs ?? [])];
        const allFlags = [...(routeVariant.hints.flags ?? []), ...(pathHints?.flags ?? [])];
        while (!ctx.atEnd() && ctx.is('identifier')) {
          const kTok = ctx.peek()!;
          const isKwarg = ctx.peek(1)?.type === 'equals';
          if (isKwarg && allKwargs.includes(kTok.value)) {
            Object.assign(pathObj, executeKwargs(ctx, allKwargs, `${schemaPath}.path`, pathSchema));
          } else if (!isKwarg && allFlags.includes(kTok.value)) {
            Object.assign(pathObj, executeFlags(ctx, allFlags, `${schemaPath}.path`));
          } else {
            break;
          }
        }
        result.path = pathObj;
        // Continue to parse inline props (stroke, fill, etc.) after route
      }
    }
  }

  // ── Template syntax ────────────────────────────────────────────
  // `template name key=val ...` — sets node.template + node.props
  if (!result.path && ctx.is('identifier', 'template')) {
    const templateKwTok = ctx.next()!; // consume 'template'
    ctx.emitLeaf({
      schemaPath: `${schemaPath}.template`,
      from: templateKwTok.offset,
      to: templateKwTok.end,
      value: 'template',
      dslRole: 'keyword',
    });
    let templateName: string | undefined;
    let templateNameFrom: number | undefined;
    let templateNameTo: number | undefined;
    if (ctx.is('string')) {
      const tok = ctx.next()!;
      templateName = tok.value;
      templateNameFrom = tok.offset;
      templateNameTo = tok.end;
    } else if (ctx.is('identifier')) {
      const tok = ctx.next()!;
      templateName = tok.value;
      templateNameFrom = tok.offset;
      templateNameTo = tok.end;
      // Handle dotted template names: `core.box`, `state.node`
      while (ctx.is('dot' as any)) {
        ctx.next(); // consume dot
        if (ctx.is('identifier')) {
          const partTok = ctx.next()!;
          templateName += '.' + partTok.value;
          templateNameTo = partTok.end;
        }
      }
    }
    if (templateName != null) {
      result.template = templateName;
      ctx.emitLeaf({
        schemaPath: `${schemaPath}.template`,
        from: templateNameFrom!,
        to: templateNameTo!,
        value: templateName,
        dslRole: 'value',
      });
      Object.assign(templateProps, parseTemplatePositionals(ctx, templateName, schemaPath));
    }
    // Fall through to inline parsing loop so node-level properties
    // like 'at' (transform), opacity, fill, etc. are still parsed.
  }

  // ── Implicit template syntax ──────────────────────────────────
  // Allows `mybox: core.box text="Hello"` or `mybox: box text="Hello"`
  // without the explicit `template` keyword.
  // A quoted name is accepted here as well as bare, because the explicit
  // `template "name"` form accepts one and the click-to-edit popup writes a
  // string back as a string: editing a shape name in the editor produced
  // `c: "arrow" from=a to=b`, which nothing could read, and the whole line
  // was re-read as phantom objects.
  if (!result.path && (ctx.is('identifier') || ctx.is('string'))) {
    const tok = ctx.peek()!;
    const quotedName = tok.type === 'string';
    let implicitTemplateName: string | undefined;
    const setNames = getSetNames();

    // Check for dotted name: `core.box`, `state.node`
    if (!quotedName && setNames.includes(tok.value) && ctx.peek(1)?.type === ('dot' as any)) {
      const setName = tok.value;
      const shapeNames = getShapeNames(setName);
      const shapeTok = ctx.peek(2);
      if (shapeTok?.type === 'identifier' && shapeNames.includes(shapeTok.value)) {
        implicitTemplateName = `${setName}.${shapeTok.value}`;
      }
    }
    // Check for unqualified name that matches a shape in any set
    if (!implicitTemplateName && !geometry.includes(tok.value)) {
      for (const setName of setNames) {
        if (getShapeNames(setName).includes(tok.value)) {
          implicitTemplateName = tok.value;
          break;
        }
      }
    }

    // A name in the shape position that no set defines, carrying props: an
    // unknown shape. Nothing else can be written here — geometry, `at`,
    // `fill` and the node's own kwargs and flags are all excluded below — so
    // reading it as a shape keeps the misspelling in the model, where
    // expandTemplates names it and the editor can still click it. Left
    // unclaimed it leaked onto the token stream to be re-read as the id of a
    // phantom object.
    //
    // A bare word with nothing after it is deliberately excluded: `box.fill:
    // red` is far likelier a property that landed in the wrong place than a
    // shape called `red`, and the empty-node warning says so more usefully.
    const dotted = !quotedName && ctx.peek(1)?.type === ('dot' as any) && ctx.peek(2)?.type === 'identifier';
    const nameLen = dotted ? 3 : 1;
    const afterName = ctx.peek(nameLen);
    const sameLineProps = !!afterName && afterName.type !== 'newline'
      && afterName.type !== 'indent' && afterName.type !== 'dedent' && afterName.type !== 'eof';
    // An indented block counts as content too — a codeblock carries nothing
    // on its own line, all of it is in the block underneath.
    let scan = nameLen;
    while (ctx.peek(scan)?.type === 'newline') scan++;
    const hasPropsAhead = sameLineProps || ctx.peek(scan)?.type === ('indent' as any);
    if (!implicitTemplateName && !result.template && hasPropsAhead
        && !geometry.includes(tok.value)
        && ctx.peek(1)?.type !== 'equals'
        && ctx.peek(1)?.type !== 'colon'
        && !(hints.kwargs ?? []).includes(tok.value)
        && !(hints.flags ?? []).includes(tok.value)
        && findInlinePropField(schema, inlineProps, tok.value) === null) {
      implicitTemplateName = dotted ? `${tok.value}.${ctx.peek(2)!.value}` : tok.value;
    }

    if (implicitTemplateName) {
      // Consume the template name tokens
      let nameFrom = tok.offset;
      let nameTo = tok.end;
      ctx.next(); // consume first identifier
      // A quoted name arrives as ONE token however many dots it holds, so the
      // dotted path must not run for it — `n: "state.node" label="Idle"` ate
      // `label` and `=` as the dot and shape name, then silently rebound the
      // next string to the positional. The popup writes this form.
      if (!quotedName && implicitTemplateName.includes('.')) {
        ctx.next(); // consume dot
        const partTok = ctx.next()!; // consume shape name
        nameTo = partTok.end;
      }
      result.template = implicitTemplateName;
      ctx.emitLeaf({
        schemaPath: `${schemaPath}.template`,
        from: nameFrom,
        to: nameTo,
        value: implicitTemplateName,
        dslRole: 'value',
      });
      Object.assign(templateProps, parseTemplatePositionals(ctx, implicitTemplateName, schemaPath));
      // Fall through to inline parsing loop for node-level properties.
    }
  }

  // ── Inline parsing loop ────────────────────────────────────────
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
          to: nameTok.end,
          value: nameTok.value,
          dslRole: 'sigil',
        });
        continue;
      }
      // atSign but no identifier following — stop
      break;
    }

    // Skip geometry keyword 'path' if we already parsed a route above
    if (result.path && tok.value === 'path') break;

    // `key=value` never opens a keyword-led construct: geometry, `at`, `fill`,
    // `stroke`, `dash` and `layout` are all written bare, and only the kwargs
    // and flags the schema names (`opacity=`, `visible=`) take an `=`. Without
    // this test, a template prop was captured by whichever node construct
    // happened to share its name — `text=API`, which the emitter produces for
    // every box, re-parsed as an empty text geometry and lost the label.
    const nextIsEquals = ctx.peek(1)?.type === 'equals';
    const keywordLed = !nextIsEquals
      || (hints.kwargs?.includes(tok.value) ?? false)
      || (hints.flags?.includes(tok.value) ?? false);

    // `style=primary` — the written-out spelling of the `@primary` sigil, and
    // an object property like any other. Every shape used to forward a
    // `props.style` of its own to get here; one route means one meaning.
    if (hints.sigil && nextIsEquals && tok.value === hints.sigil.key) {
      const keyTok = ctx.next()!; // key
      ctx.next();                 // '='
      const valTok = ctx.peek();
      if (valTok?.type === 'identifier' || valTok?.type === 'string') {
        ctx.next();
        result[hints.sigil.key] = valTok.value;
        ctx.emitLeaf({
          schemaPath: `${schemaPath}.${keyTok.value}`,
          from: keyTok.offset,
          to: keyTok.end,
          value: keyTok.value,
          dslRole: 'kwarg-key',
        });
        ctx.emitLeaf({
          schemaPath: `${schemaPath}.${keyTok.value}`,
          from: valTok.offset,
          to: valTok.end,
          value: valTok.value,
          dslRole: 'kwarg-value',
        });
        continue;
      }
      // Say what is actually wrong — there may well be a value, just not a
      // name — and drop only the value, so the properties after it still read.
      ctx.warn(`${nodeId ? `"${nodeId}": ` : ''}"${keyTok.value}=" needs the name of a style`);
      if (valTok && valTok.type !== 'newline' && valTok.type !== 'indent'
          && valTok.type !== 'dedent' && valTok.type !== 'eof') {
        ctx.next();
      }
      continue;
    }

    // Inline layout hints: `layout grow=1 slot=container` on the node's own
    // line (e.g. a flex child). The emitter produces these for layout objects
    // that carry only inline hint keys (grow/order/alignSelf/slot), so the
    // walker must accept them symmetrically. Block layout (`layout flex row`
    // on an indented line) is handled later in the indented-block loop.
    if (keywordLed && tok.value === 'layout' && ctx.peek(1)?.type !== 'colon' && ctx.peek(1)?.type !== ('dot' as any)) {
      const layoutSchema = resolveFieldSchema(schema, 'layout');
      if (layoutSchema) {
        const parsed = executeSchema(ctx, layoutSchema, `${schemaPath}.layout`);
        if (parsed != null && Object.keys(parsed).length > 0) {
          result.layout = { ...((result.layout as Record<string, unknown>) ?? {}), ...parsed };
          continue;
        }
      }
    }

    // Try geometry keywords (rect, ellipse, path, etc.)
    if (keywordLed && geometry.includes(tok.value)) {
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
    const inlinePropField = keywordLed ? findInlinePropField(schema, inlineProps, tok.value) : null;
    if (inlinePropField !== null) {
      const { fieldName } = inlinePropField;
      // Special handling for 'fill' — color union, no wrapping schema
      if (fieldName === 'fill') {
        ctx.next(); // consume 'fill'
        ctx.emitLeaf({
          schemaPath: `${schemaPath}.fill`,
          from: tok.offset,
          to: tok.end,
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
          // Unwrap single _value key to scalar
          if ('_value' in parsed && Object.keys(parsed).length === 1) {
            result[fieldName] = parsed._value;
          } else {
            result[fieldName] = parsed;
          }
          continue;
        }
      }
      // Inline prop keyword recognized but couldn't parse via executeSchema.
      // Try shorthand `keyword value` syntax (e.g. `opacity 0.5`, `depth 3`).
      // Applies when the field has no DslHints and the next token is a scalar.
      const isNodeKwarg = hints.kwargs?.includes(fieldName) ?? false;
      const isNodeFlag = hints.flags?.includes(fieldName) ?? false;
      if (isNodeKwarg) {
        ctx.next(); // consume keyword
        // Accept both `keyword=value` and `keyword value` forms
        if (ctx.is('equals')) ctx.next();
        const valTok = ctx.peek();
        if (valTok?.type === 'number') {
          ctx.next();
          result[fieldName] = parseFloat(valTok.value);
          ctx.emitLeaf({
            schemaPath: `${schemaPath}.${fieldName}`,
            from: valTok.offset,
            to: valTok.end,
            value: result[fieldName],
            dslRole: 'value',
          });
          continue;
        }
        if (valTok?.type === 'string' || valTok?.type === 'identifier' || valTok?.type === 'hexColor') {
          ctx.next();
          result[fieldName] = valTok.value;
          ctx.emitLeaf({
            schemaPath: `${schemaPath}.${fieldName}`,
            from: valTok.offset,
            to: valTok.end,
            value: valTok.value,
            dslRole: 'value',
          });
          continue;
        }
        // Couldn't parse a value — break to avoid loop.
        break;
      }
      if (isNodeFlag) {
        // Flag without value — fall through to flag handler below.
      } else {
        // A recognised keyword whose value didn't parse (`at` with nothing
        // after it). Skip the rest of the line to prevent token leakage, and
        // say so rather than dropping it without a word.
        ctx.warn(`${nodeId ? `"${nodeId}": ` : ''}could not read "${ctx.lineTailFrom(tok.offset)}"`);
        ctx.skipToNewline();
        break;
      }
    }

    // Check for floating transform kwargs: `rotation=0`, `scale=2` without `at` keyword.
    // These map to node.transform using the transform field's kwargs list.
    // Used in camera nodes: `cam: camera look=all zoom=1 rotation=0`
    if (ctx.peek(1)?.type === 'equals') {
      const transformSchema = resolveFieldSchema(schema, 'transform');
      if (transformSchema) {
        const tHints = getDsl(transformSchema);
        if (tHints?.kwargs?.includes(tok.value)) {
          const kw = executeKwargs(ctx, tHints.kwargs, `${schemaPath}.transform`, transformSchema);
          if (Object.keys(kw).length > 0) {
            if (!result.transform) result.transform = {};
            Object.assign(result.transform as Record<string, unknown>, kw);
            continue;
          }
        }
      }
    }

    // Check for node-level kwargs (e.g. opacity=0.5, depth=3) and flags (e.g. visible).
    // These are defined on the NodeSchema itself, not on any property sub-schema.
    const isKwarg = ctx.peek(1)?.type === 'equals';
    if (isKwarg && hints.kwargs?.includes(tok.value)) {
      const kw = executeKwargs(ctx, hints.kwargs, schemaPath, schema);
      Object.assign(result, kw);
      continue;
    }
    // Flag fields accept an explicit boolean assignment too (`visible=false`),
    // which is the only way to express a non-default flag value. The emitter
    // produces this form, so the walker must accept it symmetrically.
    if (isKwarg && hints.flags?.includes(tok.value)) {
      const keyTok = ctx.next()!; // key
      ctx.next();                 // '='
      const valTok = ctx.peek();
      if (valTok?.type === 'identifier' && (valTok.value === 'true' || valTok.value === 'false')) {
        ctx.next();
        result[keyTok.value] = valTok.value === 'true';
        ctx.emitLeaf({
          schemaPath: `${schemaPath}.${keyTok.value}`,
          from: valTok.offset,
          to: valTok.end,
          value: result[keyTok.value],
          dslRole: 'kwarg-value',
        });
        continue;
      }
      break;
    }
    if (!isKwarg && hints.flags?.includes(tok.value)) {
      const fl = executeFlags(ctx, hints.flags, schemaPath);
      Object.assign(result, fl);
      continue;
    }

    // Template props, last so that every node-level construct above wins the
    // name: `opacity=0.5` on a box is the node's opacity, not a prop the box
    // template would silently ignore. Reaching here means nothing at node
    // level claimed the token, which is exactly when it belongs to the shape.
    if (typeof result.template === 'string'
        && readTemplateProp(ctx, result.template, templateProps, schemaPath)) {
      continue;
    }

    // Not a recognized token — break (inline parsing stops)
    break;
  }

  // Nothing on a node's line should go unread. What's left here is a typo, a
  // property belonging to some other shape, or syntax from another dialect.
  // Left on the token stream it was re-read as the start of a new object —
  // `box "X" at 150,40 color=red` produced phantom nodes named `color` and
  // `red` — so consume it and report it instead.
  const leftover = ctx.peek();
  if (leftover && leftover.type !== 'newline' && leftover.type !== 'indent'
      && leftover.type !== 'dedent' && leftover.type !== 'eof') {
    // Unless the shape itself is unknown — then its props can't be read
    // because nothing declares their grammar, and "Unknown template" is the
    // one warning worth printing. Saying both would bury the useful one.
    const unknownShape = typeof result.template === 'string'
      && getShapePropsSchema(result.template) === undefined;
    if (!unknownShape) {
      ctx.warn(`${nodeId ? `"${nodeId}": ` : ''}could not read "${ctx.lineTailFrom(leftover.offset)}"`);
    }
    ctx.skipToNewline();
  }

  // ── Indented block (block properties + children) ───────────────
  ctx.skipNewlines();
  if (ctx.is('indent' as any) && hints.children?.children === 'block') {
    ctx.next(); // consume indent
    const children: Array<Record<string, unknown>> = [];

    while (!ctx.atEnd() && !ctx.is('dedent' as any)) {
      ctx.skipNewlines();
      if (ctx.is('dedent' as any)) break;

      // Content lines: an indented run of quoted strings filling the field
      // the shape declares as its block child — textblock/codeblock `lines`,
      // table `rows`. Quoted rather than raw so punctuation, `//`, `=` and
      // leading spaces survive: the lexer already reads a string literal
      // exactly, and a raw-line mode would mean a second way to lex.
      if (ctx.is('string')) {
        const templateName = typeof result.template === 'string' ? result.template : undefined;
        const entry = templateName ? blockEntryField(getShapePropsSchema(templateName)) : null;
        const startTok = ctx.peek()!;
        const knownShape = templateName ? getShapePropsSchema(templateName) !== undefined : false;
        if (!entry) {
          // An unknown shape is already reported by name; saying its content
          // was unreadable too would only bury that.
          if (!templateName || knownShape) {
            ctx.warn(
              templateName
                ? `${templateName} takes no block content, so "${ctx.lineTailFrom(startTok.offset)}" was not read`
                : `could not read "${ctx.lineTailFrom(startTok.offset)}"`,
            );
          }
          ctx.skipToNewline();
          ctx.skipNewlines();
          continue;
        }
        const cells: string[] = [];
        const leafPath = `${schemaPath}.tplprops:${templateName}.${entry.key}`;
        while (ctx.is('string')) {
          const cellTok = ctx.next()!;
          cells.push(cellTok.value);
          ctx.emitLeaf({
            schemaPath: leafPath,
            from: cellTok.offset,
            to: cellTok.end,
            value: cellTok.value,
            dslRole: 'value',
          });
        }
        const bucket = (templateProps[entry.key] ??= []) as unknown[];
        if (entry.shape === 'row') {
          bucket.push(cells);
        } else {
          if (cells.length > 1) {
            ctx.warn(`${templateName} takes one line per line — "${ctx.lineTailFrom(startTok.offset)}" holds ${cells.length}`);
          }
          bucket.push(...cells);
        }
        const tail = ctx.peek();
        if (tail && tail.type !== 'newline' && tail.type !== 'indent'
            && tail.type !== 'dedent' && tail.type !== 'eof') {
          ctx.warn(`${templateName} content must be quoted — could not read "${ctx.lineTailFrom(tail.offset)}"`);
          ctx.skipToNewline();
        }
        ctx.skipNewlines();
        continue;
      }

      // Distinguish block properties from child nodes:
      // A block property is an identifier in blockProps that is NOT followed by a colon
      // (and not part of a dotted-id child declaration).
      // A child node is an identifier (possibly dotted) followed by a colon.
      if (ctx.is('identifier')) {
        const firstTok = ctx.peek()!;
        const isBlockProp = isBlockPropertyToken(ctx, blockProps, geometry, schema, inlineProps);

        if (isBlockProp) {
          // Parse block property via the same inline prop logic
          const fieldName = firstTok.value;
          const isFillProp = fieldName === 'fill';

          if (isFillProp) {
            const fillTok = ctx.next()!; // consume 'fill'
            ctx.emitLeaf({
              schemaPath: `${schemaPath}.fill`,
              from: fillTok.offset,
              to: fillTok.end,
              value: 'fill',
              dslRole: 'keyword',
            });
            const color = executeColor(ctx, `${schemaPath}.fill`);
            if (color != null) result.fill = color;
          } else if (geometry.includes(fieldName)) {
            // Geometry keyword as block property (e.g., `path (...)`)
            const geomSchema = resolveFieldSchema(schema, fieldName);
            if (geomSchema) {
              const geom = executeSchema(ctx, geomSchema, `${schemaPath}.${fieldName}`);
              if (geom != null) result[fieldName] = geom;
            } else {
              ctx.next(); // skip unrecognized geometry
            }
          } else {
            // Other block prop (stroke, dash, layout, etc.)
            // A recognised block-property keyword whose body doesn't parse —
            // `stroke` on its own line with no colour. Dropping the line was
            // silent, which is the same hole the node's own line no longer has.
            const drop = () => {
              ctx.warn(`${nodeId ? `"${nodeId}": ` : ''}could not read "${ctx.lineTailFrom(firstTok.offset)}"`);
              ctx.skipToNewline();
            };
            const inlinePropField = findInlinePropField(schema, [...inlineProps, ...blockProps], fieldName);
            if (inlinePropField) {
              const propSchema = resolveFieldSchema(schema, inlinePropField.fieldName);
              if (propSchema) {
                const parsed = executeSchema(ctx, propSchema, `${schemaPath}.${inlinePropField.fieldName}`);
                if (parsed != null && Object.keys(parsed).length > 0) {
                  if ('_value' in parsed && Object.keys(parsed).length === 1) {
                    result[inlinePropField.fieldName] = parsed._value;
                  } else {
                    result[inlinePropField.fieldName] = parsed;
                  }
                } else {
                  drop();
                }
              } else {
                drop();
              }
            } else {
              drop();
            }
          }
          ctx.skipNewlines();
          continue;
        }

        // Try parsing as a child instance. schemaPath is passed through
        // unchanged (not accumulated with '.children') — schemaPath is
        // node-relative and depth-independent, matching the emitter's
        // grammar (astEmitter always emits e.g. 'layout.grow', never
        // 'children.layout.grow' for a nested node's own properties).
        const child = executeInstance(ctx, schema, 'id', 'required', schemaPath);
        if (child) {
          children.push(child);
          ctx.skipNewlines();
          continue;
        }
      }

      // Can't parse. Report the line and drop it whole: skipping one token at
      // a time said nothing and left the rest to be misread piecemeal.
      const strayTok = ctx.peek();
      if (strayTok && strayTok.type !== 'newline' && strayTok.type !== 'indent'
          && strayTok.type !== 'dedent' && strayTok.type !== 'eof') {
        ctx.warn(`${nodeId ? `"${nodeId}": ` : ''}could not read "${ctx.lineTailFrom(strayTok.offset)}"`);
        ctx.skipToNewline();
      } else {
        ctx.next();
      }
    }

    if (ctx.is('dedent' as any)) ctx.next();
    if (children.length > 0) result.children = children;
  }

  // Assigned last: block content lands in templateProps during the indented
  // block above, so a shape whose only props are its content lines still gets
  // them.
  if (Object.keys(templateProps).length > 0) result.props = templateProps;

  return result;
}

/**
 * Detect if the current token starts an arrow/route connection.
 * Peeks ahead on the current line for an arrow token.
 */
/**
 * True when the line opens with a registered shape name (`arrow`, `state.node`)
 * rather than a node id. Only consulted to decide whether a line containing
 * `->` is a template with route endpoints or a bare route primitive; a node
 * genuinely named after a shape loses the bare form, which is a fair trade
 * for `arrow a -> b` meaning what everyone reads it as.
 */
function startsWithShapeName(ctx: WalkContext, geometry: string[]): boolean {
  const tok = ctx.peek();
  if (!tok || tok.type !== 'identifier' || geometry.includes(tok.value)) return false;
  const setNames = getSetNames();
  if (setNames.includes(tok.value) && ctx.peek(1)?.type === ('dot' as any)) {
    const shapeTok = ctx.peek(2);
    return shapeTok?.type === 'identifier' && getShapeNames(tok.value).includes(shapeTok.value);
  }
  return setNames.some(setName => getShapeNames(setName).includes(tok.value));
}

function hasArrowAhead(ctx: WalkContext): boolean {
  let offset = 0;
  while (true) {
    const tok = ctx.peek(offset);
    if (!tok) return false;
    if (tok.type === 'newline' || tok.type === 'indent' || tok.type === 'dedent' || tok.type === 'eof') return false;
    if (tok.type === 'arrow') return true;
    offset++;
  }
}

/**
 * Determine if the current token is a block property (vs a child node declaration).
 * Block properties: identifier in blockProps or geometry list, NOT followed by colon.
 * Child nodes: identifier (possibly dotted) followed by colon.
 */
function isBlockPropertyToken(
  ctx: WalkContext,
  blockProps: string[],
  geometry: string[],
  schema?: z.ZodType,
  inlineProps?: string[],
): boolean {
  const tok = ctx.peek();
  if (!tok || tok.type !== 'identifier') return false;

  const name = tok.value;
  let isKnown = blockProps.includes(name) || geometry.includes(name);
  // Also check if the token matches a keyword of any inline/block prop field
  // (e.g. 'at' is the keyword for the 'transform' field)
  if (!isKnown && schema && inlineProps) {
    isKnown = findInlinePropField(schema, [...inlineProps, ...blockProps], name) !== null;
  }
  if (!isKnown) return false;

  // If the next real token after (possibly dotted) identifier(s) is a colon, it's a child
  // Check immediate next token:
  const next = ctx.peek(1);
  if (next?.type === 'colon') return false;  // id: ... = child
  if (next?.type === 'dot') return false;    // dotted id = child

  return true;
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

export interface KeyframesBlockResult {
  keyframes: any[];
  chapters: any[];
}

/**
 * Parse an indented block under `animate`, which interleaves chapter markers
 * and keyframe entries:
 *   chapter "Name" at <time>
 *   <time | +relative> [easing=name] [delay=n]
 *       target.property: value
 *       target.property: value
 * OR on single line:
 *   <time> target.property: value
 *
 * Chapters and keyframes are routed into separate arrays.
 */
export function parseKeyframesBlock(ctx: WalkContext, schemaPath: string): KeyframesBlockResult {
  const keyframes: any[] = [];
  const chapters: any[] = [];
  ctx.skipNewlines();
  if (!ctx.is('indent' as any)) return { keyframes, chapters };
  ctx.next();

  // `schemaPath` is "<name>.keyframes"; chapters live alongside under "<name>.chapters".
  const chaptersBase = schemaPath.replace(/\.keyframes$/, '.chapters');

  while (!ctx.atEnd() && !ctx.is('dedent' as any)) {
    ctx.skipNewlines();
    if (ctx.is('dedent' as any)) break;

    // A `chapters` header opening an indented run of `chapter` lines. Only
    // the inline form was handled, so the header fell through to the
    // skip-a-token branch and its sub-block's dedent closed the whole
    // animate block — every keyframe written after a chapters block was
    // dropped out of the animation and re-read as a top-level object.
    if (ctx.is('identifier', 'chapters')) {
      ctx.next();
      ctx.skipNewlines();
      if (ctx.is('indent' as any)) {
        ctx.next();
        while (!ctx.atEnd() && !ctx.is('dedent' as any)) {
          ctx.skipNewlines();
          if (ctx.is('dedent' as any)) break;
          if (!ctx.is('identifier', 'chapter')) { ctx.next(); continue; }
          const ch = executeSchema(ctx, ChapterSchema, `${chaptersBase}.${chapters.length}`);
          if (ch && ch.name !== undefined) chapters.push(ch);
          ctx.skipNewlines();
        }
        if (ctx.is('dedent' as any)) ctx.next();
      }
      ctx.skipNewlines();
      continue;
    }

    // Chapter marker line: `chapter "Name" at <time>`. Emit under the resolvable
    // "<name>.chapters.<i>" path so name/time are clickable.
    if (ctx.is('identifier', 'chapter')) {
      const ch = executeSchema(ctx, ChapterSchema, `${chaptersBase}.${chapters.length}`);
      if (ch && ch.name !== undefined) chapters.push(ch);
      ctx.skipNewlines();
      continue;
    }

    // Keyframe time: absolute `<number>` or relative `+<number>`.
    const kfPath = `${schemaPath}.${keyframes.length}`;
    const kf: any = { changes: {} };
    if (ctx.is('plus' as any)) {
      ctx.next(); // consume '+'
      if (!ctx.is('number')) { ctx.next(); continue; }
      const t = ctx.next()!;
      kf.plus = parseFloat(t.value);
      ctx.emitLeaf({ schemaPath: `${kfPath}.time`, from: t.offset, to: t.end, value: kf.plus, dslRole: 'value' });
    } else if (ctx.is('number')) {
      const t = ctx.next()!;
      kf.time = parseFloat(t.value);
      ctx.emitLeaf({ schemaPath: `${kfPath}.time`, from: t.offset, to: t.end, value: kf.time, dslRole: 'value' });
    } else {
      ctx.next();
      continue;
    }

    // Optional `easing=` / `delay=` on the time line, in any order.
    while (ctx.is('identifier') && ctx.peek(1)?.type === 'equals') {
      const key = ctx.peek()!.value;
      if (key === 'easing') {
        ctx.next(); ctx.next();
        if (ctx.is('identifier')) {
          const e = ctx.next()!;
          kf.easing = e.value;
          ctx.emitLeaf({ schemaPath: `${kfPath}.easing`, from: e.offset, to: e.end, value: e.value, dslRole: 'value' });
        }
      } else if (key === 'delay') {
        ctx.next(); ctx.next();
        if (ctx.is('number')) {
          const d = ctx.next()!;
          kf.delay = parseFloat(d.value);
          ctx.emitLeaf({ schemaPath: `${kfPath}.delay`, from: d.offset, to: d.end, value: kf.delay, dslRole: 'value' });
        }
      } else {
        break;
      }
    }

    // Inline change on same line: "1.5 box.opacity: 1"
    if (ctx.is('identifier')) {
      const { key, value } = parseChangeInline(ctx);
      if (key) kf.changes[key] = value;
    }

    ctx.skipNewlines();

    // Indented changes block
    if (ctx.is('indent' as any)) {
      ctx.next();
      while (!ctx.atEnd() && !ctx.is('dedent' as any)) {
        ctx.skipNewlines();
        if (ctx.is('dedent' as any)) break;
        if (!ctx.is('identifier')) { ctx.next(); continue; }
        const { key, value } = parseChangeInline(ctx);
        if (key) kf.changes[key] = value;
        ctx.skipNewlines();
      }
      if (ctx.is('dedent' as any)) ctx.next();
    }

    keyframes.push(kf);
    ctx.skipNewlines();
  }

  if (ctx.is('dedent' as any)) ctx.next();
  return { keyframes, chapters };
}

function parseChangeInline(ctx: WalkContext): { key: string | null; value: unknown } {
  // Parse dotted path: box.opacity or box.transform.x
  const parts: string[] = [];
  while (ctx.is('identifier')) {
    parts.push(ctx.next()!.value);
    if (ctx.is('dot' as any)) { ctx.next(); continue; }
    break;
  }
  if (!ctx.is('colon')) return { key: null, value: null };
  ctx.next();

  const key = parts.join('.');
  // The value leaf is tagged `track:<path>` so the click resolver can type it by
  // walking the scene model (e.g. `a.fill` → color, `a.opacity` → number).
  const valSchemaPath = `track:${key}`;

  const valTok = ctx.peek();
  if (!valTok) return { key, value: null };

  // Braced object: { value: N, easing: "name" } — used in easing-comparison
  if (valTok.type === 'braceOpen') {
    const obj = parseKeyframeValueObject(ctx);
    return { key, value: obj };
  }

  // Parenthesized tuple: (a) or (a,b) → string[] array (used in camera-look-fit)
  if (valTok.type === 'parenOpen') {
    const arr = parseKeyframeTuple(ctx);
    return { key, value: arr };
  }

  // Boolean literals
  if (valTok.type === 'identifier' && (valTok.value === 'true' || valTok.value === 'false')) {
    const b = valTok.value === 'true';
    ctx.next();
    ctx.emitLeaf({ schemaPath: valSchemaPath, from: valTok.offset, to: valTok.end, value: b, dslRole: 'value' });
    return { key, value: b };
  }

  // Attempt color parsing first — handles named, hex, hsl, rgb forms
  const colorValue = executeColor(ctx, valSchemaPath);
  if (colorValue != null) {
    // Check for inline easing: value easing=name
    if (ctx.is('identifier', 'easing') && ctx.peek(1)?.type === 'equals') {
      ctx.next(); ctx.next();
      const easing = ctx.is('identifier') ? ctx.next()!.value : undefined;
      if (easing) return { key, value: { value: colorValue, easing } };
    }
    return { key, value: colorValue };
  }

  let value: unknown;
  if (valTok.type === 'number') {
    value = parseFloat(valTok.value); ctx.next();
    ctx.emitLeaf({ schemaPath: valSchemaPath, from: valTok.offset, to: valTok.end, value, dslRole: 'value' });
  } else if (valTok.type === 'string' || valTok.type === 'identifier' || valTok.type === 'hexColor') {
    value = valTok.value; ctx.next();
    ctx.emitLeaf({ schemaPath: valSchemaPath, from: valTok.offset, to: valTok.end, value, dslRole: 'value' });
  }

  // Check for inline easing after value: `box.x: 500 easing=linear`
  if (value != null && ctx.is('identifier', 'easing') && ctx.peek(1)?.type === 'equals') {
    ctx.next(); ctx.next();
    const easing = ctx.is('identifier') ? ctx.next()!.value : undefined;
    if (easing) return { key, value: { value, easing } };
  }

  return { key, value };
}

/**
 * Parse a parenthesized tuple value: `(a)` or `(a,b)` → string[].
 * Used for camera-look-fit: `cam.camera.look: (a)` or `cam.camera.look: (a,b)`.
 */
function parseKeyframeTuple(ctx: WalkContext): unknown[] {
  const items: unknown[] = [];
  if (!ctx.is('parenOpen')) return items;
  ctx.next(); // consume (

  while (!ctx.atEnd() && !ctx.is('parenClose')) {
    const tok = ctx.peek();
    if (!tok) break;
    if (tok.type === 'identifier') {
      items.push(ctx.next()!.value);
    } else if (tok.type === 'number') {
      items.push(parseFloat(ctx.next()!.value));
    } else if (tok.type === 'comma') {
      ctx.next(); // skip comma
    } else {
      break;
    }
  }

  if (ctx.is('parenClose')) ctx.next(); // consume )
  return items;
}

/**
 * Parse a braced keyframe value object: `{ value: N, easing: "name" }`.
 * This is the JSON-escape-hatch syntax used in easing-comparison.
 */
function parseKeyframeValueObject(ctx: WalkContext): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  if (!ctx.is('braceOpen')) return obj;
  ctx.next(); // consume {

  while (!ctx.atEnd() && !ctx.is('braceClose')) {
    if (!ctx.is('identifier')) { ctx.next(); continue; }
    const keyTok = ctx.next()!;
    const key = keyTok.value;
    if (!ctx.is('colon')) continue;
    ctx.next(); // consume :

    const valTok = ctx.peek();
    if (!valTok) break;
    let val: unknown;
    if (valTok.type === 'number') { val = parseFloat(valTok.value); ctx.next(); }
    else if (valTok.type === 'string') { val = valTok.value; ctx.next(); }
    else if (valTok.type === 'identifier') { val = valTok.value; ctx.next(); }
    else if (valTok.type === 'hexColor') { val = valTok.value; ctx.next(); }
    else break;

    obj[key] = val;
    // Skip comma between entries
    if (ctx.is('comma')) ctx.next();
  }

  if (ctx.is('braceClose')) ctx.next(); // consume }
  return obj;
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
      to: tok.end,
      value: tok.value,
      dslRole: 'value',
    });
    // Check for hex-alpha: `#rrggbb a=0.7`
    if (ctx.is('identifier', 'a') && ctx.peek(1)?.type === 'equals') {
      ctx.next(); ctx.next(); // consume 'a' and '='
      if (ctx.is('number')) {
        const a = parseFloat(ctx.next()!.value);
        return { hex: tok.value, a };
      }
    }
    return tok.value;
  }

  // Bare HSL triplet: three consecutive numbers with no keyword (e.g., `fill 210 70 45`)
  if (tok.type === 'number') {
    const t1 = ctx.peek(1);
    const t2 = ctx.peek(2);
    if (t1?.type === 'number' && t2?.type === 'number') {
      const h = parseFloat(ctx.next()!.value);
      const s = parseFloat(ctx.next()!.value);
      const l = parseFloat(ctx.next()!.value);
      const color: Record<string, number> = { h, s, l };
      // Optional alpha: `a=0.7`
      if (ctx.is('identifier', 'a') && ctx.peek(1)?.type === 'equals') {
        ctx.next(); ctx.next();
        if (ctx.is('number')) color.a = parseFloat(ctx.next()!.value);
      }
      ctx.emitLeaf({ schemaPath, from: tok.offset, to: tok.offset, value: color, dslRole: 'value' });
      return color;
    }
  }

  if (tok.type === 'identifier') {
    if (tok.value === 'hsl') {
      return executeSchema(ctx, HslColorSchema, schemaPath);
    }
    if (tok.value === 'rgb') {
      return executeSchema(ctx, RgbColorSchema, schemaPath);
    }
    // Named color — may be followed by `a=N` for named-alpha
    ctx.next();
    ctx.emitLeaf({
      schemaPath,
      from: tok.offset,
      to: tok.end,
      value: tok.value,
      dslRole: 'value',
    });
    // Check for named-alpha: `black a=0.7`
    if (ctx.is('identifier', 'a') && ctx.peek(1)?.type === 'equals') {
      ctx.next(); ctx.next(); // consume 'a' and '='
      if (ctx.is('number')) {
        const a = parseFloat(ctx.next()!.value);
        return { name: tok.value, a };
      }
    }
    return tok.value;
  }

  return null;
}
