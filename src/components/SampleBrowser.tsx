import { useState, useCallback } from 'react';

export interface Sample {
  id: string;
  title: string;
  category: string;
  description: string;
  dsl: string;
}

export interface Category {
  id: string;
  title: string;
}

interface SampleBrowserProps {
  categories: Category[];
  samples: Sample[];
  activeSampleId: string | null;
  onSelect: (sample: Sample) => void;
}

export function SampleBrowser({
  categories,
  samples,
  activeSampleId,
  onSelect,
}: SampleBrowserProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCategory = useCallback((id: string) => {
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  return (
    <div style={{
      width: 280,
      flexShrink: 0,
      background: '#0e1117',
      borderRight: '1px solid #1a1d24',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      minHeight: 0,
    }}>
      <div style={{
        padding: '10px 14px 8px',
        fontSize: 11,
        fontWeight: 700,
        color: '#6b7280',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        borderBottom: '1px solid #1a1d24',
        flexShrink: 0,
      }}>
        Samples
      </div>
      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}>
        {categories.map(cat => {
          const catSamples = samples.filter(s => s.category === cat.id);
          if (catSamples.length === 0) return null;
          const isCollapsed = collapsed[cat.id];

          return (
            <div key={cat.id}>
              <div
                onClick={() => toggleCategory(cat.id)}
                style={{
                  padding: '8px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#8a8f98',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  userSelect: 'none',
                  borderBottom: '1px solid #1a1d2400',
                }}
              >
                <span style={{
                  display: 'inline-block',
                  transition: 'transform 0.15s',
                  transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                  fontSize: 10,
                }}>
                  ▼
                </span>
                {cat.title}
                <span style={{ color: '#4a4f59', fontSize: 11, marginLeft: 'auto' }}>
                  {catSamples.length}
                </span>
              </div>
              {!isCollapsed && catSamples.map(sample => {
                const isActive = sample.id === activeSampleId;
                return (
                  <div
                    key={sample.id}
                    onClick={() => onSelect(sample)}
                    style={{
                      padding: '6px 14px 6px 28px',
                      cursor: 'pointer',
                      background: isActive ? '#1a1d24' : 'transparent',
                      borderLeft: isActive ? '2px solid #a78bfa' : '2px solid transparent',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.background = '#13161d';
                    }}
                    onMouseLeave={e => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }}
                  >
                    <div style={{
                      fontSize: 12,
                      color: isActive ? '#e2e5ea' : '#c9cdd4',
                      fontWeight: isActive ? 600 : 400,
                      marginBottom: 2,
                    }}>
                      {sample.title}
                    </div>
                    <div style={{
                      fontSize: 10,
                      color: '#4a4f59',
                    }}>
                      {sample.description}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
