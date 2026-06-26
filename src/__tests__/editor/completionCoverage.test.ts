import { describe, it, expect } from 'vitest';
import { EditorSession } from '../../editor/editorSession';
import { getDsl } from '../../dsl/dslMeta';
import {
  getPropertySchema, detectSchemaType, getEnumValues, getAvailableProperties,
  DocumentSchema, EasingNameSchema,
} from '../../types/schemaRegistry';
import { NodeSchema } from '../../types/node';
import {
  RectGeomSchema, EllipseGeomSchema, TextGeomSchema, ImageGeomSchema, CameraSchema, PathGeomSchema,
} from '../../types/node';
import { StrokeSchema, TransformSchema, DashSchema, LayoutSchema } from '../../types/properties';
import { AnimConfigSchema } from '../../types/animation';
import { getSetNames, getShapeNames, getShapePropsSchema } from '../../templates/registry';
import { registerBuiltinTemplates } from '../../templates/index';
import { NAMED_ANCHORS } from '../../types/anchor';
import type { z } from 'zod';

/**
 * Completion-coverage gate. For every construct the grammar admits, this asserts
 * the simulator offers a completion for it — turning "does completion cover
 * everything typeable?" into an enforced test. Expectations are DERIVED from the
 * same object definitions (DslHints) the parser uses, so adding a field/kwarg to
 * a schema fails this gate until completion is wired for it.
 */

registerBuiltinTemplates();

/** Labels the simulator would offer at the end of `dsl`. */
function labelsAt(dsl: string): string[] {
  return new EditorSession(dsl).availableLabels();
}

function expectOffers(dsl: string, expected: string[]) {
  const got = labelsAt(dsl);
  // A kwarg may be offered bare ("easing") or with the "=" pre-typed
  // ("easing=") — both let the user type the kwarg, so accept either form.
  const has = (e: string) => got.includes(e) || got.includes(e + '=');
  const missing = expected.filter(e => !has(e));
  expect(missing, `at <${JSON.stringify(dsl)}> missing [${missing.join(', ')}] — got [${got.join(', ')}]`).toEqual([]);
}

const hints = (s: z.ZodType) => getDsl(s) ?? {};

// ─── Top-level keywords ──────────────────────────────────────────

describe('coverage: top-level keywords', () => {
  const expected = Object.keys((DocumentSchema as any).shape)
    .filter(k => k !== 'objects')
    .map(k => (k === 'styles' ? 'style' : k));

  it(`offers all document-level keywords: ${expected.join(', ')}`, () => {
    expectOffers('', expected);
  });
});

// ─── Geometry keywords ───────────────────────────────────────────

describe('coverage: geometry keywords', () => {
  const geometry = getDsl(NodeSchema)?.geometry ?? [];
  it(`offers all geometry types after "id:": ${geometry.join(', ')}`, () => {
    expectOffers('box: ', geometry);
  });
});

// ─── Node-level properties ───────────────────────────────────────

describe('coverage: node properties', () => {
  const nh = getDsl(NodeSchema)!;
  const fieldKeyword = (f: string): string => {
    const map: Record<string, z.ZodType> = {
      transform: TransformSchema, dash: DashSchema, layout: LayoutSchema, stroke: StrokeSchema,
    };
    return map[f] ? (getDsl(map[f])?.keyword ?? f) : f;
  };
  const expected = Array.from(new Set([
    ...[...(nh.inlineProps ?? []), ...(nh.blockProps ?? [])].map(fieldKeyword),
    ...(nh.kwargs ?? []),
    ...(nh.flags ?? []),
  ]));

  it(`offers all node properties: ${expected.join(', ')}`, () => {
    expectOffers('box: rect 10x10 ', expected);
  });
});

// ─── Compound constructs: kwargs, flags, enums ───────────────────

interface ConstructCtx { name: string; schema: z.ZodType; prefix: string; }
const CONSTRUCTS: ConstructCtx[] = [
  { name: 'rect', schema: RectGeomSchema, prefix: 'b: rect 10x10' },
  { name: 'text', schema: TextGeomSchema, prefix: 'b: text "hi"' },
  { name: 'image', schema: ImageGeomSchema, prefix: 'b: image "x" 10x10' },
  { name: 'camera', schema: CameraSchema, prefix: 'c: camera' },
  { name: 'stroke', schema: StrokeSchema, prefix: 'b: rect 10x10 stroke red' },
  { name: 'transform', schema: TransformSchema, prefix: 'b: rect 10x10 at 1,2' },
  { name: 'dash', schema: DashSchema, prefix: 'b: rect 10x10\n  dash dashed' },
  { name: 'layout', schema: LayoutSchema, prefix: 'b: rect 10x10\n  layout flex row' },
];

describe('coverage: construct kwargs + flags', () => {
  for (const c of CONSTRUCTS) {
    const h = hints(c.schema);
    const expected = [...(h.kwargs ?? []), ...(h.flags ?? [])];
    if (expected.length === 0) continue;
    it(`${c.name} offers: ${expected.join(', ')}`, () => {
      expectOffers(c.prefix + ' ', expected);
    });
  }
});

describe('coverage: enum kwarg values', () => {
  for (const c of CONSTRUCTS) {
    const h = hints(c.schema);
    for (const kw of (h.kwargs ?? [])) {
      const fieldSchema = getPropertySchema(`${c.name}.${kw}`, NodeSchema);
      if (!fieldSchema || detectSchemaType(fieldSchema) !== 'enum') continue;
      const values = getEnumValues(fieldSchema) ?? [];
      it(`${c.name}.${kw} offers enum values: ${values.join(', ')}`, () => {
        expectOffers(`${c.prefix} ${kw}=`, values);
      });
    }
  }
});

// ─── Colors ──────────────────────────────────────────────────────

describe('coverage: color values', () => {
  it('offers named colors + hsl/rgb after fill', () => {
    expectOffers('box: rect 10x10 fill ', ['steelblue', 'hsl', 'rgb']);
  });
  it('offers colors after stroke', () => {
    expectOffers('box: rect 10x10 stroke ', ['steelblue', 'hsl', 'rgb']);
  });
});

// ─── Shape sets + their shapes ───────────────────────────────────

describe('coverage: shape sets', () => {
  const sets = getSetNames();
  it(`offers all shape-set prefixes after "id:": ${sets.join(', ')}`, () => {
    expectOffers('box: ', sets);
  });

  for (const set of sets) {
    const shapes = getShapeNames(set);
    it(`offers all ${set} shapes after "${set}.": ${shapes.join(', ')}`, () => {
      expectOffers(`box: ${set}.`, shapes);
    });
  }
});

// ─── Template-instance props ─────────────────────────────────────

describe('coverage: template props', () => {
  for (const set of getSetNames()) {
    for (const shape of getShapeNames(set)) {
      const propsSchema = getShapePropsSchema(`${set}.${shape}`);
      if (!propsSchema) continue;
      const props = getAvailableProperties('', propsSchema)
        .map(p => p.name)
        .filter(n => n !== 'id' && n !== 'children');
      if (props.length === 0) continue;
      it(`${set}.${shape} offers props: ${props.join(', ')}`, () => {
        expectOffers(`x: ${set}.${shape} `, props);
      });
    }
  }
});

// ─── use [ … ] ───────────────────────────────────────────────────

describe('coverage: use directive', () => {
  const sets = getSetNames();
  it('offers shape sets after "use "', () => {
    expectOffers('use ', sets);
  });
  it('offers shape sets inside "use ["', () => {
    expectOffers('use [', sets);
  });
});

// ─── animate ─────────────────────────────────────────────────────

describe('coverage: animate', () => {
  const ah = getDsl(AnimConfigSchema)!;
  const headerExpected = [...(ah.flags ?? []), ...(ah.kwargs ?? [])];
  it(`animate header offers: ${headerExpected.join(', ')}`, () => {
    expectOffers('animate 3s ', headerExpected);
  });

  it('animate easing= offers easing names', () => {
    const easings = getEnumValues(EasingNameSchema) ?? [];
    expectOffers('animate 3s easing=', easings);
  });
});

// ─── connections ─────────────────────────────────────────────────

describe('coverage: connection targets', () => {
  it('offers node IDs after "->"', () => {
    const dsl = 'a: rect 10x10 at 0,0\nb: rect 10x10 at 100,0\nl: a -> ';
    expectOffers(dsl, ['a', 'b']);
  });
});

// ─── @style sigil ────────────────────────────────────────────────

describe('coverage: @style sigil', () => {
  it('offers defined style names after "@"', () => {
    expectOffers('style primary\n  fill red\nbox: rect 10x10 @', ['@primary']);
  });
});

// ─── anchor kwarg values ─────────────────────────────────────────

describe('coverage: anchor values', () => {
  it('offers named anchors after "anchor="', () => {
    expectOffers('box: rect 10x10 at 1,2 anchor=', [...NAMED_ANCHORS]);
  });
});

// ─── style block body ────────────────────────────────────────────

describe('coverage: style block properties', () => {
  it('offers style properties on an indented line in a style block', () => {
    expectOffers('style primary\n  ', ['fill', 'stroke', 'dash', 'layout']);
    expectOffers('style primary\n  fill red\n  ', ['fill', 'stroke', 'dash', 'layout']);
  });
});

// ─── animate keyframe authoring ──────────────────────────────────

describe('coverage: animate keyframes', () => {
  const SCENE = 'a: rect 10x10 at 0,0 fill red\nb: ellipse 5x5\n';

  it('offers a time + chapter on a fresh keyframe line', () => {
    expectOffers(SCENE + 'animate 3s\n  ', ['time', 'chapter']);
  });
  it('offers node IDs as the keyframe target path root', () => {
    expectOffers(SCENE + 'animate 3s\n  1 ', ['a', 'b']);
  });
  it('offers properties when drilling a keyframe path', () => {
    expectOffers(SCENE + 'animate 3s\n  1 a.', ['opacity', 'fill', 'transform']);
  });
  it('offers colors for a color-typed keyframe value', () => {
    expectOffers(SCENE + 'animate 3s\n  1 a.fill: ', ['steelblue', 'hsl', 'rgb']);
  });
  it('offers booleans for a boolean-typed keyframe value', () => {
    expectOffers(SCENE + 'animate 3s\n  1 a.visible: ', ['true', 'false']);
  });
  it('offers per-change easing after a value, then easing names', () => {
    const easings = getEnumValues(EasingNameSchema) ?? [];
    expectOffers(SCENE + 'animate 3s\n  1 a.opacity: 1 ', ['easing']);
    expectOffers(SCENE + 'animate 3s\n  1 a.opacity: 1 easing=', easings);
  });
  it('offers + (relative) at keyframe start, and block modifiers after the time', () => {
    expectOffers(SCENE + 'animate 3s\n  ', ['time', '+', 'chapter']);
    expectOffers(SCENE + 'animate 3s\n  1 ', ['a', 'easing', 'delay']);
  });
});

// ─── connection route modifiers ──────────────────────────────────

describe('coverage: connection route modifiers', () => {
  const routeVariant = getDsl(PathGeomSchema)?.variants?.find(v => v.when === 'route')?.hints;
  const expected = [...(routeVariant?.flags ?? []), ...(routeVariant?.kwargs ?? [])];
  it(`offers route flags + kwargs after "a -> b ": ${expected.join(', ')}`, () => {
    expectOffers('a: rect 10x10\nb: rect 10x10\nl: a -> b ', expected);
  });
});

// ─── template connector node-id values ───────────────────────────

describe('coverage: template connectors', () => {
  it('offers node IDs for arrow from=/to=', () => {
    const scene = 'alpha: rect 10x10\nbeta: rect 10x10\n';
    expectOffers(scene + 'x: arrow from=', ['alpha', 'beta']);
    expectOffers(scene + 'x: arrow to=', ['alpha', 'beta']);
  });
});

// ─── hex color affordance ────────────────────────────────────────

describe('coverage: hex color', () => {
  it('keeps a non-empty menu after typing "#" in a color value', () => {
    const labels = new EditorSession('box: rect 10x10 fill #').availableLabels();
    expect(labels.length, 'menu went empty after typing # in a color').toBeGreaterThan(0);
  });
});
