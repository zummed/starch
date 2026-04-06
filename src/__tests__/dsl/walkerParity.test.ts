import { describe, it, expect } from 'vitest';
import { getDsl } from '../../dsl/dslMeta';
import { DocumentSchema } from '../../types/schemaRegistry';
import type { z } from 'zod';
import { walkDocument } from '../../dsl/schemaWalker';
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

describe('walker smoke tests for all supported samples', () => {
  // Samples the walker is expected to handle. The walker is now the sole parser.
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

    it(`walker produces valid model for ${sample.category}/${sample.name}`, () => {
      const { model } = walkDocument(sample.dsl);
      expect(model).toBeDefined();
      expect(Array.isArray(model.objects)).toBe(true);
      expect(model.objects.length).toBeGreaterThan(0);
    });
  }
});
