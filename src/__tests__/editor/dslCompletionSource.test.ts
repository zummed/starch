import { describe, it, expect } from 'vitest';
import { getDslCompletions } from '../../editor/dslCompletionSource';

/** Helper: find | in text, remove it, call getDslCompletions */
function completions(text: string) {
  const offset = text.indexOf('|');
  if (offset === -1) throw new Error('Test text must contain | as cursor marker');
  const cleaned = text.replace('|', '');
  return getDslCompletions(cleaned, offset);
}

/** Get just the labels from completions */
function labels(text: string): string[] {
  return completions(text).map(c => c.label);
}

describe('getDslCompletions', () => {
  // ─── Top-level completions ─────────────────────────────────

  it('suggests top-level keywords at empty document', () => {
    const items = labels('|');
    expect(items).toContain('name');
    expect(items).toContain('style');
    expect(items).toContain('animate');
    expect(items).toContain('viewport');
  });

  it('filters top-level keywords by prefix', () => {
    const items = labels('an|');
    expect(items).toContain('animate');
    expect(items).not.toContain('name');
    expect(items).not.toContain('style');
  });

  // ─── After id: geometry completions ────────────────────────

  it('suggests geometry types after id:', () => {
    const items = labels('box: |');
    expect(items).toContain('rect');
    expect(items).toContain('ellipse');
    expect(items).toContain('text');
    expect(items).toContain('camera');
  });

  it('suggests geometry types with prefix filter', () => {
    const items = labels('box: re|');
    expect(items).toContain('rect');
    expect(items).not.toContain('ellipse');
  });

  // ─── Fill/stroke color completions ─────────────────────────

  it('suggests color names after fill keyword', () => {
    const items = labels('box: rect 100x100 fill |');
    expect(items).toContain('red');
    expect(items).toContain('blue');
    expect(items).toContain('white');
  });

  it('filters colors by prefix', () => {
    const items = labels('box: rect 100x100 fill re|');
    expect(items).toContain('red');
    expect(items).not.toContain('blue');
  });

  it('suggests color names after stroke keyword', () => {
    const items = labels('box: rect 100x100 stroke |');
    expect(items).toContain('red');
    expect(items).toContain('green');
  });

  // ─── Style reference completions (@) ───────────────────────

  it('suggests style names after @', () => {
    const text = 'style primary\n  fill red\n\nbox: rect 100x100 @|';
    const items = labels(text);
    expect(items).toContain('primary');
  });

  it('filters style names by prefix', () => {
    const text = 'style primary\n  fill red\nstyle secondary\n  fill blue\n\nbox: rect 100x100 @pr|';
    const items = labels(text);
    expect(items).toContain('primary');
    expect(items).not.toContain('secondary');
  });

  // ─── Easing completions ────────────────────────────────────

  it('suggests easing names after easing=', () => {
    const items = labels('box: rect 100x100 easing=|');
    expect(items).toContain('linear');
    expect(items).toContain('easeIn');
    expect(items).toContain('easeOut');
    expect(items).toContain('bounce');
  });

  it('filters easings by prefix', () => {
    const items = labels('box: rect 100x100 easing=ease|');
    expect(items).toContain('easeIn');
    expect(items).toContain('easeOut');
    expect(items).not.toContain('linear');
    expect(items).not.toContain('bounce');
  });

  // ─── Connection target completions (after ->) ──────────────

  it('suggests node IDs after ->', () => {
    const text = 'a: rect 100x100\nb: rect 100x100\nconn: a -> |';
    const items = labels(text);
    expect(items).toContain('a');
    expect(items).toContain('b');
    expect(items).toContain('conn');
  });

  // ─── Dash pattern completions ──────────────────────────────

  it('suggests dash patterns after dash=', () => {
    const items = labels('box: rect 100x100 dash=|');
    expect(items).toContain('dashed');
    expect(items).toContain('dotted');
    expect(items).toContain('solid');
  });

  it('suggests dash patterns after dash keyword', () => {
    const items = labels('box: rect 100x100\n  dash |');
    expect(items).toContain('dashed');
    expect(items).toContain('dotted');
  });

  // ─── Look completions ─────────────────────────────────────

  it('suggests "all" and node IDs after look=', () => {
    const text = 'box: rect 100x100\ncam: camera look=|';
    const items = labels(text);
    expect(items).toContain('all');
    expect(items).toContain('box');
  });

  // ─── Animate block completions ─────────────────────────────

  it('suggests animate block keywords', () => {
    const items = labels('animate 3s\n  |');
    expect(items).toContain('loop');
    expect(items).toContain('easing=');
    expect(items).toContain('chapter');
  });

  it('includes node IDs in animate block', () => {
    const text = 'box: rect 100x100\nanimate 3s\n  |';
    const items = labels(text);
    expect(items).toContain('box');
  });

  // ─── Style block completions ───────────────────────────────

  it('suggests style properties in style block', () => {
    const items = labels('style primary\n  |');
    expect(items).toContain('fill');
    expect(items).toContain('stroke');
    expect(items).toContain('dash');
  });

  // ─── Node property completions ─────────────────────────────

  it('suggests node properties after geometry', () => {
    const items = labels('box: rect 100x100 |');
    expect(items).toContain('fill');
    expect(items).toContain('stroke');
    expect(items).toContain('at');
    expect(items).toContain('opacity=');
  });
});
