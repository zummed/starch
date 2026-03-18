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
  | 'bool-value'
  | 'colour-value'
  | 'point-value'
  | 'size-value'
  | 'effect-value'
  | 'imageFit-value'
  | 'textAlign-value'
  | 'textVAlign-value'
  | 'syntax-value'
  | 'group-value'
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
    if (propName === 'from' || propName === 'to' || propName === 'target' || propName === 'follow')
      return { context: 'id-value' };
    if (propName === 'group') return { context: 'group-value' };
    if (propName === 'bold' || propName === 'dashed' || propName === 'arrow' || propName === 'arrowStart' || propName === 'closed'
      || propName === 'visible' || propName === 'loop' || propName === 'wrap'
      || propName === 'smooth' || propName === 'autoKey' || propName === 'mono'
      || propName === 'cascadeOpacity' || propName === 'cascadeScale' || propName === 'cascadeRotation')
      return { context: 'bool-value' };
    if (propName === 'colour' || propName === 'fill' || propName === 'stroke'
      || propName === 'color' || propName === 'textColor' || propName === 'textColour'
      || propName === 'headerColor' || propName === 'headerColour'
      || propName === 'headerFill' || propName === 'labelColor' || propName === 'labelColour'
      || propName === 'background')
      return { context: 'colour-value' };
    if (propName === 'at') return { context: 'point-value' };
    if (propName === 'size') return { context: 'size-value' };
    if (propName === 'imageFit') return { context: 'imageFit-value' };
    if (propName === 'textAlign') return { context: 'textAlign-value' };
    if (propName === 'textVAlign') return { context: 'textVAlign-value' };
    if (propName === 'alignSelf') return { context: 'align-value' };
    if (propName === 'syntax') return { context: 'syntax-value' };
    if (SCHEMA_METADATA.effects.includes(propName as never))
      return { context: 'effect-value' };
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
    // Find the current object's type by looking back to the nearest opening brace
    const lastBrace = before.lastIndexOf('{');
    const currentObj = before.slice(lastBrace);
    const typeMatch = currentObj.match(/type\s*:\s*["'](\w+)["']/);
    const shorthandMatch = currentObj.match(
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

/**
 * Extract IDs of objects that have direction set (containers).
 */
function extractContainerIds(doc: string): string[] {
  const ids: string[] = [];
  // Look for objects that have both an id and direction
  const pattern = /(?:box|circle)\s*:\s*["']([^"']+)["'][^}]*direction\s*:/g;
  let match;
  while ((match = pattern.exec(doc))) {
    ids.push(match[1]);
  }
  // Also check canonical form
  const canonical = /id\s*:\s*["']([^"']+)["'][^}]*direction\s*:/g;
  while ((match = canonical.exec(doc))) {
    ids.push(match[1]);
  }
  return [...new Set(ids)];
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
      options = props([...SCHEMA_METADATA.topLevel]);
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

    case 'group-value':
      // Offer IDs of objects that have direction (containers)
      options = quoted(extractContainerIds(doc), 'container');
      break;

    case 'bool-value':
      options = [
        { label: 'true', detail: 'boolean' },
        { label: 'false', detail: 'boolean' },
      ];
      break;

    case 'colour-value':
      options = [
        { label: '"#22d3ee"', detail: 'cyan' },
        { label: '"#34d399"', detail: 'green' },
        { label: '"#fbbf24"', detail: 'yellow' },
        { label: '"#a78bfa"', detail: 'purple' },
        { label: '"#f472b6"', detail: 'pink' },
        { label: '"#60a5fa"', detail: 'blue' },
        { label: '"#ef4444"', detail: 'red' },
        { label: '"#fb923c"', detail: 'orange' },
        { label: '"#e2e5ea"', detail: 'light' },
        { label: '"#6b7280"', detail: 'muted' },
        { label: '"#2a2d35"', detail: 'dark' },
      ];
      break;

    case 'point-value':
      options = [
        { label: '[x, y]', detail: 'position', apply: '[, ]' },
        { label: '[400, 200]', detail: 'center', apply: '[400, 200]' },
      ];
      break;

    case 'size-value':
      options = [
        { label: '[w, h]', detail: 'dimensions', apply: '[, ]' },
        { label: '[140, 46]', detail: 'default', apply: '[140, 46]' },
        { label: '[200, 60]', detail: 'wide', apply: '[200, 60]' },
      ];
      break;

    case 'imageFit-value':
      options = quoted(['contain', 'cover', 'fill'], 'fit');
      break;

    case 'effect-value':
      options = [
        { label: '0.1', detail: 'subtle' },
        { label: '0.15', detail: 'medium' },
        { label: '0.25', detail: 'strong' },
      ];
      break;

    case 'textAlign-value':
      options = quoted(['start', 'middle', 'end'], 'horizontal');
      break;

    case 'textVAlign-value':
      options = quoted(['top', 'middle', 'bottom'], 'vertical');
      break;

    case 'syntax-value':
      options = quoted([
        'javascript', 'typescript', 'python', 'json', 'yaml',
        'sql', 'bash', 'css', 'html', 'go', 'rust', 'java',
        'c', 'cpp', 'markdown',
      ], 'language');
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
