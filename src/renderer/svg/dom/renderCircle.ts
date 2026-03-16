import { createSvgEl, setAttrs } from './svgHelpers';
import { scaleAroundAnchor } from '../../../engine/anchor';
import { FONT } from '../constants';
import type { AnchorPoint } from '../../../core/types';

export interface CircleHandles {
  root: SVGGElement;
  innerG: SVGGElement;
  circle: SVGCircleElement;
  text: SVGTextElement;
}

export function createCircle(props: Record<string, unknown>): CircleHandles {
  const root = createSvgEl('g');
  const innerG = createSvgEl('g');
  const circle = createSvgEl('circle');
  const text = createSvgEl('text');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'middle');
  text.setAttribute('font-family', FONT);
  text.style.display = 'none';

  innerG.appendChild(circle);
  innerG.appendChild(text);
  root.appendChild(innerG);

  updateCircle({ root, innerG, circle, text }, props);
  return { root, innerG, circle, text };
}

export function updateCircle(h: CircleHandles, props: Record<string, unknown>): void {
  const {
    x = 0, y = 0, r = 20,
    fill = '#1a1d24', stroke = '#22d3ee', strokeWidth = 1.5,
    text, textColor = '#e2e5ea', textSize = 12,
    opacity = 1, scale = 1, anchor = 'center', textOffset,
  } = props as Record<string, number | string | boolean | number[] | undefined>;

  const { outerTranslate, innerTransform } = scaleAroundAnchor(
    x as number, y as number, scale as number, anchor as AnchorPoint,
    r as number, r as number,
  );

  h.root.setAttribute('transform', outerTranslate);
  h.root.setAttribute('opacity', String(opacity));
  h.innerG.setAttribute('transform', innerTransform);

  setAttrs(h.circle, {
    cx: 0, cy: 0, r: r as number,
    fill: fill as string,
    stroke: stroke as string,
    'stroke-width': strokeWidth as number,
  });

  if (text) {
    h.text.style.display = '';
    const tOff = textOffset as unknown as [number, number] | undefined;
    setAttrs(h.text, {
      x: 0 + (tOff?.[0] || 0),
      y: 1 + (tOff?.[1] || 0),
      fill: textColor as string,
      'font-size': textSize as number,
    });
    h.text.textContent = text as string;
  } else {
    h.text.style.display = 'none';
  }
}
