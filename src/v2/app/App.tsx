import { useState, useCallback, useRef, useEffect } from 'react';
import { useV2Diagram } from './components/V2Diagram';
import { V2SampleBrowser } from './components/V2SampleBrowser';
import { Timeline } from '../../components/Timeline';
import { Editor } from '../../components/Editor';
import { v2Samples, type V2Sample } from '../samples/index';
import type { ViewBox } from '../renderer/camera';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";

const DEFAULT_DSL = v2Samples[0]?.dsl || '{ objects: [] }';

interface EditorTab {
  id: string;
  label: string;
  dsl: string;
  closable: boolean;
}

let nextTabId = 1;

export default function App() {
  const [tabs, setTabs] = useState<EditorTab[]>([
    { id: 'sample', label: 'Sample', dsl: DEFAULT_DSL, closable: false },
  ]);
  const [activeTabId, setActiveTabId] = useState('sample');
  const [showEditor, setShowEditor] = useState(true);
  const [showBrowser, setShowBrowser] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [previewRatio, setPreviewRatio] = useState(false);
  const [fitAll, setFitAll] = useState(false);
  const [fixedCamera, setFixedCamera] = useState(false);
  const [panZoom, setPanZoom] = useState<{ x: number; y: number; zoom: number } | null>(null);
  const [editorWidth, setEditorWidth] = useState(360);
  const [isDragging, setIsDragging] = useState(false);
  const [activeSampleId, setActiveSampleId] = useState<string | null>(v2Samples[0]?.name || null);
  const dragging = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  const activeDsl = activeTab.dsl;

  // Compute viewport override from pan/zoom state
  const vpW = 800; // TODO: derive from diagram viewport setting
  const vpH = 500;
  let viewportOverride: ViewBox | null = null;
  if (panZoom) {
    const pw = vpW / panZoom.zoom;
    const ph = vpH / panZoom.zoom;
    viewportOverride = { x: panZoom.x - pw / 2, y: panZoom.y - ph / 2, w: pw, h: ph };
  }

  const diagram = useV2Diagram({
    dsl: activeDsl,
    autoplay: false,
    speed: 1,
    debug: debugMode,
    viewportOverride: fixedCamera ? viewportOverride : null,
  });

  // Seek to end when DSL changes
  const lastDslRef = useRef(activeDsl);
  if (lastDslRef.current !== activeDsl) {
    lastDslRef.current = activeDsl;
    requestAnimationFrame(() => diagram.seek(diagram.duration));
  }

  const updateTabDsl = useCallback((dsl: string) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, dsl } : t));
  }, [activeTabId]);

  const handleSampleClick = useCallback((sample: V2Sample) => {
    setTabs(prev => {
      const existing = prev.find(t => t.id === 'sample');
      if (existing) {
        return prev.map(t => t.id === 'sample' ? { ...t, dsl: sample.dsl } : t);
      }
      return [{ id: 'sample', label: 'Sample', dsl: sample.dsl, closable: true }, ...prev];
    });
    setActiveTabId('sample');
    setActiveSampleId(sample.name);
  }, []);

  const addTab = useCallback(() => {
    const id = 'tab-' + (nextTabId++);
    setTabs(prev => [...prev, {
      id,
      label: 'Untitled',
      dsl: '{\n  objects: [],\n  animate: {\n    duration: 3,\n    loop: true,\n    keyframes: [],\n  },\n}',
      closable: true,
    }]);
    setActiveTabId(id);
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      const remaining = prev.filter(t => t.id !== id);
      if (activeTabId === id) {
        setActiveTabId(remaining[remaining.length - 1]?.id || 'sample');
      }
      return remaining;
    });
  }, [activeTabId]);

  return (
    <div style={{
      width: '100%', height: '100vh', display: 'flex', flexDirection: 'column',
      background: '#0e1117', fontFamily: FONT, color: '#c9cdd4', overflow: 'hidden',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');
        textarea:focus { outline: none; border-color: #22d3ee !important; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2a2d35; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #3a3f49; }
        ::-webkit-scrollbar-corner { background: transparent; }
        * { scrollbar-width: thin; scrollbar-color: #2a2d35 transparent; }
        input[type=range] {
          -webkit-appearance: none; height: 4px; background: #1e2028; border-radius: 2px; outline: none;
        }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%;
          background: #a78bfa; cursor: pointer; border: 2px solid #0e1117;
        }
      `}</style>

      {/* Header */}
      <div style={{
        padding: '10px 20px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', borderBottom: '1px solid #1a1d24', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: '#a78bfa', boxShadow: '0 0 8px rgba(167,139,250,0.5)',
          }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: '#e2e5ea' }}>starch</span>
          <span style={{ fontSize: 10, color: '#a78bfa', marginLeft: 2, fontWeight: 600 }}>v2</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {[
            { label: 'Samples', active: showBrowser, onClick: () => setShowBrowser(!showBrowser) },
            null, // separator
            { label: 'Debug', active: debugMode, onClick: () => setDebugMode(!debugMode) },
            ...(diagram.viewport ? [{ label: 'Viewport', active: previewRatio, onClick: () => setPreviewRatio(!previewRatio) }] : []),
            { label: 'Fit All', active: fitAll, onClick: () => { setFitAll(!fitAll); setPanZoom(null); if (!fitAll && !fixedCamera) setFixedCamera(true); } },
            { label: 'Lock View', active: fixedCamera, onClick: () => { const next = !fixedCamera; setFixedCamera(next); if (!next) { setPanZoom(null); setFitAll(false); } } },
            null,
            { label: showEditor ? 'Hide' : 'Edit', active: false, onClick: () => { const next = !showEditor; setShowEditor(next); if (!next) setShowBrowser(false); } },
          ].map((btn, i) => {
            if (!btn) return <div key={`sep-${i}`} style={{ width: 1, height: 20, background: '#1e2028', margin: '0 4px' }} />;
            return (
              <button
                key={btn.label}
                onClick={btn.onClick}
                style={{
                  padding: '4px 10px', borderRadius: 6,
                  border: `1px solid ${btn.active ? '#a78bfa' : '#2a2d35'}`,
                  background: btn.active ? 'rgba(167,139,250,0.1)' : '#14161c',
                  color: btn.active ? '#a78bfa' : '#6b7280',
                  fontSize: 11, fontFamily: FONT, cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {btn.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div
        ref={bodyRef}
        style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0, userSelect: isDragging ? 'none' : 'auto' }}
        onMouseMove={(e) => {
          if (!dragging.current || !bodyRef.current) return;
          const browserWidth = showBrowser ? 240 : 0;
          const bodyLeft = bodyRef.current.getBoundingClientRect().left;
          setEditorWidth(Math.max(e.clientX - bodyLeft - browserWidth, 200));
        }}
        onMouseUp={() => { dragging.current = false; setIsDragging(false); }}
        onMouseLeave={() => { dragging.current = false; setIsDragging(false); }}
      >
        {/* Sample browser */}
        {showBrowser && (
          <V2SampleBrowser
            activeSampleId={activeSampleId}
            onSelect={handleSampleClick}
          />
        )}

        {/* Editor panel */}
        {showEditor && (
          <>
            <div style={{ width: editorWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid #1a1d24', minHeight: 0, overflow: 'hidden' }}>
              <div style={{
                display: 'flex', alignItems: 'center', borderBottom: '1px solid #1a1d24',
                flexShrink: 0, background: '#0a0c10', overflow: 'hidden',
              }}>
                {tabs.map(tab => (
                  <div
                    key={tab.id}
                    onClick={() => setActiveTabId(tab.id)}
                    style={{
                      padding: '6px 12px', fontSize: 11, fontFamily: FONT, cursor: 'pointer',
                      color: tab.id === activeTabId ? '#e2e5ea' : '#6b7280',
                      background: tab.id === activeTabId ? '#0e1117' : 'transparent',
                      borderBottom: tab.id === activeTabId ? '2px solid #a78bfa' : '2px solid transparent',
                      whiteSpace: 'nowrap', userSelect: 'none',
                    }}
                  >
                    {tab.label}
                  </div>
                ))}
                <div onClick={addTab} style={{ padding: '6px 10px', fontSize: 13, color: '#4a4f59', cursor: 'pointer', userSelect: 'none' }}>+</div>
              </div>
              <Editor value={activeDsl} onChange={updateTabDsl} onClose={tabs.length > 1 ? () => closeTab(activeTabId) : undefined} />
            </div>
            <div
              onMouseDown={(e) => { e.preventDefault(); dragging.current = true; setIsDragging(true); }}
              style={{
                width: 5, cursor: 'col-resize', flexShrink: 0,
                background: isDragging ? '#22d3ee' : 'transparent',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#22d3ee40'; }}
              onMouseLeave={(e) => { if (!dragging.current) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
            />
          </>
        )}

        {/* Diagram canvas */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              flex: 1, position: 'relative', overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'grab',
            }}
            onWheel={(e) => {
              e.preventDefault();
              const cur = panZoom || { x: vpW / 2, y: vpH / 2, zoom: 1 };
              const rect = e.currentTarget.getBoundingClientRect();
              const mx = (e.clientX - rect.left) / rect.width;
              const my = (e.clientY - rect.top) / rect.height;
              const viewW = vpW / cur.zoom;
              const viewH = vpH / cur.zoom;
              const worldX = cur.x - viewW / 2 + mx * viewW;
              const worldY = cur.y - viewH / 2 + my * viewH;
              const factor = e.deltaY > 0 ? 0.9 : 1.1;
              const newZoom = Math.max(0.1, Math.min(20, cur.zoom * factor));
              const newViewW = vpW / newZoom;
              const newViewH = vpH / newZoom;
              setPanZoom({ x: worldX + newViewW * (0.5 - mx), y: worldY + newViewH * (0.5 - my), zoom: newZoom });
              setFitAll(false);
              if (!fixedCamera) setFixedCamera(true);
            }}
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              const startX = e.clientX;
              const startY = e.clientY;
              const rect = e.currentTarget.getBoundingClientRect();
              const cur = panZoom || { x: vpW / 2, y: vpH / 2, zoom: 1 };
              const pixelToWorld = (vpW / cur.zoom) / rect.width;
              const onMove = (me: MouseEvent) => {
                setPanZoom({ x: cur.x - (me.clientX - startX) * pixelToWorld, y: cur.y - (me.clientY - startY) * pixelToWorld, zoom: cur.zoom });
              };
              const onUp = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                document.body.style.cursor = '';
              };
              document.body.style.cursor = 'grabbing';
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
              setFitAll(false);
              if (!fixedCamera) setFixedCamera(true);
            }}
          >
            <div ref={diagram.containerRef} style={{ width: '100%', height: '100%' }} />
          </div>

          <Timeline
            time={diagram.time}
            duration={diagram.duration}
            playing={diagram.playing}
            speed={diagram.speed}
            chapters={diagram.chapters}
            onSeek={(t) => { diagram.seek(t); diagram.setPlaying(false); }}
            onTogglePlay={() => {
              if (!diagram.playing && diagram.time >= diagram.duration - 0.01) diagram.seek(0);
              diagram.setPlaying(!diagram.playing);
            }}
            onRestart={() => { diagram.seek(0); diagram.setPlaying(true); }}
            onSpeedChange={diagram.setSpeed}
          />
        </div>
      </div>
    </div>
  );
}
