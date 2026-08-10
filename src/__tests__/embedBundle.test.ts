// @vitest-environment happy-dom
/**
 * Smoke test for the built embed bundle (dist/starch-embed.iife.js).
 *
 * Runs against the artifact, not the source: it exists to catch build-level
 * regressions the source tests can't see — e.g. the custom element being
 * tree-shaken out of the IIFE (sideEffects misconfiguration). Skipped when
 * the bundle hasn't been built; CI builds before testing so it always runs
 * there.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const BUNDLE = 'dist/starch-embed.iife.js';
const DSL = 'a: rect 100x40 fill steelblue at 100,100\nb: rect 100x40 fill coral at 100,200';

describe.skipIf(!existsSync(BUNDLE))('embed bundle', () => {
  it('exposes the Starch global and scan() upgrades code blocks to rendered diagrams', async () => {
    const code = readFileSync(BUNDLE, 'utf8');
    const Starch = new Function(`${code}; return Starch;`)();

    expect(typeof Starch.scan).toBe('function');
    expect(typeof Starch.render).toBe('function');
    expect(typeof Starch.renderToSVG).toBe('function');
    expect(typeof Starch.StarchDiagram).toBe('function');
    expect(typeof Starch.StarchDiagramElement).toBe('function');

    document.body.innerHTML = `<pre><code class="language-starch">${DSL}</code></pre>`;
    const count = Starch.scan(document);
    expect(count).toBe(1);

    const el = document.querySelector('starch-diagram')!;
    expect(el).toBeInstanceOf(Starch.StarchDiagramElement);
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => requestAnimationFrame(r));
    expect(el.shadowRoot!.querySelector('svg')).not.toBeNull();

    expect(Starch.renderToSVG(DSL)).toContain('<svg');
  });
});
