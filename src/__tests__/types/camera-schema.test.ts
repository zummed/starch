import { describe, it, expect } from 'vitest';
import { CameraSchema } from '../../types/node';

describe('CameraSchema', () => {
  it('accepts target as [x, y]', () => {
    expect(CameraSchema.parse({ target: [100, 200] })).toEqual({ target: [100, 200] });
  });

  it('accepts target as node ID string', () => {
    expect(CameraSchema.parse({ target: 'box1' })).toEqual({ target: 'box1' });
  });

  it('accepts target as ["nodeId", dx, dy]', () => {
    expect(CameraSchema.parse({ target: ['box1', 10, -5] })).toEqual({ target: ['box1', 10, -5] });
  });

  it('accepts zoom', () => {
    expect(CameraSchema.parse({ zoom: 2 })).toEqual({ zoom: 2 });
  });

  it('rejects negative zoom', () => {
    expect(() => CameraSchema.parse({ zoom: -1 })).toThrow();
  });

  it('accepts fit as array of IDs', () => {
    expect(CameraSchema.parse({ fit: ['a', 'b'] })).toEqual({ fit: ['a', 'b'] });
  });

  it('accepts fit as "all"', () => {
    expect(CameraSchema.parse({ fit: 'all' })).toEqual({ fit: 'all' });
  });

  it('accepts ratio', () => {
    expect(CameraSchema.parse({ ratio: 16 / 9 })).toEqual({ ratio: 16 / 9 });
  });

  it('accepts active boolean', () => {
    expect(CameraSchema.parse({ active: false })).toEqual({ active: false });
  });

  it('accepts all properties together', () => {
    const cam = { target: 'box1', zoom: 2, fit: ['a'], ratio: 2.35, active: true };
    expect(CameraSchema.parse(cam)).toEqual(cam);
  });

  it('accepts empty object', () => {
    expect(CameraSchema.parse({})).toEqual({});
  });
});
