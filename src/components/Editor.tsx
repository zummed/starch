const FONT = "'JetBrains Mono', 'Fira Code', monospace";

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  parseError?: string | null;
}

export function Editor({ value, onChange, parseError }: EditorProps) {
  return (
    <div
      style={{
        width: 360,
        borderRight: '1px solid #1a1d24',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: '10px 14px 6px',
          fontSize: 10,
          color: '#3a3f49',
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: FONT,
        }}
      >
        <span>DSL</span>
        {parseError && <span style={{ color: '#ef4444' }}>Parse error</span>}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        style={{
          flex: 1,
          padding: '10px 14px',
          background: '#0a0c10',
          border: 'none',
          color: '#b0b5be',
          fontSize: 12,
          lineHeight: 1.65,
          fontFamily: FONT,
          resize: 'none',
          outline: 'none',
        }}
      />
      <div
        style={{
          padding: '8px 14px',
          fontSize: 10,
          color: '#2a2d35',
          borderTop: '1px solid #1a1d24',
          lineHeight: 1.8,
          fontFamily: FONT,
        }}
      >
        <span style={{ color: '#4a4f59' }}>Objects:</span> box circle text table line path group
        <br />
        <span style={{ color: '#4a4f59' }}>Props:</span> pos size fill stroke text radius r opacity
        scale anchor bold
        <br />
        <span style={{ color: '#4a4f59' }}>Anchor:</span> center top bottom left right N NE E SE S SW
        W NW {'{ '}0.5,0.5{' }'}
        <br />
        <span style={{ color: '#4a4f59' }}>Lines:</span> from to fromAnchor toAnchor label arrow
        progress
        <br />
        <span style={{ color: '#4a4f59' }}>Groups:</span> children pos
        <br />
        <span style={{ color: '#4a4f59' }}>Paths:</span> points visible closed
        <br />
        <span style={{ color: '#4a4f59' }}>Anim:</span> @animate {'{'} time: obj.prop = val ease:fn{' '}
        {'}'}
        <br />
        <span style={{ color: '#4a4f59' }}>Chapters:</span> @chapter 2.0s &quot;Title&quot;
        &quot;Description&quot;
        <br />
        <span style={{ color: '#4a4f59' }}>Easing:</span> linear easeIn easeOut easeInOut easeOutBack
        bounce elastic spring snap step
      </div>
    </div>
  );
}
