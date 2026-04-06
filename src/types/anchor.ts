export const NAMED_ANCHORS = [
  'center', 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW',
] as const;

export type NamedAnchor = typeof NAMED_ANCHORS[number];
export type FloatAnchor = [number, number];
export type AnchorPoint = NamedAnchor | FloatAnchor;

export function isNamedAnchor(value: unknown): value is NamedAnchor {
  return typeof value === 'string' && NAMED_ANCHORS.includes(value as NamedAnchor);
}
