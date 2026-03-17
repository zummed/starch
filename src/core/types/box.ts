import type { BaseProps } from './base';

export interface BoxProps extends BaseProps {
  w: number;
  h: number;
  strokeWidth?: number;
  radius?: number;
  bold?: boolean;
  image?: string;
  imageFit?: 'contain' | 'cover' | 'fill';
  imagePadding?: number;
}
