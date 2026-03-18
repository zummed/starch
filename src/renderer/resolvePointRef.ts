import type { PointRef } from '../core/types';

/**
 * Resolve a PointRef to absolute coordinates.
 * - string: object ID → look up x/y from allProps
 * - [number, number]: absolute coordinates
 * - [string, number, number]: object ID + offset
 */
export function resolvePointRef(
  ref: PointRef,
  allProps: Record<string, Record<string, unknown>>,
): { x: number; y: number } | null {
  if (typeof ref === 'string') {
    const p = allProps[ref];
    if (!p) return null;
    return { x: (p.x as number) ?? 0, y: (p.y as number) ?? 0 };
  }

  if (Array.isArray(ref)) {
    if (typeof ref[0] === 'number') {
      return { x: ref[0] as number, y: ref[1] as number };
    }
    if (typeof ref[0] === 'string') {
      const p = allProps[ref[0]];
      if (!p) return null;
      return {
        x: ((p.x as number) ?? 0) + (ref[1] as number),
        y: ((p.y as number) ?? 0) + (ref[2] as number),
      };
    }
  }

  return null;
}
