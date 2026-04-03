import { describe, it, expect } from 'vitest';
import { starchSchema } from '../../editor/schema/starchSchema';
import { extractModel } from '../../editor/extractModel';

function makeDoc(...children: any[]) {
  return starchSchema.node('doc', null, children);
}

function sceneNode(
  id: string,
  geomType: string,
  geomText: string,
  props: Array<{ key: string; schemaPath: string; text: string }> = [],
) {
  return starchSchema.node('scene_node', {
    id, schemaPath: `objects.${id}`, display: 'inline', geometryType: geomType,
  }, [
    starchSchema.node('geometry_slot', {
      keyword: geomType, schemaPath: geomType,
    }, [starchSchema.text(geomText)]),
    ...props.map(p =>
      starchSchema.node('property_slot', {
        key: p.key, schemaPath: p.schemaPath,
      }, [starchSchema.text(p.text)])
    ),
  ]);
}

describe('extractModel', () => {
  it('extracts empty doc', () => {
    const doc = makeDoc();
    const model = extractModel(doc);
    expect(model).toEqual({});
  });

  it('extracts metadata', () => {
    const doc = makeDoc(
      starchSchema.node('metadata', { key: 'name', schemaPath: 'name' },
        [starchSchema.text('My Scene')]),
      starchSchema.node('metadata', { key: 'background', schemaPath: 'background' },
        [starchSchema.text('white')]),
    );
    const model = extractModel(doc);
    expect(model.name).toBe('My Scene');
    expect(model.background).toBe('white');
  });

  it('extracts a scene node with geometry', () => {
    const doc = makeDoc(sceneNode('box', 'rect', '100x200'));
    const model = extractModel(doc);
    expect(model.objects).toHaveLength(1);
    expect(model.objects[0].id).toBe('box');
    expect(model.objects[0].rect).toEqual({ w: 100, h: 200 });
  });

  it('extracts ellipse geometry', () => {
    const doc = makeDoc(sceneNode('c', 'ellipse', '50x30'));
    const model = extractModel(doc);
    expect(model.objects[0].ellipse).toEqual({ rx: 50, ry: 30 });
  });

  it('extracts scalar properties', () => {
    const doc = makeDoc(
      sceneNode('box', 'rect', '100x200', [
        { key: 'opacity', schemaPath: 'opacity', text: '0.5' },
        { key: 'fill', schemaPath: 'fill', text: 'red' },
      ]),
    );
    const model = extractModel(doc);
    expect(model.objects[0].opacity).toBe(0.5);
    expect(model.objects[0].fill).toBe('red');
  });

  it('extracts compound properties', () => {
    const doc = makeDoc(
      starchSchema.node('scene_node', {
        id: 'a', schemaPath: 'objects.a', display: 'inline', geometryType: 'rect',
      }, [
        starchSchema.node('geometry_slot', {
          keyword: 'rect', schemaPath: 'rect',
        }, [starchSchema.text('10x10')]),
        starchSchema.node('compound_slot', {
          key: 'stroke', schemaPath: 'stroke',
        }, [
          starchSchema.node('property_slot', {
            key: 'color', schemaPath: 'stroke.color',
          }, [starchSchema.text('blue')]),
          starchSchema.node('property_slot', {
            key: 'width', schemaPath: 'stroke.width',
          }, [starchSchema.text('3')]),
        ]),
      ]),
    );
    const model = extractModel(doc);
    expect(model.objects[0].stroke).toEqual({ color: 'blue', width: 3 });
  });

  it('extracts style blocks', () => {
    const doc = makeDoc(
      starchSchema.node('style_block', {
        name: 'myStyle', schemaPath: 'styles.myStyle',
      }, [
        starchSchema.node('property_slot', {
          key: 'fill', schemaPath: 'fill',
        }, [starchSchema.text('green')]),
      ]),
    );
    const model = extractModel(doc);
    expect(model.styles).toBeDefined();
    expect(model.styles.myStyle.fill).toBe('green');
  });

  it('extracts animate block with keyframes', () => {
    const doc = makeDoc(
      starchSchema.node('animate_block', { schemaPath: 'animate' }, [
        starchSchema.node('property_slot', {
          key: 'duration', schemaPath: 'animate.duration',
        }, [starchSchema.text('5')]),
        starchSchema.node('keyframe_block', {
          time: 0, schemaPath: 'animate.keyframes.0',
        }, [
          starchSchema.node('keyframe_entry', {
            target: 'box', property: 'opacity', schemaPath: 'animate.keyframes.0.changes',
          }, [starchSchema.text('1')]),
        ]),
        starchSchema.node('keyframe_block', {
          time: 2.5, schemaPath: 'animate.keyframes.1',
        }, [
          starchSchema.node('keyframe_entry', {
            target: 'box', property: 'opacity', schemaPath: 'animate.keyframes.1.changes',
          }, [starchSchema.text('0')]),
        ]),
      ]),
    );
    const model = extractModel(doc);
    expect(model.animate).toBeDefined();
    expect(model.animate.duration).toBe(5);
    expect(model.animate.keyframes).toHaveLength(2);
    expect(model.animate.keyframes[0].time).toBe(0);
    expect(model.animate.keyframes[0].changes['box.opacity']).toBe(1);
  });

  it('extracts images block', () => {
    const doc = makeDoc(
      starchSchema.node('images_block', { schemaPath: 'images' }, [
        starchSchema.node('image_entry', {
          key: 'logo', schemaPath: 'images.logo',
        }, [starchSchema.text('logo.png')]),
      ]),
    );
    const model = extractModel(doc);
    expect(model.images).toEqual({ logo: 'logo.png' });
  });

  it('extracts nested children', () => {
    const doc = makeDoc(
      starchSchema.node('scene_node', {
        id: 'parent', schemaPath: 'objects.parent', display: 'block', geometryType: 'rect',
      }, [
        starchSchema.node('geometry_slot', {
          keyword: 'rect', schemaPath: 'rect',
        }, [starchSchema.text('200x200')]),
        starchSchema.node('scene_node', {
          id: 'child', schemaPath: 'objects.parent.children.0', display: 'inline', geometryType: 'ellipse',
        }, [
          starchSchema.node('geometry_slot', {
            keyword: 'ellipse', schemaPath: 'ellipse',
          }, [starchSchema.text('30x30')]),
        ]),
      ]),
    );
    const model = extractModel(doc);
    expect(model.objects[0].children).toHaveLength(1);
    expect(model.objects[0].children[0].id).toBe('child');
    expect(model.objects[0].children[0].ellipse).toEqual({ rx: 30, ry: 30 });
  });

  it('extracts style_ref on a scene node', () => {
    const doc = makeDoc(
      starchSchema.node('scene_node', {
        id: 'a', schemaPath: 'objects.a', display: 'inline', geometryType: 'rect',
      }, [
        starchSchema.node('geometry_slot', {
          keyword: 'rect', schemaPath: 'rect',
        }, [starchSchema.text('10x10')]),
        starchSchema.node('style_ref', { name: 'accent' }),
      ]),
    );
    const model = extractModel(doc);
    expect(model.objects[0].style).toBe('accent');
  });
});
