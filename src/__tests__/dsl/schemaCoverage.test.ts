import { describe, it, expect } from 'vitest';
import { walkDocument } from '../../dsl/schemaWalker';
import { getPropertySchema, detectSchemaType } from '../../types/schemaRegistry';
import { NodeSchema } from '../../types/node';
import {
  RectGeomSchema, EllipseGeomSchema, TextGeomSchema, ImageGeomSchema,
  CameraSchema, PathGeomSchema,
} from '../../types/node';
import { StrokeSchema, TransformSchema, DashSchema, LayoutSchema } from '../../types/properties';
import { unwrap } from '../../dsl/schemaIntrospect';
import { v2Samples } from '../../samples';
import { FEATURE_CORPUS } from './roundTrip.test';
import type { z } from 'zod';

/**
 * Enforcing coverage gate. Every field on the object definitions must be:
 *   1. resolvable by the registry helpers (getPropertySchema) — so click-to-edit
 *      can find a widget for it, and
 *   2. actually exercised by the round-trip corpus — so it has a parse+emit path
 *      that is proven faithful.
 *
 * If you add a field to a schema, this test fails until you (a) give it DSL
 * hints so parse/emit handle it and (b) add a corpus case in roundTrip.test.ts
 * — OR add it to ALLOWLIST below with a reason if it is intentionally not
 * DSL-surfaced. This is what keeps "definitions drive everything" honest.
 */

// Fields that intentionally have no DSL surface (set via JSON/templates only).
const ALLOWLIST = new Set<string>([
  'id',            // structural — every node has one
  'children',      // structural — covered by nested corpus, not a leaf field
]);

function shapeKeys(schema: z.ZodType): string[] {
  const shape = (unwrap(schema) as any).shape as Record<string, z.ZodType>;
  return Object.keys(shape).filter(k => !k.startsWith('_'));
}

/** Collect every node-level key and `compound.subkey` present in a model. */
function collectPaths(model: any, out: Set<string>): void {
  const walkNode = (node: any) => {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'children' || k.startsWith('_')) continue;
      out.add(k);
      if (v && typeof v === 'object') {
        for (const sub of Object.keys(v)) out.add(`${k}.${sub}`);
      }
    }
    for (const c of node.children ?? []) walkNode(c);
  };
  for (const node of model.objects ?? []) walkNode(node);
  for (const style of Object.values(model.styles ?? {})) walkNode(style);
}

// Build the covered-path set from every corpus source.
const covered = new Set<string>();
for (const s of v2Samples) collectPaths(walkDocument(s.dsl).model, covered);
for (const c of FEATURE_CORPUS) collectPaths(walkDocument(c.dsl).model, covered);

// (prefix, schema) pairs for the compound constructs.
const CONSTRUCTS: Array<[string, z.ZodType]> = [
  ['rect', RectGeomSchema],
  ['ellipse', EllipseGeomSchema],
  ['text', TextGeomSchema],
  ['image', ImageGeomSchema],
  ['camera', CameraSchema],
  ['path', PathGeomSchema],
  ['stroke', StrokeSchema],
  ['transform', TransformSchema],
  ['dash', DashSchema],
  ['layout', LayoutSchema],
];

describe('schema coverage: every NodeSchema field is exercised', () => {
  for (const key of shapeKeys(NodeSchema)) {
    if (ALLOWLIST.has(key)) continue;
    it(`node.${key} round-trips in the corpus`, () => {
      expect(
        covered.has(key),
        `NodeSchema.${key} is never exercised — add a case to FEATURE_CORPUS or ALLOWLIST it`,
      ).toBe(true);
    });
  }
});

describe('schema coverage: every construct field is exercised', () => {
  for (const [prefix, schema] of CONSTRUCTS) {
    for (const field of shapeKeys(schema)) {
      const path = `${prefix}.${field}`;
      if (ALLOWLIST.has(path)) continue;
      it(`${path} round-trips in the corpus`, () => {
        expect(
          covered.has(path),
          `${path} is never exercised — wire DSL hints + add a corpus case, or ALLOWLIST it`,
        ).toBe(true);
      });
    }
  }
});

describe('schema coverage: registry resolves every field path', () => {
  const allPaths = new Set<string>();
  for (const key of shapeKeys(NodeSchema)) {
    if (!ALLOWLIST.has(key)) allPaths.add(key);
  }
  for (const [prefix, schema] of CONSTRUCTS) {
    for (const field of shapeKeys(schema)) allPaths.add(`${prefix}.${field}`);
  }

  for (const path of allPaths) {
    it(`getPropertySchema resolves "${path}"`, () => {
      // The click-to-edit popup resolves a widget from this schema; a null
      // here means a property the editor cannot introspect.
      expect(getPropertySchema(path, NodeSchema), `no schema for ${path}`).not.toBeNull();
    });
  }
});

describe('schema coverage: leaf fields have a detectable widget type', () => {
  // Compound containers (geometry/property objects) resolve to 'object'; their
  // leaves must resolve to a concrete widget type so a popup can render.
  const LEAF_PATHS = [
    'rect.w', 'rect.h', 'rect.radius',
    'ellipse.rx', 'ellipse.ry',
    'text.size', 'text.align', 'text.bold',
    'image.fit',
    'camera.zoom', 'camera.active',
    'stroke.width',
    'transform.x', 'transform.rotation', 'transform.scale', 'transform.anchor',
    'dash.length', 'dash.gap',
    'layout.direction', 'layout.gap', 'layout.justify', 'layout.grow',
    'opacity', 'depth', 'visible',
  ];
  for (const path of LEAF_PATHS) {
    it(`detectSchemaType("${path}") is concrete`, () => {
      const schema = getPropertySchema(path, NodeSchema);
      expect(schema, `no schema for ${path}`).not.toBeNull();
      expect(detectSchemaType(schema!)).not.toBe('unknown');
    });
  }
});
