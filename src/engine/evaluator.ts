import type { SceneObject, Tracks, Chapter } from '../core/types';
import { interpolate } from './interpolate';

/**
 * Walk all animation tracks at the given time and produce a snapshot
 * of animated props for every object.
 */
export function evaluateAnimatedProps(
  objects: Record<string, SceneObject>,
  tracks: Tracks,
  time: number,
): Record<string, Record<string, unknown>> {
  // Start with base props
  const result: Record<string, Record<string, unknown>> = {};
  for (const [id, obj] of Object.entries(objects)) {
    result[id] = { ...obj.props };
  }

  // Apply animated values
  for (const [key, keyframes] of Object.entries(tracks)) {
    const dotIdx = key.indexOf('.');
    const target = key.slice(0, dotIdx);
    const prop = key.slice(dotIdx + 1);
    if (result[target]) {
      const val = interpolate(keyframes, time);
      if (val !== undefined) result[target][prop] = val;
    }
  }

  return result;
}

/**
 * Find which chapter is active at the given time.
 * Returns the last chapter whose time <= current time, or undefined if before all chapters.
 */
export function getActiveChapter(
  chapters: Chapter[],
  time: number,
): Chapter | undefined {
  if (!chapters || chapters.length === 0) return undefined;
  const sorted = [...chapters].sort((a, b) => a.time - b.time);
  let active: Chapter | undefined;
  for (const ch of sorted) {
    if (time >= ch.time) {
      active = ch;
    } else {
      break;
    }
  }
  return active;
}
