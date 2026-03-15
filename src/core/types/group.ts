import type { BaseProps } from './base';

export type LayoutDirection = 'row' | 'column';
export type LayoutJustify = 'start' | 'center' | 'end' | 'spread';
export type LayoutAlign = 'start' | 'center' | 'end';

export interface GroupProps extends BaseProps {
  children: string[]; // IDs of contained objects
  rotation?: number;
  direction?: LayoutDirection;
  gap?: number;
  justify?: LayoutJustify;
  align?: LayoutAlign;
  padding?: number;
  // Visual properties (optional — group is invisible by default)
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  // Set by layout engine
  _layoutW?: number;
  _layoutH?: number;
}
