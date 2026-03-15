import type { BaseProps } from './base';

export interface BoxProps extends BaseProps {
  w: number;
  h: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  text?: string;
  textColor?: string;
  textSize?: number;
  bold?: boolean;
}
