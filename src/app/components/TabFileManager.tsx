import { useState } from 'react';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";
const TABS_KEY = 'starch-tabs';

interface TabInfo {
  id: string;
  label: string;
  dsl: string;
  closable: boolean;
  visible?: boolean;
}

interface TabFileManagerProps {
  tabs: TabInfo[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onDuplicateTab: (id: string) => void;
  onDeleteTab: (id: string) => void;
}

function getStorageSize(): string {
  try {
    const data = localStorage.getItem(TABS_KEY);
    if (!data) return '0 B';
    const bytes = new Blob([data]).size;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  } catch {
    return '?';
  }
}

function dslPreview(dsl: string): string {
  const lines = dsl.split('\n').filter(l => l.trim());
  return lines.slice(0, 2).map(l => l.length > 40 ? l.slice(0, 40) + '...' : l).join('\n') || '(empty)';
}

const btnStyle = {
  padding: '4px 8px',
  fontSize: 16,
  background: 'transparent',
  border: 'none',
  borderRadius: 4,
  color: '#4a4f59',
  cursor: 'pointer',
  lineHeight: 1,
} as const;

export function TabFileManager({
  tabs,
  activeTabId,
  onSelectTab,
  onToggleVisible,
  onDuplicateTab,
  onDeleteTab,
}: TabFileManagerProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const userTabs = tabs.filter(t => t.closable);
  const sampleTab = tabs.find(t => t.id === 'sample');

  return (
    <div style={{
      width: '100%',
      minWidth: 240,
      height: '100%',
      flexShrink: 0,
      borderRight: '1px solid #1a1d24',
      overflowY: 'auto',
      background: '#0a0c10',
      fontFamily: FONT,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        fontSize: 11,
        color: '#6b7280',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 1,
      }}>
        files
      </div>

      {/* Sample tab (non-editable, always first) */}
      {sampleTab && (
        <div
          onClick={() => onSelectTab('sample')}
          style={{
            padding: '8px 16px',
            cursor: 'pointer',
            background: activeTabId === 'sample' ? '#14161c' : 'transparent',
            borderLeft: activeTabId === 'sample' ? '2px solid #a78bfa' : '2px solid transparent',
            userSelect: 'none',
          }}
        >
          <div style={{
            fontSize: 11,
            color: activeTabId === 'sample' ? '#e2e5ea' : '#6b7280',
            fontWeight: 600,
          }}>
            Sample
          </div>
          <div style={{ fontSize: 9, color: '#4a4f59', marginTop: 2 }}>
            built-in examples
          </div>
        </div>
      )}

      {/* Divider */}
      {userTabs.length > 0 && (
        <div style={{
          padding: '8px 16px 4px',
          fontSize: 9,
          color: '#4a4f59',
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}>
          your files ({userTabs.length})
        </div>
      )}

      {/* User tabs */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {userTabs.map(tab => {
          const isActive = tab.id === activeTabId;
          const isConfirmingDelete = confirmDeleteId === tab.id;
          const isVisible = tab.visible !== false;

          return (
            <div
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              style={{
                padding: '8px 16px',
                cursor: 'pointer',
                background: isActive ? '#14161c' : 'transparent',
                borderLeft: isActive ? '2px solid #a78bfa' : '2px solid transparent',
                userSelect: 'none',
              }}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget as HTMLDivElement).style.background = '#0e1117';
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
              }}
            >
              {/* Label */}
              <div style={{
                fontSize: 11,
                color: isActive ? '#e2e5ea' : '#6b7280',
                fontWeight: isActive ? 600 : 400,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {tab.label}
              </div>

              {/* DSL preview */}
              <div style={{
                fontSize: 9,
                color: '#3a3f49',
                marginTop: 3,
                whiteSpace: 'pre',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                lineHeight: 1.4,
              }}>
                {dslPreview(tab.dsl)}
              </div>

              {/* Size + actions */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 6,
              }}>
                <span style={{ fontSize: 9, color: '#3a3f49' }}>
                  {tab.dsl.length} chars
                </span>

                {isConfirmingDelete ? (
                  <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => { onDeleteTab(tab.id); setConfirmDeleteId(null); }}
                      style={{
                        padding: '3px 10px', fontSize: 11, fontFamily: FONT,
                        background: '#3b1219', border: '1px solid #ef4444',
                        borderRadius: 4, color: '#ef4444', cursor: 'pointer',
                      }}
                    >
                      delete
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      style={{
                        padding: '3px 10px', fontSize: 11, fontFamily: FONT,
                        background: 'transparent', border: '1px solid #2a2d35',
                        borderRadius: 4, color: '#6b7280', cursor: 'pointer',
                      }}
                    >
                      cancel
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => onToggleVisible(tab.id)}
                      title={isVisible ? 'Hide from tabs' : 'Show in tabs'}
                      style={{
                        ...btnStyle,
                        filter: 'grayscale(1)',
                        opacity: isVisible ? 0.9 : 0.3,
                      }}
                    >
                      👁
                    </button>
                    <button
                      onClick={() => onDuplicateTab(tab.id)}
                      title="Duplicate"
                      style={btnStyle}
                    >
                      ⧉
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(tab.id)}
                      title="Delete"
                      style={{ ...btnStyle, color: '#ef4444' }}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {userTabs.length === 0 && (
          <div style={{
            padding: '16px',
            fontSize: 10,
            color: '#3a3f49',
            textAlign: 'center',
            lineHeight: 1.6,
          }}>
            No saved files yet.<br />
            Click + in the editor to create one.
          </div>
        )}
      </div>

      {/* Storage footer */}
      <div style={{
        padding: '8px 16px',
        borderTop: '1px solid #1a1d24',
        fontSize: 9,
        color: '#3a3f49',
        flexShrink: 0,
      }}>
        Storage: {getStorageSize()}
      </div>
    </div>
  );
}
