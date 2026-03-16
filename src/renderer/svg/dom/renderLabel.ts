import { createSvgEl, setAttrs } from './svgHelpers';
import { FONT } from '../constants';

export interface LabelHandles {
  root: SVGTextElement;
}

export function createLabel(props: Record<string, unknown>): LabelHandles {
  const root = createSvgEl('text');
  root.setAttribute('dominant-baseline', 'middle');
  root.setAttribute('font-family', FONT);

  updateLabel({ root }, props);
  return { root };
}

export function updateLabel(h: LabelHandles, props: Record<string, unknown>): void {
  const {
    x = 0, y = 0, text = '', color = '#e2e5ea',
    size = 14, bold = false, opacity = 1, align = 'middle', textOffset,
  } = props as Record<string, number | string | boolean | number[] | undefined>;

  const tOff = textOffset as unknown as [number, number] | undefined;

  setAttrs(h.root, {
    x: (x as number) + (tOff?.[0] || 0),
    y: (y as number) + (tOff?.[1] || 0),
    'text-anchor': align as string,
    fill: color as string,
    'font-size': size as number,
    'font-weight': bold ? 700 : 400,
    opacity: opacity as number,
  });
  h.root.textContent = text as string;
}
