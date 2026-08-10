/**
 * Stage 3d: slot expansion computes a whole-scene layout solve at every
 * keyframe time a `.layout.slot` track changes, instead of solving each
 * mover's placement independently. All tests go through the real DSL
 * parser and buildTimeline, exercising the actual pipeline end to end.
 */
import { describe, it, expect } from 'vitest';
import { parseScene } from '../../parser/parser';
import { buildTimeline } from '../../animation/timeline';

describe('slot expansion — whole-scene solve per keyframe time', () => {
  it('two movers entering the same grid container at different times land in different cells', () => {
    const dsl = `objects
  board: rect 200x100
    layout grid columns=2 gap=0 padding=0
  m1: rect 100x100 fill steelblue at 0,300
  m2: rect 100x100 fill crimson at 0,400

animate 6
  2 m1.layout.slot: board
  4 m2.layout.slot: board`;
    const scene = parseScene(dsl);
    const { tracks } = buildTimeline(scene.animate!, scene.nodes);

    const m1x = tracks.get('m1.transform.x')!;
    const m2x = tracks.get('m2.transform.x')!;
    const m1AtEnd = m1x[m1x.length - 1].value;
    const m2AtEnd = m2x[m2x.length - 1].value;
    expect(m1AtEnd).not.toBe(m2AtEnd);
    // Two columns, 200px wide, no gap/padding: cells center on -50 and 50.
    expect(m1AtEnd).toBeCloseTo(-50);
    expect(m2AtEnd).toBeCloseTo(50);
  });

  it('sibling reflow: the remaining flex member gets interpolating keyframes, not a snap', () => {
    const dsl = `objects
  row: rect 300x50
    layout flex row gap=0 padding=0
  row2: rect 300x50
    layout flex row gap=0 padding=0
  a: rect 100x50 layout slot=row
  b: rect 100x50 layout slot=row

animate 4
  2 a.layout.slot: row2`;
    const scene = parseScene(dsl);
    const { tracks } = buildTimeline(scene.animate!, scene.nodes);

    const bx = tracks.get('b.transform.x')!;
    // "b" reflows from sharing the row with "a" to being its sole member —
    // a genuine, interpolatable position change, not a render-time snap.
    expect(bx.length).toBeGreaterThanOrEqual(2);
    const values = new Set(bx.map(kf => kf.value));
    expect(values.size).toBeGreaterThan(1);
  });

  it('a mover joining a grid adopts the cell size (rect.w/h keyframes)', () => {
    const dsl = `objects
  board: rect 200x100
    layout grid columns=2 gap=0 padding=0
  mover: rect 40x40 at 0,300

animate 4
  2 mover.layout.slot: board`;
    const scene = parseScene(dsl);
    const { tracks } = buildTimeline(scene.animate!, scene.nodes);

    const w = tracks.get('mover.rect.w')!;
    const h = tracks.get('mover.rect.h')!;
    expect(w[0].value).toBe(40);
    expect(w[w.length - 1].value).toBe(100); // grid cell width (200/2 columns)
    expect(h[0].value).toBe(40);
    expect(h[h.length - 1].value).toBe(100);
  });

  it('a free node slotted at t=2 lerps from its authored position and holds before its first affected time', () => {
    const dsl = `objects
  board: rect 200x100
    layout grid columns=2 gap=0 padding=0
  mover: rect 40x40 at 500,500

animate 4
  2 mover.layout.slot: board`;
    const scene = parseScene(dsl);
    const { tracks } = buildTimeline(scene.animate!, scene.nodes);

    const x = tracks.get('mover.transform.x')!;
    const y = tracks.get('mover.transform.y')!;
    // Authored position held at (and before) t=0 — no free→slotted teleport.
    expect(x[0]).toEqual({ time: 0, value: 500, easing: 'linear' });
    expect(y[0]).toEqual({ time: 0, value: 500, easing: 'linear' });
    // Lands in the grid cell by t=2.
    expect(x[x.length - 1].value).toBeCloseTo(-50);
    expect(y[y.length - 1].value).toBeCloseTo(0);
  });

  it('container size tracks are sorted, deduped, and account for both movers', () => {
    const dsl = `objects
  board:
    layout grid columns=1 gap=0 padding=0
  m1: rect 50x50 at 0,300
  m2: rect 50x50 at 0,400

animate 4
  2 m1.layout.slot: board
  4 m2.layout.slot: board`;
    const scene = parseScene(dsl);
    const { tracks } = buildTimeline(scene.animate!, scene.nodes);

    const h = tracks.get('board.rect.h')!;
    const times = h.map(kf => kf.time);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(new Set(times).size).toBe(times.length); // deduped

    // 1 column: one member -> one row (50px); two members -> two rows (100px).
    const atTwoMembers = h.find(kf => kf.time === 4)!;
    expect(atTwoMembers.value).toBeCloseTo(100);
  });

  it('an auto-sized container occupied at t=0 re-auto-sizes when a mover joins later', () => {
    // "col" has no authored rect, so the base solve bakes its t=0 auto-size
    // (one 50px member) into baseNodes. The per-time solves must restore the
    // authored (absent) rect before solving — otherwise every strategy
    // treats the baked rect as an explicit fixed size and the container
    // never expands for the mover (the flex-slot sample regression).
    const dsl = `objects
  col:
    layout flex column gap=0 padding=0
    a: rect 50x50
  m: rect 50x50 at 300,0

animate 2
  2 m.layout.slot: col`;
    const scene = parseScene(dsl);
    const { tracks } = buildTimeline(scene.animate!, scene.nodes);

    const h = tracks.get('col.rect.h')!;
    expect(h.find(kf => kf.time === 0)!.value).toBeCloseTo(50);
    expect(h.find(kf => kf.time === 2)!.value).toBeCloseTo(100);

    // The sitting member shifts to keep the grown container centered.
    const ay = tracks.get('col.a.transform.y')!;
    expect(ay.find(kf => kf.time === 0)!.value).toBeCloseTo(0);
    expect(ay.find(kf => kf.time === 2)!.value).toBeCloseTo(-25);
  });

  it('a completely static layout scene (no slot tracks) leaves tracks untouched', () => {
    const dsl = `objects
  board: rect 200x100
    layout grid columns=2 gap=0 padding=0
    m1: rect 50x50
    m2: rect 50x50

animate 2
  1 m1.fill: red`;
    const scene = parseScene(dsl);
    const { tracks, layoutAnimatedNodeIds } = buildTimeline(scene.animate!, scene.nodes);
    expect(layoutAnimatedNodeIds.size).toBe(0);
    expect(tracks.has('m1.transform.x')).toBe(false);
    expect(tracks.has('board.rect.w')).toBe(false);
  });

  // ── Stage 7: layout solves at build time ──────────────────────────

  it('animating a flex child\'s rect.w emits system tracks that reflow its siblings', () => {
    // "row" is 300 wide, start-justified, no gap/padding: a(50) b(50) c(50)
    // pack left to right. Growing b from 50 to 100 pushes only c (a is
    // upstream of b on the main axis, so it doesn't move).
    const dsl = `objects
  row: rect 300x50 layout flex row gap=0 padding=0 at 0,0
    a: rect 50x50
    b: rect 50x50
    c: rect 50x50

animate 2
  2 row.b.rect.w: 100`;
    const scene = parseScene(dsl);
    const { tracks, warnings } = buildTimeline(scene.animate!, scene.nodes);
    expect(warnings).toEqual([]);

    const ax = tracks.get('row.a.transform.x')!;
    const bx = tracks.get('row.b.transform.x')!;
    const cx = tracks.get('row.c.transform.x')!;

    // a: unaffected — nothing upstream of it changed.
    expect(ax).toEqual([
      { time: 0, value: -125, easing: 'linear' },
      { time: 2, value: -125, easing: 'linear' },
    ]);
    // b: grows in place (its own left edge is unaffected by its own width).
    expect(bx).toEqual([
      { time: 0, value: -75, easing: 'linear' },
      { time: 2, value: -50, easing: 'linear' },
    ]);
    // c: reflows downstream of b's growth — a real, interpolatable move.
    expect(cx).toEqual([
      { time: 0, value: -25, easing: 'linear' },
      { time: 2, value: 25, easing: 'linear' },
    ]);
  });

  it('an authored transform.x track on a static flex child is dropped with a warning', () => {
    const dsl = `objects
  row: rect 300x50 layout flex row gap=0 padding=0 at 0,0
    a: rect 50x50
    b: rect 50x50

animate 2
  2 row.a.transform.x: 999`;
    const scene = parseScene(dsl);
    const { tracks, warnings } = buildTimeline(scene.animate!, scene.nodes);

    expect(tracks.has('row.a.transform.x')).toBe(false);
    expect(warnings).toEqual([
      'Track "row.a.transform.x" has no effect — "a" is positioned by the "flex" layout of "row"',
    ]);
  });

  it("buildTimeline's baseNodes has the flex solve applied, but the input tree is left unmutated", () => {
    const dsl = `objects
  row: rect 300x50 layout flex row gap=0 padding=0 at 0,0
    a: rect 50x50
    b: rect 50x50`;
    const scene = parseScene(dsl);
    const { baseNodes } = buildTimeline(scene.animate ?? { duration: 5, loop: true, keyframes: [] }, scene.nodes);

    const inputA = scene.nodes[0].children.find(c => c.id === 'a')!;
    expect(inputA.transform).toBeUndefined();

    const baseA = baseNodes[0].children.find(c => c.id === 'a')!;
    expect(baseA.transform).toEqual({ x: -125, y: 0 });
  });
});
