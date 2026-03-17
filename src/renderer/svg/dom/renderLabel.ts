import { createSvgEl, setAttrs } from './svgHelpers';
import { FONT } from '../constants';

export interface LabelHandles {
  root: SVGGElement;
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

export function createLabel(props: Record<string, unknown>): LabelHandles {
  const root = createSvgEl('g');
  const image = createSvgEl('image') as unknown as SVGImageElement;
  image.style.display = 'none';
  const text = createSvgEl('text');
  text.setAttribute('dominant-baseline', 'middle');
  text.setAttribute('font-family', FONT);

  root.appendChild(image);
  root.appendChild(text);

  const handles = { root, image, text };
  updateLabel(handles, props);
  return handles;
}

export function updateLabel(h: LabelHandles, props: Record<string, unknown>): void {
  const {
    x = 0, y = 0, text = '', color = '#e2e5ea',
    size = 14, bold = false, opacity = 1, align = 'middle', textOffset,
    image, imageFit = 'contain', imagePadding = 2,
  } = props as Record<string, number | string | boolean | number[] | undefined>;

  const tOff = textOffset as unknown as [number, number] | undefined;
  const tx = (x as number) + (tOff?.[0] || 0);
  const ty = (y as number) + (tOff?.[1] || 0);

  h.root.setAttribute('opacity', String(opacity));

  if (image) {
    h.image.style.display = '';
    const imgSize = (size as number) * 1.4;
    const imgPad = imagePadding as number;
    const fit = imageFit === 'cover' ? 'xMidYMid slice' :
                imageFit === 'fill' ? 'none' : 'xMidYMid meet';
    setAttrs(h.image, {
      x: tx - imgSize / 2,
      y: ty - imgSize / 2,
      width: imgSize - imgPad * 2,
      height: imgSize - imgPad * 2,
      preserveAspectRatio: fit,
    });
    h.image.setAttribute('href', resolveHref(image as string));

    // Text shifts right of image
    setAttrs(h.text, {
      x: tx + imgSize / 2 + 4,
      y: ty,
      'text-anchor': 'start',
      fill: color as string,
      'font-size': size as number,
      'font-weight': bold ? 700 : 400,
    });
  } else {
    h.image.style.display = 'none';
    setAttrs(h.text, {
      x: tx,
      y: ty,
      'text-anchor': align as string,
      fill: color as string,
      'font-size': size as number,
      'font-weight': bold ? 700 : 400,
    });
  }
  h.text.textContent = text as string;
}
