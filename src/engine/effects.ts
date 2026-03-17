import type { AnimConfig, EffectInstance, EffectName } from '../core/types';
import { EFFECT_NAMES } from '../core/types';

// ── Configuration ──

const EFFECT_DURATION: Record<EffectName, number> = {
  pulse: 0.4,
  flash: 0.4,
  shake: 0.3,
  glow: 0.4,
};

// ── Extraction ──

export function extractEffects(animConfig: AnimConfig): EffectInstance[] {
  const effects: EffectInstance[] = [];
  for (const block of animConfig.keyframes) {
    for (const [targetId, changes] of Object.entries(block.changes)) {
      for (const [prop, value] of Object.entries(changes)) {
        if (prop === 'easing') continue;
        if (EFFECT_NAMES.has(prop)) {
          effects.push({
            target: targetId,
            effect: prop as EffectName,
            amplitude: value as number,
            triggerTime: block.time,
          });
        }
      }
    }
  }
  return effects;
}

// ── Envelope: sin²(πt) — smooth bell, zero at edges, peaks at midpoint ──

function envelope(elapsed: number, duration: number): number {
  if (elapsed < 0 || elapsed > duration) return 0;
  const t = elapsed / duration;
  const s = Math.sin(Math.PI * t);
  return s * s;
}

// ── Application ──

export function applyEffects(
  effects: EffectInstance[],
  result: Record<string, Record<string, unknown>>,
  time: number,
): void {
  for (const fx of effects) {
    const props = result[fx.target];
    if (!props) continue;

    const elapsed = time - fx.triggerTime;
    const duration = EFFECT_DURATION[fx.effect];
    const env = envelope(elapsed, duration);
    if (env === 0) continue;

    switch (fx.effect) {
      case 'pulse': {
        const current = (props.scale as number) ?? 1;
        props.scale = current + fx.amplitude * env;
        break;
      }
      case 'flash': {
        // Briefly dims opacity (visible even when starting at 1.0)
        const current = (props.opacity as number) ?? 1;
        props.opacity = current * (1 - fx.amplitude * env);
        break;
      }
      case 'shake': {
        // Rapid left-right oscillation that decays
        const freq = 30; // oscillations per second
        const ox = Math.sin(elapsed * freq * Math.PI) * fx.amplitude * env;
        const oy = Math.cos(elapsed * freq * Math.PI * 0.7) * fx.amplitude * env * 0.3;
        const cx = (props.x as number) ?? 0;
        const cy = (props.y as number) ?? 0;
        props.x = cx + ox;
        props.y = cy + oy;
        break;
      }
      case 'glow': {
        const current = (props.strokeWidth as number) ?? 1.5;
        props.strokeWidth = current + fx.amplitude * env;
        break;
      }
    }
  }
}
