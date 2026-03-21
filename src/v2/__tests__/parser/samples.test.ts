import { describe, it, expect } from 'vitest';
import { parseScene } from '../../parser/parser';
import { v2Samples } from '../../samples/index';

describe('v2 samples', () => {
  for (const sample of v2Samples) {
    it(`parses sample: ${sample.category}/${sample.name}`, () => {
      expect(() => parseScene(sample.dsl)).not.toThrow();
      const scene = parseScene(sample.dsl);
      expect(scene.nodes.length).toBeGreaterThan(0);
    });
  }

  it('has samples in multiple categories', () => {
    const categories = [...new Set(v2Samples.map(s => s.category))];
    expect(categories.length).toBeGreaterThanOrEqual(5);
  });

  it('has at least 20 samples total', () => {
    expect(v2Samples.length).toBeGreaterThanOrEqual(20);
  });
});
