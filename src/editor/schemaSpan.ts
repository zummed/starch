// src/editor/schemaSpan.ts

export type SchemaSection = 'node' | 'style' | 'animate' | 'images';

export interface SchemaSpan {
  from: number;        // character offset in text
  to: number;
  schemaPath: string;  // e.g., "stroke.color" — for schema lookup
  modelPath: string;   // e.g., "objects.box.stroke.color" — uses node ID, not array index
  section: SchemaSection;
}

export interface RenderResult {
  text: string;
  spans: SchemaSpan[];
}
