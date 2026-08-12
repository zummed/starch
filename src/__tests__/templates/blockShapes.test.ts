// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { parseScene } from '../../parser/parser';
import { renderToSVG } from '../../renderStatic';

/**
 * The shapes whose content is a list could not be written from the DSL until
 * recently, so their geometry had never actually been rendered from a
 * document. Both of these were wrong the first time anyone looked at one.
 */

describe('table geometry', () => {
  const scene = parseScene([
    'objects',
    '  t: table cols=["Shape", "Content"] colWidth=110',
    '    "textblock" "lines"',
    '    "table" "rows"',
  ].join('\n'));
  const table = scene.nodes.find(n => n.id === 't')!;
  const child = (id: string) => table.children.find(c => c.id === id)!;

  it('lays the grid out from the corner of its background, not the centre', () => {
    // A child's transform is measured from its parent's centre, so laying the
    // grid out from 0,0 put the corner of the header on the middle of the
    // background: every cell sat half a table down and to the right.
    const bg = child('t.bg');
    const w = bg.rect!.w!, h = bg.rect!.h!;
    expect({ w, h }).toEqual({ w: 220, h: 90 });

    // The header band spans the full width across the top of the background.
    const header = child('t.header');
    expect(header.rect!.w).toBe(w);
    expect(header.transform!.y).toBe(-h / 2 + header.rect!.h! / 2);

    // Column centres sit inside the background, symmetrical about the middle.
    const headings = [child('t.h0'), child('t.h1')].map(n => n.transform!.x!);
    expect(headings).toEqual([-55, 55]);
    for (const x of headings) expect(Math.abs(x)).toBeLessThan(w / 2);
  });

  it('puts every cell within the background it is drawn on', () => {
    const bg = child('t.bg');
    const halfW = bg.rect!.w! / 2, halfH = bg.rect!.h! / 2;
    for (const cell of table.children.filter(c => /\.(h\d+|r\d+c\d+)$/.test(c.id))) {
      expect(Math.abs(cell.transform!.x!), cell.id).toBeLessThan(halfW);
      expect(Math.abs(cell.transform!.y!), cell.id).toBeLessThan(halfH);
    }
  });

  it('keeps a row aligned with its heading', () => {
    expect(child('t.r0c0').transform!.x).toBe(child('t.h0').transform!.x);
    expect(child('t.r1c1').transform!.x).toBe(child('t.h1').transform!.x);
  });
});

describe('codeblock rendering', () => {
  it('renders leading indentation instead of collapsing it', () => {
    // SVG collapses leading whitespace unless asked not to, so a codeblock —
    // which is mostly indentation — came out flush left however it was written.
    const svg = renderToSVG([
      'objects',
      '  c: codeblock size=12',
      '    "def render(scene):"',
      '    "    return draw(scene)"',
    ].join('\n'));
    const indented = svg.match(/<text[^>]*>\s*return draw\(scene\)<\/text>/)?.[0] ?? '';
    expect(indented).toContain('xml:space="preserve"');
    expect(indented).toMatch(/>    return draw\(scene\)</);
  });
});
