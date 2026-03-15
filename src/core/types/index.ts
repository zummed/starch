// Base types & anchors
export type { ObjectType, NamedAnchor, FloatAnchor, AnchorPoint, BaseProps } from './base';

// Component props
export type { BoxProps } from './box';
export type { CircleProps } from './circle';
export type { TextProps } from './text';
export type { TableProps } from './table';
export type { LineProps } from './line';
export type { PathProps } from './path';
export type { GroupProps } from './group';

// Scene object
export type { PropsForType, SceneObject } from './scene';

// Animation
export type { EasingName, Keyframe, Chapter, AnimConfig, TrackKeyframe, Tracks } from './animation';

// Events
export type { StarchEventType, StarchEvent, StarchEventHandler, DiagramHandle } from './events';

// Composites (re-export for convenience)
export type {
  StateMachineState,
  StateMachineTransition,
  StateMachineProps,
} from '../composites';
