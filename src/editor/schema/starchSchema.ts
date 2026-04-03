import { Schema } from 'prosemirror-model';
import { attrs } from './schemaBuilder';

export const starchSchema = new Schema({
  nodes: {
    doc: {
      content: '(metadata | scene_node | style_block | animate_block | images_block)*',
    },

    text: {
      group: 'inline',
    },

    metadata: {
      attrs: attrs({
        key: { default: '' },
        schemaPath: { default: '' },
      }),
      content: 'text*',
      defining: true,
    },

    scene_node: {
      attrs: attrs({
        id: { default: '' },
        schemaPath: { default: '' },
        display: { default: '' },
        geometryType: { default: '' },
      }),
      content: '(geometry_slot | property_slot | compound_slot | style_ref | scene_node)*',
      defining: true,
    },

    geometry_slot: {
      attrs: attrs({
        keyword: { default: '' },
        schemaPath: { default: '' },
      }),
      content: 'text*',
      defining: true,
    },

    property_slot: {
      attrs: attrs({
        key: { default: '' },
        schemaPath: { default: '' },
      }),
      content: 'text*',
      defining: true,
    },

    compound_slot: {
      attrs: attrs({
        key: { default: '' },
        schemaPath: { default: '' },
      }),
      content: 'property_slot+',
      defining: true,
    },

    draft_slot: {
      attrs: attrs({
        schemaPath: { default: '' },
        expectedType: { default: '' },
        parentKey: { default: '' },
      }),
      content: 'text*',
      defining: true,
    },

    style_ref: {
      attrs: attrs({
        name: { default: '' },
      }),
      atom: true,
      defining: true,
    },

    style_block: {
      attrs: attrs({
        name: { default: '' },
        schemaPath: { default: '' },
      }),
      content: '(property_slot | compound_slot)*',
      defining: true,
    },

    animate_block: {
      attrs: attrs({
        schemaPath: { default: '' },
      }),
      content: '(property_slot | keyframe_block | chapter)*',
      defining: true,
    },

    keyframe_block: {
      attrs: attrs({
        time: { default: 0 },
        schemaPath: { default: '' },
      }),
      content: 'keyframe_entry*',
      defining: true,
    },

    keyframe_entry: {
      attrs: attrs({
        target: { default: '' },
        property: { default: '' },
        schemaPath: { default: '' },
      }),
      content: 'text*',
      defining: true,
    },

    chapter: {
      attrs: attrs({
        schemaPath: { default: '' },
      }),
      content: 'text*',
      defining: true,
    },

    images_block: {
      attrs: attrs({
        schemaPath: { default: '' },
      }),
      content: 'image_entry*',
      defining: true,
    },

    image_entry: {
      attrs: attrs({
        key: { default: '' },
        schemaPath: { default: '' },
      }),
      content: 'text*',
      defining: true,
    },
  },
});

