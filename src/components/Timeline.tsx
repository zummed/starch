import type { Chapter } from '../core/types';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";

interface TimelineProps {
  time: number;
  duration: number;
  playing: boolean;
  speed: number;
  chapters?: Chapter[];
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onRestart: () => void;
  onSpeedChange: (speed: number) => void;
}

export function Timeline({
  time,
  duration,
  playing,
  speed,
  chapters = [],
  onSeek,
  onTogglePlay,
  onRestart,
  onSpeedChange,
}: TimelineProps) {
  const pct = duration > 0 ? (time / duration) * 100 : 0;

  return (
    <div
      style={{
        height: 48,
        borderTop: '1px solid #1a1d24',
        padding: '0 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexShrink: 0,
        fontFamily: FONT,
      }}
    >
      <button
        className="ctrl-btn"
        onClick={onTogglePlay}
        style={ctrlBtnStyle(playing)}
      >
        {playing ? '\u23F8' : '\u25B6'}
      </button>
      <button
        className="ctrl-btn"
        onClick={onRestart}
        style={ctrlBtnStyle(false)}
      >
        {'\u23EE'}
      </button>
      <div style={{ flex: 1, position: 'relative', height: 20, display: 'flex', alignItems: 'center' }}>
        <input
          type="range"
          min={0}
          max={1000}
          value={pct * 10}
          onChange={(e) => onSeek((Number(e.target.value) / 1000) * duration)}
          style={{ flex: 1 }}
        />
        {/* Chapter markers */}
        {chapters.map((ch) => {
          const chPct = duration > 0 ? (ch.time / duration) * 100 : 0;
          return (
            <div
              key={ch.id}
              title={ch.title}
              onClick={() => onSeek(ch.time)}
              style={{
                position: 'absolute',
                left: `${chPct}%`,
                top: 0,
                width: 3,
                height: 20,
                background: '#a78bfa',
                borderRadius: 1,
                cursor: 'pointer',
                opacity: 0.7,
                pointerEvents: 'auto',
              }}
            />
          );
        })}
      </div>
      <span
        style={{
          fontSize: 11,
          color: '#4a4f59',
          minWidth: 70,
          textAlign: 'right',
          fontFamily: FONT,
        }}
      >
        {time.toFixed(1)}s / {duration.toFixed(1)}s
      </span>
      <div style={{ display: 'flex', gap: 4 }}>
        {[0.5, 1, 2].map((s) => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            style={{
              ...speedBtnStyle,
              borderColor: speed === s ? '#22d3ee' : '#2a2d35',
              color: speed === s ? '#22d3ee' : '#6b7280',
              background: speed === s ? 'rgba(34,211,238,0.06)' : '#14161c',
            }}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}

function ctrlBtnStyle(active: boolean): React.CSSProperties {
  return {
    width: 32,
    height: 32,
    borderRadius: 6,
    border: `1px solid ${active ? '#a78bfa' : '#2a2d35'}`,
    background: '#14161c',
    color: active ? '#a78bfa' : '#8a8f98',
    fontSize: 14,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
}

const speedBtnStyle: React.CSSProperties = {
  padding: '3px 8px',
  fontSize: 10,
  borderRadius: 6,
  border: '1px solid #2a2d35',
  background: '#14161c',
  color: '#6b7280',
  cursor: 'pointer',
  fontFamily: FONT,
};
