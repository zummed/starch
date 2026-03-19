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

  // Block times for base-prepend and auto-key.
  // Excluded from timing influence:
  //   - blocks with autoKey: false (explicit opt-out)
  //   - effects-only blocks (implicit — fire-and-forget shouldn't shift timing)
  // Empty blocks (changes: {}) are kept — they're intentional timing markers.
  const blockTimes = animConfig.keyframes
    .filter(b => {
      if (b.autoKey === false) return false;
      const targets = Object.values(b.changes);
      if (targets.length === 0) return true; // empty block = timing marker
      return targets.some(changes =>
        Object.keys(changes).some(p => p !== 'easing' && !EFFECT_NAMES.has(p))
      );
    })
    .map(b => b.time)
    .sort((a, b) => a - b);

  // Prepend base values so tracks have a starting point.
  // Use the previous keyframe block's time (not t=0) so transitions
  // happen in the window between adjacent blocks.
  if (objects) {

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
        // Split at last dot for sub-element support: "snippet.line0.text" → target="snippet.line0", prop="text"
        const lastDot = key.lastIndexOf('.');
        const target = key.slice(0, lastDot);
        const prop = key.slice(lastDot + 1);

        // Try direct object lookup first, then sub-element lookup
        let baseValue: unknown;
        const obj = objects[target];
        if (obj) {
          baseValue = (obj.props as Record<string, unknown>)[prop];
        } else {
          // Sub-element: e.g., target="snippet.line0" — find parent and extract line default
          const subMatch = target.match(/^(.+)\.line(\d+)$/);
          if (subMatch) {
            const parentObj = objects[subMatch[1]];
            if (parentObj?.type === 'textblock') {
              const parentProps = parentObj.props as Record<string, unknown>;
              const lines = parentProps.lines as string[] | undefined;
              const lineIdx = parseInt(subMatch[2]);
              const lineDefaults = parentProps._lineDefaults as Record<number, Record<string, unknown>> | undefined;
              // Check per-line defaults first, then parent prop, then line text
              if (lineDefaults?.[lineIdx]?.[prop] !== undefined) {
                baseValue = lineDefaults[lineIdx][prop];
              } else if (prop === 'text' && lines?.[lineIdx] !== undefined) {
                baseValue = lines[lineIdx];
              } else {
                baseValue = parentProps[prop];
              }
            }
          }
        }

        if (baseValue !== undefined) {
          const t = findPrevBlockTime(tracks[key][0].time, 0);
          tracks[key].unshift({ time: t, value: baseValue as number | string | boolean, easing: 'linear' });
        }
      }
    }
  }

  // Auto-key: fill gaps at block boundaries so transitions only span adjacent blocks.
  // When a property track spans multiple blocks without keyframes in between,
  // insert holds at each intermediate block time with the last known value.
  const autoKey = animConfig.autoKey ?? true;
  if (autoKey && objects) {
    const bt = blockTimes;
    for (const key of Object.keys(tracks)) {
      const track = tracks[key];
      if (track.length < 2) continue;

      const firstTime = track[0].time;
      const lastTime = track[track.length - 1].time;
      const existingTimes = new Set(track.map(kf => kf.time));

      const inserts: typeof track = [];
      for (const t of bt) {
        if (t <= firstTime || t >= lastTime) continue;
        if (existingTimes.has(t)) continue;
        let holdValue = track[0].value;
        for (const kf of track) {
          if (kf.time <= t) holdValue = kf.value;
          else break;
        }
        inserts.push({ time: t, value: holdValue, easing: 'linear' as EasingName });
      }

      if (inserts.length > 0) {
        track.push(...inserts);
        track.sort((a, b) => a.time - b.time);
      }
    }
  }

  return tracks;
}
