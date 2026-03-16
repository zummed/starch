import { createSvgEl } from './svgHelpers';

export interface CanvasHandles {
  svg: SVGSVGElement;
  content: SVGGElement;
}

export function createCanvas(): CanvasHandles {
  const svg = createSvgEl('svg', {
    width: '100%',
    height: '100%',
  });
  svg.style.background = '#0e1117';
  svg.style.display = 'block';

  const defs = createSvgEl('defs');
  const pattern = createSvgEl('pattern', {
    id: 'starch-grid',
    width: 40,
    height: 40,
    patternUnits: 'userSpaceOnUse',
  });
  const gridPath = createSvgEl('path', {
    d: 'M 40 0 L 0 0 0 40',
    fill: 'none',
    stroke: '#ffffff04',
    'stroke-width': 1,
  });
  pattern.appendChild(gridPath);
  defs.appendChild(pattern);
  svg.appendChild(defs);

  const bg = createSvgEl('rect', {
    width: '100%',
    height: '100%',
    fill: 'url(#starch-grid)',
  });
  svg.appendChild(bg);

  const content = createSvgEl('g');
  svg.appendChild(content);

  return { svg, content };
}
