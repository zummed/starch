/**
 * Playground samples.
 *
 * Two tracks, one list. The learn track (`learn.ts`) comes first and is meant
 * to be read in order — 22 numbered lessons that build one diagram, each
 * introducing a single new idea. The reference track (`reference.ts`) is the
 * lookup material: exhaustive grids of every shape, easing and colour format.
 *
 * Both tracks share the topical `category` used to group the sidebar, so a
 * reference grid files itself next to the lessons it backs up. `track` is what
 * tells them apart.
 */
import { learnSamples } from './learn';
import { referenceSamples } from './reference';

export type { V2Sample, SampleTrack } from './types';
import type { V2Sample } from './types';

export { learnSamples } from './learn';
export { referenceSamples } from './reference';

export const v2Samples: V2Sample[] = [...learnSamples, ...referenceSamples];

/** The lesson the playground opens on, and the README hero. */
export const DEFAULT_SAMPLE_NAME = '22-request-flow';

export function getV2SampleCategories(): string[] {
  return [...new Set(v2Samples.map(s => s.category))];
}

export function getV2SamplesByCategory(category: string): V2Sample[] {
  return v2Samples.filter(s => s.category === category);
}

export function getV2Sample(name: string): V2Sample | undefined {
  return v2Samples.find(s => s.name === name);
}

/**
 * Concept → the lesson that introduces it. Built from the `teaches` field, so
 * it stays true by construction rather than by anyone remembering to update a
 * table. This is what answers "which sample shows layout.slot?".
 */
export function getConceptIndex(): Map<string, V2Sample> {
  const index = new Map<string, V2Sample>();
  for (const sample of learnSamples) {
    for (const concept of sample.teaches) {
      if (!index.has(concept)) index.set(concept, sample);
    }
  }
  return index;
}
