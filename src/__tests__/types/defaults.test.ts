import { describe, it, expect } from 'vitest';
import { StrokeSchema, DashSchema } from '../../types/properties';
import { TextGeomSchema } from '../../types/node';

describe('StrokeSchema defaults', () => {
  it('parses with color only (width is optional)', () => {
    const result = StrokeSchema.safeParse({ color: 'red' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.width).toBeUndefined();
    }
  });

  it('accepts explicit width', () => {
    const result = StrokeSchema.safeParse({ color: { h: 0, s: 0, l: 60 }, width: 3 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.width).toBe(3);
    }
  });

  it('rejects width above max', () => {
    const result = StrokeSchema.safeParse({ color: { h: 0, s: 0, l: 60 }, width: 25 });
    expect(result.success).toBe(false);
  });

  it('accepts HSL color object', () => {
    const result = StrokeSchema.safeParse({ color: { h: 210, s: 80, l: 50 } });
    expect(result.success).toBe(true);
  });

  it('accepts RGB color object', () => {
    const result = StrokeSchema.safeParse({ color: { r: 255, g: 0, b: 0 } });
    expect(result.success).toBe(true);
  });

  it('accepts string color', () => {
    const result = StrokeSchema.safeParse({ color: '#ff0000' });
    expect(result.success).toBe(true);
  });
});

describe('DashSchema defaults', () => {
  it('parses with only pattern', () => {
    const result = DashSchema.safeParse({ pattern: 'dashed' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pattern).toBe('dashed');
      expect(result.data.length).toBeUndefined();
      expect(result.data.gap).toBeUndefined();
    }
  });

  it('parses dotted pattern with only pattern', () => {
    const result = DashSchema.safeParse({ pattern: 'dotted' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pattern).toBe('dotted');
    }
  });

  it('accepts custom SVG dasharray string as pattern', () => {
    const result = DashSchema.safeParse({ pattern: '5 3 2 3' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pattern).toBe('5 3 2 3');
    }
  });

  it('accepts explicit length and gap', () => {
    const result = DashSchema.safeParse({ pattern: 'dashed', length: 10, gap: 5 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBe(10);
      expect(result.data.gap).toBe(5);
    }
  });
});

describe('TextGeomSchema defaults', () => {
  it('parses without size (size is optional)', () => {
    const result = TextGeomSchema.safeParse({ content: 'Hello' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.content).toBe('Hello');
      expect(result.data.size).toBeUndefined();
    }
  });

  it('accepts explicit size', () => {
    const result = TextGeomSchema.safeParse({ content: 'Hello', size: 24 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.size).toBe(24);
    }
  });

  it('rejects size below min', () => {
    const result = TextGeomSchema.safeParse({ content: 'Hello', size: 0 });
    expect(result.success).toBe(false);
  });
});
