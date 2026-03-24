// src/__tests__/editor/schemaCompletionSource.test.ts
import { describe, it, expect } from 'vitest';
import { getSchemaCompletions } from '../../editor/schemaCompletionSource';
import type { SchemaSpan } from '../../editor/schemaSpan';

describe('getSchemaCompletions', () => {
  const spans: SchemaSpan[] = [
    { from: 0, to: 3, schemaPath: 'rect', modelPath: 'objects.box.rect', section: 'node' },
    { from: 4, to: 7, schemaPath: 'rect.w', modelPath: 'objects.box.rect.w', section: 'node' },
    { from: 17, to: 20, schemaPath: 'fill', modelPath: 'objects.box.fill', section: 'node' },
  ];

  it('returns color completions at a fill value position', () => {
    const items = getSchemaCompletions(spans, 18, 'bl');
    expect(items.some(i => i.label === 'blue')).toBe(true);
    expect(items.some(i => i.label === 'black')).toBe(true);
  });

  it('returns enum completions for enum schema types', () => {
    const enumSpans: SchemaSpan[] = [
      { from: 0, to: 5, schemaPath: 'text.align', modelPath: 'objects.box.text.align', section: 'node' },
    ];
    const items = getSchemaCompletions(enumSpans, 2, 'mi');
    expect(items.some(i => i.label === 'middle')).toBe(true);
  });

  it('returns top-level keywords when no span context exists', () => {
    const items = getSchemaCompletions([], 0, 'an');
    expect(items.some(i => i.label === 'animate')).toBe(true);
  });

  it('returns easing values after easing= in line text', () => {
    const items = getSchemaCompletions([], 0, 'ea', 'easing=ea');
    expect(items.some(i => i.label === 'easeIn')).toBe(true);
    expect(items.some(i => i.label === 'easeOut')).toBe(true);
  });

  it('returns color completions after fill keyword in line text', () => {
    const items = getSchemaCompletions([], 0, 'red', 'fill red');
    expect(items.some(i => i.label === 'red')).toBe(true);
  });

  it('returns style names after @ sign', () => {
    const modelJson = { styles: { primary: { fill: 'blue' }, accent: { fill: 'red' } } };
    const items = getSchemaCompletions([], 0, 'pr', '@pr', modelJson);
    expect(items.some(i => i.label === 'primary')).toBe(true);
  });

  it('returns node IDs after -> for connections', () => {
    const modelJson = { objects: [{ id: 'nodeA' }, { id: 'nodeB' }] };
    const items = getSchemaCompletions([], 0, 'node', 'link: nodeA -> node', modelJson);
    expect(items.some(i => i.label === 'nodeA')).toBe(true);
    expect(items.some(i => i.label === 'nodeB')).toBe(true);
  });

  it('returns object property completions for object schema types', () => {
    const objectSpans: SchemaSpan[] = [
      { from: 0, to: 4, schemaPath: 'rect', modelPath: 'objects.box.rect', section: 'node' },
    ];
    const items = getSchemaCompletions(objectSpans, 2, '');
    // rect is an object type, should return properties like w, h
    expect(items.some(i => i.label === 'w')).toBe(true);
    expect(items.some(i => i.label === 'h')).toBe(true);
  });
});
