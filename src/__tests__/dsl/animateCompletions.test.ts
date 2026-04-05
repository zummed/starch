import { describe, it, expect } from 'vitest';
import { animateHeaderCompletions } from '../../dsl/animateCompletions';

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
