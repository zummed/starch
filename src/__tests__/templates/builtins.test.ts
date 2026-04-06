import { describe, it, expect } from 'vitest';
import { boxTemplate } from '../../templates/sets/core/box';
import { circleTemplate } from '../../templates/sets/core/circle';
import { lineTemplate } from '../../templates/sets/core/line';
import { textblockTemplate } from '../../templates/sets/core/textblock';
import { codeblockTemplate } from '../../templates/sets/core/codeblock';
import { tableTemplate } from '../../templates/sets/core/table';

describe('boxTemplate', () => {
  it('creates a box with bg and label children', () => {
    const node = boxTemplate('b1', { w: 140, h: 60, text: 'Hello' });
    expect(node.id).toBe('b1');
    expect(node.children).toHaveLength(2);
    expect(node.children[0].id).toBe('b1.bg');
    expect(node.children[0].rect!.w).toBe(140);
    expect(node.children[1].id).toBe('b1.label');
    expect(node.children[1].text!.content).toBe('Hello');
  });

  it('creates a box without text', () => {
    const node = boxTemplate('b2', { w: 100, h: 50 });
    expect(node.children).toHaveLength(1); // just bg
  });

  it('derives fill from colour prop', () => {
    const node = boxTemplate('b3', { colour: 'red' });
    expect(node.children[0].fill).toBeDefined();
    expect(node.children[0].stroke).toBeDefined();
    // Derived fill should have lower saturation/lightness
    const fill = node.children[0].fill as { h: number; s: number; l: number };
    expect(fill.s).toBeLessThan(100);
  });

  it('uses default dimensions', () => {
    const node = boxTemplate('b4', {});
    expect(node.children[0].rect!.w).toBe(120);
    expect(node.children[0].rect!.h).toBe(60);
  });
});

describe('circleTemplate', () => {
  it('creates a circle with shape and optional label', () => {
    const node = circleTemplate('c1', { r: 40, text: 'Test' });
    expect(node.children).toHaveLength(2);
    expect(node.children[0].ellipse!.rx).toBe(40);
    expect(node.children[1].text!.content).toBe('Test');
  });
});

describe('lineTemplate', () => {
  it('creates a line with route, arrow, and label', () => {
    const node = lineTemplate('conn', { from: 'a', to: 'b', label: 'calls' });
    expect(node.children.length).toBeGreaterThanOrEqual(2); // route + arrowEnd + label
    expect(node.children[0].id).toBe('conn.route');
    expect(node.children[0].path!.route).toEqual(['a', 'b']);

    const labelChild = node.children.find(c => c.id === 'conn.label');
    expect(labelChild).toBeDefined();
    expect(labelChild!.text!.content).toBe('calls');
  });

  it('creates a dashed line', () => {
    const node = lineTemplate('d', { from: 'a', to: 'b', dashed: true });
    expect(node.children[0].dash).toBeDefined();
    expect(node.children[0].dash!.pattern).toBe('dashed');
  });

  it('creates a line without arrow', () => {
    const node = lineTemplate('na', { from: 'a', to: 'b', arrow: false });
    const arrowChild = node.children.find(c => c.id === 'na.arrowEnd');
    expect(arrowChild).toBeUndefined();
  });
});

describe('textblockTemplate', () => {
  it('creates child text nodes for each line', () => {
    const node = textblockTemplate('tb', { lines: ['Line 1', 'Line 2', 'Line 3'] });
    expect(node.children).toHaveLength(3);
    expect(node.children[0].text!.content).toBe('Line 1');
    expect(node.children[1].text!.content).toBe('Line 2');
    expect(node.children[2].id).toBe('tb.line2');
  });

  it('spaces lines by lineHeight', () => {
    const node = textblockTemplate('tb', { lines: ['A', 'B'], lineHeight: 25 });
    expect(node.children[0].transform!.y).toBe(0);
    expect(node.children[1].transform!.y).toBe(25);
  });
});

describe('codeblockTemplate', () => {
  it('creates a monospace textblock', () => {
    const node = codeblockTemplate('cb', { lines: ['const x = 1;'] });
    expect(node.children[0].text!.mono).toBe(true);
  });
});

describe('tableTemplate', () => {
  it('creates header and data cells', () => {
    const node = tableTemplate('t1', {
      cols: ['Name', 'Age'],
      rows: [['Alice', '30'], ['Bob', '25']],
    });
    // Should have: bg, header, 2 header texts, 4 data cells
    expect(node.children.length).toBeGreaterThanOrEqual(6);
    const headerTexts = node.children.filter(c => c.id.match(/^t1\.h\d/));
    expect(headerTexts).toHaveLength(2);
    expect(headerTexts[0].text!.content).toBe('Name');
  });
});
