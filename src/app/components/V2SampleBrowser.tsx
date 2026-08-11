import { useState } from 'react';
import { v2Samples, type V2Sample, type SampleTrack } from '../../samples/index';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";

/**
 * The two tracks are shown as separate sections rather than one flat list:
 * the course is meant to be read top to bottom, the reference grids are meant
 * to be dipped into. They share category names on purpose (a reference grid
 * files itself next to the lessons it backs up), so the accordion is keyed by
 * track *and* category.
 */
const TRACKS: Array<{ track: SampleTrack; title: string; hint: string }> = [
  { track: 'learn', title: 'course', hint: 'read in order' },
  { track: 'reference', title: 'reference', hint: 'look things up' },
];

/** Lesson names carry their step number — `06-template-parts`. */
const NUMBERED = /^(\d{2})-(.+)$/;

const categoriesFor = (track: SampleTrack): string[] =>
  [...new Set(v2Samples.filter(s => s.track === track).map(s => s.category))];

/**
 * "01–04" for a course category, so a collapsed sidebar still reads as a
 * sequence and you can tell how far in a topic sits. Reference categories
 * have no numbers and get nothing.
 */
function stepRange(track: SampleTrack, category: string): string | null {
  if (track !== 'learn') return null;
  const steps = v2Samples
    .filter(s => s.track === track && s.category === category)
    .map(s => NUMBERED.exec(s.name)?.[1])
    .filter((step): step is string => step !== undefined);
  if (steps.length === 0) return null;
  return steps.length === 1 ? steps[0] : `${steps[0]}–${steps[steps.length - 1]}`;
}

const sectionKey = (track: SampleTrack, category: string) => `${track}/${category}`;

interface V2SampleBrowserProps {
  activeSampleId: string | null;
  onSelect: (sample: V2Sample) => void;
}

export function V2SampleBrowser({ activeSampleId, onSelect }: V2SampleBrowserProps) {
  // Open on whichever section holds the current sample, so the playground's
  // default lesson isn't hidden inside a collapsed category on first paint.
  const [expanded, setExpanded] = useState<string | null>(() => {
    const active = v2Samples.find(s => s.name === activeSampleId);
    return active
      ? sectionKey(active.track, active.category)
      : sectionKey('learn', categoriesFor('learn')[0]);
  });

  return (
    <div style={{
      width: 240,
      height: '100%',
      flexShrink: 0,
      borderRight: '1px solid #1a1d24',
      overflowY: 'auto',
      background: '#0a0c10',
      fontFamily: FONT,
    }}>
      {TRACKS.map(({ track, title, hint }, trackIndex) => (
        <div
          key={track}
          style={trackIndex > 0 ? { borderTop: '1px solid #262a33', marginTop: 20 } : undefined}
        >
          <div style={{ padding: '14px 16px 8px' }}>
            <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
              {title}
            </div>
            <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2 }}>{hint}</div>
          </div>

          {categoriesFor(track).map(cat => {
            const key = sectionKey(track, cat);
            const isOpen = expanded === key;
            return (
              <div key={key}>
                <div
                  onClick={() => setExpanded(isOpen ? null : key)}
                  style={{
                    padding: '8px 16px',
                    fontSize: 12,
                    color: isOpen ? '#a78bfa' : '#8a8f98',
                    cursor: 'pointer',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    userSelect: 'none',
                  }}
                >
                  <span style={{ fontSize: 8 }}>{isOpen ? '▼' : '▶'}</span>
                  <span style={{ flex: 1 }}>{cat}</span>
                  {stepRange(track, cat) && (
                    <span style={{ fontSize: 10, fontWeight: 400, color: '#4b5563' }}>
                      {stepRange(track, cat)}
                    </span>
                  )}
                </div>
                {isOpen && v2Samples
                  .filter(s => s.track === track && s.category === cat)
                  .map(sample => {
                    const isActive = activeSampleId === sample.name;
                    const numbered = NUMBERED.exec(sample.name);
                    return (
                      <div
                        key={sample.name}
                        onClick={() => onSelect(sample)}
                        title={sample.description}
                        style={{
                          padding: '6px 16px 6px 28px',
                          fontSize: 11,
                          color: isActive ? '#e2e5ea' : '#6b7280',
                          background: isActive ? '#14161c' : 'transparent',
                          cursor: 'pointer',
                          borderLeft: isActive ? '2px solid #a78bfa' : '2px solid transparent',
                          userSelect: 'none',
                        }}
                      >
                        {numbered
                          ? <><span style={{ color: isActive ? '#6b7280' : '#4b5563', marginRight: 8 }}>{numbered[1]}</span>{numbered[2]}</>
                          : sample.name}
                      </div>
                    );
                  })
                }
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
