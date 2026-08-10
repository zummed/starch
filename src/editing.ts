/**
 * Shared contract for the "edit in playground" round trip.
 *
 * A host (the `<starch-diagram>` element, or any app embedding starch)
 * opens the playground with the DSL in the URL hash; the playground's
 * embed mode posts the edited DSL back via postMessage. Both sides import
 * this module so the URL format and message shapes can't drift apart.
 *
 * The DSL travels in the fragment (never sent to a server) as
 * base64url-encoded UTF-8: `#dsl=<base64url>`.
 */

export const PLAYGROUND_URL = 'https://zummed.github.io/starch/';

const HASH_PREFIX = '#dsl=';

export function encodeDslToHash(dsl: string): string {
  const bytes = new TextEncoder().encode(dsl);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return HASH_PREFIX + b64;
}

/** Returns null when the hash is absent, not ours, or undecodable. */
export function decodeDslFromHash(hash: string): string | null {
  if (!hash.startsWith(HASH_PREFIX)) return null;
  const b64 = hash.slice(HASH_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
  try {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** URL that opens the playground with `dsl` loaded, in embed mode unless `embed: false`. */
export function buildEditUrl(dsl: string, playgroundUrl: string = PLAYGROUND_URL, options?: { embed?: boolean }): string {
  const url = new URL(playgroundUrl);
  if (options?.embed !== false) {
    url.searchParams.set('embed', '1');
  }
  url.hash = '';
  return url.toString() + encodeDslToHash(dsl);
}

// ── postMessage protocol ──
//
// Playground (embed mode)          Host (opener or parent frame)
//   → { ready }                      ← may reply { init, dsl } to override
//   → { save, dsl }   on Save        applies/persists the DSL
//   → { cancel }      on Cancel
//
// The `source` field distinguishes these from unrelated messages.

export type PlaygroundMessage =
  | { source: 'starch-playground'; type: 'ready' }
  | { source: 'starch-playground'; type: 'save'; dsl: string }
  | { source: 'starch-playground'; type: 'cancel' };

export type HostMessage = { source: 'starch-host'; type: 'init'; dsl: string };

export function isPlaygroundMessage(data: unknown): data is PlaygroundMessage {
  const d = data as PlaygroundMessage | null;
  return !!d && d.source === 'starch-playground' && (d.type === 'ready' || d.type === 'save' || d.type === 'cancel');
}

export function isHostMessage(data: unknown): data is HostMessage {
  const d = data as HostMessage | null;
  return !!d && d.source === 'starch-host' && d.type === 'init' && typeof d.dsl === 'string';
}
