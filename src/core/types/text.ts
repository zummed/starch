import type { BaseProps } from './base';

export interface TextProps extends BaseProps {
  text: string;
  color?: string;
  size?: number;
  bold?: boolean;
  align?: 'start' | 'middle' | 'end';
}
