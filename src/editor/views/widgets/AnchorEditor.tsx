import { useState, useRef, useCallback } from 'react';
import type { NamedAnchor } from '../../../types/anchor';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";

function stop(e: React.SyntheticEvent) { e.stopPropagation(); }

type AnchorMode = 'named' | 'custom';

// 3x3 grid of primary named anchors
const GRID: NamedAnchor[][] = [
  ['NW', 'N', 'NE'],
  ['W', 'center', 'E'],
  ['SW', 'S', 'SE'],
];

// Map named anchors to [-1..1] positions for the visual
const NAMED_POS: Record<string, [number, number]> = {
  center: [0, 0],
  N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1],
  S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1],
};

const SQUARE_SIZE = 100;
const DOT_R = 5;

function detectMode(value: unknown): AnchorMode {
  if (Array.isArray(value)) return 'custom';
  return 'named';
}

/** Convert [-1..1] to pixel position within the square. */
function toPixel(v: number): number {
  return (v + 1) / 2 * SQUARE_SIZE;
}
/** Convert pixel position within the square to [-1..1]. */
function fromPixel(px: number): number {
  return Math.round(Math.max(-1, Math.min(1, (px / SQUARE_SIZE) * 2 - 1)) * 100) / 100;
}

/** Get [x, y] in [-1..1] from current value. */
function getXY(value: unknown): [number, number] {
  if (Array.isArray(value)) return [value[0] as number, value[1] as number];
  if (typeof value === 'string' && value in NAMED_POS) return NAMED_POS[value];
  return [0, 0];
}

interface AnchorEditorProps {
  value: unknown; // NamedAnchor | [number, number]
  onChange: (value: unknown) => void;
}

export function AnchorEditor({ value, onChange }: AnchorEditorProps) {
  const [mode, setMode] = useState<AnchorMode>(detectMode(value));
  const currentNamed = typeof value === 'string' ? value : null;
  const [xy] = [getXY(value)];

  const modeButton = (m: AnchorMode, label: string) => (
    <button
      key={m}
      onClick={() => {
        setMode(m);
        if (m === 'named') onChange(currentNamed ?? 'center');
        else onChange([xy[0], xy[1]]);
      }}
      onMouseDown={stop}
      style={{
        flex: 1, padding: '3px 6px', fontSize: 9, fontFamily: FONT,
        border: `1px solid ${mode === m ? '#a78bfa' : '#2a2d35'}`,
        borderRadius: 3, cursor: 'pointer',
        background: mode === m ? 'rgba(167,139,250,0.1)' : 'transparent',
        color: mode === m ? '#a78bfa' : '#4a4f59',
      }}
    >
      {label}
    </button>
  );

  const gridCell = (name: NamedAnchor) => {
    const isActive = currentNamed === name;
    return (
      <button
        key={name}
        onClick={() => onChange(name)}
        onMouseDown={stop}
        title={name}
        style={{
          width: 28, height: 28, padding: 0,
          fontSize: 8, fontFamily: FONT,
          border: `1px solid ${isActive ? '#a78bfa' : '#2a2d35'}`,
          borderRadius: 3, cursor: 'pointer',
          background: isActive ? 'rgba(167,139,250,0.15)' : 'transparent',
          color: isActive ? '#a78bfa' : '#6b7280',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {name === 'center' ? '●' : name}
      </button>
    );
  };

  return (
    <div style={{ padding: 8, minWidth: 130 }} onMouseDown={stop} onPointerDown={stop}>
      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 6 }}>
        {modeButton('named', 'Named')}
        {modeButton('custom', '[x, y]')}
      </div>

      {mode === 'named' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
          {GRID.map((row, i) => (
            <div key={i} style={{ display: 'flex', gap: 2 }}>
              {row.map(name => gridCell(name))}
            </div>
          ))}
        </div>
      )}

      {mode === 'custom' && (
        <AnchorSquare x={xy[0]} y={xy[1]} onChange={(nx, ny) => onChange([nx, ny])} />
      )}

      {/* Coordinate readout */}
      <div style={{
        marginTop: 6, fontSize: 9, fontFamily: FONT, color: '#6b7280', textAlign: 'center',
      }}>
        {Array.isArray(value)
          ? `[${(value[0] as number).toFixed(2)}, ${(value[1] as number).toFixed(2)}]`
          : typeof value === 'string' ? value : 'center'}
      </div>
    </div>
  );
}

// ─── Visual draggable square ───────────────────────────────────────

function AnchorSquare({ x, y, onChange }: { x: number; y: number; onChange: (x: number, y: number) => void }) {
  const squareRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const updateFromEvent = useCallback((clientX: number, clientY: number) => {
    const el = squareRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx = fromPixel(clientX - rect.left);
    const ny = fromPixel(clientY - rect.top);
    onChange(nx, ny);
  }, [onChange]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateFromEvent(e.clientX, e.clientY);
  }, [updateFromEvent]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    e.stopPropagation();
    updateFromEvent(e.clientX, e.clientY);
  }, [updateFromEvent]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragging.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  const px = toPixel(x);
  const py = toPixel(y);

  return (
    <div
      ref={squareRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position: 'relative',
        width: SQUARE_SIZE,
        height: SQUARE_SIZE,
        background: '#0e1117',
        border: '1px solid #2a2d35',
        borderRadius: 4,
        cursor: 'crosshair',
        touchAction: 'none',
        margin: '0 auto',
      }}
    >
      {/* Crosshair lines at center */}
      <div style={{
        position: 'absolute', left: SQUARE_SIZE / 2, top: 0,
        width: 1, height: SQUARE_SIZE, background: '#1a1d24',
      }} />
      <div style={{
        position: 'absolute', top: SQUARE_SIZE / 2, left: 0,
        width: SQUARE_SIZE, height: 1, background: '#1a1d24',
      }} />
      {/* Draggable dot */}
      <div style={{
        position: 'absolute',
        left: px - DOT_R,
        top: py - DOT_R,
        width: DOT_R * 2,
        height: DOT_R * 2,
        borderRadius: '50%',
        background: '#a78bfa',
        boxShadow: '0 0 4px rgba(167,139,250,0.5)',
        pointerEvents: 'none',
      }} />
    </div>
  );
}
