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

  it('"animate 3s" produces keyframes: []', () => {
    const { model } = walkDocument('animate 3s');
    expect(model.animate?.keyframes).toEqual([]);
  });

  it('"animate 3s loop" produces keyframes: []', () => {
    const { model } = walkDocument('animate 3s loop');
    expect(model.animate?.keyframes).toEqual([]);
  });

  it('animate with actual keyframes preserves them', () => {
    const dsl = `animate 3s
  1 box.opacity: 1`;
    const { model } = walkDocument(dsl);
    expect(model.animate?.keyframes).toHaveLength(1);
  });

  it('"animate s" does not assign a string to duration', () => {
    // Regression: after autocompleting `animate 3s` and deleting the `3`,
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
