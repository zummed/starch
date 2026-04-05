import { describe, it, expect } from 'vitest';
import { animateHeaderCompletions, animateKeyframeStartCompletions, extractPartialPath } from '../../dsl/animateCompletions';

function labels(items: { label: string }[]): string[] {
  return items.map(i => i.label);
}

describe('animateHeaderCompletions', () => {
  it('returns flags and kwarg snippets when cursor is after duration', () => {
    // Simulating cursor after "animate 10s "
    const items = animateHeaderCompletions('animate 10s ');
    const l = labels(items);
    expect(l).toContain('loop');
    expect(l).toContain('autoKey');
    expect(l).toContain('easing=');
  });

  it('kwarg snippet includes value placeholder', () => {
    const items = animateHeaderCompletions('animate 10s ');
    const easing = items.find(i => i.label === 'easing=');
    expect(easing!.snippetTemplate).toBeDefined();
    expect(easing!.snippetTemplate).toContain('${1}');
  });

  it('omits flags already present in the header', () => {
    const items = animateHeaderCompletions('animate 10s loop ');
    const l = labels(items);
    expect(l).not.toContain('loop');
    expect(l).toContain('autoKey');
    expect(l).toContain('easing=');
  });

  it('returns easing enum values when cursor is after "easing="', () => {
    const items = animateHeaderCompletions('animate 10s easing=');
    const l = labels(items);
    expect(l).toContain('linear');
    expect(l).toContain('easeIn');
    expect(l).toContain('easeOut');
    // Must NOT include flags/kwargs at this position
    expect(l).not.toContain('loop');
    expect(l).not.toContain('easing=');
  });

  it('returns easing enum values mid-typing after "easing="', () => {
    const items = animateHeaderCompletions('animate 10s easing=ea');
    const l = labels(items);
    // Handler returns full list; caller filters by prefix.
    expect(l).toContain('easeIn');
    expect(l).toContain('linear');
  });
});

describe('animateKeyframeStartCompletions', () => {
  it('returns timestamp snippet and chapter keyword', () => {
    const items = animateKeyframeStartCompletions();
    const l = labels(items);
    expect(l.some(lbl => /^\d/.test(lbl) || lbl.includes('time') || lbl.includes('seconds'))).toBe(true);
    expect(l).toContain('chapter');
  });

  it('timestamp item has a snippet template', () => {
    const items = animateKeyframeStartCompletions();
    const ts = items.find(i => i.detail === 'Keyframe timestamp');
    expect(ts).toBeDefined();
    expect(ts!.snippetTemplate).toBeDefined();
  });
});

describe('extractPartialPath', () => {
  it('returns empty string when no identifier characters before cursor', () => {
    expect(extractPartialPath('    ')).toBe('');
    expect(extractPartialPath('')).toBe('');
    expect(extractPartialPath('  1 ')).toBe('');
  });

  it('returns single segment', () => {
    expect(extractPartialPath('    card')).toBe('card');
    expect(extractPartialPath('  1 ca')).toBe('ca');
  });

  it('returns dotted path', () => {
    expect(extractPartialPath('  1 card.bg')).toBe('card.bg');
    expect(extractPartialPath('  1 card.bg.f')).toBe('card.bg.f');
    expect(extractPartialPath('  1 card.bg.stroke.')).toBe('card.bg.stroke.');
  });

  it('stops at whitespace', () => {
    expect(extractPartialPath('  1 card.bg.fill ')).toBe('');
    expect(extractPartialPath('  a.b c.d')).toBe('c.d');
  });

  it('stops at colon (path terminator)', () => {
    expect(extractPartialPath('  1 card.bg.fill: ')).toBe('');
    // Cursor right after colon (no trailing space):
    expect(extractPartialPath('  1 card.bg.fill:')).toBe('');
  });
});
