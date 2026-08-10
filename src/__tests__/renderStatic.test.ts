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

  it('throws on invalid DSL', () => {
    // Duplicate node ids fail tree validation inside parseScene.
    const INVALID_DSL = 'a: rect 10x10\na: rect 10x10';
    expect(() => renderToSVG(INVALID_DSL)).toThrow();
  });
});
