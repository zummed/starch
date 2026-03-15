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
  stroke?: string;
  strokeWidth?: number;
  dashed?: boolean;
  arrow?: boolean;
  label?: string;
  labelColor?: string;
  labelSize?: number;
  opacity?: number;
  progress?: number; // 0–1, partial line drawing
}
