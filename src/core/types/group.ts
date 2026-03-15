import type { BaseProps } from './base';

export interface GroupProps extends BaseProps {
  children: string[]; // IDs of contained objects
  rotation?: number;
}
