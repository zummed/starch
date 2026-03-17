import { createSvgEl, setAttrs } from './svgHelpers';
import { scaleAroundAnchor } from '../../../engine/anchor';
import { FONT } from '../constants';
import type { AnchorPoint } from '../../../core/types';

export interface CircleHandles {
  root: SVGGElement;
  innerG: SVGGElement;
  circle: SVGCircleElement;
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

export function createCircle(props: Record<string, unknown>): CircleHandles {
  const root = createSvgEl('g');
  const innerG = createSvgEl('g');
  const circle = createSvgEl('circle');
  const image = createSvgEl('image') as unknown as SVGImageElement;
  image.style.display = 'none';
  const text = createSvgEl('text');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'middle');
  text.setAttribute('font-family', FONT);
  text.style.display = 'none';

  innerG.appendChild(circle);
  innerG.appendChild(image);
  innerG.appendChild(text);
  root.appendChild(innerG);

  const handles = { root, innerG, circle, image, text };
  updateCircle(handles, props);
  return handles;
}

export function updateCircle(h: CircleHandles, props: Record<string, unknown>): void {
  const {
    x = 0, y = 0, r = 20,
    fill = '#1a1d24', stroke = '#22d3ee', strokeWidth = 1.5,
    text, textColor = '#e2e5ea', textSize = 12,
    opacity = 1, scale = 1, anchor = 'center', textOffset,
    image, imageFit = 'contain', imagePadding = 4,
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

  if (image) {
    h.image.style.display = '';
    const imgHalf = ((r as number) - (imagePadding as number)) * 0.707;
    const fit = imageFit === 'cover' ? 'xMidYMid slice' :
                imageFit === 'fill' ? 'none' : 'xMidYMid meet';
    setAttrs(h.image, {
      x: -imgHalf,
      y: -imgHalf,
      width: imgHalf * 2,
      height: imgHalf * 2,
      preserveAspectRatio: fit,
    });
    h.image.setAttribute('href', resolveHref(image as string));
  } else {
    h.image.style.display = 'none';
  }

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
