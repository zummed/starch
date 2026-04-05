import { describe, it, expect } from 'vitest';
import { animateHeaderCompletions, animateKeyframeStartCompletions, extractPartialPath, collectAnimatedPaths } from '../../dsl/animateCompletions';

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

describe('collectAnimatedPaths', () => {
  it('returns empty set for empty animate block', () => {
    expect(collectAnimatedPaths(undefined)).toEqual(new Set());
    expect(collectAnimatedPaths({ duration: 5, keyframes: [] })).toEqual(new Set());
  });

  it('collects paths from a single keyframe', () => {
    const block = {
      duration: 5,
      keyframes: [
        { time: 1, changes: { 'card.bg.fill': 'blue' } },
      ],
    };
    expect(collectAnimatedPaths(block)).toEqual(new Set(['card.bg.fill']));
  });

  it('collects paths across multiple keyframes', () => {
    const block = {
      duration: 5,
      keyframes: [
        { time: 1, changes: { 'card.bg.fill': 'blue', 'card.opacity': 0.5 } },
        { time: 2, changes: { 'card.bg.fill': 'red' } },
      ],
    };
    expect(collectAnimatedPaths(block)).toEqual(
      new Set(['card.bg.fill', 'card.opacity']),
    );
  });
});

import { tierCandidate } from '../../dsl/animateCompletions';

const tierScene = {
  objects: [
    {
      id: 'card',
      children: [
        {
          id: 'bg',
          rect: { w: 100, h: 50 },
          fill: 'blue',
          stroke: { color: 'red', width: 2 },
        },
      ],
    },
  ],
};

describe('tierCandidate', () => {
  it('returns animated for candidate under an animated path', () => {
    const animated = new Set(['card.bg.fill']);
    const tier = tierCandidate('fill', 'card.bg', tierScene, animated);
    expect(tier).toBe('animated');
  });

  it('returns animated for drill target leading to animated path', () => {
    const animated = new Set(['card.bg.fill']);
    // Candidate "bg" at prefix "card" → extends to "card.bg" which is a
    // prefix of an animated path.
    expect(tierCandidate('bg', 'card', tierScene, animated)).toBe('animated');
  });

  it('returns set for candidate with explicit model value', () => {
    const animated = new Set<string>();
    // card.bg.fill is set on the model
    expect(tierCandidate('fill', 'card.bg', tierScene, animated)).toBe('set');
  });

  it('returns set for drill target with set descendants', () => {
    const animated = new Set<string>();
    // stroke has color and width set
    expect(tierCandidate('stroke', 'card.bg', tierScene, animated)).toBe('set');
  });

  it('returns available for unset schema-reachable properties', () => {
    const animated = new Set<string>();
    // opacity is schema-reachable on bg but not set
    expect(tierCandidate('opacity', 'card.bg', tierScene, animated)).toBe('available');
  });

  it('animated beats set', () => {
    const animated = new Set(['card.bg.fill']);
    // fill is both animated AND set; animated wins.
    expect(tierCandidate('fill', 'card.bg', tierScene, animated)).toBe('animated');
  });
});
