import { describe, it, expect } from 'vitest';
import { DslBuilder } from '../../editor/dslBuilder';

describe('DslBuilder', () => {
  it('tracks offset through plain writes', () => {
    const b = new DslBuilder('node');
    b.write('hello ');
    b.write('world');
    const result = b.build();
    expect(result.text).toBe('hello world');
    expect(result.spans).toEqual([]);
  });

  it('records spans with correct offsets', () => {
    const b = new DslBuilder('node');
    b.write('box: rect ');
    b.writeSpan('140', 'rect.w', 'objects.box.rect.w');
    b.write('x');
    b.writeSpan('80', 'rect.h', 'objects.box.rect.h');
    const result = b.build();
    expect(result.text).toBe('box: rect 140x80');
    expect(result.spans).toEqual([
      { from: 10, to: 13, schemaPath: 'rect.w', modelPath: 'objects.box.rect.w', section: 'node' },
      { from: 14, to: 16, schemaPath: 'rect.h', modelPath: 'objects.box.rect.h', section: 'node' },
    ]);
  });

  it('handles newlines in offset tracking', () => {
    const b = new DslBuilder('node');
    b.write('line1\n  ');
    b.writeSpan('value', 'fill', 'objects.box.fill');
    const result = b.build();
    expect(result.spans[0].from).toBe(8);
    expect(result.spans[0].to).toBe(13);
  });

  it('supports section override per span', () => {
    const b = new DslBuilder('animate');
    b.writeSpan('2s', 'duration', 'animate.duration');
    const result = b.build();
    expect(result.spans[0].section).toBe('animate');
  });
});
