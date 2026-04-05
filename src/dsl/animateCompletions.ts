/**
 * Animate-specific completion handlers. Each handler takes minimal input
 * and returns CompletionItem[]. Structural context detection (which handler
 * to call) lives in astCompletions.ts.
 */
import type { CompletionItem } from './astCompletions';
import { AnimConfigSchema, EasingNameSchema } from '../types/animation';
import { getDsl } from './dslMeta';
import { getEnumValues, detectSchemaType } from '../types/schemaRegistry';
import { getAllColorNames } from '../types/color';
import { currentValueAt, resolvePath, enumerateNextSegments } from './modelPathWalker';

/**
 * Scan backwards from the end of `headerText` to find the last token.
 * Returns the token text and whether it ends with '=' (kwarg-value position).
 */
function lastTokenInfo(headerText: string): { token: string; afterEquals: boolean } {
  // Trim trailing word (partial the user is typing).
  let end = headerText.length;
  // Rewind past any partial identifier characters after '='.
  let i = end;
  while (i > 0) {
    const ch = headerText[i - 1];
    if (/[a-zA-Z_\-]/.test(ch)) { i--; continue; }
    break;
  }
  // After rewinding, i points to the character after the last delimiter.
  // If the character at i-1 is '=', we're in kwarg-value position.
  const afterEquals = i > 0 && headerText[i - 1] === '=';
  // Find the kwarg key if afterEquals.
  if (afterEquals) {
    let keyEnd = i - 1;
    let keyStart = keyEnd;
    while (keyStart > 0 && /[a-zA-Z_\-]/.test(headerText[keyStart - 1])) {
      keyStart--;
    }
    return { token: headerText.slice(keyStart, keyEnd), afterEquals: true };
  }
  return { token: '', afterEquals: false };
}

/**
 * Which flags/kwargs have already appeared in the header, so we can omit
 * duplicates. Scan tokens separated by whitespace.
 */
function usedFlagsAndKwargs(headerText: string): Set<string> {
  const used = new Set<string>();
  const tokens = headerText.split(/\s+/);
  for (const tok of tokens) {
    if (!tok) continue;
    // Kwarg: "easing=linear" → record "easing"
    const eq = tok.indexOf('=');
    if (eq >= 0) {
      used.add(tok.slice(0, eq));
      continue;
    }
    // Flag or positional — record the bare identifier.
    if (/^[a-zA-Z_][\w\-]*$/.test(tok)) used.add(tok);
  }
  return used;
}

/**
 * Header context completions. Routes internally between:
 *   - kwarg-value (after "key="): enum values for that kwarg.
 *   - otherwise: flags + kwarg snippets from AnimConfigSchema hints.
 */
export function animateHeaderCompletions(headerText: string): CompletionItem[] {
  const hints = getDsl(AnimConfigSchema);
  if (!hints) return [];

  const { token, afterEquals } = lastTokenInfo(headerText);

  // Kwarg-value sub-context.
  if (afterEquals && token === 'easing') {
    const vals = getEnumValues(EasingNameSchema) ?? [];
    return vals.map(v => ({ label: v, type: 'value', detail: 'Easing function' }));
  }

  // Flags + kwarg snippets.
  const used = usedFlagsAndKwargs(headerText);
  const items: CompletionItem[] = [];

  for (const flag of hints.flags ?? []) {
    if (used.has(flag)) continue;
    items.push({ label: flag, type: 'keyword', detail: 'Animation flag' });
  }

  for (const kw of hints.kwargs ?? []) {
    if (used.has(kw)) continue;
    items.push({
      label: `${kw}=`,
      type: 'keyword',
      detail: 'Animation option',
      snippetTemplate: `${kw}=\${1}`,
    });
  }

  return items;
}

/**
 * Scan backwards from the end of `textBeforeCursor` to extract the dotted
 * path the user is typing. Stops at whitespace or ':' (value terminator).
 *
 * This is tokenisation-style scanning — it reads characters until a
 * delimiter, not pattern-matching on content shape.
 */
export function extractPartialPath(textBeforeCursor: string): string {
  let i = textBeforeCursor.length;
  while (i > 0) {
    const ch = textBeforeCursor[i - 1];
    if (/[a-zA-Z0-9_\-.]/.test(ch)) { i--; continue; }
    break;
  }
  const raw = textBeforeCursor.slice(i);
  // If what we captured contains ':', it's past a terminator — reject.
  if (raw.includes(':')) return '';
  return raw;
}

/**
 * Collect all paths that appear in any keyframe's `changes` record on this
 * animate block. Used by tier-1 classification during path completion.
 */
export function collectAnimatedPaths(animateBlock: any): Set<string> {
  const paths = new Set<string>();
  if (!animateBlock?.keyframes) return paths;
  for (const kf of animateBlock.keyframes) {
    if (!kf?.changes) continue;
    for (const path of Object.keys(kf.changes)) {
      paths.add(path);
    }
  }
  return paths;
}

/**
 * Keyframe-start context: cursor is on an indented line under the animate
 * header, before typing a timestamp. Offer a numeric-time snippet and the
 * `chapter` keyword.
 */
export function animateKeyframeStartCompletions(): CompletionItem[] {
  return [
    {
      label: 'time',
      type: 'keyword',
      detail: 'Keyframe timestamp',
      snippetTemplate: '${1:1} ${2:path}: ${3:value}',
    },
    {
      label: 'chapter',
      type: 'keyword',
      detail: 'Named chapter marker',
      snippetTemplate: 'chapter "${1:name}" at ${2:0}',
    },
  ];
}

export type Tier = 'animated' | 'set' | 'available';

/**
 * Classify a candidate next-segment by tier:
 *   - 'animated': extending to `prefix.candidate` reaches (or is a prefix of)
 *     some path in the animated set.
 *   - 'set': `prefix.candidate` has an explicit value in the model — or,
 *     for drill targets, some descendant leaf is set.
 *   - 'available': schema-reachable but neither of the above.
 */
export function tierCandidate(
  candidate: string,
  prefix: string,
  modelJson: any,
  animatedPaths: Set<string>,
): Tier {
  const fullPath = prefix ? `${prefix}.${candidate}` : candidate;

  // Tier 1: animated — any animated path starts with fullPath (or equals it).
  for (const ap of animatedPaths) {
    if (ap === fullPath) return 'animated';
    if (ap.startsWith(fullPath + '.')) return 'animated';
  }

  // Tier 2: set — fullPath leads to a currently-set value.
  const value = currentValueAt(modelJson, fullPath);
  if (value !== undefined && value !== null) {
    // For scalars and present sub-objects, treat as set.
    return 'set';
  }

  return 'available';
}

/**
 * Enumerate all top-level scene node ids from the model. Used as the
 * root-segment candidate list (when partial has no dot yet or is empty).
 */
function sceneNodeIds(modelJson: any): string[] {
  if (!Array.isArray(modelJson?.objects)) return [];
  return modelJson.objects.map((o: any) => o?.id).filter((id: any) => typeof id === 'string');
}

/**
 * Main path-completion handler. Given a partial dot-path, resolves as far
 * as possible through the scene model and returns tiered next-segment
 * candidates.
 *
 * When the partial ends with '.' or is empty at a segment boundary, we've
 * committed the previous segments. Otherwise, the last segment is a
 * filter-prefix for the caller (we return all options at the resolved
 * parent).
 */
export function animatePathCompletions(
  partialPath: string,
  modelJson: any,
  animateBlock: any,
): CompletionItem[] {
  const animated = collectAnimatedPaths(animateBlock);

  // Split on '.'. The last segment is the user's filter-prefix (possibly
  // empty if they just typed a dot). Everything before it is committed.
  const segments = partialPath.split('.');
  const committed = segments.slice(0, -1);
  const prefix = committed.join('.');

  // Empty committed → we're at the root. Return top-level scene node ids.
  if (committed.length === 0) {
    const ids = sceneNodeIds(modelJson);
    return ids.map(id => {
      const tier = tierCandidate(id, '', modelJson, animated);
      return makeCandidateItem(id, tier, 'drill');
    });
  }

  // Resolve the walk through the committed segments.
  const loc = resolvePath(modelJson, committed);
  if (!loc) {
    // Fallback: unknown root — return all nodes + info item.
    const ids = sceneNodeIds(modelJson);
    const items: CompletionItem[] = ids.map(id => {
      const tier = tierCandidate(id, '', modelJson, animated);
      return makeCandidateItem(id, tier, 'drill');
    });
    items.push({
      label: `no match for "${committed[0]}"`,
      type: 'info',
      detail: 'Showing all scene nodes',
    });
    return items;
  }

  // Enumerate next-level options and tier them.
  const nexts = enumerateNextSegments(loc);
  const items = nexts.map(n => {
    const tier = tierCandidate(n.name, prefix, modelJson, animated);
    return makeCandidateItem(n.name, tier, n.kind);
  });

  // Sort by tier: animated → set → available, then alphabetical.
  const tierOrder: Record<Tier, number> = { animated: 0, set: 1, available: 2 };
  items.sort((a, b) => {
    const ta = tierOrder[(a.detail as Tier) ?? 'available'];
    const tb = tierOrder[(b.detail as Tier) ?? 'available'];
    if (ta !== tb) return ta - tb;
    return a.label.localeCompare(b.label);
  });

  return items;
}

function makeCandidateItem(
  name: string,
  tier: Tier,
  kind: 'drill' | 'leaf',
): CompletionItem {
  const item: CompletionItem = {
    label: name,
    type: kind === 'leaf' ? 'property' : 'keyword',
    detail: tier,
  };
  if (kind === 'drill') item.retrigger = true;
  return item;
}

/**
 * Produce value completions for a full keyframe change path.
 * Includes the current scene value (if concise) as a top-ranked item.
 */
export function animateValueCompletions(
  fullPath: string,
  modelJson: any,
): CompletionItem[] {
  const segments = fullPath.split('.');
  const loc = resolvePath(modelJson, segments);
  if (!loc || !loc.schema) return [];

  const type = detectSchemaType(loc.schema);
  const items: CompletionItem[] = [];

  // Current-value item (top-ranked).
  const current = currentValueAt(modelJson, fullPath);
  if (current !== undefined && current !== null) {
    const asText = conciseValue(current);
    if (asText !== null) {
      items.push({
        label: asText,
        type: 'value',
        detail: `current: ${asText}`,
      });
    }
  }

  // Type-specific completions.
  if (type === 'color') {
    for (const name of getAllColorNames()) {
      if (items[0]?.label === name) continue; // don't duplicate the current
      items.push({ label: name, type: 'value', detail: 'Named color' });
    }
    items.push({
      label: 'hsl',
      type: 'keyword',
      detail: 'HSL color',
      snippetTemplate: 'hsl ${1:H} ${2:S} ${3:L}',
    });
    items.push({
      label: 'rgb',
      type: 'keyword',
      detail: 'RGB color',
      snippetTemplate: 'rgb ${1:R} ${2:G} ${3:B}',
    });
  } else if (type === 'enum') {
    const vals = getEnumValues(loc.schema) ?? [];
    for (const v of vals) {
      if (items[0]?.label === v) continue;
      items.push({ label: v, type: 'value' });
    }
  } else if (type === 'boolean') {
    for (const v of ['true', 'false']) {
      if (items[0]?.label === v) continue;
      items.push({ label: v, type: 'value' });
    }
  }
  // number → only current-value item (no free list).

  return items;
}

/**
 * Format a model value as a concise DSL-compatible string. Returns null for
 * structured values that can't be rendered concisely.
 */
function conciseValue(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return String(v);
  return null;
}
