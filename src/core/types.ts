// ─── Object Types ───────────────────────────────────────────────

export type ObjectType = 'box' | 'circle' | 'text' | 'table' | 'line' | 'path' | 'group';

// Named anchor presets (cardinal + ordinal + legacy names)
export type NamedAnchor =
  | 'center'
  | 'top' | 'bottom' | 'left' | 'right'
  | 'topleft' | 'topright' | 'bottomleft' | 'bottomright'
  | 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

// Float-based anchor: x and y in [0, 1] where (0,0) = top-left, (1,1) = bottom-right
export interface FloatAnchor {
  x: number; // 0–1
  y: number; // 0–1
}

export type AnchorPoint = NamedAnchor | FloatAnchor;

// ─── Base Props ─────────────────────────────────────────────────

export interface BaseProps {
  x: number;
  y: number;
  opacity?: number;    // 0–1, default 1
  scale?: number;      // default 1
  anchor?: AnchorPoint; // default 'center'
}

export interface BoxProps extends BaseProps {
  w: number;
  h: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  text?: string;
  textColor?: string;
  textSize?: number;
  bold?: boolean;
}

export interface CircleProps extends BaseProps {
  r: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  text?: string;
  textColor?: string;
  textSize?: number;
}

export interface TextProps extends BaseProps {
  text: string;
  color?: string;
  size?: number;
  bold?: boolean;
  align?: 'start' | 'middle' | 'end';
}

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

export interface LineProps {
  from?: string;
  to?: string;
  fromAnchor?: AnchorPoint; // specific anchor on source object
  toAnchor?: AnchorPoint;   // specific anchor on target object
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  stroke?: string;
  strokeWidth?: number;
  dashed?: boolean;
  arrow?: boolean;
  label?: string;
  labelColor?: string;
  labelSize?: number;
  opacity?: number;
  progress?: number; // 0–1, partial line drawing
}

export interface PathProps {
  points: Array<{ x: number; y: number }>;
  closed?: boolean;
  stroke?: string;
  strokeWidth?: number;
  visible?: boolean; // only rendered when debug mode is on
  opacity?: number;
}

export interface GroupProps extends BaseProps {
  children: string[]; // IDs of contained objects
  rotation?: number;
}

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

// ─── Animation Types ────────────────────────────────────────────

export type EasingName =
  | 'linear'
  | 'easeIn' | 'easeOut' | 'easeInOut'
  | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic'
  | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart'
  | 'easeInBack' | 'easeOutBack'
  | 'bounce' | 'elastic' | 'spring'
  | 'snap' | 'step';

export interface Keyframe {
  time: number;
  target: string;
  prop: string;
  value: number | string | boolean;
  easing: EasingName;
}

export interface Chapter {
  id: string;
  time: number;
  title: string;
  description?: string;
}

export interface AnimConfig {
  duration: number;
  loop: boolean;
  keyframes: Keyframe[];
  chapters: Chapter[];
}

export interface TrackKeyframe {
  time: number;
  value: number | string | boolean;
  easing: EasingName;
}

export type Tracks = Record<string, TrackKeyframe[]>; // key = "objectId.propName"

// ─── Events ─────────────────────────────────────────────────────

export type StarchEventType =
  | 'chapterEnter'
  | 'chapterExit'
  | 'animationEnd'
  | 'animationLoop';

export interface StarchEvent {
  type: StarchEventType;
  chapter?: Chapter;
  time: number;
}

export type StarchEventHandler = (event: StarchEvent) => void;

// ─── Diagram Component Props ────────────────────────────────────

export interface DiagramHandle {
  play(): void;
  pause(): void;
  seek(time: number): void;
  nextChapter(): void;
  prevChapter(): void;
}
