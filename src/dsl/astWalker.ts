import type { DslHints, PositionalHint } from './dslMeta';

/**
 * Walk a schema's DSL hints, calling the strategy for each element.
 * The strategy determines whether we're emitting (model→text) or consuming (text→model).
 *
 * Walk order: keyword → positional → sigil → kwargs → flags → children → record
 *
 * For schemas with variants, selects the matching variant based on the strategy's
 * variant detection (value inspection for emit, token lookahead for consume).
 */
export function walkSchema(
  hints: DslHints,
  strategy: WalkStrategy,
): void {
  // Resolve variants if present
  const effectiveHints = strategy.resolveVariant?.(hints) ?? hints;

  // Keyword
  if (effectiveHints.keyword) {
    strategy.handleKeyword(effectiveHints.keyword);
  }

  // Positional
  if (effectiveHints.positional) {
    for (const pos of effectiveHints.positional) {
      strategy.handlePositional(pos);
    }
  }

  // Sigil
  if (effectiveHints.sigil) {
    strategy.handleSigil(effectiveHints.sigil);
  }

  // Kwargs
  if (effectiveHints.kwargs) {
    for (const key of effectiveHints.kwargs) {
      strategy.handleKwarg(key);
    }
  }

  // Flags
  if (effectiveHints.flags) {
    for (const key of effectiveHints.flags) {
      strategy.handleFlag(key);
    }
  }

  // Children (block sub-schemas)
  if (effectiveHints.children) {
    for (const [key, mode] of Object.entries(effectiveHints.children)) {
      strategy.handleChildren(key, mode);
    }
  }

  // Record (dynamic-keyed maps)
  if (effectiveHints.record) {
    strategy.handleRecord(effectiveHints.record);
  }
}

export interface WalkStrategy {
  handleKeyword(keyword: string): void;
  handlePositional(hint: PositionalHint): void;
  handleSigil(sigil: { key: string; prefix: string }): void;
  handleKwarg(key: string): void;
  handleFlag(key: string): void;
  handleChildren(key: string, mode: 'block' | 'inline'): void;
  handleRecord(record: { key: string; entryHints: DslHints }): void;
  resolveVariant?(hints: DslHints): DslHints;
}
