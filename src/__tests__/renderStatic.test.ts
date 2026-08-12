// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { renderToSVG } from '../renderStatic';

const VALID_DSL = `
server: rect 140x46 fill steelblue at 200,100
  serverLabel: text "Server" size=14
client: rect 140x46 fill dodgerblue at 200,250
  clientLabel: text "Client" size=14
`;

describe('renderToSVG', () => {
  it('renders a valid DSL scene to an SVG string', () => {
    const svg = renderToSVG(VALID_DSL);
    expect(svg).toContain('<svg');
  });

  it('renders an arrow label halo as a solid core plus a blurred fade', () => {
    const svg = renderToSVG(`
a: rect 60x30 at 100,100
b: rect 60x30 at 300,100
r: arrow from=a to=b label="request"
`);
    const labelText = svg.match(/<text[^>]*>request<\/text>/)?.[0] ?? '';
    // Solid core, behind the fill and round-joined.
    expect(labelText).toMatch(/stroke-width="2"/);
    expect(labelText).toContain('paint-order="stroke"');
    expect(labelText).toContain('stroke-linejoin="round"');
    // Fade — stacked so the alpha builds up near the glyphs.
    expect(labelText.match(/drop-shadow\(0 0 3px /g)).toHaveLength(2);
  });

  it('leaves un-haloed text with no backing attributes', () => {
    const svg = renderToSVG('t: text "plain" size=14 at 100,100');
    const plain = svg.match(/<text[^>]*>plain<\/text>/)?.[0] ?? '';
    expect(plain).not.toContain('stroke');
    expect(plain).not.toContain('paint-order');
    expect(plain).not.toContain('filter');
  });

  it('throws on invalid DSL', () => {
    // Duplicate node ids fail tree validation inside parseScene.
    const INVALID_DSL = 'a: rect 10x10\na: rect 10x10';
    expect(() => renderToSVG(INVALID_DSL)).toThrow();
  });
});
