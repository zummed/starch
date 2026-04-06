import type { WalkContext } from './walkContext';
import type { PositionalHint } from './dslMeta';
import { getDsl } from './dslMeta';
import type { z } from 'zod';
import { HslColorSchema, RgbColorSchema } from '../types/properties';
import { getSetNames, getShapeNames, getShapePropsSchema } from '../templates/registry';

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
      if (ctx.is('identifier')) {
        const itemTok = ctx.next()!;
        items.push(itemTok.value);
        ctx.emitLeaf({
          schemaPath: `${schemaPath}.${k}`,
          from: itemTok.offset,
          to: itemTok.offset + itemTok.value.length,
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
      to: tok.offset + tok.value.length,
      value: result[k],
      dslRole: 'value',
    });
    return result;
  }
  // Identifier with optional suffix (e.g., '3s' when suffix='s')
  if (tok.type === 'identifier') {
    // If the identifier is followed by '=', it is a kwarg, not a positional.
    // Return null so the caller's kwarg loop handles it.
    if (ctx.peek(1)?.type === 'equals') return null;

    if (hint.suffix) {
      const suffix = hint.suffix;
      if (tok.value.endsWith(suffix)) {
        const raw = tok.value.slice(0, -suffix.length);
        const num = parseFloat(raw);
        if (!isNaN(num)) {
          result[k] = num;
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
      }
      // Suffix hint signals a numeric field. If the identifier doesn't
      // form a valid <number><suffix>, don't assign the raw string —
      // leave duration unset so downstream defaults apply.
      return null;
    }
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
    if (valTok.type === 'number') { value = parseFloat(valTok.value); ctx.next(); }
    else if (valTok.type === 'string') { value = valTok.value; ctx.next(); }
    else if (valTok.type === 'identifier') { value = valTok.value; ctx.next(); }
    else if (valTok.type === 'hexColor') { value = valTok.value; ctx.next(); }
    else if (valTok.type === 'parenOpen') {
      // Parenthesized value: (x,y) → [x, y] or (id) → ['id'] or (id,dx,dy) → [id, dx, dy]
      value = parseKwargTuple(ctx);
    }
    else break;

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
      to: kwTok.offset + kwTok.value.length,
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
      const kw = executeKwargs(ctx, allKwargs, schemaPath);
      Object.assign(result, kw);
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
  ctx.next(); // consume first identifier
  while (ctx.is('dot' as any)) {
    ctx.next(); // consume dot
    ctx.next(); // consume next identifier
  }
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
 * Parse template props: first positionals (from DslHints on the shape's
 * props schema), then flags, then key=val kwargs. Returns the merged props object.
 *
 * For arrow-format positionals, the route array is split into
 * from (first), to (last), and route (intermediates).
 */
function parseTemplateProps(
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

  // Parse flags if declared
  if (hints?.flags) {
    while (!ctx.atEnd() && ctx.is('identifier')) {
      const flagTok = ctx.peek()!;
      if (!hints.flags.includes(flagTok.value)) break;
      if (ctx.peek(1)?.type === 'equals') break; // it's a kwarg, not a flag
      ctx.next();
      props[flagTok.value] = true;
      ctx.emitLeaf({
        schemaPath: `${schemaPath}.tplprops:${templateName}.${flagTok.value}`,
        from: flagTok.offset,
        to: flagTok.offset + flagTok.value.length,
        value: true,
        dslRole: 'flag',
      });
    }
  }

  // Parse key=val kwargs (existing pattern, works for all shapes)
  while (!ctx.atEnd() && ctx.is('identifier') && ctx.peek(1)?.type === 'equals') {
    const keyTok = ctx.next()!;
    ctx.next(); // consume =
    const valTok = ctx.peek();
    if (!valTok) break;
    let val: unknown;
    if (valTok.type === 'number') val = parseFloat(valTok.value);
    else if (valTok.type === 'string') val = valTok.value;
    else if (valTok.type === 'identifier') val = valTok.value;
    else if (valTok.type === 'hexColor') val = valTok.value;
    else break;
    ctx.next();
    props[keyTok.value] = val;
    ctx.emitLeaf({
      schemaPath: `${schemaPath}.tplprops:${templateName}.${keyTok.value}`,
      from: keyTok.offset,
      to: keyTok.offset + keyTok.value.length,
      value: keyTok.value,
      dslRole: 'kwarg-key',
    });
    ctx.emitLeaf({
      schemaPath: `${schemaPath}.tplprops:${templateName}.${keyTok.value}`,
      from: valTok.offset,
      to: valTok.offset + valTok.value.length,
      value: val,
      dslRole: 'kwarg-value',
    });
  }

  return props;
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
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const hints = getDsl(schema);
  if (!hints) return result;

  const geometry = hints.geometry ?? [];
  const inlineProps = hints.inlineProps ?? [];
  const blockProps = hints.blockProps ?? [];

  // ── Arrow/route detection ──────────────────────────────────────
  // Check if current line starts with an arrow-based route.
  // Handles: `a -> b`, `(a,10,20) -> (b,-5,0)`, `(250,100) -> b`, etc.
  // This must be checked BEFORE geometry keywords so that node IDs like 'a'
  // are not misidentified as geometry.
  if ((ctx.is('identifier') || ctx.is('parenOpen' as any)) && hasArrowAhead(ctx)) {
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
            Object.assign(pathObj, executeKwargs(ctx, allKwargs, `${schemaPath}.path`));
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
      to: templateKwTok.offset + templateKwTok.value.length,
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
      templateNameTo = tok.offset + tok.value.length;
    } else if (ctx.is('identifier')) {
      const tok = ctx.next()!;
      templateName = tok.value;
      templateNameFrom = tok.offset;
      templateNameTo = tok.offset + tok.value.length;
      // Handle dotted template names: `core.box`, `state.node`
      while (ctx.is('dot' as any)) {
        ctx.next(); // consume dot
        if (ctx.is('identifier')) {
          const partTok = ctx.next()!;
          templateName += '.' + partTok.value;
          templateNameTo = partTok.offset + partTok.value.length;
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
      const props = parseTemplateProps(ctx, templateName, schemaPath);
      if (Object.keys(props).length > 0) result.props = props;
    }
    // Fall through to inline parsing loop so node-level properties
    // like 'at' (transform), opacity, fill, etc. are still parsed.
  }

  // ── Implicit template syntax ──────────────────────────────────
  // Allows `mybox: core.box text="Hello"` or `mybox: box text="Hello"`
  // without the explicit `template` keyword.
  if (!result.path && ctx.is('identifier')) {
    const tok = ctx.peek()!;
    let implicitTemplateName: string | undefined;
    const setNames = getSetNames();

    // Check for dotted name: `core.box`, `state.node`
    if (setNames.includes(tok.value) && ctx.peek(1)?.type === ('dot' as any)) {
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

    if (implicitTemplateName) {
      // Consume the template name tokens
      let nameFrom = tok.offset;
      let nameTo = tok.offset + tok.value.length;
      ctx.next(); // consume first identifier
      if (implicitTemplateName.includes('.')) {
        ctx.next(); // consume dot
        const partTok = ctx.next()!; // consume shape name
        nameTo = partTok.offset + partTok.value.length;
      }
      result.template = implicitTemplateName;
      ctx.emitLeaf({
        schemaPath: `${schemaPath}.template`,
        from: nameFrom,
        to: nameTo,
        value: implicitTemplateName,
        dslRole: 'value',
      });
      const props = parseTemplateProps(ctx, implicitTemplateName, schemaPath);
      if (Object.keys(props).length > 0) result.props = props;
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
          to: nameTok.offset + nameTok.value.length,
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

    // Try geometry keywords (rect, ellipse, path, etc.)
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
            to: valTok.offset + valTok.value.length,
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
            to: valTok.offset + valTok.value.length,
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
        // Truly unrecognized — skip rest of line to prevent token leakage.
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
          const kw = executeKwargs(ctx, tHints.kwargs, `${schemaPath}.transform`);
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
      const kw = executeKwargs(ctx, hints.kwargs, schemaPath);
      Object.assign(result, kw);
      continue;
    }
    if (!isKwarg && hints.flags?.includes(tok.value)) {
      const fl = executeFlags(ctx, hints.flags, schemaPath);
      Object.assign(result, fl);
      continue;
    }

    // Not a recognized token — break (inline parsing stops)
    break;
  }

  // ── Indented block (block properties + children) ───────────────
  ctx.skipNewlines();
  if (ctx.is('indent' as any) && hints.children?.children === 'block') {
    ctx.next(); // consume indent
    const children: Array<Record<string, unknown>> = [];

    while (!ctx.atEnd() && !ctx.is('dedent' as any)) {
      ctx.skipNewlines();
      if (ctx.is('dedent' as any)) break;

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
              to: fillTok.offset + fillTok.value.length,
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
                  ctx.skipToNewline();
                }
              } else {
                ctx.skipToNewline();
              }
            } else {
              ctx.skipToNewline();
            }
          }
          ctx.skipNewlines();
          continue;
        }

        // Try parsing as a child instance (dotted-id: body)
        const child = executeInstance(ctx, schema, 'id', 'required', `${schemaPath}.children`);
        if (child) {
          children.push(child);
          ctx.skipNewlines();
          continue;
        }
      }

      // Can't parse — skip token to avoid infinite loop
      ctx.next();
    }

    if (ctx.is('dedent' as any)) ctx.next();
    if (children.length > 0) result.children = children;
  }

  return result;
}

/**
 * Detect if the current token starts an arrow/route connection.
 * Peeks ahead on the current line for an arrow token.
 */
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
 * Parse an indented block of keyframe entries:
 *   <time> [easing=name]
 *       target.property: value
 *       target.property: value
 * OR on single line:
 *   <time> target.property: value
 */
export function parseKeyframesBlock(ctx: WalkContext, schemaPath: string): any[] {
  const keyframes: any[] = [];
  ctx.skipNewlines();
  if (!ctx.is('indent' as any)) return keyframes;
  ctx.next();

  while (!ctx.atEnd() && !ctx.is('dedent' as any)) {
    ctx.skipNewlines();
    if (ctx.is('dedent' as any)) break;
    if (!ctx.is('number')) { ctx.next(); continue; }

    const timeTok = ctx.next()!;
    const kf: any = { time: parseFloat(timeTok.value), changes: {} };

    // Optional easing on timestamp line: "1.5 easing=easeIn"
    if (ctx.is('identifier', 'easing') && ctx.peek(1)?.type === 'equals') {
      ctx.next(); ctx.next();
      if (ctx.is('identifier')) {
        kf.easing = ctx.next()!.value;
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
  return keyframes;
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

  const valTok = ctx.peek();
  if (!valTok) return { key: parts.join('.'), value: null };

  // Braced object: { value: N, easing: "name" } — used in easing-comparison
  if (valTok.type === 'braceOpen') {
    const obj = parseKeyframeValueObject(ctx);
    return { key: parts.join('.'), value: obj };
  }

  // Parenthesized tuple: (a) or (a,b) → string[] array (used in camera-look-fit)
  if (valTok.type === 'parenOpen') {
    const arr = parseKeyframeTuple(ctx);
    return { key: parts.join('.'), value: arr };
  }

  // Boolean literals
  if (valTok.type === 'identifier' && valTok.value === 'true') {
    ctx.next();
    return { key: parts.join('.'), value: true };
  }
  if (valTok.type === 'identifier' && valTok.value === 'false') {
    ctx.next();
    return { key: parts.join('.'), value: false };
  }

  // Attempt color parsing first — handles named, hex, hsl, rgb forms
  const colorValue = executeColor(ctx, parts.join('.'));
  if (colorValue != null) {
    // Check for inline easing: value easing=name
    if (ctx.is('identifier', 'easing') && ctx.peek(1)?.type === 'equals') {
      ctx.next(); ctx.next();
      const easing = ctx.is('identifier') ? ctx.next()!.value : undefined;
      if (easing) return { key: parts.join('.'), value: { value: colorValue, easing } };
    }
    return { key: parts.join('.'), value: colorValue };
  }

  let value: unknown;
  if (valTok.type === 'number') { value = parseFloat(valTok.value); ctx.next(); }
  else if (valTok.type === 'string' || valTok.type === 'identifier' || valTok.type === 'hexColor') {
    value = valTok.value;
    ctx.next();
  }

  // Check for inline easing after value: `box.x: 500 easing=linear`
  if (value != null && ctx.is('identifier', 'easing') && ctx.peek(1)?.type === 'equals') {
    ctx.next(); ctx.next();
    const easing = ctx.is('identifier') ? ctx.next()!.value : undefined;
    if (easing) return { key: parts.join('.'), value: { value, easing } };
  }

  return { key: parts.join('.'), value };
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
      to: tok.offset + tok.value.length,
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
      to: tok.offset + tok.value.length,
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
