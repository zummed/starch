import type { TrackKeyframe } from '../core/types';
import { applyEasing } from './easing';

export function lerpColor(a: string, b: string, t: number): string {
  const hexPattern = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
  const ma = hexPattern.exec(a);
  const mb = hexPattern.exec(b);
  if (!ma || !mb) return t < 0.5 ? a : b;
  const r = Math.round(parseInt(ma[1], 16) * (1 - t) + parseInt(mb[1], 16) * t);
  const g = Math.round(parseInt(ma[2], 16) * (1 - t) + parseInt(mb[2], 16) * t);
  const bl = Math.round(parseInt(ma[3], 16) * (1 - t) + parseInt(mb[3], 16) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

export function interpolate(
  keyframes: TrackKeyframe[],
  time: number,
): number | string | boolean | undefined {
  if (keyframes.length === 0) return undefined;
  if (time <= keyframes[0].time) return keyframes[0].value;
  if (time >= keyframes[keyframes.length - 1].time) return keyframes[keyframes.length - 1].value;

  for (let i = 0; i < keyframes.length - 1; i++) {
    if (time >= keyframes[i].time && time <= keyframes[i + 1].time) {
      const rawT =
        (time - keyframes[i].time) / (keyframes[i + 1].time - keyframes[i].time);
      const t = applyEasing(rawT, keyframes[i + 1].easing);
      const a = keyframes[i].value;
      const b = keyframes[i + 1].value;

      if (typeof a === 'number' && typeof b === 'number') {
        return a + (b - a) * t;
      }
      if (typeof a === 'string' && a.startsWith('#') && typeof b === 'string' && b.startsWith('#')) {
        return lerpColor(a, b as string, t);
      }
      return t < 0.5 ? a : b;
    }
  }
  return keyframes[keyframes.length - 1].value;
}
