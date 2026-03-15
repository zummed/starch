import type { AnimConfig, Tracks, SceneObject } from '../core/types';

export function buildTimeline(
  animConfig: AnimConfig,
  objects?: Record<string, SceneObject>,
): Tracks {
  const tracks: Tracks = {};
  for (const kf of animConfig.keyframes) {
    const key = `${kf.target}.${kf.prop}`;
    if (!tracks[key]) tracks[key] = [];
    tracks[key].push({ time: kf.time, value: kf.value, easing: kf.easing || 'linear' });
  }
  for (const key of Object.keys(tracks)) {
    tracks[key].sort((a, b) => a.time - b.time);

    // If the first keyframe is after t=0 and the user explicitly set this prop,
    // prepend a t=0 keyframe with the base value so it animates from the definition.
    if (objects && tracks[key][0].time > 0) {
      const dotIdx = key.indexOf('.');
      const target = key.slice(0, dotIdx);
      const prop = key.slice(dotIdx + 1);
      const obj = objects[target];
      if (obj?._inputKeys?.has(prop)) {
        const baseValue = (obj.props as Record<string, unknown>)[prop];
        if (baseValue !== undefined) {
          tracks[key].unshift({ time: 0, value: baseValue as number | string | boolean, easing: 'linear' });
        }
      }
    }
  }
  return tracks;
}
