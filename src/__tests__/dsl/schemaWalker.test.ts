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
