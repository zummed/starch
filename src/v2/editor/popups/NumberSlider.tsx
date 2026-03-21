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

const TRACK_WIDTH = 160;
const THUMB_W = 4;
const MAX_DEFLECT = (TRACK_WIDTH / 2) - THUMB_W;

export function NumberSlider({ value, step = 1, label, onChange }: NumberSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const deflect = useRef(0);
  const currentVal = useRef(value);
  const accumulator = useRef(0); // accumulates sub-step fractional amounts
  const rafId = useRef<number | null>(null);

  useEffect(() => { currentVal.current = value; }, [value]);

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
        const snapped = parseFloat((currentVal.current + accumulator.current).toFixed(dec));
        if (snapped !== currentVal.current) {
          currentVal.current = snapped;
          onChange(snapped);
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
    const newVal = value + dir * nudge;
    const dec = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
    onChange(parseFloat(newVal.toFixed(dec)));
  }, [value, step, onChange]);

  // Cleanup
  useEffect(() => () => {
    if (rafId.current) cancelAnimationFrame(rafId.current);
  }, []);

  const display = step < 0.01 ? value.toFixed(3)
    : step < 0.1 ? value.toFixed(2)
    : step < 1 ? value.toFixed(1)
    : Number.isInteger(value) ? String(value) : value.toFixed(1);

  return (
    <div style={{ padding: '6px 8px' }} onMouseDown={stop}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 4,
      }}>
        {label && <span style={{ fontSize: 10, color: '#6b7280', fontFamily: FONT }}>{label}</span>}
        <span style={{ fontSize: 11, color: '#a78bfa', fontFamily: FONT }}>{display}</span>
      </div>
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
    </div>
  );
}
