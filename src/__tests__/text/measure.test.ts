/**
 * These run against the fallback measurer — vitest has no Canvas API, so
 * `resolveTextMeasurer` picks it, exactly as a Node host does when it calls
 * `renderToSVG`. That is the path a markdown replacer or the README
 * generator takes, and it used to return every label as one line: `\n` was
 * never split, `maxWidth` was ignored outright, and height was always a
 * single line's worth. The renderer emits one tspan per line and box
 * templates size themselves from the line count, so both silently produced
 * text overflowing its own background — in headless renders only. The
 * browser, on the canvas measurer, laid the same document out correctly.
 *
 * Widths here are an estimate by design (0.6em per character); it is the
 * line *structure* these pin down.
 */
import { describe, it, expect } from 'vitest';
import { getTextMeasurer } from '../../text/measure';

const measurer = getTextMeasurer();
const texts = (content: string, opts?: Parameters<typeof measurer.measure>[1]) =>
  measurer.measure(content, opts).lines.map(line => line.text);

describe('text measurement', () => {
  it('splits on explicit newlines', () => {
    expect(texts('Line one\nLine two\nLine three')).toEqual(['Line one', 'Line two', 'Line three']);
  });

  it('reports height per line, not per string', () => {
    const one = measurer.measure('one', { size: 10, lineHeight: 20 });
    const three = measurer.measure('one\ntwo\nthree', { size: 10, lineHeight: 20 });
    expect(one.height).toBe(20);
    expect(three.height).toBe(60);
  });

  it('takes width from the widest line', () => {
    const measured = measurer.measure('a\nlonger line', { size: 10 });
    expect(measured.width).toBe('longer line'.length * 6);
  });

  it('wraps on whitespace at maxWidth', () => {
    // 10px text → 6px per char, so 60px holds ten characters.
    expect(texts('aaa bbb ccc ddd', { size: 10, maxWidth: 60 })).toEqual(['aaa bbb', 'ccc ddd']);
  });

  it('keeps an over-long word whole rather than splitting mid-word', () => {
    expect(texts('supercalifragilistic', { size: 10, maxWidth: 30 })).toEqual(['supercalifragilistic']);
  });

  it('wraps within each hard line independently', () => {
    expect(texts('aaa bbb ccc\nddd eee fff', { size: 10, maxWidth: 60 }))
      .toEqual(['aaa bbb', 'ccc', 'ddd eee', 'fff']);
  });

  it('leaves a short single line alone', () => {
    const measured = measurer.measure('Client', { size: 14 });
    expect(measured.lines).toHaveLength(1);
    expect(measured.lines[0].text).toBe('Client');
    expect(measured.lines[0].width).toBeCloseTo(50.4);
  });

  it('treats an empty string as one empty line', () => {
    expect(measurer.measure('', { size: 10 })).toEqual({
      width: 0,
      height: 14,
      lines: [{ text: '', width: 0 }],
    });
  });
});
