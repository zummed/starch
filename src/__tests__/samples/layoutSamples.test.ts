/**
 * Stage 5: pipeline smoke test for every Layout-category sample. This is
 * the missing test that let two broken samples ship — grid-layout and
 * circular-layout animated bare nested ids ("n1.opacity") instead of
 * root-qualified paths ("ring.n1.opacity"), which silently failed to
 * resolve (resolveTrackPath only matches a nested id once its full
 * root-to-node chain is walked) and produced buildTimeline warnings that
 * nothing asserted against.
 *
 * Runs the real production pipeline exactly as StarchDiagram does:
 * parseScene → buildTimeline (layout solved once, into baseNodes) →
 * (per time) evaluateAllTracks → applyTrackValues over baseNodes. No
 * render-time runLayout — proving the baked pipeline equals the old
 * per-frame one is exactly what these coordinate assertions are for.
 */
import { describe, it, expect } from 'vitest';
import { parseScene } from '../../parser/parser';
import { buildTimeline } from '../../animation/timeline';
import { evaluateAllTracks } from '../../animation/evaluator';
import { applyTrackValues } from '../../animation/applyTracks';
import { findNode } from '../../layout';
import { v2Samples, getV2SamplesByCategory } from '../../samples';
import type { Node } from '../../types/node';
import type { AnimConfig } from '../../types/animation';

function getSample(name: string) {
  const sample = v2Samples.find(s => s.name === name);
  if (!sample) throw new Error(`sample "${name}" not found`);
  return sample;
}

/** Run the real pipeline for a sample's DSL, mirroring StarchDiagram._rebuild/_render. */
function runPipeline(dsl: string) {
  const scene = parseScene(dsl);
  const animConfig: AnimConfig = scene.animate ?? { duration: 5, loop: true, keyframes: [] };
  const { tracks, warnings, baseNodes, layoutAnimatedNodeIds } = buildTimeline(animConfig, scene.nodes);
  const duration = animConfig.duration ?? 5;

  function evaluateAt(t: number): Node[] {
    const values = evaluateAllTracks(tracks, t);
    return applyTrackValues(baseNodes, values);
  }

  return { scene, tracks, warnings, layoutAnimatedNodeIds, duration, evaluateAt };
}

/** Every node carrying rect/ellipse geometry, anywhere in the tree. */
function collectGeometryNodes(nodes: Node[]): Node[] {
  const out: Node[] = [];
  for (const n of nodes) {
    if (n.rect || n.ellipse) out.push(n);
    out.push(...collectGeometryNodes(n.children));
  }
  return out;
}

// Node['transform'] is typed as TransformInput (schema input, x/y optional)
// even though runLayout always resolves concrete numbers — these narrow it
// for the arithmetic below.
function xOf(node: Node): number { return node.transform!.x!; }
function yOf(node: Node): number { return node.transform!.y!; }

describe('Layout samples — real pipeline smoke test', () => {
  const layoutSamples = getV2SamplesByCategory('Layout');

  it('has Layout-category samples to test', () => {
    expect(layoutSamples.length).toBeGreaterThan(0);
  });

  for (const sample of layoutSamples) {
    it(`${sample.name}: no warnings, finite geometry at t=0/mid/end`, () => {
      const { scene, warnings, duration, evaluateAt } = runPipeline(sample.dsl);
      expect(scene.warnings).toEqual([]); // misapplied layout props (parse-time)
      expect(warnings).toEqual([]); // timeline warnings (build-time)

      for (const t of [0, duration / 2, duration]) {
        const animated = evaluateAt(t);
        for (const node of collectGeometryNodes(animated)) {
          expect(Number.isFinite(node.transform?.x)).toBe(true);
          expect(Number.isFinite(node.transform?.y)).toBe(true);
        }
      }
    });
  }
});

describe('flex-layout — gap-spaced centered row + grow distribution', () => {
  it('row children are spaced by gap and centered in the container', () => {
    const { evaluateAt } = runPipeline(getSample('flex-layout').dsl);
    const animated = evaluateAt(0);

    const a = findNode(animated, 'a')!;
    const b = findNode(animated, 'b')!;
    const c = findNode(animated, 'c')!;

    // Gap-spaced: each step is child width (80) + gap (10) = 90.
    expect(xOf(b) - xOf(a)).toBeCloseTo(90);
    expect(xOf(c) - xOf(b)).toBeCloseTo(90);
    // justify=center puts the middle child on the container's main-axis center.
    expect(xOf(b)).toBeCloseTo(0);
    // align=center puts every child on the container's cross-axis center.
    expect(yOf(a)).toBeCloseTo(0);
    expect(yOf(b)).toBeCloseTo(0);
    expect(yOf(c)).toBeCloseTo(0);
  });

  it('the grow child absorbs the row\'s extra space', () => {
    const { evaluateAt } = runPipeline(getSample('flex-layout').dsl);
    const animated = evaluateAt(0);

    const fixed = findNode(animated, 'fixed')!;
    const grows = findNode(animated, 'grows')!;
    expect(grows.rect!.w).toBeGreaterThan(fixed.rect!.w);
  });

  it('the gap breathes apart and the fixed child\'s width reflow leaves the row\'s other fixed child in place', () => {
    const { evaluateAt } = runPipeline(getSample('flex-layout').dsl);
    const at0 = evaluateAt(0);
    const at3 = evaluateAt(3);

    // row.layout.gap: 10 -> 60 re-spaces the centered row at its wider gap.
    expect(xOf(findNode(at3, 'a')!)).toBeCloseTo(-140);
    expect(xOf(findNode(at3, 'c')!)).toBeCloseTo(140);
    expect(xOf(findNode(at3, 'b')!)).toBeCloseTo(0);

    // growRow.fixed.rect.w: 60 -> 180 eats into the grow child's share.
    const growsAt0 = findNode(at0, 'grows')!;
    const growsAt3 = findNode(at3, 'grows')!;
    expect(growsAt3.rect!.w).toBeLessThan(growsAt0.rect!.w);

    // fixed2 is unaffected: grow absorbs the whole change on its own.
    const fixed2At0 = findNode(at0, 'fixed2')!;
    const fixed2At3 = findNode(at3, 'fixed2')!;
    expect(xOf(fixed2At3)).toBeCloseTo(xOf(fixed2At0));
  });
});

describe('flex-slot — mover animates between two flex columns', () => {
  it('mover moves at the slot keyframe while other members stay valid throughout', () => {
    const { evaluateAt, duration } = runPipeline(getSample('flex-slot').dsl);

    const moverStart = findNode(evaluateAt(0), 'mover')!;
    const moverAtSlot = findNode(evaluateAt(2), 'mover')!;
    expect(xOf(moverAtSlot)).not.toBeCloseTo(xOf(moverStart), 0);

    for (const t of [0, 1, 2, 3, duration]) {
      const animated = evaluateAt(t);
      for (const id of ['itemA', 'itemB', 'mover']) {
        const node = findNode(animated, id)!;
        expect(Number.isFinite(node.transform!.x)).toBe(true);
        expect(Number.isFinite(node.transform!.y)).toBe(true);
      }
    }
  });

  it('the receiving column expands to hold the mover and the source column shrinks', () => {
    // Both columns are auto-sized (no authored rect): 2 members = 88 high
    // (2x30 + gap 8 + padding 20), 1 member = 50. The regression this pins:
    // the base solve's t=0 sizes got baked into baseNodes and the per-time
    // solves treated them as explicit fixed sizes, so "right" never grew.
    const { evaluateAt } = runPipeline(getSample('flex-slot').dsl);

    const at0 = evaluateAt(0);
    expect(findNode(at0, 'left')!.rect!.h).toBeCloseTo(88);
    expect(findNode(at0, 'right')!.rect!.h).toBeCloseTo(50);

    const at2 = evaluateAt(2);
    expect(findNode(at2, 'left')!.rect!.h).toBeCloseTo(50);
    expect(findNode(at2, 'right')!.rect!.h).toBeCloseTo(88);
    // Members re-solve inside the resized columns: itemA re-centers alone,
    // itemB shifts up to make room, mover lands below it inside the box.
    expect(yOf(findNode(at2, 'itemA')!)).toBeCloseTo(300);
    expect(yOf(findNode(at2, 'itemB')!)).toBeCloseTo(281);
    expect(yOf(findNode(at2, 'mover')!)).toBeCloseTo(319);
  });
});

describe('grid-layout — auto-placement, colSpan, honest authored heights', () => {
  it('the colSpan=2 child spans two cells and align=start keeps authored heights', () => {
    const { evaluateAt } = runPipeline(getSample('grid-layout').dsl);
    const animated = evaluateAt(0);

    const m1 = findNode(animated, 'm1')!;
    const chart = findNode(animated, 'chart')!;
    const sidebar = findNode(animated, 'sidebar')!;

    // colSpan=2 (via the gridCol-only hint): width spans two cells + the gap between them.
    expect(chart.rect!.w).toBeCloseTo(2 * m1.rect!.w + 8);

    // align=start: children keep their authored heights instead of being
    // stretched to fill the row — this is the behavior the sample teaches.
    expect(m1.rect!.h).toBe(60);
    expect(chart.rect!.h).toBe(100);
    expect(sidebar.rect!.h).toBe(100);
  });

  it('colSpan: 2 -> 1 narrows the chart to one cell and the sidebar slides left to fill the gap', () => {
    const { evaluateAt } = runPipeline(getSample('grid-layout').dsl);
    const at0 = evaluateAt(0);
    const at3 = evaluateAt(3);
    const at6 = evaluateAt(6);

    const m1 = findNode(at3, 'm1')!;
    const chartAt3 = findNode(at3, 'chart')!;
    expect(chartAt3.rect!.w).toBeCloseTo(m1.rect!.w);

    // Sidebar's auto-placed column shifts left by exactly one cell + gap.
    const sidebarAt0 = findNode(at0, 'sidebar')!;
    const sidebarAt3 = findNode(at3, 'sidebar')!;
    expect(xOf(sidebarAt0) - xOf(sidebarAt3)).toBeCloseTo(m1.rect!.w + 8);

    // colSpan returns to 2 at t=6: chart is back to its two-cell width.
    const chartAt6 = findNode(at6, 'chart')!;
    expect(chartAt6.rect!.w).toBeCloseTo(2 * m1.rect!.w + 8);
  });
});

describe('circular-layout — ring of 6, stepping carousel', () => {
  it('six children sit at radius distance from the ring center, 60 degrees apart', () => {
    const { evaluateAt } = runPipeline(getSample('circular-layout').dsl);
    const animated = evaluateAt(0);

    const children = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'].map(id => findNode(animated, id)!);
    const angles = children.map(n => {
      expect(Math.hypot(xOf(n), yOf(n))).toBeCloseTo(110, 0);
      return (Math.atan2(yOf(n), xOf(n)) * 180) / Math.PI;
    });
    for (let i = 1; i < angles.length; i++) {
      let delta = angles[i] - angles[i - 1];
      if (delta < 0) delta += 360;
      expect(delta).toBeCloseTo(60, 0);
    }
  });

  it('the ring advances one slot per second, landing back home after a full turn', () => {
    const { evaluateAt } = runPipeline(getSample('circular-layout').dsl);
    const at0 = evaluateAt(0);
    const at1 = evaluateAt(1);
    const at6 = evaluateAt(6);

    // startAngle: 0 -> 60 at t=1 moves every node one slot around — n1 lands
    // exactly where n2 started.
    const n1At1 = findNode(at1, 'n1')!;
    const n2At0 = findNode(at0, 'n2')!;
    expect(xOf(n1At1)).toBeCloseTo(xOf(n2At0));
    expect(yOf(n1At1)).toBeCloseTo(yOf(n2At0));

    // startAngle: 360 at t=6 is a full turn — every child is back home.
    for (const id of ['n1', 'n2', 'n3', 'n4', 'n5', 'n6']) {
      expect(xOf(findNode(at6, id)!)).toBeCloseTo(xOf(findNode(at0, id)!));
      expect(yOf(findNode(at6, id)!)).toBeCloseTo(yOf(findNode(at0, id)!));
    }
  });
});

describe('cross-strategy-slot — movers entering the grid at different times', () => {
  it('the two movers occupy different cells once both have moved', () => {
    const { evaluateAt } = runPipeline(getSample('cross-strategy-slot').dsl);
    const animated = evaluateAt(4); // end of task2's move (the second slot change)

    const task1 = findNode(animated, 'task1')!;
    const task2 = findNode(animated, 'task2')!;
    // board: 240 wide, 2 columns, gap=8, padding=10 -> cell width (240-20-8)/2 = 106.
    const cellWidth = 106;

    const dx = Math.abs(xOf(task1) - xOf(task2));
    const dy = Math.abs(yOf(task1) - yOf(task2));
    expect(Math.max(dx, dy)).toBeGreaterThanOrEqual(cellWidth);
  });

  it('the third task (never slotted itself) gets smoothly interpolated reflow keyframes, not a snap', () => {
    const { tracks } = runPipeline(getSample('cross-strategy-slot').dsl);
    const x = tracks.get('task3.transform.x')!;
    const y = tracks.get('task3.transform.y')!;
    expect(x).toBeDefined();
    expect(y).toBeDefined();

    // task3 sits in a flex column: siblings leaving/returning reflow it on
    // the main (vertical) axis — a genuine, interpolatable position change
    // driven purely by sibling slot changes, not a track authored on task3.
    const distinctX = new Set(x.map(kf => kf.value)).size;
    const distinctY = new Set(y.map(kf => kf.value)).size;
    expect(Math.max(distinctX, distinctY)).toBeGreaterThan(1);
  });

  it('the sample description matches what renders', () => {
    const description = getSample('cross-strategy-slot').description.toLowerCase();
    expect(description).toContain('flex');
    expect(description).toContain('grid');
  });

  it("task2 holds its authored size at t=2 instead of lerping toward its own later grid resize (regression)", () => {
    // task1 resizes into a grid cell at t=2; task2 doesn't move until t=4.
    // Resize keyframes used to be emitted only at times a node was ACTUALLY
    // resized, so task2's rect.w/h track had keyframes at 0s and 4s but a
    // gap at 2s — interpolation filled that gap by lerping task2 toward its
    // t=4 grid size the whole time it was still sitting in the flex inbox.
    const { tracks, evaluateAt } = runPipeline(getSample('cross-strategy-slot').dsl);

    const task2 = findNode(evaluateAt(2), 'task2')!;
    expect(task2.rect!.w).toBeCloseTo(130);
    expect(task2.rect!.h).toBeCloseTo(30);

    const wTrack = tracks.get('task2.rect.w')!;
    const hTrack = tracks.get('task2.rect.h')!;
    expect(wTrack.some(kf => kf.time === 2)).toBe(true);
    expect(hTrack.some(kf => kf.time === 2)).toBe(true);
  });
});
