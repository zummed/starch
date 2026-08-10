// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import '../element';

const VALID_DSL = `
server: rect 140x46 fill steelblue at 200,100
  serverLabel: text "Server" size=14
`;

const OTHER_VALID_DSL = 'a: rect 10x10 fill coral at 0,0';

// Duplicate node ids fail tree validation inside parseScene.
const INVALID_DSL = 'a: rect 10x10\na: rect 10x10';

function nextFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

/** A stand-in for the popup window returned by window.open(). */
function fakePopup(): Window {
  return {} as unknown as Window;
}

function postFromPopup(source: Window, data: unknown) {
  window.dispatchEvent(new MessageEvent('message', { data, source }));
}

describe('<starch-diagram editable>', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('shows the edit button in the shadow root when editable is present', async () => {
    const el = document.createElement('starch-diagram');
    el.setAttribute('editable', '');
    document.body.appendChild(el);
    await nextFrame();
    await nextFrame();

    const editBtn = el.shadowRoot?.querySelector('.starch-btn[title="Edit"]');
    expect(editBtn).toBeTruthy();
  });

  it('does not show the edit button when editable is absent', async () => {
    const el = document.createElement('starch-diagram');
    document.body.appendChild(el);
    await nextFrame();
    await nextFrame();

    const editBtn = el.shadowRoot?.querySelector('.starch-btn[title="Edit"]');
    expect(editBtn).toBeFalsy();
  });

  it('toggles the edit button at runtime', async () => {
    const el = document.createElement('starch-diagram');
    document.body.appendChild(el);
    await nextFrame();
    await nextFrame();

    expect(el.shadowRoot?.querySelector('.starch-btn[title="Edit"]')).toBeFalsy();

    el.setAttribute('editable', '');
    expect(el.shadowRoot?.querySelector('.starch-btn[title="Edit"]')).toBeTruthy();

    el.removeAttribute('editable');
    expect(el.shadowRoot?.querySelector('.starch-btn[title="Edit"]')).toBeFalsy();
  });

  it('applies a save message from the matching popup and dispatches starch:edit', async () => {
    const el = document.createElement('starch-diagram');
    el.setAttribute('editable', '');
    el.dsl = VALID_DSL;
    document.body.appendChild(el);
    await nextFrame();
    await nextFrame();

    const popup = fakePopup();
    vi.spyOn(window, 'open').mockReturnValue(popup);

    const editListener = vi.fn();
    el.addEventListener('starch:edit', editListener);

    const editBtn = el.shadowRoot?.querySelector('.starch-btn[title="Edit"]') as HTMLElement;
    expect(editBtn).toBeTruthy();
    editBtn.click();

    expect(window.open).toHaveBeenCalledTimes(1);

    postFromPopup(popup, { source: 'starch-playground', type: 'save', dsl: OTHER_VALID_DSL });
    await nextFrame();
    await nextFrame();

    expect(el.dsl).toBe(OTHER_VALID_DSL);
    expect(el.shadowRoot?.querySelector('svg')).toBeTruthy();
    expect(editListener).toHaveBeenCalledTimes(1);
    expect((editListener.mock.calls[0][0] as CustomEvent).detail).toEqual({ dsl: OTHER_VALID_DSL });

    const overlay = el.shadowRoot?.querySelector('.starch-error') as HTMLElement | null;
    expect(overlay?.style.display).not.toBe('block');
  });

  it('saving invalid dsl shows the error overlay and does not dispatch starch:edit', async () => {
    const el = document.createElement('starch-diagram');
    el.setAttribute('editable', '');
    el.dsl = VALID_DSL;
    document.body.appendChild(el);
    await nextFrame();
    await nextFrame();

    const popup = fakePopup();
    vi.spyOn(window, 'open').mockReturnValue(popup);

    const editListener = vi.fn();
    el.addEventListener('starch:edit', editListener);

    const editBtn = el.shadowRoot?.querySelector('.starch-btn[title="Edit"]') as HTMLElement;
    editBtn.click();

    postFromPopup(popup, { source: 'starch-playground', type: 'save', dsl: INVALID_DSL });
    await nextFrame();

    expect(editListener).not.toHaveBeenCalled();
    const overlay = el.shadowRoot?.querySelector('.starch-error') as HTMLElement | null;
    expect(overlay?.style.display).toBe('block');
  });

  it('ignores a message whose source does not match the open popup', async () => {
    const el = document.createElement('starch-diagram');
    el.setAttribute('editable', '');
    el.dsl = VALID_DSL;
    document.body.appendChild(el);
    await nextFrame();
    await nextFrame();

    const popup = fakePopup();
    const stranger = fakePopup();
    vi.spyOn(window, 'open').mockReturnValue(popup);

    const editListener = vi.fn();
    el.addEventListener('starch:edit', editListener);

    const editBtn = el.shadowRoot?.querySelector('.starch-btn[title="Edit"]') as HTMLElement;
    editBtn.click();

    postFromPopup(stranger, { source: 'starch-playground', type: 'save', dsl: OTHER_VALID_DSL });
    await nextFrame();

    expect(editListener).not.toHaveBeenCalled();
    expect(el.dsl).toBe(VALID_DSL);
  });

  it('shows "Nothing to edit yet" when clicked with no dsl', async () => {
    const el = document.createElement('starch-diagram');
    el.setAttribute('editable', '');
    document.body.appendChild(el);
    await nextFrame();
    await nextFrame();

    const openSpy = vi.spyOn(window, 'open');

    const editBtn = el.shadowRoot?.querySelector('.starch-btn[title="Edit"]') as HTMLElement;
    editBtn.click();

    expect(openSpy).not.toHaveBeenCalled();
    const overlay = el.shadowRoot?.querySelector('.starch-error') as HTMLElement | null;
    expect(overlay?.style.display).toBe('block');
    expect(overlay?.textContent).toMatch(/nothing to edit/i);
  });

  it('falls back to a plain tab when the popup features are blocked', async () => {
    const el = document.createElement('starch-diagram');
    el.setAttribute('editable', '');
    el.dsl = VALID_DSL;
    document.body.appendChild(el);
    await nextFrame();
    await nextFrame();

    const popup = fakePopup();
    const openSpy = vi.spyOn(window, 'open')
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(popup);

    const editBtn = el.shadowRoot?.querySelector('.starch-btn[title="Edit"]') as HTMLElement;
    editBtn.click();

    expect(openSpy).toHaveBeenCalledTimes(2);

    const editListener = vi.fn();
    el.addEventListener('starch:edit', editListener);
    postFromPopup(popup, { source: 'starch-playground', type: 'save', dsl: OTHER_VALID_DSL });
    await nextFrame();

    expect(editListener).toHaveBeenCalledTimes(1);
  });

  it('shows the error overlay when window.open is fully blocked', async () => {
    const el = document.createElement('starch-diagram');
    el.setAttribute('editable', '');
    el.dsl = VALID_DSL;
    document.body.appendChild(el);
    await nextFrame();
    await nextFrame();

    vi.spyOn(window, 'open').mockReturnValue(null);

    const editBtn = el.shadowRoot?.querySelector('.starch-btn[title="Edit"]') as HTMLElement;
    editBtn.click();

    const overlay = el.shadowRoot?.querySelector('.starch-error') as HTMLElement | null;
    expect(overlay?.style.display).toBe('block');
  });

  it('clears the popup reference on cancel', async () => {
    const el = document.createElement('starch-diagram');
    el.setAttribute('editable', '');
    el.dsl = VALID_DSL;
    document.body.appendChild(el);
    await nextFrame();
    await nextFrame();

    const popup = fakePopup();
    vi.spyOn(window, 'open').mockReturnValue(popup);

    const editBtn = el.shadowRoot?.querySelector('.starch-btn[title="Edit"]') as HTMLElement;
    editBtn.click();

    postFromPopup(popup, { source: 'starch-playground', type: 'cancel' });
    await nextFrame();

    const editListener = vi.fn();
    el.addEventListener('starch:edit', editListener);
    // A save from the now-forgotten popup must no longer be accepted.
    postFromPopup(popup, { source: 'starch-playground', type: 'save', dsl: OTHER_VALID_DSL });
    await nextFrame();

    expect(editListener).not.toHaveBeenCalled();
  });
});
