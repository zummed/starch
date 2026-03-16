import type { AnimConfig, Tracks, SceneObject, EasingName } from '../core/types';

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

  if (objects) {
    for (const key of Object.keys(tracks)) {
      if (tracks[key][0].time > 0) {
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
  }

  return tracks;
}
