export interface PathProps {
  points: Array<{ x: number; y: number }>;
  closed?: boolean;
  colour?: string;     // shortcut → stroke
  stroke?: string;
  strokeWidth?: number;
  smooth?: boolean;  // use Catmull-Rom spline instead of straight segments
  opacity?: number;
}
