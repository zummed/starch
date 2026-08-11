/**
 * The shape of a playground sample.
 *
 * Samples are split across two tracks. `learn` is a curriculum: a numbered
 * sequence where each lesson introduces one new idea and its DSL is visibly
 * the previous lesson's DSL plus a delta, so the set can be read by diffing.
 * `reference` is the opposite — exhaustive grids with no narrative, for
 * looking things up.
 */
export type SampleTrack = 'learn' | 'reference';

export interface V2Sample {
  /** Unique id. Learn lessons are prefixed with their step number (`06-…`). */
  name: string;
  /** Sidebar grouping in the playground. */
  category: string;
  /** Which track this belongs to — see {@link SampleTrack}. */
  track: SampleTrack;
  description: string;
  /**
   * The concepts this sample is the first to introduce, as DSL-facing names
   * (`fill`, `animate`, `layout.slot`). Across the learn track each concept
   * appears exactly once — `curriculum.test.ts` enforces that, so a lesson
   * cannot quietly start depending on something never taught.
   *
   * Also the index `starchAgentDocs()` uses to answer "which sample shows X".
   */
  teaches: string[];
  dsl: string;
}
