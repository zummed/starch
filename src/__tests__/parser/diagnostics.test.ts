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
    // A name in the shape position that no set defines is still recorded as
    // the template, so the warning can name the misspelling instead of
    // reporting the empty node it leaves behind. It is reported once: the
    // props can't be read either, but repeating that adds nothing.
    const scene = parseScene('api: bax "API" color=steelblue');
    expect(scene.warnings.join('\n')).toMatch(/unknown template "bax" on node "api"/i);
    expect(scene.warnings).toHaveLength(1);
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
