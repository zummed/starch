import type { BaseProps } from './base';

export interface LabelProps extends Omit<BaseProps, 'align'> {
  text: string;
  color?: string;
  size?: number;
  bold?: boolean;
  align?: 'start' | 'middle' | 'end';
}
