import { z } from 'zod';
import {
  HslColorSchema, StrokeSchema, TransformSchema, DashSchema,
  LayoutSchema, LayoutHintSchema, SizeSchema,
} from './properties';
import {
  RectGeomSchema, EllipseGeomSchema, TextGeomSchema, PathGeomSchema,
  ImageGeomSchema, CameraSchema, NodeSchema,
} from './node';
import { AnimConfigSchema, KeyframeBlockSchema, ChapterSchema, EasingNameSchema } from './animation';

export interface PropertyDescriptor {
  name: string;
  schema: z.ZodType;
  description: string;
  required: boolean;
  category: 'identity' | 'geometry' | 'visual' | 'transform' | 'layout' | 'animation' | 'meta';
}

const PROPERTY_CATEGORIES: Record<string, PropertyDescriptor['category']> = {
  id: 'identity',
  children: 'identity',
  visible: 'visual',
  rect: 'geometry',
  ellipse: 'geometry',
  text: 'geometry',
  path: 'geometry',
  image: 'geometry',
  fill: 'visual',
  stroke: 'visual',
  opacity: 'visual',
  transform: 'transform',
  depth: 'visual',
  dash: 'visual',
  size: 'layout',
  layout: 'layout',
  layoutHint: 'layout',
  style: 'meta',
  camera: 'meta',
  template: 'meta',
  props: 'meta',
};

function getDescription(schema: z.ZodType): string {
  return schema.description ?? '';
}

function isOptional(schema: z.ZodType): boolean {
  return schema instanceof z.ZodOptional || schema instanceof z.ZodDefault;
}

function unwrap(schema: z.ZodType): z.ZodType {
  if (schema instanceof z.ZodOptional) return unwrap((schema as any)._def.innerType);
  if (schema instanceof z.ZodDefault) return unwrap((schema as any)._def.innerType);
  return schema;
}

/**
 * Get the Zod schema for a dotted property path.
 */
export function getPropertySchema(path: string): z.ZodType | null {
  if (!path) return NodeSchema;

  const segments = path.split('.');
  let current: z.ZodType = NodeSchema;

  for (const segment of segments) {
    const unwrapped = unwrap(current);

    if (unwrapped instanceof z.ZodObject) {
      const shape = (unwrapped as z.ZodObject<any>).shape;
      if (segment in shape) {
        current = shape[segment];
      } else {
        return null;
      }
    } else {
      return null;
    }
  }

  return current;
}

/**
 * Get all available properties for a given context path.
 */
export function getAvailableProperties(path: string): PropertyDescriptor[] {
  const schema = path ? getPropertySchema(path) : NodeSchema;
  if (!schema) return [];

  const unwrapped = unwrap(schema);
  if (!(unwrapped instanceof z.ZodObject)) return [];

  const shape = (unwrapped as z.ZodObject<any>).shape as Record<string, z.ZodType>;
  const results: PropertyDescriptor[] = [];

  for (const [name, fieldSchema] of Object.entries(shape)) {
    if (name.startsWith('_')) continue;

    results.push({
      name,
      schema: fieldSchema,
      description: getDescription(fieldSchema),
      required: !isOptional(fieldSchema),
      category: PROPERTY_CATEGORIES[name] ?? 'meta',
    });
  }

  return results;
}

/**
 * Detect the "type" of a schema for popup selection.
 */
export type SchemaType = 'number' | 'string' | 'boolean' | 'enum' | 'color' | 'object' | 'array' | 'unknown';

export function detectSchemaType(schema: z.ZodType): SchemaType {
  const unwrapped = unwrap(schema);

  if (unwrapped instanceof z.ZodNumber) return 'number';
  if (unwrapped instanceof z.ZodString) return 'string';
  if (unwrapped instanceof z.ZodBoolean) return 'boolean';
  if (unwrapped instanceof z.ZodEnum) return 'enum';
  if (unwrapped instanceof z.ZodArray) return 'array';

  if (unwrapped instanceof z.ZodObject) {
    const shape = (unwrapped as z.ZodObject<any>).shape;
    if ('h' in shape && 's' in shape && 'l' in shape && !('width' in shape)) {
      return 'color';
    }
    return 'object';
  }

  if (unwrapped instanceof z.ZodUnion) {
    const options = (unwrapped as any)._def.options as z.ZodType[];
    if (options) {
      for (const opt of options) {
        if (detectSchemaType(opt) === 'color') return 'color';
      }
    }
  }

  return 'unknown';
}

/**
 * Get enum values from a schema, if it's an enum type.
 */
export function getEnumValues(schema: z.ZodType): string[] | null {
  const unwrapped = unwrap(schema);
  if (unwrapped instanceof z.ZodEnum) {
    return (unwrapped as any).options as string[];
  }
  return null;
}

/**
 * Get number constraints from a schema using validation probes.
 */
export function getNumberConstraints(schema: z.ZodType): { min?: number; max?: number } | null {
  const unwrapped = unwrap(schema);
  if (!(unwrapped instanceof z.ZodNumber)) return null;

  const result: { min?: number; max?: number } = {};

  // Probe for min by testing -Infinity and 0
  if (!unwrapped.safeParse(-1).success && unwrapped.safeParse(0).success) {
    result.min = 0;
  }

  // Probe for common max values
  for (const max of [1, 100, 360]) {
    if (unwrapped.safeParse(max).success && !unwrapped.safeParse(max + 1).success) {
      result.max = max;
      break;
    }
  }

  return result;
}

export {
  HslColorSchema, StrokeSchema, TransformSchema, DashSchema,
  LayoutSchema, LayoutHintSchema, SizeSchema,
  RectGeomSchema, EllipseGeomSchema, TextGeomSchema, PathGeomSchema,
  ImageGeomSchema, CameraSchema, NodeSchema,
  AnimConfigSchema, KeyframeBlockSchema, ChapterSchema, EasingNameSchema,
};
