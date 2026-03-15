import type { SceneObject } from '../../core/types';
import { scaleAroundAnchor } from '../../engine/anchor';
import type { AnchorPoint } from '../../core/types';

interface GroupRendererProps {
  props: Record<string, unknown>;
  objects: Record<string, SceneObject>;
  allProps: Record<string, Record<string, unknown>>;
  renderObject: (id: string, obj: SceneObject) => React.ReactNode;
}

export function GroupRenderer({ props, objects, allProps, renderObject }: GroupRendererProps) {
  const {
    x = 0,
    y = 0,
    opacity = 1,
    scale = 1,
    anchor = 'center',
    children = [],
    rotation = 0,
  } = props as Record<string, unknown>;

  const childIds = children as string[];

  // For groups, we use a simple translate + scale. The "bounding box" for anchor
  // is approximate — computed from children bounds in a future iteration.
  // For now, anchor around the group's own position.
  const { outerTranslate, innerTransform } = scaleAroundAnchor(
    x as number, y as number, scale as number, anchor as AnchorPoint, 0, 0,
  );

  const rotationTransform = (rotation as number) !== 0
    ? ` rotate(${rotation as number})`
    : '';

  return (
    <g
      transform={outerTranslate}
      opacity={opacity as number}
    >
      <g transform={`${innerTransform}${rotationTransform}`}>
        {/* Render children relative to group origin — children positions become offsets */}
        {childIds.map((childId) => {
          const obj = objects[childId];
          if (!obj) return null;
          // Children are rendered with their own positions relative to the group
          return renderObject(childId, obj);
        })}
      </g>
    </g>
  );
}
