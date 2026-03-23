import { useState, useCallback, useRef, useEffect } from 'react';
import { useV2Diagram } from './components/V2Diagram';
import { V2SampleBrowser } from './components/V2SampleBrowser';
import { TabLayout } from './components/TabLayout';
import { Timeline } from './components/Timeline';
import { V2Editor } from './components/V2Editor';
import { v2Samples, type V2Sample } from '../samples/index';
import type { ViewBox } from '../renderer/camera';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";
const DEFAULT_DSL = v2Samples[0]?.dsl || '{ objects: [] }';
const PREFS_KEY = 'starch-v2-prefs';
const TABS_KEY = 'starch-tabs';

type LayoutMode = 'panel' | 'tab';

interface EditorTab {
  id: string;
  label: string;
  dsl: string;
  closable: boolean;
  viewFormat?: 'json5' | 'dsl';
  nodeFormats?: Record<string, 'inline' | 'block'>;
}

interface StoredTabs {
  tabs: { id: string; label: string; dsl: string; viewFormat?: 'json5' | 'dsl'; nodeFormats?: Record<string, 'inline' | 'block'> }[];
  activeTabId: string;
  nextTabId: number;
}

function loadStoredTabs(): StoredTabs | null {
  try {
    const stored = localStorage.getItem(TABS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0) return parsed as StoredTabs;
    }
  } catch { /* ignore */ }
  return null;
}

function saveStoredTabs(tabs: EditorTab[], activeTabId: string, nextTabId: number) {
  try {
    const userTabs = tabs.filter(t => t.id !== 'sample').map(({ id, label, dsl, viewFormat, nodeFormats }) => ({ id, label, dsl, viewFormat, nodeFormats }));
    const data: StoredTabs = { tabs: userTabs, activeTabId, nextTabId };
    localStorage.setItem(TABS_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

function detectDefaultMode(): LayoutMode {
  if (typeof window === 'undefined') return 'panel';
  return window.innerWidth < 768 ? 'tab' : 'panel';
}

function loadPrefs(): { layoutMode: LayoutMode | null; showBrowser: boolean; showEditor: boolean; editorWidth: number } {
  try {
    const stored = localStorage.getItem(PREFS_KEY);
    if (stored) return { layoutMode: null, showBrowser: true, showEditor: true, editorWidth: 360, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return { layoutMode: null, showBrowser: true, showEditor: true, editorWidth: 360 };
}

function savePrefs(prefs: Record<string, unknown>) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

export default function App() {
  const initialPrefs = useRef(loadPrefs());
  const [userLayoutMode, setUserLayoutMode] = useState<LayoutMode | null>(initialPrefs.current.layoutMode);
  const [autoMode, setAutoMode] = useState<LayoutMode>(detectDefaultMode);
  const layoutMode = userLayoutMode ?? autoMode;

  const storedTabs = useRef(loadStoredTabs());
  const nextTabIdRef = useRef(storedTabs.current?.nextTabId ?? 1);

  const [tabs, setTabs] = useState<EditorTab[]>(() => {
    const sampleTab: EditorTab = { id: 'sample', label: 'Sample', dsl: DEFAULT_DSL, closable: false };
    const stored = storedTabs.current;
    if (!stored || stored.tabs.length === 0) return [sampleTab];
    const restored = stored.tabs.map(t => ({ ...t, closable: true }));
    return [sampleTab, ...restored];
  });
  const [activeTabId, setActiveTabId] = useState(() => {
    const stored = storedTabs.current;
    if (stored?.activeTabId) {
      const exists = stored.activeTabId === 'sample' || stored.tabs.some(t => t.id === stored.activeTabId);
      if (exists) return stored.activeTabId;
    }
    return 'sample';
  });
  const [showEditor, setShowEditor] = useState(layoutMode === 'panel' ? initialPrefs.current.showEditor : true);
  const [showBrowser, setShowBrowser] = useState(layoutMode === 'panel' ? initialPrefs.current.showBrowser : true);
  const [debugMode, setDebugMode] = useState(false);
  const [previewRatio, setPreviewRatio] = useState(false);
  const [fixedCamera, setFixedCamera] = useState(false);
  const [panZoom, setPanZoom] = useState<{ x: number; y: number; zoom: number } | null>(null);
  const [editorWidth, setEditorWidth] = useState(initialPrefs.current.editorWidth);
  const [isDragging, setIsDragging] = useState(false);
  const [activeSampleId, setActiveSampleId] = useState<string | null>(v2Samples[0]?.name || null);
  const dragging = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number } | null>(null);

  // Auto-detect layout on resize (only when user hasn't explicitly chosen)
  useEffect(() => {
    if (userLayoutMode !== null) return;
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setAutoMode(e.matches ? 'tab' : 'panel');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [userLayoutMode]);

  // Persist prefs
  useEffect(() => {
    savePrefs({ layoutMode: userLayoutMode, showBrowser, showEditor, editorWidth });
  }, [userLayoutMode, showBrowser, showEditor, editorWidth]);

  // Persist user tabs (debounced)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveStoredTabs(tabs, activeTabId, nextTabIdRef.current);
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [tabs, activeTabId]);

  // Track canvas area dimensions for ratio preview
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setCanvasSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isCompact = layoutMode === 'tab';

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  const activeDsl = activeTab.dsl;

  const vpW = 800;
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

  // Sync parsed name to tab label (user tabs only)
  useEffect(() => {
    if (!activeTab.closable) return;
    const raw = diagram.name;
    const name = typeof raw === 'string' && raw.trim() ? raw.trim() : 'Untitled';
    if (name !== activeTab.label) {
      setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, label: name } : t));
    }
  }, [diagram.name, activeTab.closable, activeTab.label, activeTabId]);

  const updateTabDsl = useCallback((dsl: string) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, dsl } : t));
  }, [activeTabId]);

  const handleSampleClick = useCallback((sample: V2Sample) => {
    setTabs(prev => {
      const existing = prev.find(t => t.id === 'sample');
      if (existing) {
        return prev.map(t => t.id === 'sample' ? { ...t, dsl: sample.dsl } : t);
      }
      return [{ id: 'sample', label: 'Sample', dsl: sample.dsl, closable: false }, ...prev];
    });
    setActiveTabId('sample');
    setActiveSampleId(sample.name);
    requestAnimationFrame(() => diagram.seek(diagram.duration));
  }, [diagram]);

  const addTab = useCallback(() => {
    const id = 'tab-' + (nextTabIdRef.current++);
    setTabs(prev => [...prev, {
      id, label: 'Untitled',
      dsl: '{\n  objects: [],\n  animate: {\n    duration: 3,\n    loop: true,\n    keyframes: [],\n  },\n}',
      closable: true,
    }]);
    setActiveTabId(id);
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      const remaining = prev.filter(t => t.id !== id);
      if (activeTabId === id) setActiveTabId(remaining[remaining.length - 1]?.id || 'sample');
      return remaining;
    });
  }, [activeTabId]);

  const saveTabToFile = useCallback(() => {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;
    const raw = diagram.name;
    const name = typeof raw === 'string' && raw.trim() ? raw.trim().replace(/[^\w\s-]/g, '_') : 'untitled';
    const blob = new Blob([tab.dsl], { type: 'application/json5' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name + '.json5';
    a.click();
    URL.revokeObjectURL(url);
  }, [tabs, activeTabId, diagram.name]);

  const loadFileToTab = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json5,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          updateTabDsl(reader.result);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [updateTabDsl]);

  const toggleLayoutMode = useCallback(() => {
    const next: LayoutMode = layoutMode === 'panel' ? 'tab' : 'panel';
    setUserLayoutMode(next);
  }, [layoutMode]);

  // Touch-friendly button size
  const btnPad = isCompact ? '8px 14px' : '4px 10px';
  const btnSize = isCompact ? 12 : 11;

  // Compute fitted container dimensions for ratio preview
  const ratioContainerStyle = (() => {
    if (!previewRatio || !diagram.cameraRatio || !canvasSize) {
      return { width: '100%', height: '100%' } as const;
    }
    const { w: pw, h: ph } = canvasSize;
    const r = diagram.cameraRatio;
    let cw: number, ch: number;
    if (pw / ph > r) {
      // Parent is wider than ratio — constrain by height
      ch = ph;
      cw = ph * r;
    } else {
      // Parent is taller than ratio — constrain by width
      cw = pw;
      ch = pw / r;
    }
    return { width: cw, height: ch, border: '1px solid rgba(167, 139, 250, 0.5)', borderRadius: 4 } as const;
  })();

  // Shared canvas content (used by both layouts)
  const canvasContent = (
    <div
      ref={canvasRef}
      style={{
        width: '100%', height: '100%', position: 'relative', overflow: 'hidden',
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

        if (!fixedCamera) setFixedCamera(true);
      }}
    >
      <div ref={diagram.containerRef} style={ratioContainerStyle} />
    </div>
  );

  const timelineContent = (
    <Timeline
      time={diagram.time}
      duration={diagram.duration}
      playing={diagram.playing}
      speed={diagram.speed}
      chapters={diagram.chapters}
      keyframeTimes={diagram.keyframeTimes}
      onSeek={(t) => { diagram.seek(t); diagram.setPlaying(false); }}
      onTogglePlay={() => {
        if (!diagram.playing && diagram.time >= diagram.duration - 0.01) diagram.seek(0);
        diagram.setPlaying(!diagram.playing);
      }}
      onRestart={() => { diagram.seek(0); diagram.setPlaying(false); }}
      onSpeedChange={diagram.setSpeed}
    />
  );

  const editorContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
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
            {tab.label.length > 30 ? tab.label.slice(0, 30) + '...' : tab.label}
          </div>
        ))}
        <div onClick={addTab} style={{ padding: '6px 10px', fontSize: 13, color: '#4a4f59', cursor: 'pointer', userSelect: 'none' }}>+</div>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
        borderBottom: '1px solid #1a1d24', flexShrink: 0, background: '#0a0c10',
      }}>
        <button
          onClick={() => {
            const newFormat = (activeTab.viewFormat || 'json5') === 'json5' ? 'dsl' : 'json5';
            setTabs(prev => prev.map(t =>
              t.id === activeTabId ? { ...t, viewFormat: newFormat } : t
            ));
          }}
          title="Toggle between JSON5 and DSL view"
          style={{
            padding: '3px 8px', borderRadius: 4, fontSize: 10, fontFamily: FONT,
            border: '1px solid #2a2d35', background: '#14161c', color: '#6b7280',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          Mode
        </button>
        {activeTab.closable && (
          <>
            <button
              onClick={loadFileToTab}
              style={{
                padding: '3px 8px', borderRadius: 4, fontSize: 10, fontFamily: FONT,
                border: '1px solid #2a2d35', background: '#14161c', color: '#6b7280',
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              Load
            </button>
            <button
              onClick={saveTabToFile}
              style={{
                padding: '3px 8px', borderRadius: 4, fontSize: 10, fontFamily: FONT,
                border: '1px solid #2a2d35', background: '#14161c', color: '#6b7280',
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              Save
            </button>
          </>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 9, color: '#4a4f59', marginRight: activeTab.closable ? 6 : 0 }}>
          {(activeTab.viewFormat || 'json5') === 'json5' ? 'JSON5' : 'DSL'}
        </span>
        {activeTab.closable && (
          <button
            onClick={() => closeTab(activeTabId)}
            style={{
              padding: '3px 6px', borderRadius: 4, fontSize: 11, fontFamily: FONT,
              border: '1px solid #2a2d35', background: '#14161c', color: '#ef4444',
              cursor: 'pointer', lineHeight: 1,
            }}
          >
            ✕
          </button>
        )}
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <V2Editor
          value={activeDsl}
          onChange={updateTabDsl}
          viewFormat={activeTab.viewFormat || 'json5'}
          onViewFormatChange={(format) => {
            setTabs(prev => prev.map(t =>
              t.id === activeTabId ? { ...t, viewFormat: format } : t
            ));
          }}
          nodeFormats={activeTab.nodeFormats}
          onNodeFormatsChange={(formats) => {
            setTabs(prev => prev.map(t =>
              t.id === activeTabId ? { ...t, nodeFormats: formats } : t
            ));
          }}
        />
      </div>
    </div>
  );

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
          -webkit-appearance: none; width: ${isCompact ? 20 : 14}px; height: ${isCompact ? 20 : 14}px;
          border-radius: 50%; background: #a78bfa; cursor: pointer; border: 2px solid #0e1117;
        }
      `}</style>

      {/* Header */}
      <div style={{
        padding: isCompact ? '8px 12px' : '10px 20px',
        display: 'flex', alignItems: 'center',
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
        <div style={{ display: 'flex', gap: isCompact ? 4 : 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Layout mode toggle — small icon button */}
          <button
            onClick={toggleLayoutMode}
            title={layoutMode === 'panel' ? 'Switch to compact view' : 'Switch to full view'}
            style={{
              padding: isCompact ? '8px 10px' : '4px 8px', borderRadius: 6,
              border: '1px solid #2a2d35',
              background: '#14161c',
              color: '#6b7280',
              fontSize: isCompact ? 16 : 13, fontFamily: FONT, cursor: 'pointer',
              minHeight: isCompact ? 44 : undefined,
              lineHeight: 1,
            }}
          >
            {layoutMode === 'panel' ? '⊟' : '⊞'}
          </button>

          {!isCompact && (
            <>
              <div style={{ width: 1, height: 20, background: '#1e2028', margin: '0 4px' }} />
              {[
                { label: 'Samples', active: showBrowser, onClick: () => setShowBrowser(!showBrowser) },
                { label: 'Debug', active: debugMode, onClick: () => setDebugMode(!debugMode) },
                { label: 'Fit All', active: false, onClick: () => { const fit = diagram.computeFitAll(); setPanZoom(fit); setFixedCamera(true); } },
                { label: 'Lock View', active: fixedCamera, onClick: () => { const next = !fixedCamera; setFixedCamera(next); if (!next) { setPanZoom(null); } } },
                { label: 'Viewport', active: previewRatio, onClick: () => setPreviewRatio(!previewRatio) },
                { label: showEditor ? 'Hide' : 'Edit', active: false, onClick: () => { const next = !showEditor; setShowEditor(next); if (!next) setShowBrowser(false); } },
              ].map(btn => (
                <button
                  key={btn.label}
                  onClick={btn.onClick}
                  style={{
                    padding: btnPad, borderRadius: 6,
                    border: `1px solid ${btn.active ? '#a78bfa' : '#2a2d35'}`,
                    background: btn.active ? 'rgba(167,139,250,0.1)' : '#14161c',
                    color: btn.active ? '#a78bfa' : '#6b7280',
                    fontSize: btnSize, fontFamily: FONT, cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  {btn.label}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Body */}
      {isCompact ? (
        <TabLayout
          canvasContent={canvasContent}
          timelineContent={timelineContent}
          editorContent={editorContent}
          onSampleSelect={handleSampleClick}
          activeSampleId={activeSampleId}
        />
      ) : (
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
          {/* Sample browser — slide in/out */}
          <div style={{
            width: showBrowser ? 240 : 0,
            height: '100%',
            flexShrink: 0, overflow: 'hidden',
            transition: 'width 0.2s ease',
          }}>
            <V2SampleBrowser
              activeSampleId={activeSampleId}
              onSelect={handleSampleClick}
            />
          </div>

          {/* Editor panel — slide in/out */}
          <div style={{
            width: showEditor ? editorWidth : 0,
            height: '100%',
            flexShrink: 0, overflow: 'hidden',
            transition: isDragging ? 'none' : 'width 0.2s ease',
            display: 'flex', flexDirection: 'column',
            borderRight: showEditor ? '1px solid #1a1d24' : 'none',
            minHeight: 0,
          }}>
            {editorContent}
          </div>

          {/* Resize handle */}
          {showEditor && (
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
          )}

          {/* Diagram canvas + timeline */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              {canvasContent}
            </div>
            {timelineContent}
          </div>
        </div>
      )}
    </div>
  );
}
