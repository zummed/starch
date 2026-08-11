/**
 * Silent-failure diagnostics.
 *
 * The DSL walker drops tokens it can't match rather than erroring, so a
 * document could parse "successfully" while quietly losing what the author
 * wrote. These tests pin the warnings that make that loss visible, and pin
 * the fact that real documents stay quiet.
 */
import { describe, it, expect } from 'vitest';
import { parseScene } from '../../parser/parser';
import { v2Samples } from '../../samples/index';

describe('parse diagnostics', () => {
  it('warns when a shape name is misspelled', () => {
    // The walker drops an unrecognised shape name outright rather than
    // recording it as a template, so what survives is a node stripped of
    // everything the author wrote — which the empty-node check catches.
    const scene = parseScene('api: bax "API" color=steelblue');
    expect(scene.warnings.join('\n')).toMatch(/"api" has no properties/i);
  });

  it('warns when a node ends up with no properties', () => {
    const scene = parseScene('box: rect 100x50\nbox.fill: red');
    expect(scene.warnings.join('\n')).toMatch(/"box\.fill" has no properties/i);
  });

  it('warns when nothing in the document is recognised', () => {
    const scene = parseScene('!!! this is not starch at all ??? %%%');
    expect(scene.nodes).toHaveLength(0);
    expect(scene.warnings.join('\n')).toMatch(/zero nodes/i);
  });

  it('stays silent on an empty document', () => {
    expect(parseScene('').warnings).toEqual([]);
  });

  it('reports no warnings for any shipped sample', () => {
    const noisy = v2Samples
      .map(sample => ({ name: sample.name, warnings: parseScene(sample.dsl).warnings }))
      .filter(entry => entry.warnings.length > 0);
    expect(noisy).toEqual([]);
  });
});
