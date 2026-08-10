/**
 * Embed mode + URL-hash DSL loading for the playground app.
 *
 * Two independent behaviors live here:
 *  - Normal mode: a `#dsl=` hash on load is imported as a new tab, then cleared.
 *  - Embed mode (`?embed=1`): the playground edits a single diagram supplied via the
 *    hash and/or a host `init` postMessage, and reports back via `save`/`cancel`.
 *
 * The pure helpers (isEmbedMode, readHashImport, resolveHost) take their inputs as
 * plain values so they're testable without touching `window`. `useEmbedHost` is the
 * only stateful/side-effecting piece — it wires those helpers to the DOM.
 */
import { useCallback, useEffect, useRef } from 'react';
import { decodeDslFromHash, isHostMessage, type PlaygroundMessage } from '../editing';

const HASH_DSL_PREFIX = '#dsl=';

/** True when `?embed=1` is present in the given `location.search`. */
export function isEmbedMode(search: string): boolean {
  return new URLSearchParams(search).get('embed') === '1';
}

export type HashImportResult =
  | { kind: 'dsl'; dsl: string }
  | { kind: 'error' }
  | { kind: 'none' };

/** Reads (without side effects) whatever DSL a `location.hash` carries, if any. */
export function readHashImport(hash: string): HashImportResult {
  const dsl = decodeDslFromHash(hash);
  if (dsl !== null) return { kind: 'dsl', dsl };
  if (hash.startsWith(HASH_DSL_PREFIX)) return { kind: 'error' };
  return { kind: 'none' };
}

/**
 * The window to exchange playground messages with: an opener (popup) or a parent frame
 * that actually differs from `win` (an unframed window's `parent` is itself). Accessing
 * `.opener`/`.parent` is safe even cross-origin — only reading properties *through* them
 * would throw.
 */
export function resolveHost(win: Window): Window | null {
  if (win.opener) return win.opener as Window;
  if (win.parent !== win) return win.parent;
  return null;
}

interface UseEmbedHostResult {
  /** Send `{ type: 'save', dsl }` to the host, then attempt to close the window. */
  save: (dsl: string) => void;
  /** Send `{ type: 'cancel' }` to the host, then attempt to close the window. */
  cancel: () => void;
}

/**
 * Wires up the embed postMessage protocol while `active`:
 *  - posts `{ type: 'ready' }` to the host once, on mount;
 *  - listens for the host's `{ type: 'init', dsl }` message, remembering its origin as
 *    the reply origin and invoking `onInit(dsl)`;
 *  - returns `save`/`cancel` senders that reply to the host (targetOrigin = the
 *    remembered init origin, else '*') and then call `window.close()`.
 *
 * With no host at all (opened directly), `save` no-ops with a console.warn and `cancel`
 * just closes the window — neither throws.
 */
export function useEmbedHost(active: boolean, onInit: (dsl: string) => void): UseEmbedHostResult {
  const hostRef = useRef<Window | null>(null);
  const replyOriginRef = useRef<string | null>(null);
  const onInitRef = useRef(onInit);
  onInitRef.current = onInit;

  useEffect(() => {
    if (!active) return;
    const host = resolveHost(window);
    hostRef.current = host;
    if (host) {
      const ready: PlaygroundMessage = { source: 'starch-playground', type: 'ready' };
      host.postMessage(ready, '*');
    }

    const onMessage = (event: MessageEvent) => {
      if (!isHostMessage(event.data)) return;
      replyOriginRef.current = event.origin;
      onInitRef.current(event.data.dsl);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [active]);

  const save = useCallback((dsl: string) => {
    const host = hostRef.current;
    if (!host) {
      console.warn('no host to post to');
    } else {
      const msg: PlaygroundMessage = { source: 'starch-playground', type: 'save', dsl };
      host.postMessage(msg, replyOriginRef.current ?? '*');
    }
    window.close();
  }, []);

  const cancel = useCallback(() => {
    const host = hostRef.current;
    if (host) {
      const msg: PlaygroundMessage = { source: 'starch-playground', type: 'cancel' };
      host.postMessage(msg, replyOriginRef.current ?? '*');
    }
    window.close();
  }, []);

  return { save, cancel };
}
