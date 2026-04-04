import { tokenize } from './tokenizer';
import { WalkContext } from './walkContext';
import { executeSchema } from './hintExecutors';
import { getDsl } from './dslMeta';
import { DocumentSchema } from '../types/schemaRegistry';
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
