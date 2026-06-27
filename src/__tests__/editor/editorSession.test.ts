import { describe, it, expect } from 'vitest';
import { EditorSession } from '../../editor/editorSession';

/**
 * Behavioural tests for the headless editor simulator. These document what a
 * user experiences typing in the editor — driven through the real ProseMirror
 * state and the real completion/snippet plugins, with no browser.
 */

describe('EditorSession: typing', () => {
  it('types text and parses it into the model', () => {
    const s = new EditorSession();
    s.type('box: rect 140x80');
    expect(s.text).toBe('box: rect 140x80');
    expect(s.cursor).toBe(16);
    expect(s.model().objects[0]).toMatchObject({ id: 'box', rect: { w: 140, h: 80 } });
  });

  it('types over a multi-line document', () => {
    const s = new EditorSession();
    s.type('a: rect 10x10\nb: rect 20x20');
    expect(s.model().objects.map((o: any) => o.id)).toEqual(['a', 'b']);
  });

  it('backspaces characters', () => {
    const s = new EditorSession('box: rect 140x80');
    s.moveToEnd().backspace(2);
    expect(s.text).toBe('box: rect 140x');
  });
});

describe('EditorSession: completion menu', () => {
  it('offers top-level keywords on an empty document', () => {
    const s = new EditorSession();
    expect(s.availableLabels()).toEqual(expect.arrayContaining(['name', 'animate', 'style']));
  });

  it('offers geometry keywords after "id:"', () => {
    const s = new EditorSession('box: ');
    expect(s.availableLabels()).toEqual(
      expect.arrayContaining(['rect', 'ellipse', 'text', 'path', 'image']),
    );
  });

  it('filters the open menu by the typed prefix', () => {
    const s = new EditorSession();
    s.type('box: re').triggerCompletion();
    expect(s.completionLabels()).toEqual(['rect']);
  });

  it('offers colors after fill', () => {
    const s = new EditorSession('box: rect 10x10 fill ');
    expect(s.availableLabels()).toEqual(expect.arrayContaining(['steelblue', 'hsl', 'rgb']));
  });

  it('offers node + rect properties after a WxH size (trailing space)', () => {
    // Regression: a completed `rect 100x100 ` (WxH lexes as one identifier)
    // must still offer node-scope props and the rect-scope `radius`, not
    // re-offer geometry keywords or fall over.
    const s = new EditorSession('foo: rect 100x100 ');
    expect(s.availableLabels()).toEqual(
      expect.arrayContaining(['radius', 'fill', 'stroke', 'at']),
    );
    expect(s.availableLabels()).not.toContain('rect');
  });

  it('filters node props after a WxH size by typed prefix', () => {
    const s = new EditorSession('foo: rect 100x100 fi');
    expect(s.availableLabels()).toEqual(['fill']);
  });
});

describe('EditorSession: accepting completions + snippets', () => {
  it('accepts a snippet and fills placeholders via Tab', () => {
    const s = new EditorSession();
    s.type('box: re').triggerCompletion().accept('rect');
    expect(s.text).toBe('box: rect wxh');
    expect(s.snippetActive()).toBe(true);
    // First placeholder (W) is selected — typing replaces it.
    s.type('140').tab().type('80').tab();
    expect(s.text).toBe('box: rect 140x80 ');
    expect(s.model().objects[0]).toMatchObject({ rect: { w: 140, h: 80 } });
  });

  it('accepts a plain keyword completion', () => {
    const s = new EditorSession();
    s.type('na').triggerCompletion().accept('name');
    expect(s.text.startsWith('name')).toBe(true);
  });
});

describe('EditorSession: click-to-edit', () => {
  it('edits a number value in place', () => {
    const s = new EditorSession('box: rect 10x10 radius=4');
    s.clickEdit(s.text.lastIndexOf('4'), 9);
    expect(s.model().objects[0].rect.radius).toBe(9);
  });

  it('edits a color value, keeping the keyword', () => {
    const s = new EditorSession('box: rect 10x10 fill red');
    s.clickEdit(s.text.lastIndexOf('red'), 'steelblue');
    expect(s.text).toBe('box: rect 10x10 fill steelblue');
  });

  it('edits a compound field via the rebuild path (not String())', () => {
    const s = new EditorSession('box: rect 140x80');
    s.clickEditField(s.text.indexOf('rect'), 'w', 10);
    expect(s.model().objects[0].rect).toEqual({ w: 10, h: 80 });
  });

  it('refuses clickEdit on a compound target (would corrupt)', () => {
    const s = new EditorSession('box: rect 140x80');
    expect(() => s.clickEdit(s.text.indexOf('rect'), 5)).toThrow();
  });
});

describe('EditorSession: key fidelity', () => {
  it('Tab accepts the selected completion when the menu is open', () => {
    const s = new EditorSession('na');
    s.triggerCompletion().tab();
    expect(s.text.startsWith('name')).toBe(true);
  });

  it('Tab advances snippet placeholders when a snippet is active', () => {
    const s = new EditorSession();
    s.type('box: re').triggerCompletion().accept('rect');
    expect(s.snippetActive()).toBe(true);
    s.type('140').tab().type('80');
    expect(s.text).toBe('box: rect 140x80');
  });

  it('Backspace deletes a non-empty selection', () => {
    const s = new EditorSession('box: rect 140x80');
    const i = s.text.indexOf('140');
    s.select(i, i + 3).backspace();
    expect(s.text).toBe('box: rect x80');
  });

  it('Escape exits an active snippet', () => {
    const s = new EditorSession();
    s.type('box: re').triggerCompletion().accept('rect');
    s.escape();
    expect(s.snippetActive()).toBe(false);
  });
});
