import type { BaseProps } from './base';

export interface CircleProps extends BaseProps {
  r: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  text?: string;
  textColor?: string;
  textSize?: number;
}
