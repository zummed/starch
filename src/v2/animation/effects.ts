export type EffectType = 'pulse' | 'shake' | 'flash' | 'glow';

export interface EffectEntry {
  type: EffectType;
  triggerTime: number;
  amplitude: number;
  duration: number;
}

function decay(elapsed: number, duration: number): number {
  if (elapsed < 0 || elapsed > duration) return 0;
  const t = elapsed / duration;
  return Math.max(0, 1 - t * t);
}

function evaluateSingleEffect(effect: EffectEntry, time: number): number {
  const elapsed = time - effect.triggerTime;
  if (elapsed < 0 || elapsed > effect.duration) return 0;

  const envelope = decay(elapsed, effect.duration);

  switch (effect.type) {
    case 'pulse':
    case 'flash':
    case 'glow':
      return effect.amplitude * envelope;
    case 'shake': {
      const freq = 30;
      const oscillation = Math.sin(elapsed * freq * Math.PI * 2);
      return effect.amplitude * oscillation * envelope;
    }
    default:
      return 0;
  }
}

export function evaluateEffects(effects: EffectEntry[], time: number): number {
  let total = 0;
  for (const effect of effects) {
    total += evaluateSingleEffect(effect, time);
  }
  return total;
}
