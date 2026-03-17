import React from 'react';
import type { ViewBox } from '../../engine/camera';

interface SvgCanvasProps {
  children: React.ReactNode;
  width?: string;
  height?: string;
  background?: string;
  showGrid?: boolean;
  viewBox?: ViewBox | null;
}

export function SvgCanvas({ children, width = '100%', height = '100%', background = '#0e1117', showGrid = true, viewBox }: SvgCanvasProps) {
  const isTransparent = background === 'transparent' || background === 'none';
  const vb = viewBox ? `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}` : undefined;
  return (
    <svg
      width={width}
      height={height}
      viewBox={vb}
      preserveAspectRatio="xMidYMid meet"
      style={{ background: isTransparent ? 'transparent' : background, display: 'block' }}
    >
      {showGrid && !isTransparent && (
        <>
          <defs>
            <pattern id="starch-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#ffffff04" strokeWidth="1" />
            </pattern>
          </defs>
          <rect x={viewBox?.x ?? 0} y={viewBox?.y ?? 0} width={viewBox?.width ?? '100%'} height={viewBox?.height ?? '100%'} fill="url(#starch-grid)" />
        </>
      )}
      {children}
    </svg>
  );
}
