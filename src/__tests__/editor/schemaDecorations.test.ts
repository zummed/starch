import { describe, it, expect } from 'vitest';
import { getSpanAtPos } from '../../editor/schemaDecorations';
import type { SchemaSpan } from '../../editor/schemaSpan';

describe('getSpanAtPos', () => {
  const spans: SchemaSpan[] = [
    { from: 10, to: 13, schemaPath: 'rect.w', modelPath: 'objects.box.rect.w', section: 'node' },
    { from: 14, to: 16, schemaPath: 'rect.h', modelPath: 'objects.box.rect.h', section: 'node' },
    { from: 22, to: 25, schemaPath: 'fill', modelPath: 'objects.box.fill', section: 'node' },
  ];

  it('returns span containing the position', () => {
    expect(getSpanAtPos(spans, 11)).toEqual(spans[0]);
  });

  it('returns span at exact start', () => {
    expect(getSpanAtPos(spans, 10)).toEqual(spans[0]);
  });

  it('returns null for position outside spans', () => {
    expect(getSpanAtPos(spans, 5)).toBeNull();
    expect(getSpanAtPos(spans, 13)).toBeNull(); // between spans
    expect(getSpanAtPos(spans, 20)).toBeNull();
  });

  it('returns null for empty spans', () => {
    expect(getSpanAtPos([], 5)).toBeNull();
  });
});
