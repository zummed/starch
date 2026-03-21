/**
 * Compatibility layer: translates the old Starch DSL format into the new
 * compositional node format.
 *
 * Old format:
 *   { type: "box", id: "b1", x: 100, y: 50, w: 120, h: 60, colour: "dodgerblue", text: "Hello" }
 *
 * New format:
 *   { template: "box", id: "b1", props: { w: 120, h: 60, colour: "dodgerblue", text: "Hello", transform: { x: 100, y: 50 } } }
 */

const TEMPLATE_MAP: Record<string, string> = {
  box: 'box',
  circle: 'circle',
  label: 'label',
  line: 'line',
  path: 'line', // path objects with from/to become line templates
  table: 'table',
  textblock: 'textblock',
  code: 'codeblock',
};

const POSITION_KEYS = ['x', 'y', 'rotation', 'scale', 'at', 'anchor'] as const;
const META_KEYS = ['type', 'id'] as const;

export function convertOldObject(obj: Record<string, unknown>): Record<string, unknown> {
  const type = obj.type as string;
  const id = obj.id as string;

  if (!type || !id) return obj;

  const templateName = TEMPLATE_MAP[type];
  if (!templateName) return obj;

  const props: Record<string, unknown> = {};
  const transform: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if ((META_KEYS as readonly string[]).includes(key)) continue;

    if ((POSITION_KEYS as readonly string[]).includes(key)) {
      transform[key] = value;
    } else {
      props[key] = value;
    }
  }

  if (Object.keys(transform).length > 0) {
    props.transform = transform;
  }

  // Handle type-specific conversions
  if (type === 'circle' && props.r === undefined) {
    props.r = 30;
  }

  // Convert old keyframe format (object-grouped) references
  // Old: { target: "b1", prop: "x", ... } → new: { "b1.transform.x": ... }
  // This is handled at the animation config level, not per-object

  return { template: templateName, id, props };
}

export function convertOldFormat(raw: Record<string, unknown>): Record<string, unknown> {
  const result = { ...raw };

  // Convert objects array
  if (Array.isArray(raw.objects)) {
    result.objects = raw.objects.map((obj: any) => convertOldObject(obj));
  }

  return result;
}
