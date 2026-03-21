import { useState, useCallback } from 'react';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";

interface ColorPickerProps {
  value: { h: number; s: number; l: number };
  onChange: (value: { h: number; s: number; l: number }) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [h, setH] = useState(value.h);
  const [s, setS] = useState(value.s);
  const [l, setL] = useState(value.l);

  const update = useCallback((nh: number, ns: number, nl: number) => {
    setH(nh); setS(ns); setL(nl);
    onChange({ h: nh, s: ns, l: nl });
  }, [onChange]);

  const previewColor = `hsl(${h}, ${s}%, ${l}%)`;

  return (
    <div style={{ padding: 8, minWidth: 200 }}>
      <div style={{
        width: '100%', height: 24, borderRadius: 4, marginBottom: 8,
        background: previewColor, border: '1px solid #2a2d35',
      }} />
      {[
        { label: 'H', value: h, max: 360, onChange: (v: number) => update(v, s, l) },
        { label: 'S', value: s, max: 100, onChange: (v: number) => update(h, v, l) },
        { label: 'L', value: l, max: 100, onChange: (v: number) => update(h, s, v) },
      ].map(slider => (
        <div key={slider.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: '#6b7280', width: 12, fontFamily: FONT }}>{slider.label}</span>
          <input
            type="range"
            min={0}
            max={slider.max}
            value={slider.value}
            onChange={(e) => slider.onChange(parseInt(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 10, color: '#8a8f98', width: 28, textAlign: 'right', fontFamily: FONT }}>
            {slider.value}
          </span>
        </div>
      ))}
    </div>
  );
}
