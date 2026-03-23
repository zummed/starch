import { describe, it, expect } from 'vitest';
import { resolveDslClick, applyDslPopupChange, type DslClickTarget } from '../../editor/dslClickTarget';

// ─── Helper ──────────────────────────────────────────────────────

/** Place cursor at the `|` position and call resolveDslClick */
function click(text: string) {
  const pos = text.indexOf('|');
  if (pos === -1) throw new Error('Test text must contain | as cursor marker');
  const cleaned = text.replace('|', '');
  return { target: resolveDslClick(cleaned, pos), doc: cleaned, pos };
}

// ─── resolveDslClick ─────────────────────────────────────────────

describe('resolveDslClick', () => {
  const LINE = 'box: rect 140x80 radius=8 fill 210 70 45 stroke 210 80 30 width=2 at 200,150';

  describe('dimensions (NxN)', () => {
    it('clicking on 140 (first half) resolves to rect.w', () => {
      const { target } = click('box: rect 1|40x80 radius=8 fill 210 70 45 stroke 210 80 30 width=2 at 200,150');
      expect(target).not.toBeNull();
      expect(target!.kind).toBe('dimension');
      expect(target!.schemaPath).toBe('rect.w');
      expect(target!.value).toBe(140);
      expect(target!.dimHalf).toBe('w');
    });

    it('clicking on 80 (second half) resolves to rect.h', () => {
      const { target } = click('box: rect 140x8|0 radius=8 fill 210 70 45 stroke 210 80 30 width=2 at 200,150');
      expect(target).not.toBeNull();
      expect(target!.kind).toBe('dimension');
      expect(target!.schemaPath).toBe('rect.h');
      expect(target!.value).toBe(80);
      expect(target!.dimHalf).toBe('h');
    });

    it('ellipse dimensions map to rx/ry', () => {
      const { target } = click('dot: ellipse 5|0x30 at 100,100');
      expect(target).not.toBeNull();
      expect(target!.kind).toBe('dimension');
      expect(target!.schemaPath).toBe('ellipse.rx');
      expect(target!.value).toBe(50);
    });

    it('image dimensions map to image.w/image.h', () => {
      const { target } = click('pic: image 200x15|0 src=photo.png');
      expect(target).not.toBeNull();
      expect(target!.kind).toBe('dimension');
      expect(target!.schemaPath).toBe('image.h');
      expect(target!.value).toBe(150);
    });
  });

  describe('HSL components', () => {
    it('clicking on 210 after fill resolves to fill.h', () => {
      const { target } = click('box: rect 140x80 radius=8 fill 2|10 70 45 stroke 210 80 30 width=2 at 200,150');
      expect(target).not.toBeNull();
      expect(target!.kind).toBe('hsl-component');
      expect(target!.schemaPath).toBe('fill.h');
      expect(target!.value).toBe(210);
    });

    it('clicking on 70 after fill resolves to fill.s', () => {
      const { target } = click('box: rect 140x80 radius=8 fill 210 7|0 45 stroke 210 80 30 width=2 at 200,150');
      expect(target).not.toBeNull();
      expect(target!.kind).toBe('hsl-component');
      expect(target!.schemaPath).toBe('fill.s');
      expect(target!.value).toBe(70);
    });

    it('clicking on 45 after fill resolves to fill.l', () => {
      const { target } = click('box: rect 140x80 radius=8 fill 210 70 4|5 stroke 210 80 30 width=2 at 200,150');
      expect(target).not.toBeNull();
      expect(target!.kind).toBe('hsl-component');
      expect(target!.schemaPath).toBe('fill.l');
      expect(target!.value).toBe(45);
    });

    it('clicking on 210 after stroke resolves to stroke.h', () => {
      const { target } = click('box: rect 140x80 radius=8 fill 210 70 45 stroke 2|10 80 30 width=2 at 200,150');
      expect(target).not.toBeNull();
      expect(target!.kind).toBe('hsl-component');
      expect(target!.schemaPath).toBe('stroke.h');
      expect(target!.value).toBe(210);
    });
  });

  describe('color compound (fill/stroke keyword)', () => {
    it('clicking on fill keyword resolves to color-compound', () => {
      const { target } = click('box: rect 140x80 radius=8 fi|ll 210 70 45 stroke 210 80 30 width=2 at 200,150');
      expect(target).not.toBeNull();
      expect(target!.kind).toBe('color-compound');
      expect(target!.schemaPath).toBe('fill');
      expect(target!.value).toEqual({ h: 210, s: 70, l: 45 });
    });

    it('clicking on stroke keyword resolves to color-compound', () => {
      const { target } = click('box: rect 140x80 radius=8 fill 210 70 45 stro|ke 210 80 30 width=2 at 200,150');
      expect(target).not.toBeNull();
      expect(target!.kind).toBe('color-compound');
      expect(target!.schemaPath).toBe('stroke');
      expect(target!.value).toEqual({ h: 210, s: 80, l: 30 });
    });
  });

  describe('key=value', () => {
    it('clicking on 8 in radius=8 resolves to rect.radius', () => {
      const { target } = click('box: rect 140x80 radius=|8 fill 210 70 45 stroke 210 80 30 width=2 at 200,150');
      expect(target).not.toBeNull();
      expect(target!.kind).toBe('key-value');
      expect(target!.schemaPath).toBe('rect.radius');
      expect(target!.value).toBe(8);
    });

    it('clicking on 2 in width=2 resolves to stroke.width', () => {
      const { target } = click('box: rect 140x80 radius=8 fill 210 70 45 stroke 210 80 30 width=|2 at 200,150');
      expect(target).not.toBeNull();
      expect(target!.kind).toBe('key-value');
      expect(target!.schemaPath).toBe('stroke.width');
      expect(target!.value).toBe(2);
    });

    it('clicking on key part (before =) also targets the value', () => {
      const { target } = click('box: rect 140x80 rad|ius=8 fill 210 70 45');
      expect(target).not.toBeNull();
      expect(target!.kind).toBe('key-value');
      expect(target!.schemaPath).toBe('rect.radius');
      expect(target!.value).toBe(8);
    });

    it('clicking on size= in text node resolves to text.size', () => {
      const { target } = click('label: text size=2|4 "Hello"');
      expect(target).not.toBeNull();
      expect(target!.kind).toBe('key-value');
      expect(target!.schemaPath).toBe('text.size');
      expect(target!.value).toBe(24);
    });
  });

  describe('at-coordinate', () => {
    it('clicking on 200 in at 200,150 resolves to transform.x', () => {
      const { target } = click('box: rect 140x80 radius=8 fill 210 70 45 stroke 210 80 30 width=2 at 2|00,150');
      expect(target).not.toBeNull();
      expect(target!.kind).toBe('at-coordinate');
      expect(target!.schemaPath).toBe('transform.x');
      expect(target!.value).toBe(200);
    });

    it('clicking on 150 in at 200,150 resolves to transform.y', () => {
      const { target } = click('box: rect 140x80 radius=8 fill 210 70 45 stroke 210 80 30 width=2 at 200,1|50');
      expect(target).not.toBeNull();
      expect(target!.kind).toBe('at-coordinate');
      expect(target!.schemaPath).toBe('transform.y');
      expect(target!.value).toBe(150);
    });

    it('handles negative coordinates', () => {
      const { target } = click('box: rect 100x50 at -5|0,200');
      expect(target).not.toBeNull();
      expect(target!.kind).toBe('at-coordinate');
      expect(target!.schemaPath).toBe('transform.x');
      expect(target!.value).toBe(-50);
    });

    it('handles at y=-20 partial form', () => {
      const { target } = click('box: rect 100x50 at y=-2|0');
      expect(target).not.toBeNull();
      expect(target!.kind).toBe('at-coordinate');
      expect(target!.schemaPath).toBe('transform.y');
      expect(target!.value).toBe(-20);
    });
  });

  describe('null cases', () => {
    it('clicking on rect keyword returns null', () => {
      const { target } = click('box: re|ct 140x80 radius=8 fill 210 70 45');
      expect(target).toBeNull();
    });

    it('clicking on at keyword returns null', () => {
      const { target } = click('box: rect 140x80 a|t 200,150');
      expect(target).toBeNull();
    });

    it('clicking on node id returns null', () => {
      const { target } = click('bo|x: rect 140x80');
      expect(target).toBeNull();
    });
  });

  describe('multi-line DSL', () => {
    it('clicking on fill hue in block mode resolves correctly', () => {
      const doc = 'card: rect 160x100 at 200,150\n  fill 2|10 70 45\n  stroke 210 80 30 width=2';
      const { target } = click(doc);
      expect(target).not.toBeNull();
      expect(target!.kind).toBe('hsl-component');
      expect(target!.schemaPath).toBe('fill.h');
      expect(target!.value).toBe(210);
    });

    it('clicking on stroke width in block mode resolves correctly', () => {
      const doc = 'card: rect 160x100 at 200,150\n  fill 210 70 45\n  stroke 210 80 30 width=|2';
      const { target } = click(doc);
      expect(target).not.toBeNull();
      expect(target!.kind).toBe('key-value');
      expect(target!.schemaPath).toBe('stroke.width');
      expect(target!.value).toBe(2);
    });

    it('clicking on dimensions in block mode header resolves correctly', () => {
      const doc = 'card: rect 16|0x100 at 200,150\n  fill 210 70 45';
      const { target } = click(doc);
      expect(target).not.toBeNull();
      expect(target!.kind).toBe('dimension');
      expect(target!.schemaPath).toBe('rect.w');
      expect(target!.value).toBe(160);
    });
  });

  describe('named colors', () => {
    it('clicking on fill white resolves as color-compound with HSL', () => {
      const { target } = click('box: rect 100x50 fill whi|te');
      expect(target).not.toBeNull();
      expect(target!.kind).toBe('color-compound');
      expect(target!.schemaPath).toBe('fill');
      expect(target!.value).toEqual({ h: 0, s: 0, l: 100 });
    });

    it('clicking on fill keyword before named color opens compound', () => {
      const { target } = click('box: rect 100x50 fi|ll white');
      expect(target).not.toBeNull();
      expect(target!.kind).toBe('color-compound');
      expect(target!.schemaPath).toBe('fill');
      expect(target!.value).toEqual({ h: 0, s: 0, l: 100 });
    });
  });

  describe('boolean keywords', () => {
    it('clicking on bold resolves to text.bold', () => {
      const { target } = click('label: text size=16 bo|ld "Hello"');
      expect(target).not.toBeNull();
      expect(target!.kind).toBe('boolean');
      expect(target!.schemaPath).toBe('text.bold');
      expect(target!.value).toBe(true);
    });

    it('clicking on closed resolves to path.closed', () => {
      const { target } = click('shape: path clos|ed a -> b -> c');
      expect(target).not.toBeNull();
      expect(target!.kind).toBe('boolean');
      expect(target!.schemaPath).toBe('path.closed');
      expect(target!.value).toBe(true);
    });
  });
});

// ─── applyDslPopupChange ─────────────────────────────────────────

describe('applyDslPopupChange', () => {
  const LINE = 'box: rect 140x80 radius=8 fill 210 70 45 stroke 210 80 30 width=2 at 200,150';

  it('changes dimension w from 140 to 200', () => {
    const target = resolveDslClick(LINE, LINE.indexOf('140') + 1)!;
    expect(target.kind).toBe('dimension');
    const result = applyDslPopupChange(LINE, target, 200);
    expect(result).toContain('rect 200x80');
    expect(result).not.toContain('140');
  });

  it('changes dimension h from 80 to 120', () => {
    const target = resolveDslClick(LINE, LINE.indexOf('x80') + 2)!;
    expect(target.kind).toBe('dimension');
    const result = applyDslPopupChange(LINE, target, 120);
    expect(result).toContain('rect 140x120');
    expect(result).not.toContain('x80');
  });

  it('changes fill.h from 210 to 180', () => {
    // Get the first 210 after "fill"
    const fillIdx = LINE.indexOf('fill ');
    const hIdx = LINE.indexOf('210', fillIdx);
    const target = resolveDslClick(LINE, hIdx + 1)!;
    expect(target.kind).toBe('hsl-component');
    expect(target.schemaPath).toBe('fill.h');
    const result = applyDslPopupChange(LINE, target, 180);
    expect(result).toContain('fill 180 70 45');
  });

  it('changes fill compound to new HSL', () => {
    const fillIdx = LINE.indexOf('fill');
    const target = resolveDslClick(LINE, fillIdx + 2)!;
    expect(target.kind).toBe('color-compound');
    const result = applyDslPopupChange(LINE, target, { h: 0, s: 100, l: 50 });
    expect(result).toContain('fill 0 100 50');
  });

  it('changes radius from 8 to 12', () => {
    const target = resolveDslClick(LINE, LINE.indexOf('=8') + 1)!;
    expect(target.kind).toBe('key-value');
    const result = applyDslPopupChange(LINE, target, 12);
    expect(result).toContain('radius=12');
    expect(result).not.toContain('radius=8');
  });

  it('changes at-x from 200 to 300', () => {
    const atIdx = LINE.indexOf('at ');
    const xIdx = LINE.indexOf('200', atIdx);
    const target = resolveDslClick(LINE, xIdx + 1)!;
    expect(target.kind).toBe('at-coordinate');
    expect(target.schemaPath).toBe('transform.x');
    const result = applyDslPopupChange(LINE, target, 300);
    expect(result).toContain('at 300,150');
  });

  it('changes stroke.width from 2 to 4', () => {
    const target = resolveDslClick(LINE, LINE.indexOf('width=2') + 6)!;
    expect(target.kind).toBe('key-value');
    expect(target.schemaPath).toBe('stroke.width');
    const result = applyDslPopupChange(LINE, target, 4);
    expect(result).toContain('width=4');
  });

  it('replaces named color with HSL numbers', () => {
    const doc = 'box: rect 100x50 fill white';
    const target = resolveDslClick(doc, doc.indexOf('white') + 2)!;
    expect(target.kind).toBe('color-compound');
    const result = applyDslPopupChange(doc, target, { h: 210, s: 80, l: 50 });
    expect(result).toContain('fill 210 80 50');
    expect(result).not.toContain('white');
  });

  it('preserves other parts of the document when changing a value', () => {
    const doc = 'box: rect 140x80 radius=8 fill 210 70 45 at 200,150\nlabel: text size=16 "Hello"';
    const target = resolveDslClick(doc, doc.indexOf('radius=8') + 7)!;
    const result = applyDslPopupChange(doc, target, 12);
    expect(result).toContain('radius=12');
    expect(result).toContain('label: text size=16 "Hello"');
  });
});
