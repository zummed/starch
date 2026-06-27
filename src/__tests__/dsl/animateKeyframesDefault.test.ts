/**
 * Regression: walker must always emit animate.keyframes as an array
 * so that the renderer's buildTimeline doesn't crash.
 */
import { describe, it, expect } from 'vitest';
import { walkDocument } from '../../dsl/schemaWalker';

describe('animate block always has keyframes array', () => {
  it('bare "animate" produces keyframes: []', () => {
    const { model } = walkDocument('animate');
    expect(model.animate?.keyframes).toEqual([]);
  });

  it('"animate 3" produces keyframes: []', () => {
    const { model } = walkDocument('animate 3');
    expect(model.animate?.keyframes).toEqual([]);
  });

  it('"animate 3 loop" produces keyframes: []', () => {
    const { model } = walkDocument('animate 3 loop');
    expect(model.animate?.keyframes).toEqual([]);
  });

  it('animate with actual keyframes preserves them', () => {
    const dsl = `animate 3
  1 box.opacity: 1`;
    const { model } = walkDocument(dsl);
    expect(model.animate?.keyframes).toHaveLength(1);
  });

  it('"animate s" does not assign a string to duration', () => {
    // Regression: after autocompleting `animate 3` and deleting the `3`,
    // the parser previously assigned the raw string "s" to duration, which
    // crashed V2Diagram's numeric timeline code.
    const { model } = walkDocument('animate s');
    expect(typeof model.animate?.duration).not.toBe('string');
    expect(model.animate?.keyframes).toEqual([]);
  });

  it('"animate abc" does not assign a string to duration', () => {
    const { model } = walkDocument('animate abc');
    expect(typeof model.animate?.duration).not.toBe('string');
    expect(model.animate?.keyframes).toEqual([]);
  });
});
