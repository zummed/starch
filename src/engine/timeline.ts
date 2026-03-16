import type { AnimConfig, Tracks, SceneObject, EasingName } from '../core/types';
import { EFFECT_NAMES } from '../core/types';

export function buildTimeline(
  animConfig: AnimConfig,
  objects?: Record<string, SceneObject>,
): Tracks {
  const tracks: Tracks = {};
  const defaultEasing: EasingName = animConfig.easing || 'linear';

  for (const block of animConfig.keyframes) {
    const blockEasing: EasingName = block.easing || defaultEasing;

    for (const [targetId, changes] of Object.entries(block.changes)) {
      const objectEasing: EasingName = (changes.easing as EasingName) || blockEasing;

      for (const [prop, value] of Object.entries(changes)) {
        if (prop === 'easing') continue;
        if (EFFECT_NAMES.has(prop)) continue; // effects handled separately

        const key = `${targetId}.${prop}`;
        if (!tracks[key]) tracks[key] = [];
        tracks[key].push({
          time: block.time,
          value: value as number | string | boolean,
          easing: objectEasing,
        });
      }
    }
  }

  for (const key of Object.keys(tracks)) {
    tracks[key].sort((a, b) => a.time - b.time);
  }

  // Prepend base values so tracks have a starting point.
  // Use the previous keyframe block's time (not t=0) so transitions
  // happen in the window between adjacent blocks.
  if (objects) {
    const blockTimes = animConfig.keyframes.map(b => b.time).sort((a, b) => a - b);

    const findPrevBlockTime = (before: number, earliest: number): number => {
      let prev = earliest;
      for (const bt of blockTimes) {
        if (bt < before) prev = bt;
        else break;
      }
      return prev;
    };

    for (const key of Object.keys(tracks)) {
      if (tracks[key][0].time > 0) {
        const dotIdx = key.indexOf('.');
        const target = key.slice(0, dotIdx);
        const prop = key.slice(dotIdx + 1);
        const obj = objects[target];
        if (obj?._inputKeys?.has(prop)) {
          const baseValue = (obj.props as Record<string, unknown>)[prop];
          if (baseValue !== undefined) {
            const t = findPrevBlockTime(tracks[key][0].time, 0);
            tracks[key].unshift({ time: t, value: baseValue as number | string | boolean, easing: 'linear' });
          }
        }
      }
    }
  }

  return tracks;
}
