import { useState } from 'react';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";

interface Tab {
  label: string;
  content: React.ReactNode;
}

interface TabbedPopupProps {
  tabs: Tab[];
  defaultTab?: number;
}

export function TabbedPopup({ tabs, defaultTab = 0 }: TabbedPopupProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  if (tabs.length === 1) {
    return <>{tabs[0].content}</>;
  }

  return (
    <div>
      <div style={{
        display: 'flex', borderBottom: '1px solid #1a1d24',
      }}>
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            onClick={() => setActiveTab(i)}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              flex: 1,
              padding: '5px 8px',
              fontSize: 10,
              fontFamily: FONT,
              color: i === activeTab ? '#a78bfa' : '#4a4f59',
              background: 'transparent',
              border: 'none',
              borderBottom: i === activeTab ? '2px solid #a78bfa' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs[activeTab]?.content}
    </div>
  );
}
