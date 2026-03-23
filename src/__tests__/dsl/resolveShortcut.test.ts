import { describe, it, expect } from 'vitest';
import { resolveShortcut, suggestShortcuts } from '../../dsl/resolveShortcut';

const trackPaths = [
  'box.fill.h', 'box.fill.s', 'box.fill.l',
  'box.stroke.h', 'box.stroke.s', 'box.stroke.l', 'box.stroke.width',
  'box.rect.w', 'box.rect.h',
  'box.transform.x', 'box.transform.y',
  'box.opacity',
  'cam.camera.zoom', 'cam.camera.look',
  'cam.transform.rotation',
  'card.title.text.size', 'card.title.text.content',
  'card.badge.fill.h', 'card.badge.fill.s', 'card.badge.fill.l',
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

    it('resolves box..width to box.stroke.width', () => {
      expect(resolveShortcut('box..width', trackPaths)).toBe('box.stroke.width');
    });

    it('resolves card..content to card.title.text.content', () => {
      expect(resolveShortcut('card..content', trackPaths)).toBe('card.title.text.content');
    });
  });

  describe('pass-through (no shortcut)', () => {
    it('returns box.fill.h unchanged when no .. present', () => {
      expect(resolveShortcut('box.fill.h', trackPaths)).toBe('box.fill.h');
    });

    it('returns cam.camera.zoom unchanged when no .. present', () => {
      expect(resolveShortcut('cam.camera.zoom', trackPaths)).toBe('cam.camera.zoom');
    });
  });

  describe('ambiguous shortcuts (should throw)', () => {
    it('throws for box..h (matches fill.h, stroke.h, rect.h)', () => {
      expect(() => resolveShortcut('box..h', trackPaths)).toThrow(/[Aa]mbiguous/);
    });

    it('throws error message listing all candidates for box..h', () => {
      expect(() => resolveShortcut('box..h', trackPaths)).toThrow('box..h');
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
    // box has ambiguous 'h' (fill.h, stroke.h, rect.h) — should not appear
    const suggestions = suggestShortcuts('box', trackPaths);
    const ambiguousShorts = suggestions.filter(s => s.short === 'box..h');
    expect(ambiguousShorts).toHaveLength(0);
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
