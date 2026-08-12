import { describe, it, expect } from 'vitest';
import { arrowTemplate } from '../../templates/sets/core/arrow';
import { lineTemplate } from '../../templates/sets/core/line';
import { getTextMeasurer } from '../../text/measure';
import { measureTextNodes } from '../../text/measurePass';
import type { Node } from '../../types/node';

const measurer = getTextMeasurer();

function label(node: Node): Node {
  return node.children.find(c => c.id.endsWith('.label'))!;
}

function plates(node: Node): Node[] {
  return label(node).children.filter(c => c.rect);
}

function text(node: Node): Node {
  return label(node).children.find(c => c.text)!;
}

describe('path labels', () => {
  it('backs the label with a glyph halo by default', () => {
    const node = arrowTemplate('a', { from: 'x', to: 'y', label: 'calls' }, measurer);
    expect(plates(node)).toHaveLength(0);
    // Solid core plus a fade, rather than one wide hard outline.
    expect(text(node)._halo).toMatchObject({ width: 2, blur: 3 });
  });

  it('drops the backing entirely for labelBg=none', () => {
    const node = arrowTemplate('a', { from: 'x', to: 'y', label: 'calls', labelBg: 'none' }, measurer);
    expect(plates(node)).toHaveLength(0);
    expect(text(node)._halo).toBeUndefined();
  });

  it('fits a single plate to the measured text for labelBg=plate', () => {
    const node = arrowTemplate('a', { from: 'x', to: 'y', label: 'calls', labelBg: 'plate' }, measurer);
    const bg = plates(node);
    expect(bg).toHaveLength(1);
    expect(bg[0].id).toBe('a.label.bg');

    const measured = measurer.measure('calls', { size: 11 });
    expect(bg[0].rect!.w).toBe(Math.ceil(measured.width) + 12);
    expect(text(node)._halo).toBeUndefined();
  });

  it('gives each line of a wrapped label its own plate', () => {
    const node = arrowTemplate(
      'a',
      { from: 'x', to: 'y', label: 'first\nsecond line', labelBg: 'plate' },
      measurer,
    );
    const bg = plates(node);
    expect(bg.map(p => p.id)).toEqual(['a.label.bg.0', 'a.label.bg.1']);
    // Close-fitting: the short line gets a short plate, not one slab sized
    // to the longest line.
    expect(bg[0].rect!.w).toBeLessThan(bg[1].rect!.w);
    // Stacked in reading order, and centred on the label as a whole.
    expect(bg[0].transform!.y!).toBeLessThan(bg[1].transform!.y!);
    expect(bg[0].transform!.y! + bg[1].transform!.y!).toBeCloseTo(0);
  });

  it('wraps at labelMaxWidth without shrinking the text', () => {
    const node = arrowTemplate(
      'a',
      { from: 'x', to: 'y', label: 'a label long enough to wrap', labelSize: 11, labelMaxWidth: 60 },
      measurer,
    );
    measureTextNodes([node], measurer);

    const t = text(node);
    expect(t.text!.size).toBe(11);
    expect(t._measured!.lines.length).toBeGreaterThan(1);
    expect(t._measured!.width).toBeLessThanOrEqual(60);
  });

  it('keeps .label.text addressable whichever backing is used', () => {
    for (const labelBg of ['halo', 'plate', 'none']) {
      const node = arrowTemplate('a', { from: 'x', to: 'y', label: 'go', labelBg }, measurer);
      expect(label(node).id).toBe('a.label');
      expect(text(node).id).toBe('a.label.text');
    }
  });

  it('reports an unrecognised backing instead of dropping it', () => {
    expect(() =>
      arrowTemplate('a', { from: 'x', to: 'y', label: 'go', labelBg: 'oblong' }, measurer),
    ).toThrow(/Unknown label backing "oblong"/);
  });

  it('gives line labels the same treatment as arrow labels', () => {
    const node = lineTemplate('l', { from: 'x', to: 'y', label: 'calls' }, measurer);
    expect(text(node)._halo).toMatchObject({ width: 2, blur: 3 });
    expect(label(node).transform!.pathFollow).toBe('l.route');
  });
});
