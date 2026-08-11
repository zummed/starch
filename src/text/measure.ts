/**
 * Text measurement service wrapping Pretext.
 * Provides accurate text dimensions and line-breaking without DOM reflows.
 *
 * Static import ensures Pretext is bundled and available synchronously —
 * so templates get accurate canvas measurements at parse time, not a
 * heuristic fallback from an unresolved async load.
 */
import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext';

export interface MeasuredText {
  width: number;
  height: number;
  lines: Array<{ text: string; width: number }>;
}

export interface TextMeasurer {
  measure(content: string, opts?: {
    size?: number;
    bold?: boolean;
    mono?: boolean;
    lineHeight?: number;
    maxWidth?: number;
  }): MeasuredText;
}

function buildFont(size: number, bold: boolean, mono: boolean): string {
  const weight = bold ? 'bold ' : '';
  const family = mono ? 'monospace' : 'sans-serif';
  return `${weight}${size}px ${family}`;
}

// ─── Canvas-backed measurer (browser) ──────────────────────────

const canvasMeasurer: TextMeasurer = {
  measure(content, opts = {}) {
    const size = opts.size ?? 14;
    const bold = opts.bold ?? false;
    const mono = opts.mono ?? false;
    const lh = opts.lineHeight ?? size * 1.4;
    const font = buildFont(size, bold, mono);

    // Use pre-wrap when text contains explicit newlines so \n creates hard breaks
    const whiteSpace = content.includes('\n') ? 'pre-wrap' as const : undefined;
    const prepared = prepareWithSegments(content, font, whiteSpace ? { whiteSpace } : undefined);

    const maxWidth = (opts.maxWidth !== undefined && opts.maxWidth > 0)
      ? opts.maxWidth
      : 1e7; // effectively no wrapping
    const result = layoutWithLines(prepared, maxWidth, lh);
    return {
      width: result.lines.length > 0 ? Math.max(...result.lines.map(l => l.width)) : 0,
      height: result.height,
      lines: result.lines,
    };
  },
};

// ─── Fallback measurer (Node.js / tests — no Canvas API) ───────

/**
 * Character widths are a guess here, but the *line structure* must not be:
 * everything downstream reads it. The renderer emits one tspan per line, so
 * a measurer that returns a single line renders "a\nb" as one run with a
 * stray newline in it, and box auto-sizing takes its height from the line
 * count. Collapsing them made every multi-line and maxWidth-wrapped label
 * overflow its background in headless renders — while the browser, on the
 * canvas measurer, laid the same document out correctly.
 */
const fallbackMeasurer: TextMeasurer = {
  measure(content, opts = {}) {
    const size = opts.size ?? 14;
    const lh = opts.lineHeight ?? size * 1.4;
    const charWidth = size * 0.6;
    const maxWidth = (opts.maxWidth !== undefined && opts.maxWidth > 0) ? opts.maxWidth : Infinity;

    const lines: Array<{ text: string; width: number }> = [];
    for (const hardLine of content.split('\n')) {
      // Greedy wrap on whitespace, matching how the canvas measurer breaks.
      // A single word wider than maxWidth still gets its own line rather
      // than being split mid-word.
      let current = '';
      for (const word of hardLine.split(/(\s+)/)) {
        if (word === '') continue;
        const candidate = current + word;
        if (current !== '' && candidate.length * charWidth > maxWidth) {
          lines.push({ text: current.trimEnd(), width: current.trimEnd().length * charWidth });
          current = /^\s+$/.test(word) ? '' : word;
        } else {
          current = candidate;
        }
      }
      lines.push({ text: current.trimEnd(), width: current.trimEnd().length * charWidth });
    }

    return {
      width: Math.max(...lines.map(line => line.width), 0),
      height: lines.length * lh,
      lines,
    };
  },
};

// ─── Singleton — resolved synchronously at module load ─────────

function resolveTextMeasurer(): TextMeasurer {
  try {
    // Probe: will throw if Canvas API is unavailable (Node.js / test env)
    prepareWithSegments('a', '14px sans-serif');
    return canvasMeasurer;
  } catch {
    return fallbackMeasurer;
  }
}

const _measurer: TextMeasurer = resolveTextMeasurer();

export function getTextMeasurer(): TextMeasurer {
  return _measurer;
}
