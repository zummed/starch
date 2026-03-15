import type { BaseProps } from './base';

export interface TableProps extends BaseProps {
  cols: string[];
  rows: string[][];
  colWidth?: number;
  rowHeight?: number;
  fill?: string;
  stroke?: string;
  headerFill?: string;
  textColor?: string;
  headerColor?: string;
  textSize?: number;
  strokeWidth?: number;
}
