import { useState } from 'react';
import { NumberSlider } from './NumberSlider';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

type PointRefMode = 'coords' | 'object' | 'objectOffset';

interface PointRefEditorProps {
  value: unknown; // string | [number, number] | [string, number, number]
  onChange: (value: unknown) => void;
}

function detectMode(value: unknown): PointRefMode {
  if (typeof value === 'string') return 'object';
  if (Array.isArray(value)) {
    if (value.length === 3 && typeof value[0] === 'string') return 'objectOffset';
    return 'coords';
  }
  return 'coords';
}

function parsePointRef(value: unknown): { mode: PointRefMode; x: number; y: number; id: string; dx: number; dy: number } {
  if (typeof value === 'string') {
    return { mode: 'object', x: 0, y: 0, id: value, dx: 0, dy: 0 };
  }
  if (Array.isArray(value)) {
    if (value.length === 3 && typeof value[0] === 'string') {
      return { mode: 'objectOffset', x: 0, y: 0, id: value[0], dx: value[1] as number, dy: value[2] as number };
    }
    return { mode: 'coords', x: (value[0] as number) ?? 0, y: (value[1] as number) ?? 0, id: '', dx: 0, dy: 0 };
  }
  return { mode: 'coords', x: 0, y: 0, id: '', dx: 0, dy: 0 };
}

export function PointRefEditor({ value, onChange }: PointRefEditorProps) {
  const parsed = parsePointRef(value);
  const [mode, setMode] = useState<PointRefMode>(parsed.mode);
  const [x, setX] = useState(parsed.x);
  const [y, setY] = useState(parsed.y);
  const [id, setId] = useState(parsed.id);
  const [dx, setDx] = useState(parsed.dx);
  const [dy, setDy] = useState(parsed.dy);

  const emitChange = (m: PointRefMode, newX: number, newY: number, newId: string, newDx: number, newDy: number) => {
    switch (m) {
      case 'coords': onChange([newX, newY]); break;
      case 'object': onChange(newId); break;
      case 'objectOffset': onChange([newId, newDx, newDy]); break;
    }
  };

  const modeButton = (m: PointRefMode, label: string) => (
    <button
      key={m}
      onClick={() => {
        setMode(m);
        emitChange(m, x, y, id, dx, dy);
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

  return (
    <div style={{ padding: 8, minWidth: 180 }} onMouseDown={stop} onPointerDown={stop}>
      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 6 }}>
        {modeButton('coords', '[x, y]')}
        {modeButton('object', '"id"')}
        {modeButton('objectOffset', '["id", dx, dy]')}
      </div>

      {mode === 'coords' && (
        <>
          <NumberSlider value={x} step={1} label="x"
            onChange={(v) => { setX(v); emitChange('coords', v, y, id, dx, dy); }} />
          <NumberSlider value={y} step={1} label="y"
            onChange={(v) => { setY(v); emitChange('coords', x, v, id, dx, dy); }} />
        </>
      )}

      {mode === 'object' && (
        <div style={{ padding: '0 0 4px' }}>
          <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 4, fontFamily: FONT }}>object ID</div>
          <input
            type="text"
            value={id}
            onChange={(e) => {
              setId(e.target.value);
              emitChange('object', x, y, e.target.value, dx, dy);
            }}
            onKeyDown={(e) => e.stopPropagation()}
            onMouseDown={stop} onPointerDown={stop}
            style={{
              width: '100%', padding: '4px 6px', fontSize: 11, fontFamily: FONT,
              background: '#0e1117', border: '1px solid #2a2d35', borderRadius: 4,
              color: '#e2e5ea', outline: 'none',
            }}
          />
        </div>
      )}

      {mode === 'objectOffset' && (
        <>
          <div style={{ padding: '0 0 4px' }}>
            <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 4, fontFamily: FONT }}>object ID</div>
            <input
              type="text"
              value={id}
              onChange={(e) => {
                setId(e.target.value);
                emitChange('objectOffset', x, y, e.target.value, dx, dy);
              }}
              onKeyDown={(e) => e.stopPropagation()}
              onMouseDown={stop} onPointerDown={stop}
              style={{
                width: '100%', padding: '4px 6px', fontSize: 11, fontFamily: FONT,
                background: '#0e1117', border: '1px solid #2a2d35', borderRadius: 4,
                color: '#e2e5ea', outline: 'none',
              }}
            />
          </div>
          <NumberSlider value={dx} step={1} label="offset x"
            onChange={(v) => { setDx(v); emitChange('objectOffset', x, y, id, v, dy); }} />
          <NumberSlider value={dy} step={1} label="offset y"
            onChange={(v) => { setDy(v); emitChange('objectOffset', x, y, id, dx, v); }} />
        </>
      )}
    </div>
  );
}
