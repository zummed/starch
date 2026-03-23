import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  getPropertySchema,
  getAvailableProperties,
  detectSchemaType,
  getEnumValues,
  getNumberConstraints,
} from '../../types/schemaRegistry';

describe('getPropertySchema', () => {
  it('returns NodeSchema for empty path', () => {
    const schema = getPropertySchema('');
    expect(schema).not.toBeNull();
  });

  it('returns rect schema', () => {
    const schema = getPropertySchema('rect');
    expect(schema).not.toBeNull();
  });

  it('returns rect.w as a number schema', () => {
    const schema = getPropertySchema('rect.w');
    expect(schema).not.toBeNull();
    expect(schema!.safeParse(100).success).toBe(true);
    expect(schema!.safeParse('hello').success).toBe(false);
  });

  it('returns fill.h as a number schema', () => {
    const schema = getPropertySchema('fill.h');
    expect(schema).not.toBeNull();
    expect(schema!.safeParse(210).success).toBe(true);
  });

  it('returns null for nonexistent path', () => {
    expect(getPropertySchema('nonexistent')).toBeNull();
    expect(getPropertySchema('rect.nonexistent')).toBeNull();
  });

  it('resolves transform.x', () => {
    const schema = getPropertySchema('transform.x');
    expect(schema).not.toBeNull();
    expect(schema!.safeParse(100).success).toBe(true);
  });

  it('resolves text.align as an enum', () => {
    const schema = getPropertySchema('text.align');
    expect(schema).not.toBeNull();
  });
});

describe('getAvailableProperties', () => {
  it('returns all Node properties for empty path', () => {
    const props = getAvailableProperties('');
    expect(props.length).toBeGreaterThan(5);
    const names = props.map(p => p.name);
    expect(names).toContain('id');
    expect(names).toContain('rect');
    expect(names).toContain('fill');
    expect(names).toContain('transform');
  });

  it('returns rect properties', () => {
    const props = getAvailableProperties('rect');
    const names = props.map(p => p.name);
    expect(names).toContain('w');
    expect(names).toContain('h');
    expect(names).toContain('radius');
  });

  it('returns empty for fill (Color union)', () => {
    // fill is now a Color union (string | RGB | HSL | named+alpha | hex+alpha)
    // getAvailableProperties returns [] for non-object schemas
    const props = getAvailableProperties('fill');
    expect(props).toEqual([]);
  });

  it('returns stroke properties', () => {
    const props = getAvailableProperties('stroke');
    const names = props.map(p => p.name);
    expect(names).toContain('color');
    expect(names).toContain('width');
  });

  it('includes descriptions', () => {
    const props = getAvailableProperties('stroke');
    const colorProp = props.find(p => p.name === 'color');
    expect(colorProp?.description).toContain('color');
  });

  it('marks required vs optional', () => {
    const props = getAvailableProperties('rect');
    const wProp = props.find(p => p.name === 'w');
    const radiusProp = props.find(p => p.name === 'radius');
    expect(wProp?.required).toBe(false); // w defaults to 0 (auto-sized by layout)
    expect(radiusProp?.required).toBe(false);
  });

  it('categorizes properties', () => {
    const props = getAvailableProperties('');
    const rectProp = props.find(p => p.name === 'rect');
    const fillProp = props.find(p => p.name === 'fill');
    const transformProp = props.find(p => p.name === 'transform');
    expect(rectProp?.category).toBe('geometry');
    expect(fillProp?.category).toBe('visual');
    expect(transformProp?.category).toBe('transform');
  });

  it('returns empty for leaf schema', () => {
    const props = getAvailableProperties('fill.h');
    expect(props).toEqual([]);
  });
});

describe('detectSchemaType', () => {
  it('detects number', () => {
    const schema = getPropertySchema('rect.w')!;
    expect(detectSchemaType(schema)).toBe('number');
  });

  it('detects string', () => {
    const schema = getPropertySchema('id')!;
    expect(detectSchemaType(schema)).toBe('string');
  });

  it('detects boolean', () => {
    const schema = getPropertySchema('visible')!;
    expect(detectSchemaType(schema)).toBe('boolean');
  });

  it('detects color (HslColor)', () => {
    const schema = getPropertySchema('fill')!;
    expect(detectSchemaType(schema)).toBe('color');
  });

  it('detects object', () => {
    const schema = getPropertySchema('rect')!;
    expect(detectSchemaType(schema)).toBe('object');
  });

  it('detects enum', () => {
    const schema = getPropertySchema('text.align')!;
    expect(detectSchemaType(schema)).toBe('enum');
  });
});

describe('getEnumValues', () => {
  it('returns values for enum schema', () => {
    const schema = getPropertySchema('text.align')!;
    const values = getEnumValues(schema);
    expect(values).toContain('start');
    expect(values).toContain('middle');
    expect(values).toContain('end');
  });

  it('returns null for non-enum', () => {
    const schema = getPropertySchema('rect.w')!;
    expect(getEnumValues(schema)).toBeNull();
  });
});

describe('getNumberConstraints', () => {
  it('detects min=0 for positive-only numbers', () => {
    const schema = getPropertySchema('rect.w')!;
    const constraints = getNumberConstraints(schema);
    expect(constraints?.min).toBe(0);
  });

  it('detects max=360 for hue', () => {
    const schema = getPropertySchema('fill.h')!;
    const constraints = getNumberConstraints(schema);
    expect(constraints?.max).toBe(360);
  });

  it('detects max=100 for saturation', () => {
    const schema = getPropertySchema('fill.s')!;
    const constraints = getNumberConstraints(schema);
    expect(constraints?.max).toBe(100);
  });

  it('detects max=1 for opacity', () => {
    const schema = getPropertySchema('opacity')!;
    const constraints = getNumberConstraints(schema);
    expect(constraints?.max).toBe(1);
  });

  it('returns null for non-number', () => {
    const schema = getPropertySchema('id')!;
    expect(getNumberConstraints(schema)).toBeNull();
  });
});
