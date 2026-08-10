// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import '../element';

const VALID_DSL = `
server: rect 140x46 fill steelblue at 200,100
  serverLabel: text "Server" size=14
`;

// Duplicate node ids fail tree validation inside parseScene.
const INVALID_DSL = 'a: rect 10x10\na: rect 10x10';

function nextFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

describe('<starch-diagram>', () => {
  it('renders an svg into the shadow root once dsl is set', async () => {
    const el = document.createElement('starch-diagram');
    document.body.appendChild(el);

    el.dsl = VALID_DSL;

    await nextFrame();
    await nextFrame();

    const svg = el.shadowRoot?.querySelector('svg');
    expect(svg).toBeTruthy();

    document.body.removeChild(el);
  });

  it('shows the error overlay on invalid dsl', async () => {
    const el = document.createElement('starch-diagram');
    document.body.appendChild(el);

    el.dsl = VALID_DSL;
    await nextFrame();
    await nextFrame();

    el.dsl = INVALID_DSL;
    await nextFrame();

    const overlay = el.shadowRoot?.querySelector('.starch-error') as HTMLElement | null;
    expect(overlay).toBeTruthy();
    expect(overlay?.style.display).toBe('block');
    expect(overlay?.textContent).toMatch(/duplicate/i);

    document.body.removeChild(el);
  });
});
