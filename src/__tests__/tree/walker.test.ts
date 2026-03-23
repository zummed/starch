import { describe, it, expect } from 'vitest';
import { generateTrackPaths } from '../../tree/walker';
import { createNode } from '../../types/node';

describe('generateTrackPaths', () => {
  it('generates paths for a flat node with transform', () => {
    const node = createNode({
      id: 'box1',
      transform: { x: 100, y: 50 },
    });
    const paths = generateTrackPaths([node]);
    expect(paths).toContain('box1.transform.x');
    expect(paths).toContain('box1.transform.y');
  });

  it('generates a single leaf path for fill (Color is atomic)', () => {
    const node = createNode({
      id: 'box1',
      fill: { h: 210, s: 80, l: 50 },
    });
    const paths = generateTrackPaths([node]);
    expect(paths).toContain('box1.fill');
    // Color sub-fields should NOT be recursed into
    expect(paths).not.toContain('box1.fill.h');
    expect(paths).not.toContain('box1.fill.s');
    expect(paths).not.toContain('box1.fill.l');
  });

  it('generates a single leaf path for string fill', () => {
    const node = createNode({
      id: 'box1',
      fill: 'steelblue',
    });
    const paths = generateTrackPaths([node]);
    expect(paths).toContain('box1.fill');
  });

  it('generates paths for geometry fields', () => {
    const node = createNode({
      id: 'r1',
      rect: { w: 100, h: 60, radius: 4 },
    });
    const paths = generateTrackPaths([node]);
    expect(paths).toContain('r1.rect.w');
    expect(paths).toContain('r1.rect.h');
    expect(paths).toContain('r1.rect.radius');
  });

  it('generates paths for nested children using tree walk', () => {
    const tree = [createNode({
      id: 'parent',
      children: [
        createNode({
          id: 'bg',
          fill: { h: 0, s: 100, l: 50 },
          rect: { w: 100, h: 60 },
        }),
      ],
    })];
    const paths = generateTrackPaths(tree);
    expect(paths).toContain('parent.bg.fill');
    expect(paths).toContain('parent.bg.rect.w');
  });

  it('generates paths for deeply nested children', () => {
    const tree = [createNode({
      id: 'root',
      children: [
        createNode({
          id: 'mid',
          children: [
            createNode({
              id: 'leaf',
              opacity: 1,
            }),
          ],
        }),
      ],
    })];
    const paths = generateTrackPaths(tree);
    expect(paths).toContain('root.mid.leaf.opacity');
  });

  it('generates paths for stroke sub-object (color + width)', () => {
    const node = createNode({
      id: 's1',
      stroke: { color: { h: 0, s: 0, l: 60 }, width: 2 },
    });
    const paths = generateTrackPaths([node]);
    expect(paths).toContain('s1.stroke.color');
    expect(paths).toContain('s1.stroke.width');
    // Color sub-fields should NOT be recursed into
    expect(paths).not.toContain('s1.stroke.color.h');
  });

  it('generates stroke.color even without explicit width', () => {
    const node = createNode({
      id: 's1',
      stroke: { color: 'red' },
    });
    const paths = generateTrackPaths([node]);
    expect(paths).toContain('s1.stroke.color');
    expect(paths).not.toContain('s1.stroke.width');
  });

  it('generates paths for layoutHint freeform keys', () => {
    const node = createNode({
      id: 'item',
      layoutHint: { grow: 1, order: 2 },
    });
    const paths = generateTrackPaths([node]);
    expect(paths).toContain('item.layoutHint.grow');
    expect(paths).toContain('item.layoutHint.order');
  });

  it('generates paths for dash sub-object', () => {
    const node = createNode({
      id: 'p1',
      dash: { pattern: 'dashed', length: 8, gap: 4 },
    });
    const paths = generateTrackPaths([node]);
    expect(paths).toContain('p1.dash.length');
    expect(paths).toContain('p1.dash.gap');
    expect(paths).toContain('p1.dash.pattern');
  });

  it('generates paths for visible and depth when explicitly set', () => {
    const node = createNode({
      id: 'n1',
      visible: true,
      depth: 5,
    });
    const paths = generateTrackPaths([node]);
    expect(paths).toContain('n1.visible');
    expect(paths).toContain('n1.depth');
  });

  it('does NOT generate visible path when not explicitly set', () => {
    const node = createNode({ id: 'n1' });
    const paths = generateTrackPaths([node]);
    expect(paths).not.toContain('n1.visible');
  });

  it('generates paths for text geometry', () => {
    const node = createNode({
      id: 't1',
      text: { content: 'hello', size: 14 },
    });
    const paths = generateTrackPaths([node]);
    expect(paths).toContain('t1.text.content');
    expect(paths).toContain('t1.text.size');
  });

  it('handles multiple top-level nodes', () => {
    const nodes = [
      createNode({ id: 'a', opacity: 1 }),
      createNode({ id: 'b', opacity: 0.5 }),
    ];
    const paths = generateTrackPaths(nodes);
    expect(paths).toContain('a.opacity');
    expect(paths).toContain('b.opacity');
  });
});
