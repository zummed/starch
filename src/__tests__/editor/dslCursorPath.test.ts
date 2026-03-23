import { describe, it, expect } from 'vitest';
import { getDslCursorContext, stripModelPrefix } from '../../editor/dslCursorPath';

/** Helper: find the | in text, remove it, and call getDslCursorContext at that position */
function ctx(text: string) {
  const offset = text.indexOf('|');
  if (offset === -1) throw new Error('Test text must contain | as cursor marker');
  const cleaned = text.replace('|', '');
  return getDslCursorContext(cleaned, offset);
}

describe('getDslCursorContext', () => {
  // ─── Top-level context ─────────────────────────────────────────

  it('returns property name context at top level', () => {
    const result = ctx('|');
    expect(result.isPropertyName).toBe(true);
    expect(result.path).toBe('');
  });

  it('returns property name context for partial keyword at top level', () => {
    const result = ctx('back|');
    expect(result.isPropertyName).toBe(true);
    expect(result.prefix).toBe('back');
  });

  // ─── Node context ─────────────────────────────────────────────

  it('detects node context after id:', () => {
    const result = ctx('box: rect 160x100 |');
    expect(result.path).toContain('objects');
    expect(result.path).toContain('0');
  });

  it('detects fill property context on a node', () => {
    const result = ctx('box: rect 160x100 fill |');
    expect(result.path).toContain('fill');
    expect(result.currentKey).toBe('fill');
  });

  it('detects stroke property context on a node', () => {
    const result = ctx('box: rect 160x100 stroke |');
    expect(result.path).toContain('stroke');
    expect(result.currentKey).toBe('stroke');
  });

  it('detects at (transform) context', () => {
    const result = ctx('box: rect 160x100 at |');
    expect(result.path).toContain('transform');
  });

  it('detects value context after key=', () => {
    const result = ctx('box: rect 160x100 radius=|');
    expect(result.path).toContain('rect');
    expect(result.path).toContain('radius');
    expect(result.currentKey).toBe('radius');
  });

  it('detects transform property after key=', () => {
    const result = ctx('box: rect 160x100 rotation=|');
    expect(result.path).toContain('transform');
    expect(result.path).toContain('rotation');
    expect(result.currentKey).toBe('rotation');
  });

  it('detects opacity as a node-level property', () => {
    const result = ctx('box: rect 160x100 opacity=|');
    expect(result.path).toContain('opacity');
    expect(result.currentKey).toBe('opacity');
  });

  it('detects style reference with @', () => {
    const result = ctx('box: rect 160x100 @|');
    expect(result.path).toContain('style');
    expect(result.currentKey).toBe('style');
  });

  it('detects connection context with ->', () => {
    const result = ctx('conn: a -> |');
    expect(result.path).toContain('path');
    expect(result.path).toContain('route');
  });

  // ─── Style block context ─────────────────────────────────────

  it('detects style block context', () => {
    const result = ctx('style primary\n  fill |');
    expect(result.path).toContain('styles');
    expect(result.path).toContain('fill');
  });

  it('detects property name position in style block', () => {
    const result = ctx('style primary\n  |');
    expect(result.path).toContain('styles');
    expect(result.isPropertyName).toBe(true);
  });

  // ─── Animate block context ───────────────────────────────────

  it('detects animate block context', () => {
    const result = ctx('animate 3s\n  |');
    expect(result.path).toContain('animate');
  });

  it('detects easing= in animate block', () => {
    const result = ctx('animate 3s\n  0 box.fill.h: 180 easing=|');
    expect(result.path).toContain('animate');
    expect(result.currentKey).toBe('easing');
  });

  // ─── Text geometry properties ─────────────────────────────────

  it('detects text property size=', () => {
    const result = ctx('label: text "Hello" size=|');
    expect(result.path).toContain('text');
    expect(result.path).toContain('size');
    expect(result.currentKey).toBe('size');
  });

  // ─── Camera properties ────────────────────────────────────────

  it('detects camera zoom= property', () => {
    const result = ctx('cam: camera zoom=|');
    expect(result.path).toContain('camera');
    expect(result.path).toContain('zoom');
    expect(result.currentKey).toBe('zoom');
  });

  // ─── Empty text ───────────────────────────────────────────────

  it('handles empty text (top-level keyword position)', () => {
    const result = getDslCursorContext('', 0);
    expect(result.path).toBe('');
    // In DSL, at top level you can type a keyword or node ID
    expect(result.isPropertyName).toBe(true);
  });

  // ─── Multiple nodes ───────────────────────────────────────────

  it('increments node index for second node', () => {
    const result = ctx('box1: rect 100x100\nbox2: rect 200x200 fill |');
    expect(result.path).toContain('objects');
    // The second node should have index 1
    expect(result.path).toContain('1');
    expect(result.path).toContain('fill');
  });

  // ─── Prefix extraction ────────────────────────────────────────

  it('extracts prefix for partial word', () => {
    const result = ctx('box: rect 160x100 rad|');
    expect(result.prefix).toBe('rad');
  });

  it('extracts prefix after = sign', () => {
    const result = ctx('box: rect 160x100 easing=eas|');
    expect(result.currentKey).toBe('easing');
    expect(result.prefix).toBe('eas');
  });
});

// ─── Boolean keyword context ────────────────────────────────────
describe('boolean keywords', () => {
  it('resolves bold on its own indented line', () => {
    const result = ctx('box: text "hi"\n  bol|d');
    expect(result.path).toContain('text');
    expect(result.path).toContain('bold');
    expect(result.isPropertyName).toBe(false);
  });

  it('resolves mono on its own indented line', () => {
    const result = ctx('box: text "hi"\n  mon|o');
    expect(result.path).toContain('text');
    expect(result.path).toContain('mono');
    expect(result.isPropertyName).toBe(false);
  });

  it('resolves smooth for path nodes', () => {
    const result = ctx('line: path (0,0) (100,100)\n  smoot|h');
    expect(result.path).toContain('path');
    expect(result.path).toContain('smooth');
    expect(result.isPropertyName).toBe(false);
  });

  it('resolves closed for path nodes', () => {
    const result = ctx('line: path (0,0) (100,100)\n  close|d');
    expect(result.path).toContain('path');
    expect(result.path).toContain('closed');
    expect(result.isPropertyName).toBe(false);
  });

  it('resolves inline bold keyword', () => {
    const result = ctx('box: text "hi" bol|d');
    expect(result.path).toContain('text');
    expect(result.path).toContain('bold');
    expect(result.isPropertyName).toBe(false);
  });
});

describe('stripModelPrefix', () => {
  it('strips objects.N prefix', () => {
    expect(stripModelPrefix('objects.0.rect.w')).toBe('rect.w');
    expect(stripModelPrefix('objects.3.fill.h')).toBe('fill.h');
  });

  it('strips styles.name prefix', () => {
    expect(stripModelPrefix('styles.primary.fill.s')).toBe('fill.s');
  });

  it('passes through paths without prefix', () => {
    expect(stripModelPrefix('animate.duration')).toBe('animate.duration');
  });
});
