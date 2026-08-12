import { describe, it, expect } from 'vitest';
import { getStarchGuide } from '../../dsl/guide';
import { parseScene } from '../../parser/parser';
import { registerBuiltinTemplates } from '../../templates/index';
import { listSets } from '../../templates/registry';
import { getEnumValues, detectSchemaType } from '../../types/schemaRegistry';
import type { z } from 'zod';
import { getDsl } from '../../dsl/dslMeta';
import { EasingNameSchema } from '../../types/animation';

registerBuiltinTemplates();

/** The worked examples, which are the only fences tagged as starch. */
function examples(guide: string): string[] {
  return [...guide.matchAll(/```starch\n([\s\S]*?)```/g)].map(m => m[1]);
}

describe('getStarchGuide', () => {
  it('documents every registered shape', () => {
    const guide = getStarchGuide();
    for (const set of listSets()) {
      for (const name of set.shapes.keys()) {
        expect(guide, `${set.name}.${name} is missing from the guide`).toContain(name);
      }
    }
  });

  it('derives properties from the schemas rather than a written list', () => {
    // labelBg was added to arrowProps with no change to the guide, and its
    // enum arms come from the schema — so this fails the moment a prop is
    // renamed, which is the whole point of generating it.
    const guide = getStarchGuide();
    expect(guide).toContain('`labelBg` (halo | plate | none)');
    expect(guide).toContain('Wrap the label at this width in pixels');
  });

  it('lists every easing the evaluator accepts', () => {
    const guide = getStarchGuide();
    for (const easing of getEnumValues(EasingNameSchema) ?? []) {
      expect(guide, `easing ${easing} is missing`).toContain(`\`${easing}\``);
    }
  });

  it('teaches only starch that actually parses', () => {
    // A guide that documents syntax the parser rejects is worse than none —
    // every example is parsed here, and a warning counts as a failure for
    // the same reason it does in `starch check`.
    const found = examples(getStarchGuide());
    expect(found.length).toBeGreaterThan(0);
    for (const example of found) {
      const scene = parseScene(example);
      expect(scene.warnings, `example warned: ${example}`).toEqual([]);
      expect(scene.nodes.length).toBeGreaterThan(0);
    }
  });

  it('says which shapes cannot have their content set from the DSL', () => {
    // A shape with no dsl() hints still takes scalar `key=value` — the kwarg
    // loop accepts any key — but that loop stops at `[`, so a list-valued
    // prop has no written form. Claiming these shapes take no properties at
    // all was wrong in the other direction, and equally misleading.
    const guide = getStarchGuide();
    for (const set of listSets()) {
      for (const [name, definition] of set.shapes) {
        if (getDsl(definition.props)) continue;
        const shape = definition.props.shape as Record<string, z.ZodType>;
        const lists = Object.keys(shape).filter(k => detectSchemaType(shape[k]) === 'array');
        if (lists.length === 0) continue;
        expect(guide).toContain(`\`${name}\` has no way to write`);
      }
    }
  });

  it('warns that shape properties must precede `at`', () => {
    // `box "X" at 150,40 color=red` drops the colour: anything after `at` is
    // read as an object-level property, not a shape prop. Every cold reader
    // that hit this wrote a document that parsed but rendered wrong.
    expect(getStarchGuide()).toContain('before `at x,y`');
  });

  it('teaches both connection forms, and both parse', () => {
    // Three cold readers each wrote `arrow a -> b label="x"` from the usage
    // line and got `Duplicate ID: "a"`, because the route branch ate the
    // word `arrow`. Both spellings work now, so assert the guide claims
    // that and that the claim is true.
    const guide = getStarchGuide();
    expect(guide).toContain('are the same thing');
    const head = 'objects\n  a: box "A" at 10,10\n  b: box "B" at 300,10\n  ';
    for (const form of ['c: arrow a -> b label="calls"', 'c: arrow from=a to=b label="calls"']) {
      const scene = parseScene(head + form);
      expect(scene.warnings, form).toEqual([]);
      const label = scene.nodes.find(n => n.id === 'c')
        ?.children.find(k => k.id === 'c.label')
        ?.children.find(t => t.text)?.text?.content;
      expect(label, form).toBe('calls');
    }
  });

  it('shows shape booleans in the form that can also express false', () => {
    // Both spellings parse now, but `[dashed]` reads as a placeholder and
    // cannot say false — a cold reader copied the brackets literally.
    const guide = getStarchGuide();
    for (const set of listSets()) {
      for (const definition of set.shapes.values()) {
        for (const flag of getDsl(definition.props)?.flags ?? []) {
          expect(guide).toContain(`${flag}=true`);
          expect(guide).not.toContain(`[${flag}]`);
        }
      }
    }
  });

  it('narrows to the sets an app actually uses', () => {
    const core = getStarchGuide({ sets: ['core'] });
    expect(core).toContain('use core');
    expect(core).not.toContain('use state');
  });

  it('reports an unknown set instead of returning a guide missing it', () => {
    expect(() => getStarchGuide({ sets: ['core', 'sequence'] })).toThrow(/Unknown shape set "sequence"/);
  });

  it('drops the worked examples on request, keeping the syntax ones', () => {
    // A style block cannot be described without showing one, so that snippet
    // is part of the syntax rather than an example and survives.
    const guide = getStarchGuide({ examples: false });
    expect(guide).not.toContain('## Examples');
    expect(guide).toContain('## Shapes');
    expect(examples(guide).length).toBeLessThan(examples(getStarchGuide()).length);
  });

  it('needs no DOM', () => {
    // The default vitest environment here is node — if this file ever needs
    // happy-dom, the guide has grown a dependency it should not have.
    expect(typeof globalThis.document).toBe('undefined');
    expect(getStarchGuide().length).toBeGreaterThan(1000);
  });
});
