import type { AnimConfig, Tracks } from '../core/types';

export function buildTimeline(animConfig: AnimConfig): Tracks {
  const tracks: Tracks = {};
  for (const kf of animConfig.keyframes) {
    const key = `${kf.target}.${kf.prop}`;
    if (!tracks[key]) tracks[key] = [];
    tracks[key].push({ time: kf.time, value: kf.value, easing: kf.easing || 'linear' });
  }
  for (const key of Object.keys(tracks)) {
    tracks[key].sort((a, b) => a.time - b.time);
  }
  return tracks;
}
