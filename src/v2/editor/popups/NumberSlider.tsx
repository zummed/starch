const FONT = "'JetBrains Mono', 'Fira Code', monospace";

interface NumberSliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  onChange: (value: number) => void;
}

export function NumberSlider({ value, min = 0, max = 100, step = 1, label, onChange }: NumberSliderProps) {
  return (
    <div style={{ padding: 8, minWidth: 180 }}>
      {label && <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 4, fontFamily: FONT }}>{label}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{ flex: 1 }}
        />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          style={{
            width: 50, padding: '2px 4px', fontSize: 11, fontFamily: FONT,
            background: '#14161c', border: '1px solid #2a2d35', borderRadius: 4,
            color: '#e2e5ea', textAlign: 'right',
          }}
        />
      </div>
    </div>
  );
}
