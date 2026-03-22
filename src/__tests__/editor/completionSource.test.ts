import { describe, it, expect } from 'vitest';
import { getCompletions } from '../../editor/completionSource';

describe('getCompletions', () => {
  it('suggests node properties at root object level', () => {
    const text = '{ objects: [{ id: "a", | }] }';
    const offset = text.indexOf('|');
    const items = getCompletions(text.replace('|', ''), offset);
    const labels = items.map(i => i.label);
    expect(labels).toContain('rect');
    expect(labels).toContain('fill');
    expect(labels).toContain('transform');
    expect(labels).toContain('opacity');
  });

  it('filters by prefix', () => {
    const text = '{ objects: [{ id: "a", re| }] }';
    const offset = text.indexOf('|');
    const items = getCompletions(text.replace('|', ''), offset);
    const labels = items.map(i => i.label);
    expect(labels).toContain('rect');
    expect(labels).not.toContain('fill');
  });

  it('suggests rect sub-properties', () => {
    const text = '{ objects: [{ id: "a", rect: { | } }] }';
    const offset = text.indexOf('|');
    const items = getCompletions(text.replace('|', ''), offset);
    const labels = items.map(i => i.label);
    expect(labels).toContain('w');
    expect(labels).toContain('h');
    expect(labels).toContain('radius');
  });

  it('suggests enum values for text.align', () => {
    const text = '{ objects: [{ id: "a", text: { content: "hi", size: 14, align: | } }] }';
    const offset = text.indexOf('|');
    const items = getCompletions(text.replace('|', ''), offset);
    const labels = items.map(i => i.label);
    expect(labels).toContain('start');
    expect(labels).toContain('middle');
    expect(labels).toContain('end');
  });

  it('suggests color presets for fill value', () => {
    const text = '{ objects: [{ id: "a", fill: | }] }';
    const offset = text.indexOf('|');
    const items = getCompletions(text.replace('|', ''), offset);
    const labels = items.map(i => i.label);
    expect(labels).toContain('red');
    expect(labels).toContain('blue');
  });

  it('suggests boolean values for visible', () => {
    const text = '{ objects: [{ id: "a", visible: | }] }';
    const offset = text.indexOf('|');
    const items = getCompletions(text.replace('|', ''), offset);
    const labels = items.map(i => i.label);
    expect(labels).toContain('true');
    expect(labels).toContain('false');
  });

  it('includes descriptions from schema', () => {
    const text = '{ objects: [{ id: "a", | }] }';
    const offset = text.indexOf('|');
    const items = getCompletions(text.replace('|', ''), offset);
    const rectItem = items.find(i => i.label === 'rect');
    expect(rectItem?.detail).toBeDefined();
  });

  it('returns empty for non-completable position', () => {
    const items = getCompletions('', 0);
    expect(items).toEqual([]);
  });
});
