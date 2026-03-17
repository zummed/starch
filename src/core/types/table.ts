import type { BaseProps } from './base';

export interface TableProps extends BaseProps {
  cols: string[];
  rows: string[][];
  colWidth?: number;
  rowHeight?: number;
  headerFill?: string;
  headerColor?: string;
  strokeWidth?: number;
}
