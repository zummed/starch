export interface PathProps {
  points: Array<{ x: number; y: number }>;
  closed?: boolean;
  stroke?: string;
  strokeWidth?: number;
  visible?: boolean; // only rendered when debug mode is on
  opacity?: number;
}
