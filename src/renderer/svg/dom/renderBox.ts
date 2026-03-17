import { createSvgEl, setAttrs } from './svgHelpers';
import { scaleAroundAnchor } from '../../../engine/anchor';
import { FONT } from '../constants';
import type { AnchorPoint } from '../../../core/types';

export interface BoxHandles {
  root: SVGGElement;
  innerG: SVGGElement;
  rect: SVGRectElement;
  image: SVGImageElement;
  text: SVGTextElement;
}

function resolveHref(href: string): string {
  if (href.startsWith('#')) {
    const el = document.getElementById(href.slice(1));
    if (el) {
      const svg = el instanceof HTMLTemplateElement ? el.content.firstElementChild : el;
      if (svg) {
        const serialized = new XMLSerializer().serializeToString(svg);
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(serialized);
      }
    }
  }
  return href;
}

export function createBox(props: Record<string, unknown>): BoxHandles {
  const root = createSvgEl('g');
  const innerG = createSvgEl('g');
  const rect = createSvgEl('rect');
  const image = createSvgEl('image') as unknown as SVGImageElement;
  image.style.display = 'none';
  const text = createSvgEl('text');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'middle');
  text.setAttribute('font-family', FONT);
  text.style.display = 'none';

  innerG.appendChild(rect);
  innerG.appendChild(image);
  innerG.appendChild(text);
  root.appendChild(innerG);

  const handles = { root, innerG, rect, image, text };
  updateBox(handles, props);
  return handles;
}

export function updateBox(h: BoxHandles, props: Record<string, unknown>): void {
  const {
    x = 0, y = 0, w: rawW = 140, h: rawH = 46,
    _layoutW, _layoutH,
    fill = '#1a1d24', stroke = '#22d3ee', strokeWidth = 1.5,
    radius = 8, text, textColor = '#e2e5ea', textSize = 13,
    opacity = 1, scale = 1, bold = false, anchor = 'center', textOffset,
    textAlign = 'middle', textVAlign = 'middle',
    image, imageFit = 'contain', imagePadding = 4,
  } = props as Record<string, number | string | boolean | number[] | undefined>;

  const w = (_layoutW as number) || (rawW as number);
  const height = (_layoutH as number) || (rawH as number);
  const imgPad = imagePadding as number;

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

  if (image) {
    h.image.style.display = '';
    const fit = imageFit === 'cover' ? 'xMidYMid slice' :
                imageFit === 'fill' ? 'none' : 'xMidYMid meet';
    setAttrs(h.image, {
      x: -(w as number) / 2 + imgPad,
      y: -(height as number) / 2 + imgPad,
      width: (w as number) - imgPad * 2,
      height: (height as number) - imgPad * 2,
      preserveAspectRatio: fit,
    });
    h.image.setAttribute('href', resolveHref(image as string));
  } else {
    h.image.style.display = 'none';
  }

  if (text) {
    h.text.style.display = '';
    const tOff = textOffset as unknown as [number, number] | undefined;
    const ha = textAlign as string;
    const va = textVAlign as string;
    const pad = 6;
    const tx = ha === 'start' ? -(w as number) / 2 + pad
      : ha === 'end' ? (w as number) / 2 - pad : 0;
    const ty = va === 'top' ? -(height as number) / 2 + pad
      : va === 'bottom' ? (height as number) / 2 - pad : 1;
    const anchorVal = ha === 'start' ? 'start' : ha === 'end' ? 'end' : 'middle';
    const baseline = va === 'top' ? 'hanging' : va === 'bottom' ? 'auto' : 'middle';
    setAttrs(h.text, {
      x: tx + (tOff?.[0] || 0),
      y: ty + (tOff?.[1] || 0),
      'text-anchor': anchorVal,
      'dominant-baseline': baseline,
      fill: textColor as string,
      'font-size': textSize as number,
      'font-weight': bold ? 700 : 400,
    });
    h.text.textContent = text as string;
  } else {
    h.text.style.display = 'none';
  }
}
