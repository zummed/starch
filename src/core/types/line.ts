import type { AnchorPoint } from './base';

export interface LineProps {
  from?: string;
  to?: string;
  fromAnchor?: AnchorPoint; // specific anchor on source object
  toAnchor?: AnchorPoint;   // specific anchor on target object
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  colour?: string;     // shortcut → stroke (+ fill for label bg if needed)
  stroke?: string;
  strokeWidth?: number;
  dashed?: boolean;
  arrow?: boolean;
  label?: string;
  labelColor?: string;
  labelSize?: number;
  labelRotation?: number; // degrees, default 0 (horizontal)
  opacity?: number;
  progress?: number; // 0–1, partial line drawing
  bend?: number | Array<{ x: number; y: number }>; // auto-curve offset or explicit waypoints
  closed?: boolean;  // close the spline loop (bend must be an array of points)
}
