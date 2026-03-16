import type { ObjectType } from './base';
import type { BoxProps } from './box';
import type { CircleProps } from './circle';
import type { LabelProps } from './label';
import type { TableProps } from './table';
import type { LineProps } from './line';
import type { PathProps } from './path';

// ─── Scene Object ───────────────────────────────────────────────

export type PropsForType<T extends ObjectType> =
  T extends 'box' ? BoxProps :
  T extends 'circle' ? CircleProps :
  T extends 'label' ? LabelProps :
  T extends 'table' ? TableProps :
  T extends 'line' ? LineProps :
  T extends 'path' ? PathProps :
  never;

export interface SceneObject<T extends ObjectType = ObjectType> {
  type: T;
  id: string;
  props: PropsForType<T>;
  _inputKeys?: Set<string>; // props explicitly set by the user (vs schema defaults)
  _definitionOrder?: number; // insertion order for layout tie-breaking
}
