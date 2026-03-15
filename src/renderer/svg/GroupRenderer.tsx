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
    fill,
    stroke,
    strokeWidth = 2,
    radius = 0,
    _layoutW,
    _layoutH,
  } = props as Record<string, unknown>;

  const childIds = children as string[];

  const hw = ((_layoutW as number) || 0) / 2;
  const hh = ((_layoutH as number) || 0) / 2;

  const { outerTranslate, innerTransform } = scaleAroundAnchor(
    x as number, y as number, scale as number, anchor as AnchorPoint, hw, hh,
  );

  const rotationTransform = (rotation as number) !== 0
    ? ` rotate(${rotation as number})`
    : '';

  const hasVisual = !!(fill || stroke);

  return (
    <g
      transform={outerTranslate}
      opacity={opacity as number}
    >
      <g transform={`${innerTransform}${rotationTransform}`}>
        {hasVisual && (_layoutW as number) > 0 && (_layoutH as number) > 0 && (
          <rect
            x={-hw}
            y={-hh}
            width={_layoutW as number}
            height={_layoutH as number}
            rx={radius as number}
            ry={radius as number}
            fill={(fill as string) || 'none'}
            stroke={(stroke as string) || 'none'}
            strokeWidth={stroke ? (strokeWidth as number) : 0}
          />
        )}
        {childIds.map((childId) => {
          const obj = objects[childId];
          if (!obj) return null;
          return renderObject(childId, obj) as React.ReactNode;
        })}
      </g>
    </g>
  );
}
