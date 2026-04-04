import { describe, it, expect } from 'vitest';
import { walkDocument } from '../../dsl/schemaWalker';

describe('walkDocument - top-level fields', () => {
  it('parses name', () => {
    const { model } = walkDocument('name "My Scene"');
    expect(model.name).toBe('My Scene');
  });

  it('parses description', () => {
    const { model } = walkDocument('description "A test"');
    expect(model.description).toBe('A test');
  });

  it('parses background', () => {
    const { model } = walkDocument('background white');
    expect(model.background).toBe('white');
  });

  it('parses viewport', () => {
    const { model } = walkDocument('viewport 800x600');
    expect(model.viewport).toEqual({ width: 800, height: 600 });
  });

  it('parses multiple top-level fields', () => {
    const { model } = walkDocument(`name "Test"
description "A test"
background white`);
    expect(model.name).toBe('Test');
    expect(model.description).toBe('A test');
    expect(model.background).toBe('white');
  });

  it('empty input returns empty objects array', () => {
    const { model } = walkDocument('');
    expect(model.objects).toEqual([]);
  });

  it('emits AST leaves for each value', () => {
    const { ast } = walkDocument('name "My Scene"');
    const leaves = ast.astLeaves();
    const nameLeaf = leaves.find(l => l.schemaPath === 'name._value');
    expect(nameLeaf).toBeDefined();
    expect(nameLeaf?.value).toBe('My Scene');
    expect(nameLeaf?.dslRole).toBe('value');
  });
});

describe('walkDocument - instance declarations', () => {
  it('parses a single node declaration', () => {
    const { model } = walkDocument('box: rect 100x60');
    expect(model.objects).toHaveLength(1);
    expect(model.objects[0].id).toBe('box');
    expect(model.objects[0].rect).toEqual({ w: 100, h: 60 });
  });

  it('parses multiple nodes', () => {
    const { model } = walkDocument(`box: rect 100x60
circle: ellipse 50x50`);
    expect(model.objects).toHaveLength(2);
    expect(model.objects[0].id).toBe('box');
    expect(model.objects[1].id).toBe('circle');
  });

  it('parses node with fill color', () => {
    const { model } = walkDocument('box: rect 100x60 fill red');
    expect(model.objects[0].fill).toBe('red');
  });

  it('parses node with stroke', () => {
    const { model } = walkDocument('box: rect 100x60 stroke red width=2');
    expect(model.objects[0].stroke).toEqual({ color: 'red', width: 2 });
  });

  it('parses node with transform (at)', () => {
    const { model } = walkDocument('box: rect 100x60 at 200,150');
    expect(model.objects[0].transform).toEqual({ x: 200, y: 150 });
  });
});

describe('walkDocument - children and sigils', () => {
  it('parses @style sigil reference', () => {
    const { model } = walkDocument('box: rect 100x60 @primary');
    expect(model.objects[0].style).toBe('primary');
  });

  it('parses @style before properties', () => {
    const { model } = walkDocument('box: rect 100x60 @primary fill red');
    expect(model.objects[0].style).toBe('primary');
    expect(model.objects[0].fill).toBe('red');
  });

  it('parses nested children (indented)', () => {
    const dsl = `parent: rect 200x200
  child1: rect 50x50
  child2: ellipse 30x30`;
    const { model } = walkDocument(dsl);
    expect(model.objects[0].id).toBe('parent');
    expect(model.objects[0].children).toHaveLength(2);
    expect(model.objects[0].children[0].id).toBe('child1');
    expect(model.objects[0].children[1].id).toBe('child2');
  });
});
