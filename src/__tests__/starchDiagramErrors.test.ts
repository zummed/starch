// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { StarchDiagram } from '../StarchDiagram';

const VALID_DSL = `
server: rect 140x46 fill steelblue at 200,100
  serverLabel: text "Server" size=14
`;

const VALID_DSL_2 = `
client: rect 140x46 fill dodgerblue at 200,250
  clientLabel: text "Client" size=14
`;

// Duplicate node ids fail tree validation inside parseScene.
const INVALID_DSL = 'a: rect 10x10\na: rect 10x10';

describe('StarchDiagram error handling', () => {
  it('setDSL returns ok:true and clears .error on valid DSL', () => {
    const container = document.createElement('div');
    const diagram = new StarchDiagram(container);

    const result = diagram.setDSL(VALID_DSL);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.isArray(result.warnings)).toBe(true);
    }
    expect(diagram.error).toBeNull();
  });

  it('setDSL returns ok:false, sets .error, emits an error event, and preserves the previously rendered SVG on garbage DSL', () => {
    const container = document.createElement('div');
    const diagram = new StarchDiagram(container);

    diagram.setDSL(VALID_DSL);
    const svgBefore = container.innerHTML;
    expect(svgBefore).toContain('<svg');

    const handler = vi.fn();
    diagram.on('error', handler);

    const result = diagram.setDSL(INVALID_DSL);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe('string');
    }
    expect(diagram.error).toEqual(expect.any(String));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].type).toBe('error');

    // Previous render is left untouched — no rebuild happens on parse error
    expect(container.innerHTML).toBe(svgBefore);
  });

  it('a following valid setDSL clears .error', () => {
    const container = document.createElement('div');
    const diagram = new StarchDiagram(container);

    diagram.setDSL(INVALID_DSL);
    expect(diagram.error).not.toBeNull();

    const result = diagram.setDSL(VALID_DSL_2);
    expect(result.ok).toBe(true);
    expect(diagram.error).toBeNull();
  });
});
