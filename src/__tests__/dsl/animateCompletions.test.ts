import { describe, it, expect } from 'vitest';
import { animateHeaderCompletions, animateKeyframeStartCompletions, extractPartialPath, collectAnimatedPaths } from '../../dsl/animateCompletions';
import { animatePathCompletions } from '../../dsl/animateCompletions';

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

const pathScene = {
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
        { id: 'title', text: { content: 'hi', size: 14 } },
      ],
    },
    { id: 'solo', rect: { w: 20, h: 20 } },
  ],
  animate: {
    duration: 5,
    keyframes: [{ time: 1, changes: { 'card.bg.fill': 'green' } }],
  },
};

describe('animatePathCompletions', () => {
  it('at empty prefix, returns all scene node ids', () => {
    const items = animatePathCompletions('', pathScene, pathScene.animate);
    const l = labels(items);
    expect(l).toContain('card');
    expect(l).toContain('solo');
  });

  it('at empty prefix, marks node with animated descendant as tier 1', () => {
    const items = animatePathCompletions('', pathScene, pathScene.animate);
    const card = items.find(i => i.label === 'card');
    expect(card!.detail).toBe('animated');
  });

  it('after "card.", returns children and node properties', () => {
    const items = animatePathCompletions('card.', pathScene, pathScene.animate);
    const l = labels(items);
    expect(l).toContain('bg');
    expect(l).toContain('title');
    expect(l).toContain('fill'); // card's own property (unset)
    expect(l).toContain('opacity');
  });

  it('after "card.bg.", fill is animated, stroke is set', () => {
    const items = animatePathCompletions('card.bg.', pathScene, pathScene.animate);
    const fill = items.find(i => i.label === 'fill');
    const stroke = items.find(i => i.label === 'stroke');
    const opacity = items.find(i => i.label === 'opacity');
    expect(fill!.detail).toBe('animated');
    expect(stroke!.detail).toBe('set');
    expect(opacity!.detail).toBe('available');
  });

  it('tier 1 items come before tier 2, before tier 3', () => {
    const items = animatePathCompletions('card.bg.', pathScene, pathScene.animate);
    const fillIdx = items.findIndex(i => i.label === 'fill');
    const strokeIdx = items.findIndex(i => i.label === 'stroke');
    const opacityIdx = items.findIndex(i => i.label === 'opacity');
    expect(fillIdx).toBeLessThan(strokeIdx);
    expect(strokeIdx).toBeLessThan(opacityIdx);
  });

  it('unknown root falls back to all nodes + info item', () => {
    const items = animatePathCompletions('typo.', pathScene, pathScene.animate);
    const l = labels(items);
    expect(l).toContain('card');
    expect(l).toContain('solo');
    // Info item signals no match
    const info = items.find(i => i.type === 'info');
    expect(info).toBeDefined();
    expect(info!.label).toContain('typo');
  });

  it('after a leaf segment returns empty', () => {
    // card.bg.fill is a leaf — drilling further is invalid
    const items = animatePathCompletions('card.bg.fill.', pathScene, pathScene.animate);
    expect(items).toEqual([]);
  });
});
