export type EasingName =
  | 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
  | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic'
  | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart'
  | 'easeInBack' | 'easeOutBack'
  | 'bounce' | 'elastic' | 'spring'
  | 'snap' | 'step' | 'cut';

export interface PropertyChange {
  value: unknown;
  easing?: EasingName;
}

export interface KeyframeBlock {
  time: number;
  plus?: number;
  delay?: number;
  easing?: EasingName;
  autoKey?: boolean;
  changes: Record<string, unknown | PropertyChange>;
}

export interface Chapter {
  name: string;
  time: number;
}

export interface AnimConfig {
  duration: number;
  loop?: boolean;
  autoKey?: boolean;
  easing?: EasingName;
  keyframes: KeyframeBlock[];
  chapters?: Chapter[];
}

export interface TrackKeyframe {
  time: number;
  value: unknown;
  easing: EasingName;
}

export type Tracks = Map<string, TrackKeyframe[]>;
