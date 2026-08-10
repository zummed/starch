import { describe, it, expect } from 'vitest';
import { parseScene } from '../../parser/parser';
import { buildAstFromModel } from '../../dsl/astEmitter';
import { emptyFormatHints } from '../../dsl/formatHints';
import { createNode } from '../../types/node';
import { computeLayoutPlacements } from '../../layout';

const hints = emptyFormatHints();

describe('layout DSL parsing — new strategies', () => {
  it('parses grid layout', () => {
    const scene = parseScene(`objects\n  g: rect 600x400\n    layout grid columns=3 gap=10 padding=15`);
    const g = scene.nodes.find(n => n.id === 'g')!;
    expect(g.layout?.type).toBe('grid');
    expect(g.layout?.columns).toBe(3);
    expect(g.layout?.gap).toBe(10);
    expect(g.layout?.padding).toBe(15);
  });

  it('parses circular layout', () => {
    const scene = parseScene(`objects\n  r: ellipse 150x150\n    layout circular radius=120 startAngle=0 sweep=360`);
    const r = scene.nodes.find(n => n.id === 'r')!;
    expect(r.layout?.type).toBe('circular');
    expect(r.layout?.radius).toBe(120);
    expect(r.layout?.startAngle).toBe(0);
    expect(r.layout?.sweep).toBe(360);
  });

  it('parses grid child hints', () => {
    const scene = parseScene(`objects\n  g: rect 600x400\n    layout grid columns=3\n    c: rect 100x100\n      layout gridCol=2 colSpan=2`);
    const g = scene.nodes.find(n => n.id === 'g')!;
    const c = g.children.find(n => n.id === 'c')!;
    expect(c.layout?.gridCol).toBe(2);
    expect(c.layout?.colSpan).toBe(2);
  });
});

describe('layout DSL round-trip', () => {
  it('grid layout round-trips through parse → emit → parse', () => {
    const input = `objects\n  g: rect 600x400\n    layout grid columns=3 gap=10 padding=15`;
    const scene = parseScene(input);
    const objects = scene.nodes.filter(n => !(n as any)._isStyle);
    const { text } = buildAstFromModel({ objects }, hints);
    const reparsed = parseScene(text);
    const g = reparsed.nodes.find(n => n.id === 'g')!;
    expect(g.layout?.type).toBe('grid');
    expect(g.layout?.columns).toBe(3);
    expect(g.layout?.gap).toBe(10);
  });

  it('circular layout round-trips', () => {
    const input = `objects\n  r: ellipse 150x150\n    layout circular radius=120 startAngle=45 sweep=270`;
    const scene = parseScene(input);
    const objects = scene.nodes.filter(n => !(n as any)._isStyle);
    const { text } = buildAstFromModel({ objects }, hints);
    const reparsed = parseScene(text);
    const r = reparsed.nodes.find(n => n.id === 'r')!;
    expect(r.layout?.type).toBe('circular');
    expect(r.layout?.radius).toBe(120);
    expect(r.layout?.startAngle).toBe(45);
    expect(r.layout?.sweep).toBe(270);
  });

  it('grid child hints round-trip as inline layout', () => {
    const input = `objects\n  g: rect 600x400\n    layout grid columns=2\n    c: rect 100x100\n      layout gridCol=1 colSpan=2`;
    const scene = parseScene(input);
    const objects = scene.nodes.filter(n => !(n as any)._isStyle);
    const { text } = buildAstFromModel({ objects }, hints);
    const reparsed = parseScene(text);
    const g = reparsed.nodes.find(n => n.id === 'g')!;
    const c = g.children.find(n => n.id === 'c')!;
    expect(c.layout?.gridCol).toBe(1);
    expect(c.layout?.colSpan).toBe(2);
  });

  // Regression: connections and explicit-path nodes emit through their own
  // renderConnection/renderExplicitPath paths, which historically dropped
  // hint-only layout (grow/slot/gridCol/...) entirely on re-emit — it parsed
  // fine but silently vanished on the next save/edit round-trip.
  it('hint-only layout on a connection round-trips', () => {
    const input = 'objects\n  a: rect 60x40 at 100,150\n  b: rect 60x40 at 300,150\n  line: a -> b gap=4 stroke darkgray\n    layout grow=2';
    const scene = parseScene(input);
    const objects = scene.nodes.filter(n => !(n as any)._isStyle);
    const line = objects.find(n => n.id === 'line')!;
    expect(line.layout?.grow).toBe(2);

    const { text } = buildAstFromModel({ objects }, hints);
    const reparsed = parseScene(text);
    const reparsedLine = reparsed.nodes.find(n => n.id === 'line')!;
    expect(reparsedLine.layout?.grow).toBe(2);
  });

  it('hint-only layout on an explicit path node round-trips', () => {
    const input = 'objects\n  p: path (0,0) (100,50) stroke silver\n    layout slot=container';
    const scene = parseScene(input);
    const objects = scene.nodes.filter(n => !(n as any)._isStyle);
    const p = objects.find(n => n.id === 'p')!;
    expect(p.layout?.slot).toBe('container');

    const { text } = buildAstFromModel({ objects }, hints);
    const reparsed = parseScene(text);
    const reparsedP = reparsed.nodes.find(n => n.id === 'p')!;
    expect(reparsedP.layout?.slot).toBe('container');
  });

  // Every LayoutSchema prop parses, emits, and reparses to the same value —
  // guards against a prop being added to the schema but missed by the
  // (now schema-derived) emitter's container-vs-hint classification.
  it('every LayoutSchema prop round-trips through parse → emit → parse', () => {
    const input = `objects
  g: rect 600x400
    layout grid direction=row gap=10 justify=center align=stretch padding=5 columns=3 rows=2 colGap=4 rowGap=6 radius=100 startAngle=10 sweep=200
    c: rect 50x50
      layout grow=1 order=2 alignSelf=end slot=g skip=true gridCol=1 gridRow=1 colSpan=2 rowSpan=1`;
    const scene = parseScene(input);
    const objects = scene.nodes.filter(n => !(n as any)._isStyle);
    const { text } = buildAstFromModel({ objects }, hints);
    const reparsed = parseScene(text);
    const reparsedObjects = reparsed.nodes.filter(n => !(n as any)._isStyle);

    const g = objects.find(n => n.id === 'g')!;
    const c = g.children.find(n => n.id === 'c')!;
    const g2 = reparsedObjects.find(n => n.id === 'g')!;
    const c2 = g2.children.find(n => n.id === 'c')!;

    // Real boolean, not the string "true" — regression for the kwarg
    // identifier-token coercion (skip is the only boolean layout kwarg).
    expect(c.layout?.skip).toBe(true);
    expect(c2.layout?.skip).toBe(true);

    expect(g2.layout).toEqual(g.layout);
    expect(c2.layout).toEqual(c.layout);
  });
});

describe('end-to-end: DSL → parse → layout', () => {
  it('grid layout from DSL produces placements', () => {
    const scene = parseScene(`objects
  dashboard: rect 600x400
    layout grid columns=3 gap=10 padding=15
    m1: rect 0x80
    m2: rect 0x80
    m3: rect 0x80`);
    const nodes = scene.nodes.map(o => createNode(o));
    const results = computeLayoutPlacements(nodes);
    expect(results.length).toBeGreaterThanOrEqual(3);
  });

  it('circular layout from DSL produces placements', () => {
    const scene = parseScene(`objects
  ring: ellipse 150x150
    layout circular radius=120
    n1: rect 60x30
    n2: rect 60x30
    n3: rect 60x30`);
    const nodes = scene.nodes.map(o => createNode(o));
    const results = computeLayoutPlacements(nodes);
    expect(results.length).toBe(3);
  });

  it('slot animation DSL across strategies parses correctly', () => {
    const scene = parseScene(`objects
  inbox: rect 200x200
    layout flex column gap=8 padding=10
    task1: rect 160x30
      layout slot=inbox

  board: rect 300x200
    layout grid columns=2 gap=8 padding=10

animate 4
  2 task1.layout.slot: board`);
    // Filter out style nodes
    const objects = scene.nodes.filter(n => !(n as any)._isStyle);
    expect(objects).toHaveLength(2);
    expect(objects[0].layout?.type).toBe('flex');
    expect(objects[1].layout?.type).toBe('grid');
    expect(objects[0].children[0].layout?.slot).toBe('inbox');
    expect(scene.animate?.keyframes?.[0]?.changes?.['task1.layout.slot']).toBe('board');
  });
});
