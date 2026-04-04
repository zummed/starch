import { Schema, type DOMOutputSpec } from 'prosemirror-model';
import { attrs } from './schemaBuilder';

/** Fallback toDOM for block nodes — used when no NodeView is registered. */
const block0: DOMOutputSpec = ['div', 0];
const inline0: DOMOutputSpec = ['span', 0];

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
      toDOM: () => block0,
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
      toDOM: () => block0,
      defining: true,
    },

    geometry_slot: {
      attrs: attrs({
        keyword: { default: '' },
        schemaPath: { default: '' },
      }),
      content: 'text*',
      toDOM: () => block0,
      defining: true,
    },

    property_slot: {
      attrs: attrs({
        key: { default: '' },
        schemaPath: { default: '' },
      }),
      content: 'text*',
      toDOM: () => block0,
      defining: true,
    },

    compound_slot: {
      attrs: attrs({
        key: { default: '' },
        schemaPath: { default: '' },
      }),
      content: 'property_slot+',
      toDOM: () => block0,
      defining: true,
    },

    draft_slot: {
      attrs: attrs({
        schemaPath: { default: '' },
        expectedType: { default: '' },
        parentKey: { default: '' },
      }),
      content: 'text*',
      toDOM: () => block0,
      defining: true,
    },

    style_ref: {
      attrs: attrs({
        name: { default: '' },
      }),
      atom: true,
      toDOM: (node) => ['span', { class: 'style-ref' }, `@${node.attrs.name}`] as DOMOutputSpec,
      defining: true,
    },

    style_block: {
      attrs: attrs({
        name: { default: '' },
        schemaPath: { default: '' },
      }),
      content: '(property_slot | compound_slot)*',
      toDOM: () => block0,
      defining: true,
    },

    animate_block: {
      attrs: attrs({
        schemaPath: { default: '' },
      }),
      content: '(property_slot | keyframe_block | chapter)*',
      toDOM: () => block0,
      defining: true,
    },

    keyframe_block: {
      attrs: attrs({
        time: { default: 0 },
        schemaPath: { default: '' },
      }),
      content: 'keyframe_entry*',
      toDOM: () => block0,
      defining: true,
    },

    keyframe_entry: {
      attrs: attrs({
        target: { default: '' },
        property: { default: '' },
        schemaPath: { default: '' },
      }),
      content: 'text*',
      toDOM: () => block0,
      defining: true,
    },

    chapter: {
      attrs: attrs({
        schemaPath: { default: '' },
      }),
      content: 'text*',
      toDOM: () => block0,
      defining: true,
    },

    images_block: {
      attrs: attrs({
        schemaPath: { default: '' },
      }),
      content: 'image_entry*',
      toDOM: () => block0,
      defining: true,
    },

    image_entry: {
      attrs: attrs({
        key: { default: '' },
        schemaPath: { default: '' },
      }),
      content: 'text*',
      toDOM: () => block0,
      defining: true,
    },
  },
});
