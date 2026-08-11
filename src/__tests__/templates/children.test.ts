/**
 * Templates that are given children in the DSL.
 *
 * A template builds its own parts (a box's background and label). Children
 * written under it in the DSL are additional content and must be appended to
 * those parts — assigning over them left the template an empty shell and put
 * unexpanded child definitions into the tree, which then crashed the walker.
 */
import { describe, it, expect } from 'vitest';
import { parseScene } from '../../parser/parser';
import { expandTemplates } from '../../templates/registry';
import { registerBuiltinTemplates } from '../../templates/index';

describe('unknown template names', () => {
  it('reports a template name that no loaded set provides', () => {
    registerBuiltinTemplates();
    const warnings: string[] = [];
    expandTemplates([{ id: 'a', template: 'nope', props: {} }], ['core'], undefined, warnings);
    expect(warnings.join('\n')).toMatch(/unknown template "nope".*core/i);
  });

  it('resolves a shape from a set named in the search path', () => {
    registerBuiltinTemplates();
    const warnings: string[] = [];
    expandTemplates([{ id: 'a', template: 'node', props: {} }], ['state'], undefined, warnings);
    expect(warnings).toEqual([]);
  });
});

describe('template children', () => {
  it('keeps the template parts and appends DSL children', () => {
    const scene = parseScene('b: box "B" 100x50\n  a: rect 20x20');
    const ids = scene.nodes[0].children.map(child => child.id);
    expect(ids).toContain('b.bg');
    expect(ids).toContain('b.label');
    expect(ids).toContain('a');
  });

  it('lays children out inside a group', () => {
    const scene = parseScene('g: group "G" 200x100\n  a: rect 20x20\n  b: rect 20x20');
    const ids = scene.nodes[0].children.map(child => child.id);
    expect(ids).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('expands nested templates written as children', () => {
    const scene = parseScene('g: group "G" 200x100\n  inner: box "Inner" 80x40');
    const inner = scene.nodes[0].children.find(child => child.id === 'inner');
    expect(inner?.children.map(child => child.id)).toContain('inner.bg');
  });

  it('does not warn for a template with children', () => {
    expect(parseScene('b: box "B" 100x50\n  a: rect 20x20').warnings).toEqual([]);
  });
});
