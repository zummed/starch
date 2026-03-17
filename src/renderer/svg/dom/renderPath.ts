import { createSvgEl, setAttrs } from './svgHelpers';

const DEBUG_STROKE = '#ef4444';

export interface PathHandles {
  root: SVGPathElement;
  _lastPointCount: number;
}

export function createPath(props: Record<string, unknown>, debug: boolean): PathHandles {
  const root = createSvgEl('path');
  root.setAttribute('fill', 'none');

  const handles: PathHandles = { root, _lastPointCount: 0 };
  updatePath(handles, props, debug);
  return handles;
}

export function updatePath(h: PathHandles, props: Record<string, unknown>, debug: boolean): void {
  const {
    points = [],
    closed = false,
    stroke = '#4a4f59',
    strokeWidth = 1,
    visible = false,
    opacity = 1,
  } = props as Record<string, unknown>;

  const isDebugOnly = !visible && debug;
  const pts = points as Array<{ x: number; y: number }>;

  if (pts.length < 2) {
    h.root.style.display = 'none';
    return;
  }
  h.root.style.display = '';

  const smooth = (props.smooth ?? false) as boolean;

  let d: string;
  if (smooth && closed && pts.length >= 3) {
    const n = pts.length;
    const segments: string[] = [`M ${pts[0].x} ${pts[0].y}`];
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      const p3 = pts[(i + 2) % n];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      segments.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`);
    }
    d = segments.join(' ');
  } else {
    d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + (closed ? ' Z' : '');
  }

  setAttrs(h.root, {
    d,
    stroke: isDebugOnly ? DEBUG_STROKE : stroke as string,
    'stroke-width': strokeWidth as number,
    'stroke-dasharray': '4 4',
    opacity: isDebugOnly ? 0.5 : opacity as number,
  });

  h._lastPointCount = pts.length;
}
