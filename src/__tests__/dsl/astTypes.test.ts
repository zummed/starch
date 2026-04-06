import { describe, it, expect } from 'vitest';
import { createAstNode, nodeAt, findCompound, flattenLeaves, lineOf, indentOf } from '../../dsl/astTypes';

describe('AST tree queries', () => {
  // Build a small test tree:
  // Document (0-25)
  //   NodeLine compound (0-25)
  //     NodeId 'box' value (0-3)
  //     Geometry compound (5-16)
  //       'rect' keyword (5-9)
  //       '140' value (10-13)
  //       '80' value (14-16)
  //     Fill compound (17-25)
  //       'fill' keyword (17-21)
  //       'red' value (22-25)

  function buildTestTree() {
    const doc = createAstNode({ dslRole: 'document', from: 0, to: 25, schemaPath: '', modelPath: '' });
    const nodeLine = createAstNode({ dslRole: 'compound', from: 0, to: 25, schemaPath: '', modelPath: 'objects.box' });
    const nodeId = createAstNode({ dslRole: 'value', from: 0, to: 3, schemaPath: 'id', modelPath: 'objects.box.id', value: 'box' });
    const geom = createAstNode({ dslRole: 'compound', from: 5, to: 16, schemaPath: 'rect', modelPath: 'objects.box.rect' });
    const rectKw = createAstNode({ dslRole: 'keyword', from: 5, to: 9, schemaPath: 'rect', modelPath: 'objects.box.rect', value: 'rect' });
    const w = createAstNode({ dslRole: 'value', from: 10, to: 13, schemaPath: 'rect.w', modelPath: 'objects.box.rect.w', value: 140 });
    const h = createAstNode({ dslRole: 'value', from: 14, to: 16, schemaPath: 'rect.h', modelPath: 'objects.box.rect.h', value: 80 });
    const fill = createAstNode({ dslRole: 'compound', from: 17, to: 25, schemaPath: 'fill', modelPath: 'objects.box.fill' });
    const fillKw = createAstNode({ dslRole: 'keyword', from: 17, to: 21, schemaPath: 'fill', modelPath: 'objects.box.fill', value: 'fill' });
    const red = createAstNode({ dslRole: 'value', from: 22, to: 25, schemaPath: 'fill', modelPath: 'objects.box.fill', value: 'red' });

    doc.children = [nodeLine];
    nodeLine.children = [nodeId, geom, fill];
    nodeLine.parent = doc;
    geom.children = [rectKw, w, h];
    geom.parent = nodeLine;
    fill.children = [fillKw, red];
    fill.parent = nodeLine;
    for (const c of geom.children) c.parent = geom;
    for (const c of fill.children) c.parent = fill;
    for (const c of nodeLine.children) c.parent = nodeLine;

    return doc;
  }

  it('nodeAt finds the deepest node at a position', () => {
    const tree = buildTestTree();
    const node = nodeAt(tree, 11); // inside '140'
    expect(node?.value).toBe(140);
    expect(node?.schemaPath).toBe('rect.w');
  });

  it('nodeAt returns compound for position on keyword', () => {
    const tree = buildTestTree();
    const node = nodeAt(tree, 6); // inside 'rect'
    expect(node?.dslRole).toBe('keyword');
    expect(node?.schemaPath).toBe('rect');
  });

  it('nodeAt returns null for position outside tree', () => {
    const tree = buildTestTree();
    expect(nodeAt(tree, 100)).toBeNull();
  });

  it('findCompound walks up to nearest compound ancestor', () => {
    const tree = buildTestTree();
    const wNode = nodeAt(tree, 11)!; // '140' value
    const compound = findCompound(wNode);
    expect(compound?.schemaPath).toBe('rect');
    expect(compound?.dslRole).toBe('compound');
  });

  it('findCompound returns the node itself if it is a compound', () => {
    const tree = buildTestTree();
    const geom = nodeAt(tree, 6)!.parent!; // geometry compound
    expect(findCompound(geom)?.schemaPath).toBe('rect');
  });

  it('flattenLeaves produces sorted leaf nodes for decorations', () => {
    const tree = buildTestTree();
    const leaves = flattenLeaves(tree);
    expect(leaves.length).toBeGreaterThan(0);
    // All leaves should have from < to
    for (const leaf of leaves) {
      expect(leaf.to).toBeGreaterThan(leaf.from);
    }
    // Should be sorted by from
    for (let i = 1; i < leaves.length; i++) {
      expect(leaves[i].from).toBeGreaterThanOrEqual(leaves[i - 1].from);
    }
  });
});

describe('lineOf', () => {
  it('returns 0 for position on first line', () => {
    const text = 'animate 10s\n  1 box.fill: red';
    expect(lineOf(0, text)).toBe(0);
    expect(lineOf(5, text)).toBe(0);
    expect(lineOf(11, text)).toBe(0); // before newline
  });

  it('returns 1 for position on second line', () => {
    const text = 'animate 10s\n  1 box.fill: red';
    expect(lineOf(12, text)).toBe(1); // just after newline
    expect(lineOf(text.length, text)).toBe(1);
  });

  it('handles multiple newlines', () => {
    const text = 'a\nb\nc\nd';
    expect(lineOf(0, text)).toBe(0);
    expect(lineOf(2, text)).toBe(1);
    expect(lineOf(4, text)).toBe(2);
    expect(lineOf(6, text)).toBe(3);
  });

  it('returns 0 for empty text', () => {
    expect(lineOf(0, '')).toBe(0);
  });
});

describe('indentOf', () => {
  it('returns 0 for unindented line', () => {
    const text = 'animate 10s\n  1 box.fill: red';
    expect(indentOf(0, text)).toBe(0);
    expect(indentOf(5, text)).toBe(0);
  });

  it('returns leading-space count on indented line', () => {
    const text = 'animate 10s\n  1 box.fill: red';
    expect(indentOf(12, text)).toBe(2); // start of "  1..."
    expect(indentOf(14, text)).toBe(2); // mid-line
    expect(indentOf(text.length, text)).toBe(2);
  });

  it('counts tabs and spaces as 1 char each', () => {
    const text = '\t\t body';
    expect(indentOf(5, text)).toBe(3); // two tabs + one space
  });

  it('returns 0 for empty line', () => {
    const text = 'a\n\nb';
    expect(indentOf(2, text)).toBe(0);
  });
});
