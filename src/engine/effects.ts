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

// ── Deterministic noise for shake ──

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + seed * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1; // [-1, 1]
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
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
        const current = (props.opacity as number) ?? 1;
        props.opacity = Math.min(1, current + fx.amplitude * env);
        break;
      }
      case 'shake': {
        const seed = hashCode(fx.target) + Math.floor(elapsed * 60);
        const rx = pseudoRandom(seed);
        const ry = pseudoRandom(seed + 1);
        const cx = (props.x as number) ?? 0;
        const cy = (props.y as number) ?? 0;
        props.x = cx + rx * fx.amplitude * env;
        props.y = cy + ry * fx.amplitude * env;
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
