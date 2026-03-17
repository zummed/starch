import { createSvgEl } from './svgHelpers';

export interface CanvasHandles {
  svg: SVGSVGElement;
  content: SVGGElement;
  setBackground: (bg: string) => void;
  setViewBox: (x: number, y: number, w: number, h: number) => void;
  clearViewBox: () => void;
}

export function createCanvas(background = '#0e1117'): CanvasHandles {
  const svg = createSvgEl('svg', {
    width: '100%',
    height: '100%',
  });
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
  });
  svg.appendChild(bg);

  const content = createSvgEl('g');
  svg.appendChild(content);

  function setBackground(color: string) {
    const isTransparent = color === 'transparent' || color === 'none';
    svg.style.background = isTransparent ? 'transparent' : color;
    bg.setAttribute('fill', isTransparent ? 'none' : 'url(#starch-grid)');
  }

  setBackground(background);

  function setViewBox(x: number, y: number, w: number, h: number) {
    svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    bg.setAttribute('x', String(x));
    bg.setAttribute('y', String(y));
    bg.setAttribute('width', String(w));
    bg.setAttribute('height', String(h));
  }

  function clearViewBox() {
    svg.removeAttribute('viewBox');
    svg.removeAttribute('preserveAspectRatio');
    bg.setAttribute('x', '0');
    bg.setAttribute('y', '0');
    bg.setAttribute('width', '100%');
    bg.setAttribute('height', '100%');
  }

  return { svg, content, setBackground, setViewBox, clearViewBox };
}
