import type { EasingName } from '../core/types';

export const EASINGS: Record<EasingName, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => {
    const u = t - 1;
    return u * u * u + 1;
  },
  easeInOutCubic: (t) =>
    t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  easeInQuart: (t) => t * t * t * t,
  easeOutQuart: (t) => {
    const u = t - 1;
    return 1 - u * u * u * u;
  },
  easeInOutQuart: (t) => {
    const u = t - 1;
    return t < 0.5 ? 8 * t * t * t * t : 1 - 8 * u * u * u * u;
  },
  easeOutBack: (t) => {
    const c = 1.70158;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },
  easeInBack: (t) => {
    const c = 1.70158;
    return (c + 1) * t * t * t - c * t * t;
  },
  bounce: (t) => {
    if (t < 1 / 2.75) return 7.5625 * t * t;
    if (t < 2 / 2.75) {
      const u = t - 1.5 / 2.75;
      return 7.5625 * u * u + 0.75;
    }
    if (t < 2.5 / 2.75) {
      const u = t - 2.25 / 2.75;
      return 7.5625 * u * u + 0.9375;
    }
    const u = t - 2.625 / 2.75;
    return 7.5625 * u * u + 0.984375;
  },
  elastic: (t) =>
    t === 0 || t === 1
      ? t
      : -Math.pow(2, 10 * (t - 1)) * Math.sin((t - 1.1) * 5 * Math.PI),
  spring: (t) => 1 - Math.cos(t * 4.5 * Math.PI) * Math.exp(-t * 6),
  snap: (t) => (t > 0 ? 1 : 0),
  step: (t) => (t < 1 ? 0 : 1),
  cut: (t) => (t > 0 ? 1 : 0),  // deprecated — same as snap
};

export function applyEasing(t: number, easingName?: EasingName | string): number {
  if (!easingName || easingName === 'linear') return t;
  const fn = EASINGS[easingName as EasingName];
  return fn ? fn(t) : t;
}
