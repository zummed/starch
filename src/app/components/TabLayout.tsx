import { useState, useCallback } from 'react';
import type { V2Sample } from '../../samples/index';
import { v2Samples, getV2SampleCategories } from '../../samples/index';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";

interface TabLayoutProps {
  canvasContent: React.ReactNode;
  timelineContent: React.ReactNode;
  editorContent: React.ReactNode;
  fileManagerContent?: React.ReactNode;
  onSampleSelect: (sample: V2Sample) => void;
  activeSampleId: string | null;
}

function InlineSampleBrowser({ onSelect, activeSampleId }: { onSelect: (s: V2Sample) => void; activeSampleId: string | null }) {
  const [expanded, setExpanded] = useState(true);
  const categories = getV2SampleCategories();
  const [expandedCat, setExpandedCat] = useState<string | null>(categories[0] ?? null);

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{
          width: '100%', padding: '10px 16px', border: 'none',
          background: '#14161c', color: '#a78bfa', fontSize: 12,
          fontFamily: FONT, cursor: 'pointer', textAlign: 'left',
          borderBottom: '1px solid #1a1d24',
        }}
      >
        Samples...
      </button>
    );
  }

  return (
    <div style={{
      borderBottom: '1px solid #1a1d24', background: '#0a0c10',
      maxHeight: 300, overflowY: 'auto',
    }}>
      <div style={{
        padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
          samples
        </span>
        <button
          onClick={() => setExpanded(false)}
          style={{
            background: 'none', border: 'none', color: '#6b7280',
            fontSize: 14, cursor: 'pointer', padding: '2px 6px',
          }}
        >
          ×
        </button>
      </div>
      {categories.map(cat => (
        <div key={cat}>
          <div
            onClick={() => setExpandedCat(expandedCat === cat ? null : cat)}
            style={{
              padding: '6px 16px', fontSize: 12,
              color: expandedCat === cat ? '#a78bfa' : '#8a8f98',
              cursor: 'pointer', fontWeight: 600, userSelect: 'none',
            }}
          >
            <span style={{ fontSize: 8, marginRight: 6 }}>{expandedCat === cat ? '▼' : '▶'}</span>
            {cat}
          </div>
          {expandedCat === cat && v2Samples
            .filter(s => s.category === cat)
            .map(sample => (
              <div
                key={sample.name}
                onClick={() => { onSelect(sample); setExpanded(false); }}
                style={{
                  padding: '6px 16px 6px 28px', fontSize: 11,
                  color: activeSampleId === sample.name ? '#e2e5ea' : '#6b7280',
                  background: activeSampleId === sample.name ? '#14161c' : 'transparent',
                  cursor: 'pointer', userSelect: 'none',
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

export function TabLayout({ canvasContent, timelineContent, editorContent, fileManagerContent, onSampleSelect, activeSampleId }: TabLayoutProps) {
  const [activeTab, setActiveTab] = useState<'canvas' | 'editor' | 'files'>('canvas');

  const bottomTabs: { id: 'canvas' | 'editor' | 'files'; label: string; icon: string }[] = [
    { id: 'canvas', label: 'Canvas', icon: '◇' },
    { id: 'editor', label: 'Editor', icon: '⟨/⟩' },
    ...(fileManagerContent ? [{ id: 'files' as const, label: 'Files', icon: '☰' }] : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* All tabs are always mounted — CSS hides the inactive ones.
           This preserves ProseMirror editor state across tab switches. */}
      <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'canvas' ? 'flex' : 'none', flexDirection: 'column' }}>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {canvasContent}
        </div>
        {timelineContent}
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'editor' ? 'flex' : 'none', flexDirection: 'column' }}>
        <InlineSampleBrowser onSelect={onSampleSelect} activeSampleId={activeSampleId} />
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {editorContent}
        </div>
      </div>
      {fileManagerContent && (
        <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'files' ? 'flex' : 'none', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {fileManagerContent}
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div style={{
        height: 48, flexShrink: 0, display: 'flex',
        borderTop: '1px solid #1a1d24', background: '#0a0c10',
      }}>
        {bottomTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 2,
              background: 'transparent', border: 'none',
              color: activeTab === tab.id ? '#a78bfa' : '#6b7280',
              fontSize: 10, fontFamily: FONT, cursor: 'pointer',
              minHeight: 44,
            }}
          >
            <span style={{ fontSize: 16 }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
