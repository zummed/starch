import { createSvgEl, setAttrs } from './svgHelpers';
import { scaleAroundAnchor } from '../../../engine/anchor';
import type { AnchorPoint, SceneObject } from '../../../core/types';

export type RenderObjectFn = (id: string, obj: SceneObject) => SVGElement | null;

export interface GroupHandles {
  root: SVGGElement;
  innerG: SVGGElement;
  bgRect: SVGRectElement;
}

export function createGroup(
  props: Record<string, unknown>,
  objects: Record<string, SceneObject>,
  renderObject: RenderObjectFn,
): GroupHandles {
  const root = createSvgEl('g');
  const innerG = createSvgEl('g');
  const bgRect = createSvgEl('rect');
  bgRect.style.display = 'none';
  innerG.appendChild(bgRect);
  root.appendChild(innerG);

  const handles: GroupHandles = { root, innerG, bgRect };
  updateGroup(handles, props, objects, renderObject);
  return handles;
}

export function updateGroup(
  h: GroupHandles,
  props: Record<string, unknown>,
  objects: Record<string, SceneObject>,
  renderObject: RenderObjectFn,
): void {
  const {
    x = 0, y = 0, opacity = 1, scale = 1, anchor = 'center',
    children = [], rotation = 0,
    fill, stroke, strokeWidth = 2, radius = 0,
    _layoutW, _layoutH,
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

  h.root.setAttribute('transform', outerTranslate);
  h.root.setAttribute('opacity', String(opacity));
  h.innerG.setAttribute('transform', `${innerTransform}${rotationTransform}`);

  // Background rect
  const hasVisual = !!(fill || stroke);
  if (hasVisual && (_layoutW as number) > 0 && (_layoutH as number) > 0) {
    h.bgRect.style.display = '';
    setAttrs(h.bgRect, {
      x: -hw, y: -hh,
      width: _layoutW as number, height: _layoutH as number,
      rx: radius as number, ry: radius as number,
      fill: (fill as string) || 'none',
      stroke: (stroke as string) || 'none',
      'stroke-width': stroke ? (strokeWidth as number) : 0,
    });
  } else {
    h.bgRect.style.display = 'none';
  }

  // Remove existing children (except bgRect) and re-render
  while (h.innerG.childNodes.length > 1) {
    h.innerG.removeChild(h.innerG.lastChild!);
  }

  for (const childId of childIds) {
    const obj = objects[childId];
    if (!obj) continue;
    const childEl = renderObject(childId, obj);
    if (childEl) h.innerG.appendChild(childEl);
  }
}
