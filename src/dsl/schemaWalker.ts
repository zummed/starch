import { tokenize } from './tokenizer';
import { WalkContext } from './walkContext';
import { executeSchema, executeInstance, executeColor, parseKeyframesBlock } from './hintExecutors';
import { getDsl } from './dslMeta';
import { DocumentSchema } from '../types/schemaRegistry';
import { NodeSchema } from '../types/node';
import { resolveFieldSchema } from './schemaIntrospect';
import type { z } from 'zod';

export interface WalkResult {
  model: Record<string, any>;
  ast: WalkContext;
}

/**
 * Main entry point: walk a DSL document using DocumentSchema as the root.
 * Returns the parsed model and the walker's context (with AST leaves).
 */
export function walkDocument(text: string): WalkResult {
  const tokens = tokenize(text);
  const ctx = new WalkContext(tokens, text);
  const model: Record<string, any> = { objects: [] };

  const shape = (DocumentSchema as any).shape;
  const topLevelFields = collectTopLevelFields(shape);

  while (!ctx.atEnd()) {
    ctx.skipNewlines();
    if (ctx.atEnd()) break;

    const tok = ctx.peek();
    if (!tok || tok.type !== 'identifier') {
      // Skip unknown tokens (indent/dedent/etc.)
      ctx.next();
      continue;
    }

    // Match against top-level fields by keyword
    const matched = matchTopLevel(ctx, tok.value, topLevelFields, model);
    if (matched) {
      ctx.skipNewlines();
      continue;
    }

    // Try matching a section keyword (style/animate/images)
    if (matchSection(ctx, tok.value, shape, model)) {
      ctx.skipNewlines();
      continue;
    }

    // Try matching an instance declaration against fields with instanceDeclaration hint
    if (matchInstance(ctx, shape, model)) {
      ctx.skipNewlines();
      continue;
    }

    // Unknown — skip token
    ctx.next();
  }

  return { model, ast: ctx };
}

interface TopLevelField {
  name: string;       // field name in model
  keyword: string;    // DSL keyword
  schema: z.ZodType;
}

function collectTopLevelFields(shape: Record<string, z.ZodType>): TopLevelField[] {
  const fields: TopLevelField[] = [];
  for (const [name, field] of Object.entries(shape)) {
    const inner = (field as any)._def?.innerType ?? field;
    const hints = getDsl(inner);
    if (hints?.topLevel && hints.keyword) {
      fields.push({ name, keyword: hints.keyword, schema: inner });
    }
  }
  return fields;
}

function matchTopLevel(
  ctx: WalkContext,
  keyword: string,
  fields: TopLevelField[],
  model: Record<string, any>,
): boolean {
  const field = fields.find(f => f.keyword === keyword);
  if (!field) return false;

  const result = executeSchema(ctx, field.schema, field.name);
  if (result == null) return false;

  // If positional has a single _value key, unwrap to scalar
  if ('_value' in result && Object.keys(result).length === 1) {
    model[field.name] = result._value;
  } else {
    model[field.name] = result;
  }
  return true;
}

/** Walk Zod schema chain (including _zod.parent) to find DslHints. */
function findHints(schema: z.ZodType): { hints: NonNullable<ReturnType<typeof getDsl>>; schema: z.ZodType } | null {
  let s: any = schema;
  while (s) {
    const h = getDsl(s as z.ZodType);
    if (h) return { hints: h, schema: s as z.ZodType };
    s = s?._zod?.parent ?? null;
  }
  return null;
}

function matchSection(
  ctx: WalkContext,
  keyword: string,
  shape: Record<string, z.ZodType>,
  model: Record<string, any>,
): boolean {
  for (const [name, field] of Object.entries(shape)) {
    const inner = (field as any)._def?.innerType ?? field;
    const found = findHints(inner);
    if (!found) continue;
    const { hints, schema: hintSchema } = found;

    // sectionKeyword field (styles, images, objects)
    if (hints.sectionKeyword === keyword) {
      ctx.next(); // consume section keyword

      if (hints.instanceDeclaration && hints.instanceDeclaration.colon === 'required') {
        // "objects" section → indented list of instance declarations
        // e.g.: objects\n  mybox: at 200,150\n    ...
        ctx.skipNewlines();
        if (ctx.is('indent' as any)) {
          ctx.next(); // consume indent

          // Get the element schema for resolving instances
          const inner2 = (field as any)._def?.innerType ?? field;
          const arrayDef = (inner2 as any)._def;
          const elementSchema = arrayDef?.element ?? arrayDef?.type;
          const resolvedSchema = (elementSchema as any)?._def?.getter
            ? (elementSchema as any)._def.getter()
            : elementSchema;

          while (!ctx.atEnd() && !ctx.is('dedent' as any)) {
            ctx.skipNewlines();
            if (ctx.is('dedent' as any)) break;
            if (resolvedSchema) {
              // Inside an objects section, colons are optional (colon-less syntax supported)
              const instance = executeInstance(ctx, resolvedSchema, 'id', 'optional', name);
              if (instance) {
                if (!model[name]) model[name] = [];
                model[name].push(instance);
                ctx.skipNewlines();
                continue;
              }
            }
            ctx.next(); // skip unrecognized
          }
          if (ctx.is('dedent' as any)) ctx.next();
        }
      } else if (hints.instanceDeclaration) {
        // "style primary" → followed by indented props
        const nameTok = ctx.peek();
        if (nameTok?.type === 'identifier') {
          const entryName = nameTok.value;
          ctx.next();
          const props = parsePropertyBlock(ctx, `${name}.${entryName}`);
          if (!model[name]) model[name] = {};
          model[name][entryName] = props;
        }
      } else if (hints.indentedEntries) {
        // "images" → key: "value" entries
        const entries = parseKeyValueBlock(ctx);
        if (!model[name]) model[name] = {};
        Object.assign(model[name], entries);
      }
      return true;
    }

    // animate uses keyword on the schema itself (not sectionKeyword hint)
    if (hints.keyword === keyword) {
      const parsed = executeSchema(ctx, hintSchema, name);
      if (parsed != null) {
        // Parse indented block: interleaved chapters + keyframes.
        if (hints.children?.keyframes === 'block') {
          const { keyframes, chapters } = parseKeyframesBlock(ctx, `${name}.keyframes`);
          parsed.keyframes = keyframes; // always set, even if empty (consumers iterate it)
          if (chapters.length > 0) parsed.chapters = chapters;
        }
        model[name] = parsed;
      }
      return true;
    }
  }
  return false;
}

/**
 * Parse an indented block of style properties. Driven by NodeSchema's DslHints
 * so a style accepts the same property set the emitter produces and a node
 * carries: fill, stroke, dash, layout (compound constructs) plus opacity /
 * depth (kwargs) and visible (flag). Keeping this schema-driven prevents the
 * style parse path from drifting from emit (which previously dropped dash /
 * layout / opacity / depth / visible silently).
 */
function parsePropertyBlock(ctx: WalkContext, schemaPath: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  ctx.skipNewlines();
  if (!ctx.is('indent')) return result;
  ctx.next(); // consume indent

  const nodeHints = getDsl(NodeSchema);
  const compoundProps = new Set(['stroke', 'dash', 'layout']);

  while (!ctx.atEnd() && !ctx.is('dedent')) {
    ctx.skipNewlines();
    if (ctx.is('dedent')) break;
    const tok = ctx.peek();
    if (!tok || tok.type !== 'identifier') { ctx.next(); continue; }
    const name = tok.value;

    if (name === 'fill') {
      ctx.next();
      const color = executeColor(ctx, `${schemaPath}.fill`);
      if (color != null) result.fill = color;
    } else if (compoundProps.has(name)) {
      const fieldSchema = resolveFieldSchema(NodeSchema, name);
      const parsed = fieldSchema ? executeSchema(ctx, fieldSchema, `${schemaPath}.${name}`) : null;
      if (parsed != null && Object.keys(parsed).length > 0) result[name] = parsed;
      else ctx.skipToNewline();
    } else if (nodeHints?.kwargs?.includes(name) && ctx.peek(1)?.type === 'equals') {
      // opacity=, depth=
      ctx.next(); ctx.next();
      if (ctx.is('number')) result[name] = parseFloat(ctx.next()!.value);
      else ctx.skipToNewline();
    } else if (nodeHints?.flags?.includes(name)) {
      // visible (bare) or visible=false
      ctx.next();
      if (ctx.is('equals')) {
        ctx.next();
        const v = ctx.peek();
        if (v?.type === 'identifier') { ctx.next(); result[name] = v.value === 'true'; }
      } else {
        result[name] = true;
      }
    } else {
      ctx.next(); // unknown — skip
    }
    ctx.skipNewlines();
  }

  if (ctx.is('dedent')) ctx.next();
  return result;
}

/**
 * Parse an indented block of `key: "value"` lines.
 * Used for images block.
 */
function parseKeyValueBlock(ctx: WalkContext): Record<string, string> {
  const result: Record<string, string> = {};
  ctx.skipNewlines();
  if (!ctx.is('indent')) return result;
  ctx.next(); // consume indent

  while (!ctx.atEnd() && !ctx.is('dedent')) {
    ctx.skipNewlines();
    if (ctx.is('dedent')) break;
    if (!ctx.is('identifier')) { ctx.next(); continue; }
    const keyTok = ctx.next()!;
    if (!ctx.is('colon')) continue;
    ctx.next();
    if (!ctx.is('string')) continue;
    const valTok = ctx.next()!;
    result[keyTok.value] = valTok.value;
    ctx.skipNewlines();
  }
  if (ctx.is('dedent')) ctx.next();
  return result;
}

function matchInstance(
  ctx: WalkContext,
  shape: Record<string, z.ZodType>,
  model: Record<string, any>,
): boolean {
  // Find any field with instanceDeclaration hint (typically 'objects')
  for (const [name, field] of Object.entries(shape)) {
    const inner = (field as any)._def?.innerType ?? field;
    const hints = getDsl(inner);
    if (!hints?.instanceDeclaration) continue;

    // Skip fields whose sectionKeyword matches the current token — those
    // are section headers and should be handled by matchSection, not here.
    // Fields with sectionKeyword can still match top-level instances WHEN the
    // current token is NOT the section keyword (e.g., `box: rect` at top level
    // goes into the `objects` field even though it has sectionKeyword: 'objects').
    //
    // However, fields where colon is 'optional' AND they have a sectionKeyword
    // should NOT match at top level (avoid greedy style-name matching).
    if (hints.sectionKeyword && hints.instanceDeclaration?.colon !== 'required') continue;
    if (hints.sectionKeyword && ctx.peek()?.value === hints.sectionKeyword) continue;

    // The array's element schema is the instance schema
    const arrayDef = (inner as any)._def;
    const elementSchema = arrayDef?.element ?? arrayDef?.type;
    // Unwrap lazy
    const resolvedSchema = (elementSchema as any)?._def?.getter
      ? (elementSchema as any)._def.getter()
      : elementSchema;

    if (!resolvedSchema) continue;

    const { idKey, colon } = hints.instanceDeclaration;
    const instance = executeInstance(ctx, resolvedSchema, idKey, colon, name);
    if (instance) {
      if (!model[name]) model[name] = [];
      model[name].push(instance);
      return true;
    }
  }
  return false;
}
