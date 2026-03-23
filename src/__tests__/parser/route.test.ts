import { describe, it, expect } from 'vitest';
import { parseScene } from '../../parser/parser';

describe('unified route model', () => {
  it('parses route array directly', () => {
    const scene = parseScene(`{
      objects: [
        { id: "a", rect: { w: 50, h: 50 } },
        { id: "b", rect: { w: 50, h: 50 } },
        { id: "line", path: { route: ["a", "b"] } }
      ]
    }`);
    const line = scene.nodes.find(n => n.id === 'line');
    expect(line?.path?.route).toEqual(['a', 'b']);
  });

  it('parses route with waypoints', () => {
    const scene = parseScene(`{
      objects: [
        { id: "a", rect: { w: 50, h: 50 } },
        { id: "b", rect: { w: 50, h: 50 } },
        { id: "line", path: { route: ["a", [250, 100], [250, 200], "b"] } }
      ]
    }`);
    const line = scene.nodes.find(n => n.id === 'line');
    expect(line?.path?.route).toEqual(['a', [250, 100], [250, 200], 'b']);
  });

  it('parses route with node+offset PointRefs', () => {
    const scene = parseScene(`{
      objects: [
        { id: "a", rect: { w: 50, h: 50 } },
        { id: "b", rect: { w: 50, h: 50 } },
        { id: "line", path: { route: [["a", 10, 20], ["b", -5, 0]] } }
      ]
    }`);
    const line = scene.nodes.find(n => n.id === 'line');
    expect(line?.path?.route).toEqual([['a', 10, 20], ['b', -5, 0]]);
  });

  it('parses points as coordinate-only tuples', () => {
    const scene = parseScene(`{
      objects: [
        { id: "tri", path: { points: [[0, -40], [40, 30], [-40, 30]], closed: true } }
      ]
    }`);
    const tri = scene.nodes.find(n => n.id === 'tri');
    expect(tri?.path?.points).toEqual([[0, -40], [40, 30], [-40, 30]]);
    expect(tri?.path?.closed).toBe(true);
  });

  it('parses route with path modifiers', () => {
    const scene = parseScene(`{
      objects: [
        { id: "a", rect: { w: 50, h: 50 } },
        { id: "b", rect: { w: 50, h: 50 } },
        { id: "line", path: { route: ["a", "b"], smooth: true, radius: 15, gap: 4 } }
      ]
    }`);
    const line = scene.nodes.find(n => n.id === 'line');
    expect(line?.path?.smooth).toBe(true);
    expect(line?.path?.radius).toBe(15);
    expect(line?.path?.gap).toBe(4);
  });
});
