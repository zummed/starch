import type { Chapter } from '../../types/animation';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";

interface TimelineProps {
  time: number;
  duration: number;
  playing: boolean;
  speed: number;
  chapters?: Chapter[];
  keyframeTimes?: number[];
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
  keyframeTimes = [],
  onSeek,
  onTogglePlay,
  onRestart,
  onSpeedChange,
}: TimelineProps) {
  const pct = duration > 0 ? (time / duration) * 100 : 0;
  const narrow = typeof window !== 'undefined' && window.innerWidth < 1024;

  return (
    <div
      style={{
        height: 48,
        borderTop: '1px solid #1a1d24',
        padding: narrow ? '0 8px' : '0 20px',
        display: 'flex',
        alignItems: 'center',
        gap: narrow ? 6 : 12,
        flexShrink: 0,
        fontFamily: FONT,
      }}
    >
      <button
        className="ctrl-btn"
        onClick={onTogglePlay}
        style={ctrlBtnStyle(playing, narrow)}
      >
        <svg width="12" height="12" viewBox="0 0 12 12">
          {playing
            ? <><rect x="1" y="1" width="3.5" height="10" rx="1" fill="currentColor"/><rect x="7.5" y="1" width="3.5" height="10" rx="1" fill="currentColor"/></>
            : <polygon points="2,0 12,6 2,12" fill="currentColor"/>
          }
        </svg>
      </button>
      <button
        className="ctrl-btn"
        onClick={onRestart}
        style={ctrlBtnStyle(false, narrow)}
      >
        <svg width="12" height="12" viewBox="0 0 12 12">
          <rect x="0" y="1" width="2.5" height="10" rx="0.5" fill="currentColor"/>
          <polygon points="10,0 3,6 10,12" fill="currentColor"/>
        </svg>
      </button>
      {keyframeTimes.length > 0 && !narrow && (<>
        <button
          className="ctrl-btn"
          title="Previous keyframe"
          onClick={() => {
            const prev = [...keyframeTimes].reverse().find(t => t < time - 0.01);
            onSeek(prev ?? keyframeTimes[0]);
          }}
          style={ctrlBtnStyle(false, narrow)}
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <polygon points="6,0 0,6 6,12" fill="currentColor"/>
            <rect x="7" y="2" width="1.5" height="8" rx="0.5" fill="currentColor"/>
            <polygon points="12,2 8,6 12,10" fill="currentColor"/>
          </svg>
        </button>
        <button
          className="ctrl-btn"
          title="Next keyframe"
          onClick={() => {
            const next = keyframeTimes.find(t => t > time + 0.01);
            onSeek(next ?? keyframeTimes[keyframeTimes.length - 1]);
          }}
          style={ctrlBtnStyle(false, narrow)}
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <polygon points="0,2 4,6 0,10" fill="currentColor"/>
            <rect x="3.5" y="2" width="1.5" height="8" rx="0.5" fill="currentColor"/>
            <polygon points="6,0 12,6 6,12" fill="currentColor"/>
          </svg>
        </button>
      </>)}
      <div style={{ flex: 1, position: 'relative', height: 20, display: 'flex', alignItems: 'center', minWidth: 0 }}>
        <input
          type="range"
          min={0}
          max={1000}
          value={pct * 10}
          onChange={(e) => onSeek((Number(e.target.value) / 1000) * duration)}
          style={{ flex: 1, minWidth: 0 }}
        />
        {/* Chapter markers */}
        {chapters.map((ch) => {
          const chPct = duration > 0 ? (ch.time / duration) * 100 : 0;
          return (
            <div
              key={ch.name}
              title={ch.name}
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
      {!narrow && (
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
      )}
      {!narrow && (
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
      )}
    </div>
  );
}

function ctrlBtnStyle(active: boolean, narrow?: boolean): React.CSSProperties {
  const size = narrow ? 28 : 32;
  return {
    width: size,
    height: size,
    borderRadius: 6,
    border: `1px solid ${active ? '#a78bfa' : '#2a2d35'}`,
    background: '#14161c',
    color: active ? '#a78bfa' : '#6b7280',
    fontSize: 14,
    fontFamily: "'JetBrains Mono', monospace",
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
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
