/**
 * Animating the parts inside a template.
 *
 * Template parts carry ids already qualified by their parent (a box named
 * `c1` builds `c1.bg`), which used to be prefixed a second time on the way
 * out — so the paths the parser advertised (`c1.c1.bg.fill`) and the path an
 * author would reasonably write (`c1.bg.fill`) both resolved to nothing, and
 * the animation silently did nothing.
 *
 * This is a round trip on purpose: a path is only useful if it is advertised,
 * resolves, and actually changes the node.
 */
import { describe, it, expect } from 'vitest';
import { parseScene } from '../../parser/parser';
import { buildTimeline } from '../../animation/timeline';
import { evaluateAllTracks } from '../../animation/evaluator';
import { applyTrackValues, resolveTrackPath } from '../../animation/applyTracks';

describe('template part animation', () => {
  it('advertises single-prefixed paths for template parts', () => {
    const scene = parseScene('c1: box "Hello" 100x50');
    expect(scene.trackPaths).toContain('c1.bg.fill');
    expect(scene.trackPaths).toContain('c1.label.fill');
    expect(scene.trackPaths.some(path => path.startsWith('c1.c1.'))).toBe(false);
  });

  it('resolves an advertised path back to the part it names', () => {
    const scene = parseScene('c1: box "Hello" 100x50');
    const resolved = resolveTrackPath(scene.nodes, 'c1.bg.fill');
    expect(resolved?.node.id).toBe('c1.bg');
    expect(resolved?.propPath).toEqual(['fill']);
  });

  it('applies an animated value to the part', () => {
    const scene = parseScene([
      'c1: box "Hello" 100x50',
      '',
      'animate 2',
      '  1 c1.bg.fill: red',
    ].join('\n'));

    const { tracks } = buildTimeline(scene.animate!, scene.nodes);
    expect(tracks.has('c1.bg.fill')).toBe(true);

    // Read mid-flight: the box's grey background is interpolating towards
    // red, so the hue has landed on red's and the saturation is climbing.
    // (At the final keyframe exactly, tracks yield the authored value
    // verbatim — a plain node animated the same way behaves identically.)
    const applied = applyTrackValues(scene.nodes, evaluateAllTracks(tracks, 0.5));
    const bg = applied[0].children.find(child => child.id === 'c1.bg');
    expect(bg?.fill).toMatchObject({ h: 0, s: 50, l: 33 });
  });
});
