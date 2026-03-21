import { describe, it, expect } from 'vitest';
import { evaluateEffects, type EffectEntry } from '../../animation/effects';

describe('evaluateEffects', () => {
  it('returns 0 when no effects are active', () => {
    expect(evaluateEffects([], 5)).toBe(0);
  });

  it('returns amplitude at trigger time for pulse', () => {
    const effects: EffectEntry[] = [
      { type: 'pulse', triggerTime: 1, amplitude: 0.12, duration: 0.3 },
    ];
    const value = evaluateEffects(effects, 1);
    expect(value).toBeCloseTo(0.12, 2);
  });

  it('decays pulse to 0 after duration', () => {
    const effects: EffectEntry[] = [
      { type: 'pulse', triggerTime: 1, amplitude: 0.12, duration: 0.3 },
    ];
    expect(evaluateEffects(effects, 1.3)).toBeCloseTo(0, 2);
    expect(evaluateEffects(effects, 2)).toBe(0);
  });

  it('decays pulse smoothly at midpoint', () => {
    const effects: EffectEntry[] = [
      { type: 'pulse', triggerTime: 0, amplitude: 1, duration: 1 },
    ];
    const mid = evaluateEffects(effects, 0.5);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it('returns 0 before trigger time', () => {
    const effects: EffectEntry[] = [
      { type: 'pulse', triggerTime: 2, amplitude: 0.12, duration: 0.3 },
    ];
    expect(evaluateEffects(effects, 1)).toBe(0);
  });

  it('sums multiple active effects', () => {
    const effects: EffectEntry[] = [
      { type: 'pulse', triggerTime: 0, amplitude: 0.1, duration: 1 },
      { type: 'pulse', triggerTime: 0, amplitude: 0.2, duration: 1 },
    ];
    const value = evaluateEffects(effects, 0);
    expect(value).toBeCloseTo(0.3, 2);
  });

  it('handles shake with oscillation', () => {
    const effects: EffectEntry[] = [
      { type: 'shake', triggerTime: 0, amplitude: 5, duration: 0.3 },
    ];
    const value = evaluateEffects(effects, 0.05);
    expect(Math.abs(value)).toBeLessThanOrEqual(5);
  });
});
