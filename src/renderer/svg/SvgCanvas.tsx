import React from 'react';

interface SvgCanvasProps {
  children: React.ReactNode;
  width?: string;
  height?: string;
}

export function SvgCanvas({ children, width = '100%', height = '100%' }: SvgCanvasProps) {
  return (
    <svg width={width} height={height} style={{ background: '#0e1117', display: 'block' }}>
      <defs>
        <pattern id="starch-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#ffffff04" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#starch-grid)" />
      {children}
    </svg>
  );
}
