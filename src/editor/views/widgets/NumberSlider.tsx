import { useRef, useCallback, useEffect } from 'react';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";

interface NumberSliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  onChange: (value: number) => void;
}

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function clamp(val: number, lo?: number, hi?: number): number {
  if (lo !== undefined && val < lo) return lo;
  if (hi !== undefined && val > hi) return hi;
  return val;
}

const TRACK_WIDTH = 160;
const THUMB_W = 4;
const MAX_DEFLECT = (TRACK_WIDTH / 2) - THUMB_W;

function formatDisplay(val: number, step: number): string {
  if (step < 0.01) return val.toFixed(3);
  if (step < 0.1) return val.toFixed(2);
  if (step < 1) return val.toFixed(1);
  return Number.isInteger(val) ? String(val) : val.toFixed(1);
}

export function NumberSlider({ value, min, max, step = 1, label, onChange }: NumberSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const deflect = useRef(0);
  const currentVal = useRef(value);
  const accumulator = useRef(0); // accumulates sub-step fractional amounts
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    currentVal.current = value;
    // Sync display when value prop changes (e.g., from scroll nudge)
    if (displayRef.current) displayRef.current.textContent = formatDisplay(value, step);
  }, [value, step]);

  // Animation loop: continuously applies velocity while dragging
  const tick = useCallback(() => {
    if (!dragging.current) return;
    const d = deflect.current;
    if (d !== 0) {
      // Exponential ramp: gentle in the first third, fast at full deflection
      const absNorm = Math.abs(d) / MAX_DEFLECT; // 0 to 1
      const speed = (Math.pow(10, absNorm * 2.5) - 1) / (Math.pow(10, 2.5) - 1); // 0→0, 1→1
      const delta = speed * step * 6 * Math.sign(d);

      // Accumulate fractional amounts so small deltas still produce changes
      accumulator.current += delta;
      const dec = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
      const stepSize = Math.pow(10, -dec); // minimum change we can represent
      if (Math.abs(accumulator.current) >= stepSize) {
        const raw = parseFloat((currentVal.current + accumulator.current).toFixed(dec));
        const clamped = clamp(raw, min, max);
        if (clamped !== currentVal.current) {
          currentVal.current = clamped;
          // Update display directly via DOM — avoids React re-render during drag
          if (displayRef.current) displayRef.current.textContent = formatDisplay(clamped, step);
          onChange(clamped);
        }
        accumulator.current = 0;
      }
    }
    rafId.current = requestAnimationFrame(tick);
  }, [step, onChange]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;
    startX.current = e.clientX;
    deflect.current = 0;
    accumulator.current = 0;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    rafId.current = requestAnimationFrame(tick);
  }, [tick]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    e.stopPropagation();
    const dx = e.clientX - startX.current;
    deflect.current = Math.max(-MAX_DEFLECT, Math.min(MAX_DEFLECT, dx));

    // Visual: move thumb + pulse glow for fine control hint
    if (thumbRef.current) {
      thumbRef.current.style.transform = `translateX(${deflect.current}px)`;
      const absNorm = Math.abs(deflect.current) / MAX_DEFLECT;
      // Pulse is strongest at small deflections (fine control) and fades at high speed
      const pulseIntensity = absNorm > 0.01 ? Math.max(0, 1 - absNorm * 3) : 0;
      thumbRef.current.style.boxShadow = pulseIntensity > 0
        ? `0 0 ${4 + pulseIntensity * 6}px rgba(167,139,250,${pulseIntensity * 0.8})`
        : 'none';
    }
    // Visual: tint track based on deflection intensity
    if (trackRef.current) {
      const intensity = Math.abs(deflect.current) / MAX_DEFLECT;
      trackRef.current.style.background =
        `linear-gradient(90deg,
          rgba(167,139,250,${deflect.current < 0 ? intensity * 0.2 : 0}) 0%,
          #1a1d24 50%,
          rgba(167,139,250,${deflect.current > 0 ? intensity * 0.2 : 0}) 100%)`;
    }
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    e.stopPropagation();
    dragging.current = false;
    deflect.current = 0;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }

    // Spring thumb back to center, clear glow
    if (thumbRef.current) {
      thumbRef.current.style.transition = 'transform 0.15s ease-out, box-shadow 0.15s';
      thumbRef.current.style.transform = 'translateX(0)';
      thumbRef.current.style.boxShadow = 'none';
      setTimeout(() => { if (thumbRef.current) thumbRef.current.style.transition = ''; }, 150);
    }
    if (trackRef.current) {
      trackRef.current.style.transition = 'background 0.15s';
      trackRef.current.style.background = '#1a1d24';
      setTimeout(() => { if (trackRef.current) trackRef.current.style.transition = ''; }, 150);
    }
  }, []);

  // Scroll to nudge
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const nudge = e.shiftKey ? step * 10 : step;
    const dir = e.deltaY > 0 ? -1 : 1;
    const raw = value + dir * nudge;
    const clamped = clamp(raw, min, max);
    const dec = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
    onChange(parseFloat(clamped.toFixed(dec)));
  }, [value, step, min, max, onChange]);

  // Cleanup
  useEffect(() => () => {
    if (rafId.current) cancelAnimationFrame(rafId.current);
  }, []);

  return (
    <div style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 8 }} onMouseDown={stop}>
      {label && <span style={{ fontSize: 10, color: '#6b7280', fontFamily: FONT, flexShrink: 0 }}>{label}</span>}
      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        style={{
          width: TRACK_WIDTH,
          height: 20,
          background: '#1a1d24',
          borderRadius: 10,
          position: 'relative',
          cursor: 'ew-resize',
          overflow: 'hidden',
          touchAction: 'none',
          flexShrink: 0,
        }}
      >
        {/* Center mark */}
        <div style={{
          position: 'absolute', left: '50%', top: 4, bottom: 4,
          width: 1, background: '#2a2d35', marginLeft: -0.5,
        }} />
        {/* Thumb */}
        <div
          ref={thumbRef}
          style={{
            position: 'absolute',
            left: `calc(50% - ${THUMB_W / 2}px)`,
            top: 3, bottom: 3,
            width: THUMB_W,
            background: '#a78bfa',
            borderRadius: 2,
            pointerEvents: 'none',
          }}
        />
      </div>
      <span ref={displayRef} style={{ fontSize: 11, color: '#a78bfa', fontFamily: FONT, minWidth: '4ch', textAlign: 'right', flexShrink: 0 }}>{formatDisplay(value, step)}</span>
    </div>
  );
}
