/**
 * Animate-specific completion handlers. Each handler takes minimal input
 * and returns CompletionItem[]. Structural context detection (which handler
 * to call) lives in astCompletions.ts.
 */
import type { CompletionItem } from './astCompletions';
import { AnimConfigSchema, EasingNameSchema } from '../types/animation';
import { getDsl } from './dslMeta';
import { getEnumValues } from '../types/schemaRegistry';

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
