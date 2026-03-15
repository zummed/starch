import type { ObjectType } from './base';
import type { BoxProps } from './box';
import type { CircleProps } from './circle';
import type { TextProps } from './text';
import type { TableProps } from './table';
import type { LineProps } from './line';
import type { PathProps } from './path';
import type { GroupProps } from './group';

// ─── Scene Object ───────────────────────────────────────────────

export type PropsForType<T extends ObjectType> =
  T extends 'box' ? BoxProps :
  T extends 'circle' ? CircleProps :
  T extends 'text' ? TextProps :
  T extends 'table' ? TableProps :
  T extends 'line' ? LineProps :
  T extends 'path' ? PathProps :
  T extends 'group' ? GroupProps :
  never;

export interface SceneObject<T extends ObjectType = ObjectType> {
  type: T;
  id: string;
  props: PropsForType<T>;
  groupId?: string; // which group this object belongs to, if any
}
