const FONT = "'JetBrains Mono', 'Fira Code', monospace";

interface EnumDropdownProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

export function EnumDropdown({ value, options, onChange }: EnumDropdownProps) {
  return (
    <div style={{ padding: 8, minWidth: 120 }}>
      {options.map(opt => (
        <div
          key={opt}
          onClick={() => onChange(opt)}
          style={{
            padding: '4px 8px', fontSize: 11, fontFamily: FONT,
            color: opt === value ? '#a78bfa' : '#c9cdd4',
            background: opt === value ? 'rgba(167,139,250,0.1)' : 'transparent',
            borderRadius: 4, cursor: 'pointer', marginBottom: 1,
          }}
        >
          {opt}
        </div>
      ))}
    </div>
  );
}
