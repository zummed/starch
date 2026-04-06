import { describe, it, expect } from 'vitest';
import { CameraSchema } from '../../types/node';

describe('CameraSchema', () => {
  it('accepts look as [x, y] coordinates', () => {
    expect(CameraSchema.parse({ look: [100, 200] })).toEqual({ look: [100, 200] });
  });

  it('accepts look as node ID string (target)', () => {
    expect(CameraSchema.parse({ look: 'box1' })).toEqual({ look: 'box1' });
  });

  it('accepts look as ["nodeId", dx, dy] offset', () => {
    expect(CameraSchema.parse({ look: ['box1', 10, -5] })).toEqual({ look: ['box1', 10, -5] });
  });

  it('accepts look as "all" (fit all)', () => {
    expect(CameraSchema.parse({ look: 'all' })).toEqual({ look: 'all' });
  });

  it('accepts look as array of IDs (fit)', () => {
    expect(CameraSchema.parse({ look: ['a', 'b'] })).toEqual({ look: ['a', 'b'] });
  });

  it('accepts zoom', () => {
    expect(CameraSchema.parse({ zoom: 2 })).toEqual({ zoom: 2 });
  });

  it('rejects negative zoom', () => {
    expect(() => CameraSchema.parse({ zoom: -1 })).toThrow();
  });

  it('accepts ratio', () => {
    expect(CameraSchema.parse({ ratio: 16 / 9 })).toEqual({ ratio: 16 / 9 });
  });

  it('accepts active boolean', () => {
    expect(CameraSchema.parse({ active: false })).toEqual({ active: false });
  });

  it('accepts all properties together', () => {
    const cam = { look: 'box1', zoom: 2, ratio: 2.35, active: true };
    expect(CameraSchema.parse(cam)).toEqual(cam);
  });

  it('accepts empty object', () => {
    expect(CameraSchema.parse({})).toEqual({});
  });
});
