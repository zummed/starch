import type { BaseProps } from './base';

export interface CircleProps extends BaseProps {
  r: number;
  strokeWidth?: number;
  image?: string;
  imageFit?: 'contain' | 'cover' | 'fill';
  imagePadding?: number;
}
