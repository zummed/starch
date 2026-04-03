import { describe, it, expect } from 'vitest';
import { starchSchema } from '../../editor/schema/starchSchema';

const nodes = starchSchema.nodes as Record<string, unknown>;

describe('starchSchema', () => {
  it('defines doc node as top-level', () => {
    expect(nodes['doc']).toBeDefined();
  });

  it('defines scene_node with expected attrs', () => {
    expect(nodes['scene_node']).toBeDefined();
  });

  it('defines property_slot with key and schemaPath attrs', () => {
    expect(nodes['property_slot']).toBeDefined();
  });

  it('defines geometry_slot', () => {
    expect(nodes['geometry_slot']).toBeDefined();
  });

  it('defines compound_slot', () => {
    expect(nodes['compound_slot']).toBeDefined();
  });

  it('defines draft_slot', () => {
    expect(nodes['draft_slot']).toBeDefined();
  });

  it('defines style_block, animate_block, images_block', () => {
    expect(nodes['style_block']).toBeDefined();
    expect(nodes['animate_block']).toBeDefined();
    expect(nodes['images_block']).toBeDefined();
  });

  it('defines keyframe_block and keyframe_entry', () => {
    expect(nodes['keyframe_block']).toBeDefined();
    expect(nodes['keyframe_entry']).toBeDefined();
  });

  it('defines metadata node', () => {
    expect(nodes['metadata']).toBeDefined();
  });

  it('can create a minimal valid document', () => {
    const doc = starchSchema.node('doc', null, [
      starchSchema.node('scene_node', {
        id: 'box',
        schemaPath: 'objects.0',
        display: 'inline',
        geometryType: 'rect',
      }, [
        starchSchema.node('geometry_slot', {
          keyword: 'rect',
          schemaPath: 'rect',
        }, [starchSchema.text('100x200')]),
        starchSchema.node('property_slot', {
          key: 'fill',
          schemaPath: 'fill',
        }, [starchSchema.text('red')]),
      ]),
    ]);
    expect(doc.type.name).toBe('doc');
    expect(doc.childCount).toBe(1);
    expect(doc.firstChild!.type.name).toBe('scene_node');
    expect(doc.firstChild!.attrs.id).toBe('box');
    expect(doc.firstChild!.childCount).toBe(2);
  });

  it('scene_node can contain nested scene_node children', () => {
    const doc = starchSchema.node('doc', null, [
      starchSchema.node('scene_node', {
        id: 'parent',
        schemaPath: 'objects.0',
        display: 'block',
        geometryType: 'rect',
      }, [
        starchSchema.node('geometry_slot', {
          keyword: 'rect',
          schemaPath: 'rect',
        }, [starchSchema.text('200x200')]),
        starchSchema.node('scene_node', {
          id: 'child',
          schemaPath: 'objects.0.children.0',
          display: 'inline',
          geometryType: 'ellipse',
        }, [
          starchSchema.node('geometry_slot', {
            keyword: 'ellipse',
            schemaPath: 'ellipse',
          }, [starchSchema.text('50x50')]),
        ]),
      ]),
    ]);
    expect(doc.firstChild!.childCount).toBe(2);
    expect(doc.firstChild!.child(1).type.name).toBe('scene_node');
    expect(doc.firstChild!.child(1).attrs.id).toBe('child');
  });

  it('compound_slot contains property_slots', () => {
    const doc = starchSchema.node('doc', null, [
      starchSchema.node('scene_node', {
        id: 'a', schemaPath: 'objects.0', display: 'inline', geometryType: 'rect',
      }, [
        starchSchema.node('geometry_slot', {
          keyword: 'rect', schemaPath: 'rect',
        }, [starchSchema.text('10x10')]),
        starchSchema.node('compound_slot', {
          key: 'stroke', schemaPath: 'stroke',
        }, [
          starchSchema.node('property_slot', {
            key: 'color', schemaPath: 'stroke.color',
          }, [starchSchema.text('red')]),
          starchSchema.node('property_slot', {
            key: 'width', schemaPath: 'stroke.width',
          }, [starchSchema.text('2')]),
        ]),
      ]),
    ]);
    const stroke = doc.firstChild!.child(1);
    expect(stroke.type.name).toBe('compound_slot');
    expect(stroke.childCount).toBe(2);
    expect(stroke.firstChild!.type.name).toBe('property_slot');
  });
});
