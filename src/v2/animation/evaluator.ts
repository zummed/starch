import type { TrackKeyframe, Tracks } from '../types/animation';
import { interpolateValue } from './interpolate';
import { applyEasing } from '../../engine/easing';

export function evaluateTrack(keyframes: TrackKeyframe[], time: number): unknown {
  if (keyframes.length === 0) return undefined;
  if (keyframes.length === 1) return keyframes[0].value;

  // Before first keyframe
  if (time <= keyframes[0].time) return keyframes[0].value;

  // After last keyframe
  if (time >= keyframes[keyframes.length - 1].time) {
    return keyframes[keyframes.length - 1].value;
  }

  // Find the segment
  for (let i = 1; i < keyframes.length; i++) {
    if (time <= keyframes[i].time) {
      const prev = keyframes[i - 1];
      const curr = keyframes[i];
      const duration = curr.time - prev.time;
      if (duration === 0) return curr.value;

      const rawT = (time - prev.time) / duration;
      const easedT = applyEasing(rawT, curr.easing);
      return interpolateValue(prev.value, curr.value, easedT);
    }
  }

  return keyframes[keyframes.length - 1].value;
}

export function evaluateAllTracks(
  tracks: Tracks,
  time: number,
): Map<string, unknown> {
  const result = new Map<string, unknown>();
  for (const [path, keyframes] of tracks) {
    result.set(path, evaluateTrack(keyframes, time));
  }
  return result;
}
