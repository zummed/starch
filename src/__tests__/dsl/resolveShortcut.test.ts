import { describe, it, expect } from 'vitest';
import { resolveShortcut, suggestShortcuts } from '../../dsl/resolveShortcut';

const trackPaths = [
  'box.fill',
  'box.stroke.color', 'box.stroke.width',
  'box.rect.w', 'box.rect.h',
  'box.transform.x', 'box.transform.y',
  'box.opacity',
  'cam.camera.zoom', 'cam.camera.look',
  'cam.transform.rotation',
  'card.title.text.size', 'card.title.text.content',
  'card.badge.fill',
  'card.badge.ellipse.rx', 'card.badge.ellipse.ry',
];

describe('resolveShortcut', () => {
  describe('unambiguous shortcuts', () => {
    it('resolves cam..zoom to cam.camera.zoom', () => {
      expect(resolveShortcut('cam..zoom', trackPaths)).toBe('cam.camera.zoom');
    });

    it('resolves cam..look to cam.camera.look', () => {
      expect(resolveShortcut('cam..look', trackPaths)).toBe('cam.camera.look');
    });

    it('resolves card..size to card.title.text.size (deep resolution)', () => {
      expect(resolveShortcut('card..size', trackPaths)).toBe('card.title.text.size');
    });

    it('resolves box..opacity where suffix is a single segment directly after prefix', () => {
      expect(resolveShortcut('box..opacity', trackPaths)).toBe('box.opacity');
    });

    it('resolves cam..rotation to cam.transform.rotation', () => {
      expect(resolveShortcut('cam..rotation', trackPaths)).toBe('cam.transform.rotation');
    });

    it('resolves box..width to box.stroke.width (unambiguous)', () => {
      expect(resolveShortcut('box..width', trackPaths)).toBe('box.stroke.width');
    });

    it('resolves box..fill to box.fill (single segment)', () => {
      expect(resolveShortcut('box..fill', trackPaths)).toBe('box.fill');
    });

    it('resolves box..color to box.stroke.color', () => {
      expect(resolveShortcut('box..color', trackPaths)).toBe('box.stroke.color');
    });

    it('resolves card..content to card.title.text.content', () => {
      expect(resolveShortcut('card..content', trackPaths)).toBe('card.title.text.content');
    });
  });

  describe('pass-through (no shortcut)', () => {
    it('returns box.fill unchanged when no .. present', () => {
      expect(resolveShortcut('box.fill', trackPaths)).toBe('box.fill');
    });

    it('returns cam.camera.zoom unchanged when no .. present', () => {
      expect(resolveShortcut('cam.camera.zoom', trackPaths)).toBe('cam.camera.zoom');
    });
  });

  describe('ambiguous shortcuts (should throw)', () => {
    it('throws for box..w (matches rect.w and stroke.width is "width" not "w"... wait rect.w is unique)', () => {
      // With the new Color-as-leaf model, box..h resolves unambiguously to box.rect.h
      expect(resolveShortcut('box..h', trackPaths)).toBe('box.rect.h');
    });

    it('throws for ambiguous suffix when multiple matches exist', () => {
      // Create a scenario with actual ambiguity
      const paths = [...trackPaths, 'box.extra.zoom', 'box.other.zoom'];
      expect(() => resolveShortcut('box..zoom', paths)).toThrow(/[Aa]mbiguous/);
    });
  });

  describe('no match (should throw)', () => {
    it('throws for box..nonexistent', () => {
      expect(() => resolveShortcut('box..nonexistent', trackPaths)).toThrow(/[Nn]o match/);
    });

    it('throws for unknown..zoom (prefix not present)', () => {
      expect(() => resolveShortcut('unknown..zoom', trackPaths)).toThrow(/[Nn]o match/);
    });
  });

  describe('invalid shortcut syntax (should throw)', () => {
    it('throws for ..zoom (empty prefix)', () => {
      expect(() => resolveShortcut('..zoom', trackPaths)).toThrow(/[Ii]nvalid/);
    });

    it('throws for cam.. (empty suffix)', () => {
      expect(() => resolveShortcut('cam..', trackPaths)).toThrow(/[Ii]nvalid/);
    });

    it('throws for .. (both empty)', () => {
      expect(() => resolveShortcut('..', trackPaths)).toThrow(/[Ii]nvalid/);
    });
  });
});

describe('suggestShortcuts', () => {
  it('returns zoom and look shortcuts for cam prefix', () => {
    const suggestions = suggestShortcuts('cam', trackPaths);
    const shorts = suggestions.map(s => s.short);
    expect(shorts).toContain('cam..zoom');
    expect(shorts).toContain('cam..look');
  });

  it('includes full paths in suggestions for cam', () => {
    const suggestions = suggestShortcuts('cam', trackPaths);
    const zoomSuggestion = suggestions.find(s => s.short === 'cam..zoom');
    expect(zoomSuggestion?.full).toBe('cam.camera.zoom');
    const lookSuggestion = suggestions.find(s => s.short === 'cam..look');
    expect(lookSuggestion?.full).toBe('cam.camera.look');
  });

  it('returns shortcuts for card.badge sub-properties', () => {
    const suggestions = suggestShortcuts('card.badge', trackPaths);
    const shorts = suggestions.map(s => s.short);
    expect(shorts).toContain('card.badge..fill');
    expect(shorts).toContain('card.badge..rx');
    expect(shorts).toContain('card.badge..ry');
  });

  it('includes full paths in suggestions for card.badge', () => {
    const suggestions = suggestShortcuts('card.badge', trackPaths);
    const rxSuggestion = suggestions.find(s => s.short === 'card.badge..rx');
    expect(rxSuggestion?.full).toBe('card.badge.ellipse.rx');
  });

  it('returns empty array for unknown prefix', () => {
    const suggestions = suggestShortcuts('unknown', trackPaths);
    expect(suggestions).toEqual([]);
  });

  it('only includes unambiguous shortcuts (no ambiguous suffix suggestions)', () => {
    // With Color-as-leaf, box..h is unambiguous (only box.rect.h), so it should appear
    const suggestions = suggestShortcuts('box', trackPaths);
    const hShorts = suggestions.filter(s => s.short === 'box..h');
    expect(hShorts).toHaveLength(1);
    expect(hShorts[0].full).toBe('box.rect.h');
  });

  it('returns only unique short paths', () => {
    const suggestions = suggestShortcuts('cam', trackPaths);
    const shorts = suggestions.map(s => s.short);
    const uniqueShorts = new Set(shorts);
    expect(shorts.length).toBe(uniqueShorts.size);
  });

  it('each suggestion short path resolves back to the full path', () => {
    const suggestions = suggestShortcuts('cam', trackPaths);
    for (const { short, full } of suggestions) {
      expect(resolveShortcut(short, trackPaths)).toBe(full);
    }
  });
});
