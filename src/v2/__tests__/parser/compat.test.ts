import { describe, it, expect } from 'vitest';
import { convertOldObject, convertOldFormat } from '../../parser/compat';

describe('convertOldObject', () => {
  it('converts a box with position to template format', () => {
    const result = convertOldObject({
      type: 'box', id: 'b1', x: 100, y: 50, w: 120, h: 60, colour: 'dodgerblue', text: 'Hello',
    });
    expect(result.template).toBe('box');
    expect(result.id).toBe('b1');
    const props = result.props as Record<string, unknown>;
    expect(props.w).toBe(120);
    expect(props.colour).toBe('dodgerblue');
    expect(props.text).toBe('Hello');
    const transform = props.transform as Record<string, unknown>;
    expect(transform.x).toBe(100);
    expect(transform.y).toBe(50);
  });

  it('converts a circle', () => {
    const result = convertOldObject({ type: 'circle', id: 'c1', x: 200, y: 100, r: 40 });
    expect(result.template).toBe('circle');
    const props = result.props as Record<string, unknown>;
    expect(props.r).toBe(40);
  });

  it('converts a label', () => {
    const result = convertOldObject({ type: 'label', id: 'l1', text: 'Title', x: 50, y: 20 });
    expect(result.template).toBe('label');
    const props = result.props as Record<string, unknown>;
    expect(props.text).toBe('Title');
  });

  it('converts a line', () => {
    const result = convertOldObject({ type: 'line', id: 'ln1', from: 'a', to: 'b', label: 'calls' });
    expect(result.template).toBe('line');
    const props = result.props as Record<string, unknown>;
    expect(props.from).toBe('a');
    expect(props.to).toBe('b');
  });

  it('passes through unknown types', () => {
    const obj = { type: 'unknown', id: 'u1', foo: 'bar' };
    expect(convertOldObject(obj)).toEqual(obj);
  });
});

describe('convertOldFormat', () => {
  it('converts objects array in full scene', () => {
    const raw = {
      objects: [
        { type: 'box', id: 'b1', x: 100, y: 50, w: 120, h: 60 },
      ],
      animate: { duration: 4, keyframes: [] },
    };
    const result = convertOldFormat(raw);
    expect((result.objects as any[])[0].template).toBe('box');
    expect(result.animate).toBeDefined();
  });
});
