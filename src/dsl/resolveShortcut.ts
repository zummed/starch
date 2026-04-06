/**
 * Resolves a double-dot shortcut path against known track paths.
 *
 * Examples:
 *   resolveShortcut('cam..zoom', paths) → 'cam.camera.zoom'
 *   resolveShortcut('card..size', paths) → 'card.title.text.size'
 *   resolveShortcut('box..h', paths) → ERROR if box.fill.h AND box.stroke.h exist
 *   resolveShortcut('box.fill.h', paths) → 'box.fill.h' (no shortcut, pass through)
 */
export function resolveShortcut(path: string, trackPaths: string[]): string {
  if (!path.includes('..')) return path;

  const [prefix, suffix] = path.split('..');
  if (!prefix || !suffix) {
    throw new Error(`Invalid shortcut path "${path}": prefix and suffix required around ".."`);
  }

  const candidates = trackPaths.filter(tp =>
    tp.startsWith(prefix + '.') && tp.endsWith('.' + suffix)
  );

  if (candidates.length === 0) {
    throw new Error(`No match for shortcut "${path}" in available track paths`);
  }
  if (candidates.length > 1) {
    throw new Error(
      `Ambiguous shortcut "${path}": matches ${candidates.join(', ')}`
    );
  }
  return candidates[0];
}

/**
 * Given a node ID prefix and available track paths, returns all possible
 * unambiguous shortcut completions. Used by the editor autocomplete.
 *
 * Example: suggestShortcuts('cam', paths) →
 *   [{ short: 'cam..zoom', full: 'cam.camera.zoom' }, ...]
 */
export function suggestShortcuts(
  prefix: string,
  trackPaths: string[]
): Array<{ short: string; full: string }> {
  // Find all track paths that start with the given prefix
  const relevantPaths = trackPaths.filter(tp => tp.startsWith(prefix + '.'));

  if (relevantPaths.length === 0) return [];

  // Collect all terminal segments (the last segment of each relevant path)
  const suffixToFull = new Map<string, string[]>();
  for (const tp of relevantPaths) {
    const rest = tp.slice(prefix.length + 1); // strip "prefix."
    const segments = rest.split('.');
    const suffix = segments[segments.length - 1];
    if (!suffixToFull.has(suffix)) {
      suffixToFull.set(suffix, []);
    }
    suffixToFull.get(suffix)!.push(tp);
  }

  // Only include suffixes that map to exactly one full path (unambiguous)
  const result: Array<{ short: string; full: string }> = [];
  for (const [suffix, fullPaths] of suffixToFull) {
    if (fullPaths.length === 1) {
      result.push({ short: `${prefix}..${suffix}`, full: fullPaths[0] });
    }
  }

  return result;
}
