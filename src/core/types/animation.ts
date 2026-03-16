// ─── Animation Types ────────────────────────────────────────────

export type EasingName =
  | 'linear'
  | 'easeIn' | 'easeOut' | 'easeInOut'
  | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic'
  | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart'
  | 'easeInBack' | 'easeOutBack'
  | 'bounce' | 'elastic' | 'spring'
  | 'snap' | 'step';

export interface Chapter {
  id: string;
  time: number;
  title: string;
  description?: string;
}

// ─── Keyframe Block Format ──────────────────────────────────────

export interface ObjectChanges {
  easing?: EasingName;
  [prop: string]: unknown;
}

export interface KeyframeBlock {
  time: number;
  easing?: EasingName;
  changes: Record<string, ObjectChanges>;
}

export interface AnimConfig {
  duration?: number;
  loop?: boolean;
  easing?: EasingName;
  keyframes: KeyframeBlock[];
  chapters: Chapter[];
}

// ─── Internal Track Format (unchanged) ──────────────────────────

export interface TrackKeyframe {
  time: number;
  value: number | string | boolean;
  easing: EasingName;
}

export type Tracks = Record<string, TrackKeyframe[]>; // key = "objectId.propName"
