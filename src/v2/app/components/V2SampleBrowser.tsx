import { useState } from 'react';
import { v2Samples, getV2SampleCategories, type V2Sample } from '../../samples/index';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";

interface V2SampleBrowserProps {
  activeSampleId: string | null;
  onSelect: (sample: V2Sample) => void;
}

export function V2SampleBrowser({ activeSampleId, onSelect }: V2SampleBrowserProps) {
  const categories = getV2SampleCategories();
  const [expandedCategory, setExpandedCategory] = useState<string | null>(categories[0] ?? null);

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
      <div style={{ padding: '12px 16px', fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
        v2 samples
      </div>
      {categories.map(cat => (
        <div key={cat}>
          <div
            onClick={() => setExpandedCategory(expandedCategory === cat ? null : cat)}
            style={{
              padding: '8px 16px',
              fontSize: 12,
              color: expandedCategory === cat ? '#a78bfa' : '#8a8f98',
              cursor: 'pointer',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              userSelect: 'none',
            }}
          >
            <span style={{ fontSize: 8 }}>{expandedCategory === cat ? '▼' : '▶'}</span>
            {cat}
          </div>
          {expandedCategory === cat && v2Samples
            .filter(s => s.category === cat)
            .map(sample => (
              <div
                key={sample.name}
                onClick={() => onSelect(sample)}
                style={{
                  padding: '6px 16px 6px 28px',
                  fontSize: 11,
                  color: activeSampleId === sample.name ? '#e2e5ea' : '#6b7280',
                  background: activeSampleId === sample.name ? '#14161c' : 'transparent',
                  cursor: 'pointer',
                  borderLeft: activeSampleId === sample.name ? '2px solid #a78bfa' : '2px solid transparent',
                  userSelect: 'none',
                }}
              >
                {sample.name}
              </div>
            ))
          }
        </div>
      ))}
    </div>
  );
}
