import { describe, it, expect } from 'vitest';
import { extractEffects, applyEffects } from '../effects';
import type { AnimConfig, EffectInstance } from '../../core/types';

describe('extractEffects', () => {
  it('extracts effect instances from keyframe blocks', () => {
    const config: AnimConfig = {
      keyframes: [
        { time: 1.0, changes: { box1: { pulse: 0.12, flash: 0.3 } } },
        { time: 2.0, changes: { box2: { shake: 5, glow: 2 } } },
      ],
      chapters: [],
    };
    const effects = extractEffects(config);
    expect(effects).toHaveLength(4);
    expect(effects).toContainEqual({ target: 'box1', effect: 'pulse', amplitude: 0.12, triggerTime: 1.0 });
    expect(effects).toContainEqual({ target: 'box1', effect: 'flash', amplitude: 0.3, triggerTime: 1.0 });
    expect(effects).toContainEqual({ target: 'box2', effect: 'shake', amplitude: 5, triggerTime: 2.0 });
    expect(effects).toContainEqual({ target: 'box2', effect: 'glow', amplitude: 2, triggerTime: 2.0 });
  });

  it('ignores non-effect properties and easing', () => {
    const config: AnimConfig = {
      keyframes: [
        { time: 1.0, changes: { box1: { x: 100, scale: 1.5, pulse: 0.1, easing: 'easeOut' as never } } },
      ],
      chapters: [],
    };
    const effects = extractEffects(config);
    expect(effects).toHaveLength(1);
    expect(effects[0].effect).toBe('pulse');
  });
});

describe('applyEffects', () => {
  function makeResult(id: string, props: Record<string, unknown>) {
    return { [id]: { ...props } };
  }

  it('pulse adds to scale at peak', () => {
    const effects: EffectInstance[] = [
      { target: 'b', effect: 'pulse', amplitude: 0.12, triggerTime: 1.0 },
    ];
    const result = makeResult('b', { scale: 1 });
    // Peak of sin²(πt) is at t=0.5, so elapsed = 0.2 (0.5 * 0.4s duration)
    applyEffects(effects, result, 1.2);
    expect(result.b.scale).toBeGreaterThan(1);
    expect(result.b.scale).toBeLessThanOrEqual(1.12);
  });

  it('pulse has no effect before trigger', () => {
    const effects: EffectInstance[] = [
      { target: 'b', effect: 'pulse', amplitude: 0.12, triggerTime: 2.0 },
    ];
    const result = makeResult('b', { scale: 1 });
    applyEffects(effects, result, 1.5);
    expect(result.b.scale).toBe(1);
  });

  it('pulse decays to zero after duration', () => {
    const effects: EffectInstance[] = [
      { target: 'b', effect: 'pulse', amplitude: 0.12, triggerTime: 1.0 },
    ];
    const result = makeResult('b', { scale: 1 });
    applyEffects(effects, result, 1.5); // 0.5s after trigger, past 0.4s duration
    expect(result.b.scale).toBe(1);
  });

  it('flash adds to opacity, clamped to 1', () => {
    const effects: EffectInstance[] = [
      { target: 'b', effect: 'flash', amplitude: 0.5, triggerTime: 0 },
    ];
    const result = makeResult('b', { opacity: 0.8 });
    applyEffects(effects, result, 0.2); // peak
    expect(result.b.opacity).toBeLessThanOrEqual(1);
    expect(result.b.opacity as number).toBeGreaterThan(0.8);
  });

  it('shake adds deterministic offset to x/y', () => {
    const effects: EffectInstance[] = [
      { target: 'b', effect: 'shake', amplitude: 10, triggerTime: 0 },
    ];
    const result1 = makeResult('b', { x: 100, y: 200 });
    const result2 = makeResult('b', { x: 100, y: 200 });
    applyEffects(effects, result1, 0.1);
    applyEffects(effects, result2, 0.1);
    // Same time = same result (seek-safe)
    expect(result1.b.x).toBe(result2.b.x);
    expect(result1.b.y).toBe(result2.b.y);
    // Should be offset from original
    expect(result1.b.x).not.toBe(100);
  });

  it('glow adds to strokeWidth', () => {
    const effects: EffectInstance[] = [
      { target: 'b', effect: 'glow', amplitude: 3, triggerTime: 0 },
    ];
    const result = makeResult('b', { strokeWidth: 1.5 });
    applyEffects(effects, result, 0.2); // peak
    expect(result.b.strokeWidth as number).toBeGreaterThan(1.5);
  });

  it('multiple effects on same target compose', () => {
    const effects: EffectInstance[] = [
      { target: 'b', effect: 'pulse', amplitude: 0.12, triggerTime: 0 },
      { target: 'b', effect: 'glow', amplitude: 2, triggerTime: 0 },
    ];
    const result = makeResult('b', { scale: 1, strokeWidth: 1.5 });
    applyEffects(effects, result, 0.2);
    expect(result.b.scale as number).toBeGreaterThan(1);
    expect(result.b.strokeWidth as number).toBeGreaterThan(1.5);
  });
});
