import { createSvgEl, setAttrs } from './svgHelpers';
import { scaleAroundAnchor } from '../../../engine/anchor';
import type { AnchorPoint } from '../../../core/types';
import { tokenizeLine } from '../syntax';

const MONO_FONT = "'JetBrains Mono', 'Fira Code', monospace";
const SANS_FONT = "'Inter', 'system-ui', sans-serif";

export interface TextblockHandles {
  root: SVGGElement;
  innerG: SVGGElement;
  bgRect: SVGRectElement;
  lineEls: SVGTextElement[];
}

export function createTextblock(
  props: Record<string, unknown>,
  allProps: Record<string, Record<string, unknown>>,
  id: string,
): TextblockHandles {
  const root = createSvgEl('g');
  const innerG = createSvgEl('g');
  const bgRect = createSvgEl('rect');
  bgRect.style.display = 'none';
  innerG.appendChild(bgRect);
  root.appendChild(innerG);

  const handles: TextblockHandles = { root, innerG, bgRect, lineEls: [] };
  updateTextblock(handles, props, allProps, id);
  return handles;
}

export function updateTextblock(
  h: TextblockHandles,
  props: Record<string, unknown>,
  allProps: Record<string, Record<string, unknown>>,
  id: string,
): void {
  const {
    x = 0, y = 0,
    lines = [],
    color = '#e2e5ea',
    size = 14,
    lineHeight = 1.5,
    align = 'start',
    mono = false,
    bold = false,
    opacity = 1,
    scale = 1,
    anchor = 'center',
    background,
    padding = 0,
    radius = 0,
    syntax,
  } = props as Record<string, number | string | boolean | string[] | undefined>;

  const lineArr = (lines as string[]) || [];
  const fontSize = size as number;
  const lh = (lineHeight as number) * fontSize;
  const font = mono ? MONO_FONT : SANS_FONT;
  const pad = padding as number;

  const blockH = lineArr.length * lh + pad * 2;
  const blockW = Math.max(...lineArr.map(l => l.length * fontSize * 0.6), 100) + pad * 2;

  const { outerTranslate, innerTransform } = scaleAroundAnchor(
    x as number, y as number, scale as number, anchor as AnchorPoint,
    blockW / 2, blockH / 2,
  );

  h.root.setAttribute('transform', outerTranslate);
  h.root.setAttribute('opacity', String(opacity));
  h.innerG.setAttribute('transform', innerTransform);

  if (background) {
    h.bgRect.style.display = '';
    setAttrs(h.bgRect, {
      x: -blockW / 2, y: -blockH / 2,
      width: blockW, height: blockH,
      rx: radius as number,
      fill: background as string,
    });
  } else {
    h.bgRect.style.display = 'none';
  }

  const textAnchor = align === 'end' ? 'end' : align === 'middle' ? 'middle' : 'start';
  const textX = align === 'end' ? blockW / 2 - pad : align === 'middle' ? 0 : -blockW / 2 + pad;

  // Ensure correct number of line elements
  while (h.lineEls.length < lineArr.length) {
    const el = createSvgEl('text');
    h.innerG.appendChild(el);
    h.lineEls.push(el as unknown as SVGTextElement);
  }
  while (h.lineEls.length > lineArr.length) {
    const el = h.lineEls.pop()!;
    el.remove();
  }

  for (let i = 0; i < lineArr.length; i++) {
    const el = h.lineEls[i];
    const lineProps = allProps[`${id}.line${i}`] || {};
    const lineOpacity = (lineProps.opacity as number) ?? 1;
    const lineColor = (lineProps.color as string) || undefined;
    const lineSize = (lineProps.size as number) || fontSize;
    const lineBold = (lineProps.bold as boolean) ?? (bold as boolean);
    const lineText = (lineProps.text as string) ?? lineArr[i];

    setAttrs(el, {
      x: textX,
      y: -blockH / 2 + pad + lh * 0.7 + i * lh,
      'text-anchor': textAnchor,
      'dominant-baseline': 'auto',
      fill: lineColor || (color as string),
      'font-size': lineSize,
      'font-family': font,
      'font-weight': lineBold ? 700 : 400,
      opacity: lineOpacity,
    });
    el.style.whiteSpace = 'pre';

    // Syntax highlighting: render tokens as tspan children
    const useSyntax = syntax && mono && !lineColor;
    if (useSyntax) {
      const tokens = tokenizeLine(lineText, syntax as string, color as string);
      el.textContent = '';
      for (const tok of tokens) {
        const tspan = createSvgEl('tspan');
        tspan.textContent = tok.text;
        tspan.setAttribute('fill', tok.color);
        el.appendChild(tspan);
      }
    } else {
      el.textContent = lineText;
    }
  }
}
