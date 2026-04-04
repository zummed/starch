import { describe, it, expect } from 'vitest';
import { getDsl } from '../../dsl/dslMeta';
import { DocumentSchema } from '../../types/schemaRegistry';
import type { z } from 'zod';
import { walkDocument } from '../../dsl/schemaWalker';
import { buildAstFromText } from '../../dsl/astParser';
import { v2Samples } from '../../samples';

describe('DocumentSchema top-level annotations', () => {
  it('name field has topLevel + keyword + quoted positional', () => {
    const shape = (DocumentSchema as any).shape;
    const inner = (shape.name as any)._def.innerType;
    const hints = getDsl(inner as z.ZodType);
    expect(hints).toBeDefined();
    expect(hints?.topLevel).toBe(true);
    expect(hints?.keyword).toBe('name');
    expect(hints?.positional?.[0].format).toBe('quoted');
  });

  it('description field has topLevel + keyword + quoted positional', () => {
    const shape = (DocumentSchema as any).shape;
    const inner = (shape.description as any)._def.innerType;
    const hints = getDsl(inner as z.ZodType);
    expect(hints?.topLevel).toBe(true);
    expect(hints?.keyword).toBe('description');
    expect(hints?.positional?.[0].format).toBe('quoted');
  });

  it('background field has topLevel + keyword + default positional', () => {
    const shape = (DocumentSchema as any).shape;
    const inner = (shape.background as any)._def.innerType;
    const hints = getDsl(inner as z.ZodType);
    expect(hints?.topLevel).toBe(true);
    expect(hints?.keyword).toBe('background');
    expect(hints?.positional).toBeDefined();
  });

  it('viewport field has topLevel + keyword + dimension positional', () => {
    const shape = (DocumentSchema as any).shape;
    const inner = (shape.viewport as any)._def.innerType;
    const hints = getDsl(inner as z.ZodType);
    expect(hints?.topLevel).toBe(true);
    expect(hints?.keyword).toBe('viewport');
    expect(hints?.positional?.[0].format).toBe('dimension');
  });
});

/**
 * Deep parity assertion comparing walker output to astParser output.
 * Both parsers should produce equivalent models for supported samples.
 *
 * Note on styles: the astParser always emits `styles: {}` even when
 * no styles are present; the walker only emits it when styles exist.
 * We normalise both to treat an empty/missing styles as equivalent.
 */
function assertParity(walkerModel: any, parserModel: any, name: string): void {
  // Top-level metadata
  expect(walkerModel.name, `${name}.name`).toEqual(parserModel.name);
  expect(walkerModel.description, `${name}.description`).toEqual(parserModel.description);
  expect(walkerModel.background, `${name}.background`).toEqual(parserModel.background);

  // Objects array — count + deep compare each object
  const wObjs = walkerModel.objects ?? [];
  const pObjs = parserModel.objects ?? [];
  expect(wObjs.length, `${name} objects count`).toEqual(pObjs.length);
  for (let i = 0; i < pObjs.length; i++) {
    expect(wObjs[i], `${name} objects[${i}]`).toEqual(pObjs[i]);
  }

  // Styles — normalise: treat undefined and {} as equivalent
  const wStyles = walkerModel.styles ?? {};
  const pStyles = parserModel.styles ?? {};
  expect(wStyles, `${name}.styles`).toEqual(pStyles);

  // Animate
  if (parserModel.animate) {
    expect(walkerModel.animate?.duration, `${name}.animate.duration`).toEqual(parserModel.animate.duration);
    expect(walkerModel.animate?.loop, `${name}.animate.loop`).toEqual(parserModel.animate.loop);
    expect(walkerModel.animate?.easing, `${name}.animate.easing`).toEqual(parserModel.animate.easing);
    expect(walkerModel.animate?.keyframes?.length, `${name}.animate.keyframes count`)
      .toEqual(parserModel.animate.keyframes?.length);
    // Deep compare each keyframe
    const wKfs = walkerModel.animate?.keyframes ?? [];
    const pKfs = parserModel.animate?.keyframes ?? [];
    for (let i = 0; i < pKfs.length; i++) {
      expect(wKfs[i]?.time, `${name} keyframes[${i}].time`).toEqual(pKfs[i].time);
      expect(wKfs[i]?.changes, `${name} keyframes[${i}].changes`).toEqual(pKfs[i].changes);
    }
  }

  // Images
  if (parserModel.images) {
    expect(walkerModel.images, `${name}.images`).toEqual(parserModel.images);
  }
}

describe('walker parity with astParser', () => {
  // Only test samples that the walker is expected to handle in the current
  // implementation state. Expand this list as features are added.
  const SUPPORTED_NAMES = new Set<string>([
    // Primitives
    'rect', 'ellipse', 'text',
    'dash-patterns',
    // Colors
    'color-animation', 'hue-shortest-arc',
    // Styles
    'named-styles', 'style-animation',
    // Animation
    'position-animation', 'opacity-animation',
    'easing-comparison',
    // Composition
    'box-composition', 'line-composition',
    // Connections
    'edge-snapping', 'arrow', 'smooth-bend',
    // Composition with animation
    'nested-children',
    // Inheritance
    'fill-inheritance',
    // Layout
    'flex-row', 'flex-grow', 'slot-animation',
    // Connections (more)
    'smooth-spline', 'routed-polyline',
    // Camera
    'camera-target', 'camera-zoom', 'camera-look-fit', 'camera-follow', 'camera-switch',
    'camera-ratio', 'camera-rotation', 'camera-combined',
  ]);

  for (const sample of v2Samples) {
    if (!SUPPORTED_NAMES.has(sample.name)) continue;

    it(`parity for ${sample.category}/${sample.name}`, () => {
      const walkerResult = walkDocument(sample.dsl);
      const parserResult = buildAstFromText(sample.dsl);
      assertParity(walkerResult.model, parserResult.model, sample.name);
    });
  }
});
