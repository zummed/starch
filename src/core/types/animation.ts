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
