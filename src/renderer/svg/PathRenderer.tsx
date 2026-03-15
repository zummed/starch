interface PathRendererProps {
  props: Record<string, unknown>;
  debug: boolean;
}

export function PathRenderer({ props, debug }: PathRendererProps) {
  const {
    points = [],
    closed = false,
    stroke = '#4a4f59',
    strokeWidth = 1,
    visible = false,
    opacity = 1,
  } = props as Record<string, unknown>;

  // Only render if debug mode is on, or explicitly visible
  if (!debug && !visible) return null;

  const pts = points as Array<{ x: number; y: number }>;
  if (pts.length < 2) return null;

  const d = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ') + (closed ? ' Z' : '');

  return (
    <path
      d={d}
      fill="none"
      stroke={stroke as string}
      strokeWidth={strokeWidth as number}
      strokeDasharray="4 4"
      opacity={(opacity as number) * 0.5}
    />
  );
}
