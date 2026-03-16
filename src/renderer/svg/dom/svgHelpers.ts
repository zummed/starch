export const SVG_NS = 'http://www.w3.org/2000/svg';

export function createSvgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) setAttrs(el, attrs);
  return el;
}

export function setAttrs(el: SVGElement, attrs: Record<string, string | number>): void {
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
}

export function removeChildren(el: SVGElement): void {
  while (el.lastChild) el.removeChild(el.lastChild);
}
