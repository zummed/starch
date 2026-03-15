import type { BaseProps } from './base';

export interface LabelProps extends BaseProps {
  text: string;
  color?: string;
  size?: number;
  bold?: boolean;
  align?: 'start' | 'middle' | 'end';
}
