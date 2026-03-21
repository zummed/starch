import { useRef, useState, useCallback, useEffect } from 'react';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";

interface NumberSliderProps {
  value: number;
  min?: number;   // informational only — not clamped
  max?: number;   // informational only — not clamped
  step?: number;  // base sensitivity for drag (units per pixel)
  label?: string;
  onChange: (value: number) => void;
}

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function formatNumber(n: number, step: number): string {
  if (step < 0.01) return n.toFixed(3);
  if (step < 0.1) return n.toFixed(2);
  if (step < 1) return n.toFixed(1);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function NumberSlider({ value, step = 1, label, onChange }: NumberSliderProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [dragging, setDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragStartValue = useRef(0);
  const hasDragged = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Enter edit mode
  const startEditing = useCallback(() => {
    setEditing(true);
    setEditText(formatNumber(value, step));
    setTimeout(() => inputRef.current?.select(), 0);
  }, [value, step]);

  // Commit typed value
  const commitEdit = useCallback(() => {
    const parsed = parseFloat(editText);
    if (!isNaN(parsed)) {
      onChange(parsed);
    }
    setEditing(false);
  }, [editText, onChange]);

  // Cancel edit
  const cancelEdit = useCallback(() => {
    setEditing(false);
  }, []);

  // Drag handling
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (editing) return;
    e.preventDefault();
    e.stopPropagation();

    dragStartX.current = e.clientX;
    dragStartValue.current = value;
    hasDragged.current = false;
    setDragging(true);

    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
  }, [editing, value]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    e.stopPropagation();

    const dx = e.clientX - dragStartX.current;

    // Threshold before we consider it a drag (vs click)
    if (Math.abs(dx) < 3 && !hasDragged.current) return;
    hasDragged.current = true;

    // Modifier keys affect sensitivity
    let sensitivity = step;
    if (e.shiftKey) sensitivity *= 10;
    if (e.altKey) sensitivity *= 0.1;

    const newValue = dragStartValue.current + dx * sensitivity;
    // Round to step precision
    const rounded = Math.round(newValue / step) * step;
    // Fix floating point
    const decimals = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
    onChange(parseFloat(rounded.toFixed(decimals)));
  }, [dragging, step, onChange]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    e.stopPropagation();

    setDragging(false);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

    // If we didn't drag, treat as click → enter edit mode
    if (!hasDragged.current) {
      startEditing();
    }
  }, [dragging, startEditing]);

  // Scroll handling
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();

    let nudge = step;
    if (e.shiftKey) nudge *= 10;

    const direction = e.deltaY > 0 ? -1 : 1;
    const newValue = value + direction * nudge;
    const decimals = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
    onChange(parseFloat(newValue.toFixed(decimals)));
  }, [value, step, onChange]);

  if (editing) {
    return (
      <div style={{ padding: 8, minWidth: 140 }} onMouseDown={stop} onPointerDown={stop}>
        {label && <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 4, fontFamily: FONT }}>{label}</div>}
        <input
          ref={inputRef}
          type="text"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commitEdit();
            if (e.key === 'Escape') cancelEdit();
          }}
          onBlur={commitEdit}
          onMouseDown={stop}
          onPointerDown={stop}
          style={{
            width: '100%', padding: '4px 6px', fontSize: 13, fontFamily: FONT,
            background: '#0e1117', border: '1px solid #a78bfa', borderRadius: 4,
            color: '#e2e5ea', textAlign: 'right', outline: 'none',
          }}
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ padding: 8, minWidth: 140, userSelect: 'none' }}
      onMouseDown={stop}
    >
      {label && <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 4, fontFamily: FONT }}>{label}</div>}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        style={{
          padding: '4px 6px',
          fontSize: 13,
          fontFamily: FONT,
          color: '#e2e5ea',
          textAlign: 'right',
          cursor: dragging ? 'ew-resize' : 'ew-resize',
          background: dragging ? '#1a1d24' : '#14161c',
          borderRadius: 4,
          borderBottom: '2px dotted #2a2d35',
          transition: 'background 0.1s',
        }}
      >
        {formatNumber(value, step)}
      </div>
      <div style={{ fontSize: 9, color: '#3a3f49', marginTop: 3, fontFamily: FONT }}>
        drag to scrub · click to type · scroll to nudge
      </div>
    </div>
  );
}
