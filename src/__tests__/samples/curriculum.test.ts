/**
 * The learn track is a sequence, not a pile — these are the properties that
 * keep it one.
 *
 * A curriculum rots quietly: someone renumbers a lesson, or teaches `bend` in
 * two places, or writes lesson 12 against a feature nothing introduced, and
 * nothing fails. Every sample still parses, so `samples.test.ts` stays green
 * while the ordering stops meaning anything. These assertions are what make
 * that loss loud.
 */
import { describe, it, expect } from 'vitest';
import {
  v2Samples, learnSamples, referenceSamples, getConceptIndex, getV2Sample,
  DEFAULT_SAMPLE_NAME,
} from '../../samples/index';

const NUMBERED = /^(\d{2})-[a-z0-9-]+$/;

describe('learn track', () => {
  it('numbers every lesson, contiguously, in array order', () => {
    const numbers = learnSamples.map(sample => {
      const match = NUMBERED.exec(sample.name);
      expect(match, `"${sample.name}" is not named NN-slug`).not.toBeNull();
      return Number(match![1]);
    });
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
  });

  it('introduces each concept exactly once', () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const sample of learnSamples) {
      for (const concept of sample.teaches) {
        const first = seen.get(concept);
        if (first) duplicates.push(`"${concept}" taught by ${first} and again by ${sample.name}`);
        else seen.set(concept, sample.name);
      }
    }
    expect(duplicates).toEqual([]);
  });

  it('teaches something in every lesson but the finale', () => {
    // The last lesson is a recap — it earns its place by using what came
    // before, not by adding to it.
    const silent = learnSamples.slice(0, -1).filter(s => s.teaches.length === 0);
    expect(silent.map(s => s.name)).toEqual([]);
  });

  it('covers the concepts the reference track assumes', () => {
    const taught = new Set(getConceptIndex().keys());
    // A representative spine: if any of these stops being taught, a reader
    // hits it cold in a reference grid.
    for (const concept of [
      'rect', 'ellipse', 'text', 'fill', 'stroke', 'at',
      'children', 'inheritance', 'templates', 'template-parts',
      'arrow', 'bend', 'style', 'animate', 'easing', 'part-animation',
      'layout', 'layout.slot', 'camera', 'camera.zoom',
    ]) {
      expect(taught.has(concept), `nothing in the learn track teaches "${concept}"`).toBe(true);
    }
  });
});

describe('reference track', () => {
  it('is unnumbered — reference material has no order', () => {
    const numbered = referenceSamples.filter(s => NUMBERED.test(s.name));
    expect(numbered.map(s => s.name)).toEqual([]);
  });

  it('claims to teach nothing — the learn track owns introductions', () => {
    const teaching = referenceSamples.filter(s => s.teaches.length > 0);
    expect(teaching.map(s => s.name)).toEqual([]);
  });
});

describe('sample set', () => {
  it('has unique names', () => {
    const names = v2Samples.map(s => s.name);
    expect(names.length).toBe(new Set(names).size);
  });

  it('files every sample under a category shared with a lesson', () => {
    // Reference grids sit beside the lessons they back up; a category that
    // exists only in the reference track is a topic nothing teaches.
    const lessonCategories = new Set(learnSamples.map(s => s.category));
    const orphans = referenceSamples.filter(s => !lessonCategories.has(s.category));
    expect(orphans.map(s => `${s.name} (${s.category})`)).toEqual([]);
  });

  it('resolves the playground default', () => {
    expect(getV2Sample(DEFAULT_SAMPLE_NAME)).toBeDefined();
  });
});
