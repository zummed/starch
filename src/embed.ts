/**
 * Self-contained embed entry point.
 * Registers the <starch-diagram> custom element and exposes a global
 * `Starch` object for use in any webpage: `Starch.scan()`,
 * `Starch.render()`, `Starch.renderToSVG()`, `Starch.StarchDiagram`.
 *
 * Usage:
 *   <script src="starch-embed.iife.js"></script>
 *   <starch-diagram autoplay>
 *     hello: rect 140x46 radius=8 fill steelblue at 200,100
 *   </starch-diagram>
 *
 * Or scan the page for DSL code blocks and mount them automatically:
 *   <script>Starch.scan();</script>
 */
import './element';
export { StarchDiagramElement } from './element';
import { StarchDiagram } from './StarchDiagram';
import type { StarchDiagramOptions } from './StarchDiagram';
export { StarchDiagram };
export type { StarchDiagramOptions, StarchEvent, LoadResult } from './StarchDiagram';
export { renderToSVG } from './renderStatic';
export { buildEditUrl, PLAYGROUND_URL } from './editing';

export interface ScanOptions {
  /** Autoplay scanned diagrams. Default true. */
  autoplay?: boolean;
}

/**
 * Find DSL code blocks under `root` and replace each with a mounted
 * `<starch-diagram>` element. Matches `div.starch`, `div.language-starch`,
 * `pre > code.language-starch`, and `code.language-starch` — a `<code>`
 * inside a `<pre>` replaces the whole `<pre>`. Blocks whose text is empty
 * are skipped. Returns the number of diagrams created.
 */
export function scan(root: ParentNode = document, options: ScanOptions = {}): number {
  const selector = 'div.starch, div.language-starch, pre > code.language-starch, code.language-starch';
  const matches = new Set(root.querySelectorAll<HTMLElement>(selector));

  let count = 0;
  for (const el of matches) {
    const dsl = el.textContent?.trim() || '';
    if (!dsl) continue;

    const target = el.tagName === 'CODE' && el.parentElement?.tagName === 'PRE'
      ? el.parentElement
      : el;

    const diagram = document.createElement('starch-diagram');
    diagram.textContent = dsl;
    if (options.autoplay !== false) {
      diagram.setAttribute('autoplay', '');
    }

    target.replaceWith(diagram);
    count++;
  }

  return count;
}

/** Sugar for `new StarchDiagram(container, { ...options, dsl })`. */
export function render(container: HTMLElement, dsl: string, options?: Omit<StarchDiagramOptions, 'dsl'>): StarchDiagram {
  return new StarchDiagram(container, { ...options, dsl });
}
