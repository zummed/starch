import type { AnchorPoint } from './base';

// Universal coordinate reference: object ID, [x,y], or ["objectId", dx, dy]
export type PointRef = string | [number, number] | [string, number, number];

export interface LineProps {
  from?: PointRef;
  to?: PointRef;
  fromAnchor?: AnchorPoint;
  toAnchor?: AnchorPoint;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  route?: PointRef[];       // waypoints between from and to
  smooth?: boolean;          // true = Catmull-Rom (default), false = polyline
  colour?: string;
  stroke?: string;
  strokeWidth?: number;
  dashed?: boolean;
  arrow?: boolean;
  label?: string;
  labelColor?: string;
  labelSize?: number;
  labelRotation?: number;
  opacity?: number;
  progress?: number;
  bend?: number;             // simple curve offset (number only, array removed)
  radius?: number;           // corner radius for polyline mode
  closed?: boolean;
}
