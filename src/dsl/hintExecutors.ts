import type { WalkContext } from './walkContext';
import type { PositionalHint } from './dslMeta';

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
