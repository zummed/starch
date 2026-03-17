import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { SCHEMA_METADATA } from '../core/schemas';

type Context =
  | 'top-level'
  | 'animate'
  | 'object-prop'
  | 'type-value'
  | 'easing-value'
  | 'anchor-value'
  | 'align-value'
  | 'justify-value'
  | 'direction-value'
  | 'id-value'
  | 'unknown';

interface CursorContext {
  context: Context;
  objectType?: string;
}

/**
 * Determine what kind of position the cursor is in by scanning backwards.
 */
function detectContext(doc: string, pos: number): CursorContext {
  // Get text before cursor (use full document — DSL is small)
  const before = doc.slice(0, pos);

  // Check if we're in a value position (after a colon)
  const lastColon = before.lastIndexOf(':');
  const lastComma = before.lastIndexOf(',');
  const lastOpen = Math.max(before.lastIndexOf('{'), before.lastIndexOf('['));

  const inValue = lastColon > lastComma && lastColon > lastOpen;

  if (inValue) {
    // What property are we providing a value for?
    const propMatch = before.slice(0, lastColon).match(/(\w+)\s*$/);
    const propName = propMatch?.[1];

    if (propName === 'type') return { context: 'type-value' };
    if (propName === 'easing') return { context: 'easing-value' };
    if (propName === 'anchor' || propName === 'fromAnchor' || propName === 'toAnchor')
      return { context: 'anchor-value' };
    if (propName === 'align') return { context: 'align-value' };
    if (propName === 'justify') return { context: 'justify-value' };
    if (propName === 'direction') return { context: 'direction-value' };
    if (propName === 'from' || propName === 'to' || propName === 'target')
      return { context: 'id-value' };
  }

  // Count brace nesting to determine depth
  let braceDepth = 0;
  let inAnimate = false;
  let inObjects = false;

  // Simple scan for context
  for (let i = before.length - 1; i >= 0; i--) {
    const ch = before[i];
    if (ch === '}' || ch === ']') braceDepth++;
    if (ch === '{' || ch === '[') {
      braceDepth--;
      if (braceDepth < 0) break;
    }
  }

  // Check if inside animate block
  const animateMatch = before.match(/animate\s*:\s*\{[^}]*$/);
  if (animateMatch && braceDepth <= 1) {
    inAnimate = true;
  }

  // Check if inside objects array
  const objectsMatch = before.match(/objects\s*:\s*\[/);
  if (objectsMatch) {
    inObjects = true;
  }

  if (braceDepth <= 0 && !inObjects && !inAnimate) {
    return { context: 'top-level' };
  }

  if (inAnimate && !inValue) {
    return { context: 'animate' };
  }

  if (inObjects || braceDepth > 0) {
    // Try to find the object type
    const typeMatch = before.match(/type\s*:\s*["'](\w+)["']/);
    const shorthandMatch = before.match(
      new RegExp(`(${SCHEMA_METADATA.types.join('|')})\\s*:\\s*["']`),
    );
    const objectType = typeMatch?.[1] || shorthandMatch?.[1];
    return { context: 'object-prop', objectType };
  }

  return { context: 'unknown' };
}

/**
 * Extract all object IDs from the document for from/to/target completion.
 */
function extractIds(doc: string): string[] {
  const ids = new Set<string>();

  // Canonical: id: "foo"
  const idPattern = /id\s*:\s*["']([^"']+)["']/g;
  let match;
  while ((match = idPattern.exec(doc))) {
    ids.add(match[1]);
  }

  // Shorthand: box: "foo", circle: "bar", etc.
  const typePattern = new RegExp(
    `(?:${SCHEMA_METADATA.types.join('|')})\\s*:\\s*["']([^"']+)["']`,
    'g',
  );
  while ((match = typePattern.exec(doc))) {
    ids.add(match[1]);
  }

  return [...ids];
}

function quoted(values: readonly string[], detail?: string): Array<{ label: string; detail?: string }> {
  return values.map((v) => ({ label: `"${v}"`, detail }));
}

function props(
  names: readonly string[],
  detail?: string,
): Array<{ label: string; detail?: string; apply?: string }> {
  return names.map((n) => ({ label: n, detail, apply: `${n}: ` }));
}

/**
 * CodeMirror completion source for the starch JSON5 DSL.
 */
export function starchCompletions(context: CompletionContext): CompletionResult | null {
  // Only trigger after typing a word character or quote
  const word = context.matchBefore(/[\w"']*/);
  if (!word) return null;
  if (word.from === word.to && !context.explicit) return null;

  const doc = context.state.doc.toString();
  const { context: ctx, objectType } = detectContext(doc, word.from);

  let options: Array<{ label: string; detail?: string; apply?: string }> = [];

  switch (ctx) {
    case 'top-level':
      options = props(['objects', 'animate']);
      break;

    case 'animate':
      options = props(SCHEMA_METADATA.animateProps, 'animate');
      break;

    case 'type-value':
      options = quoted(SCHEMA_METADATA.types, 'type');
      break;

    case 'easing-value':
      options = quoted(SCHEMA_METADATA.easing, 'easing');
      break;

    case 'anchor-value':
      options = quoted(SCHEMA_METADATA.anchors, 'anchor');
      break;

    case 'align-value':
      options = quoted(SCHEMA_METADATA.align, 'align');
      break;

    case 'justify-value':
      options = quoted(SCHEMA_METADATA.justify, 'justify');
      break;

    case 'direction-value':
      options = quoted(SCHEMA_METADATA.direction, 'direction');
      break;

    case 'id-value':
      options = quoted(extractIds(doc), 'id ref');
      break;

    case 'object-prop': {
      // Base props + type-specific props + shorthand props
      const allProps: string[] = [...SCHEMA_METADATA.props.base];
      if (objectType && objectType in SCHEMA_METADATA.props) {
        allProps.push(
          ...SCHEMA_METADATA.props[objectType as keyof typeof SCHEMA_METADATA.props],
        );
      }
      allProps.push(...SCHEMA_METADATA.shorthandProps);
      // Also offer type and id
      allProps.push('type', 'id');
      // Offer type-as-key shorthands
      options = [
        ...props([...new Set(allProps)], objectType || 'prop'),
        ...SCHEMA_METADATA.types.map((t) => ({
          label: t,
          detail: 'type shorthand',
          apply: `${t}: `,
        })),
      ];
      break;
    }

    default:
      return null;
  }

  if (options.length === 0) return null;

  return {
    from: word.from,
    options,
    validFor: /^[\w"']*/,
  };
}
