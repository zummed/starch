import { createSvgEl, setAttrs } from './svgHelpers';
import { scaleAroundAnchor } from '../../../engine/anchor';
import { FONT } from '../constants';
import type { AnchorPoint } from '../../../core/types';

export interface BoxHandles {
  root: SVGGElement;
  innerG: SVGGElement;
  rect: SVGRectElement;
  text: SVGTextElement;
}

export function createBox(props: Record<string, unknown>): BoxHandles {
  const root = createSvgEl('g');
  const innerG = createSvgEl('g');
  const rect = createSvgEl('rect');
  const text = createSvgEl('text');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'middle');
  text.setAttribute('font-family', FONT);
  text.style.display = 'none';

  innerG.appendChild(rect);
  innerG.appendChild(text);
  root.appendChild(innerG);

  updateBox({ root, innerG, rect, text }, props);
  return { root, innerG, rect, text };
}

export function updateBox(h: BoxHandles, props: Record<string, unknown>): void {
  const {
    x = 0, y = 0, w: rawW = 140, h: rawH = 46,
    _layoutW, _layoutH,
    fill = '#1a1d24', stroke = '#22d3ee', strokeWidth = 1.5,
    radius = 8, text, textColor = '#e2e5ea', textSize = 13,
    opacity = 1, scale = 1, bold = false, anchor = 'center', textOffset,
  } = props as Record<string, number | string | boolean | number[] | undefined>;

  const w = (_layoutW as number) || (rawW as number);
  const height = (_layoutH as number) || (rawH as number);

  const { outerTranslate, innerTransform } = scaleAroundAnchor(
    x as number, y as number, scale as number, anchor as AnchorPoint,
    (w as number) / 2, (height as number) / 2,
  );

  h.root.setAttribute('transform', outerTranslate);
  h.root.setAttribute('opacity', String(opacity));
  h.innerG.setAttribute('transform', innerTransform);

  setAttrs(h.rect, {
    x: -(w as number) / 2,
    y: -(height as number) / 2,
    width: w as number,
    height: height as number,
    rx: radius as number,
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
      'font-weight': bold ? 700 : 400,
    });
    h.text.textContent = text as string;
  } else {
    h.text.style.display = 'none';
  }
}
