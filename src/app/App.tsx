import { useState, useCallback, useRef, useEffect } from 'react';
import { useV2Diagram } from './components/V2Diagram';
import { V2SampleBrowser } from './components/V2SampleBrowser';
import { TabFileManager } from './components/TabFileManager';
import { Timeline } from './components/Timeline';
import { StructuralEditor, type StructuralEditorHandle } from '../editor/StructuralEditor';
import { v2Samples, type V2Sample } from '../samples/index';
import type { ViewBox } from '../renderer/camera';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";
const DEFAULT_DSL = v2Samples[0]?.dsl || '{ objects: [] }';
const PREFS_KEY = 'starch-v2-prefs';
const TABS_KEY = 'starch-tabs';

type LayoutMode = 'panel' | 'blade';

interface EditorTab {
  id: string;
  label: string;
  dsl: string;
  closable: boolean;
  visible?: boolean;
}

interface StoredTabs {
  tabs: { id: string; label: string; dsl: string; visible?: boolean }[];
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
    const userTabs = tabs.filter(t => t.id !== 'sample').map(t => ({
      id: t.id,
      label: t.label,
      dsl: t.dsl,
      ...(t.visible === false ? { visible: false } : {}),
    }));
    const data: StoredTabs = { tabs: userTabs, activeTabId, nextTabId };
    localStorage.setItem(TABS_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

function detectDefaultMode(): LayoutMode {
  if (typeof window === 'undefined') return 'panel';
  return window.innerWidth < 1024 ? 'blade' : 'panel';
}

function loadPrefs(): { showBrowser: boolean; showEditor: boolean; editorWidth: number } {
  try {
    const stored = localStorage.getItem(PREFS_KEY);
    if (stored) return { showBrowser: true, showEditor: true, editorWidth: 360, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return { showBrowser: true, showEditor: true, editorWidth: 360 };
}

function savePrefs(prefs: Record<string, unknown>) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

export default function App() {
  const initialPrefs = useRef(loadPrefs());
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(detectDefaultMode);

  const storedTabs = useRef(loadStoredTabs());
  const nextTabIdRef = useRef(storedTabs.current?.nextTabId ?? 1);

  const [tabs, setTabs] = useState<EditorTab[]>(() => {
    const sampleTab: EditorTab = {
      id: 'sample',
      label: 'Sample',
      dsl: DEFAULT_DSL,
      closable: false,
    };
    const stored = storedTabs.current;
    if (!stored || stored.tabs.length === 0) return [sampleTab];
    const restored = stored.tabs.map(t => ({
      id: t.id,
      label: t.label,
      dsl: t.dsl,
      closable: true,
      visible: t.visible !== false,
    }));
    return [sampleTab, ...restored];
  });
  const [activeTabId, _setActiveTabId] = useState(() => {
    const stored = storedTabs.current;
    if (stored?.activeTabId) {
      const exists = stored.activeTabId === 'sample' || stored.tabs.some(t => t.id === stored.activeTabId);
      if (exists) return stored.activeTabId;
    }
    return 'sample';
  });
  const activeTabIdRef = useRef(activeTabId);
  const setActiveTabId = useCallback((id: string) => {
    activeTabIdRef.current = id;
    _setActiveTabId(id);
  }, []);
  const [showEditor, setShowEditor] = useState(initialPrefs.current.showEditor);
  const [showBrowser, setShowBrowser] = useState(initialPrefs.current.showBrowser);
  const [showFileManager, setShowFileManager] = useState(false);
  const [activeBlade, setActiveBlade] = useState<'samples' | 'files' | 'editor' | 'viewer'>('viewer');
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
  const touchState = useRef<{
    type: 'pan' | 'pinch';
    startX: number; startY: number;
    curPanZoom: { x: number; y: number; zoom: number };
    pixelToWorld: number;
    startDist: number; startMidX: number; startMidY: number; startZoom: number;
  } | null>(null);
  const panZoomRef = useRef(panZoom);
  panZoomRef.current = panZoom;
  const fixedCameraRef = useRef(fixedCamera);
  fixedCameraRef.current = fixedCamera;
  const diagramRef = useRef<ReturnType<typeof useV2Diagram>>(null!);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number } | null>(null);

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  const editorRef = useRef<StructuralEditorHandle>(null);

  // Track DSL text for diagram rendering — updated via StructuralEditor onModelChange
  const [activeDsl, setActiveDsl] = useState(activeTab.dsl);

  // When active tab changes, sync DSL
  useEffect(() => {
    setActiveDsl(activeTab.dsl);
  }, [activeTab.id]); // intentionally keyed on id, not dsl

  const handleModelChange = useCallback((_model: any) => {
    // The editor IS the DSL text — grab it directly
    const text = editorRef.current?.getDsl() ?? '';
    if (text) {
      setActiveDsl(text);
      // Persist edits back to the tab so switching away and back restores them
      // Use ref to avoid stale closure when loadDsl triggers onModelChange synchronously
      const tabId = activeTabIdRef.current;
      setTabs(prev => prev.map(t => t.id === tabId ? { ...t, dsl: text } : t));
    }
  }, []);

  // Auto-detect layout on resize
  useEffect(() => {
    const handler = () => {
      setLayoutMode(window.innerWidth < 1024 ? 'blade' : 'panel');
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Persist prefs
  useEffect(() => {
    savePrefs({ showBrowser, showEditor, editorWidth });
  }, [showBrowser, showEditor, editorWidth]);

  // Persist user tabs (debounced)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveStoredTabs(tabs, activeTabId, nextTabIdRef.current);
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [tabs, activeTabId, activeDsl]);

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

  // Touch pan & pinch-zoom on the viewer canvas
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const dist = (t1: Touch, t2: Touch) =>
      Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cur = panZoomRef.current || diagramRef.current.computeFitAll();

      if (e.touches.length === 1) {
        const t = e.touches[0];
        const pixelToWorld = (vpW / cur.zoom) / rect.width;
        touchState.current = {
          type: 'pan', startX: t.clientX, startY: t.clientY,
          curPanZoom: cur, pixelToWorld,
          startDist: 0, startMidX: 0, startMidY: 0, startZoom: 0,
        };
      } else if (e.touches.length === 2) {
        const [t1, t2] = [e.touches[0], e.touches[1]];
        touchState.current = {
          type: 'pinch', startX: 0, startY: 0,
          curPanZoom: cur,
          pixelToWorld: (vpW / cur.zoom) / rect.width,
          startDist: dist(t1, t2),
          startMidX: (t1.clientX + t2.clientX) / 2,
          startMidY: (t1.clientY + t2.clientY) / 2,
          startZoom: cur.zoom,
        };
      }
      if (!fixedCameraRef.current) setFixedCamera(true);
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (!touchState.current) return;
      const rect = el.getBoundingClientRect();

      if (e.touches.length === 1 && touchState.current.type === 'pan') {
        const t = e.touches[0];
        const { startX, startY, curPanZoom, pixelToWorld } = touchState.current;
        setPanZoom({
          x: curPanZoom.x - (t.clientX - startX) * pixelToWorld,
          y: curPanZoom.y - (t.clientY - startY) * pixelToWorld,
          zoom: curPanZoom.zoom,
        });
      } else if (e.touches.length === 2) {
        const [t1, t2] = [e.touches[0], e.touches[1]];

        // Transition from 1-finger pan to 2-finger pinch
        if (touchState.current.type === 'pan') {
          const cur = panZoomRef.current || diagramRef.current.computeFitAll();
          touchState.current = {
            type: 'pinch', startX: 0, startY: 0,
            curPanZoom: cur,
            pixelToWorld: (vpW / cur.zoom) / rect.width,
            startDist: dist(t1, t2),
            startMidX: (t1.clientX + t2.clientX) / 2,
            startMidY: (t1.clientY + t2.clientY) / 2,
            startZoom: cur.zoom,
          };
          return;
        }

        const { startDist, startMidX, startMidY, startZoom, curPanZoom, pixelToWorld } = touchState.current;

        // Zoom from pinch distance ratio
        const curDist = dist(t1, t2);
        const newZoom = Math.max(0.1, Math.min(20, startZoom * (curDist / startDist)));

        // Pan from midpoint movement
        const midX = (t1.clientX + t2.clientX) / 2;
        const midY = (t1.clientY + t2.clientY) / 2;
        const dx = (midX - startMidX) * pixelToWorld;
        const dy = (midY - startMidY) * pixelToWorld;

        // Zoom centering (same math as onWheel)
        const mx = (midX - rect.left) / rect.width;
        const my = (midY - rect.top) / rect.height;
        const viewW = vpW / curPanZoom.zoom;
        const viewH = vpH / curPanZoom.zoom;
        const worldX = curPanZoom.x - viewW / 2 + mx * viewW;
        const worldY = curPanZoom.y - viewH / 2 + my * viewH;
        const newViewW = vpW / newZoom;
        const newViewH = vpH / newZoom;

        setPanZoom({
          x: worldX + newViewW * (0.5 - mx) - dx,
          y: worldY + newViewH * (0.5 - my) - dy,
          zoom: newZoom,
        });
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        touchState.current = null;
      } else if (e.touches.length === 1 && touchState.current?.type === 'pinch') {
        // Transition from pinch back to single-finger pan
        const t = e.touches[0];
        const cur = panZoomRef.current || diagramRef.current.computeFitAll();
        const rect = el.getBoundingClientRect();
        const pixelToWorld = (vpW / cur.zoom) / rect.width;
        touchState.current = {
          type: 'pan', startX: t.clientX, startY: t.clientY,
          curPanZoom: cur, pixelToWorld,
          startDist: 0, startMidX: 0, startMidY: 0, startZoom: 0,
        };
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: false });
    el.addEventListener('touchcancel', onTouchEnd, { passive: false });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  const isBlade = layoutMode === 'blade';

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
  diagramRef.current = diagram;

  // Sync parsed name to tab label (user tabs only)
  useEffect(() => {
    if (!activeTab.closable) return;
    const raw = diagram.name;
    const name = typeof raw === 'string' && raw.trim() ? raw.trim() : 'Untitled';
    if (name !== activeTab.label) {
      setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, label: name } : t));
    }
  }, [diagram.name, activeTab.closable, activeTab.label, activeTabId]);

  const handleSampleClick = useCallback((sample: V2Sample) => {
    // Set ref FIRST so any model change triggered by loadDsl writes to 'sample', not the old tab
    setActiveTabId('sample');
    // Update the tab's stored DSL
    setTabs(prev => prev.map(t => t.id === 'sample' ? { ...t, dsl: sample.dsl } : t));
    // Load into editor
    editorRef.current?.loadDsl(sample.dsl);
    setActiveSampleId(sample.name);
    requestAnimationFrame(() => diagram.seek(diagram.duration));
  }, [diagram, setActiveTabId]);

  const addTab = useCallback(() => {
    const id = 'tab-' + (nextTabIdRef.current++);
    const defaultDsl = 'box: rect 100x60 fill steelblue at 200,150';
    setTabs(prev => [...prev, {
      id,
      label: 'Untitled',
      dsl: defaultDsl,
      closable: true,
      visible: true,
    }]);
    setActiveTabId(id);
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      const remaining = prev.filter(t => t.id !== id);
      if (activeTabIdRef.current === id) setActiveTabId(remaining[remaining.length - 1]?.id || 'sample');
      return remaining;
    });
  }, [setActiveTabId]);

  const saveTabToFile = useCallback(() => {
    const tabId = activeTabIdRef.current;
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    const name = tab.label.trim() ? tab.label.trim().replace(/[^\w\s-]/g, '_') : 'untitled';
    const text = editorRef.current?.getDsl() ?? tab.dsl;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name + '.starch';
    a.click();
    URL.revokeObjectURL(url);
  }, [tabs]);

  const loadFileToTab = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.starch,.dsl,.txt';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const tabId = activeTabIdRef.current;
          editorRef.current?.loadDsl(reader.result);
          setTabs(prev => prev.map(t => t.id === tabId ? { ...t, dsl: reader.result as string } : t));
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, []);

  const handleToggleVisible = useCallback((id: string) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, visible: t.visible === false ? true : false } : t));
  }, []);

  const handleDuplicateTab = useCallback((id: string) => {
    setTabs(prev => {
      const source = prev.find(t => t.id === id);
      if (!source) return prev;
      const newId = 'tab-' + (nextTabIdRef.current++);
      const newTab: EditorTab = {
        id: newId,
        label: source.label + ' (copy)',
        dsl: source.dsl,
        closable: true,
      };
      return [...prev, newTab];
    });
  }, []);

  // Touch-friendly button size
  const btnPad = isBlade ? '6px 10px' : '4px 10px';
  const btnSize = isBlade ? 11 : 11;

  // Compute fitted container dimensions for ratio preview
  const ratioContainerStyle = (() => {
    if (!previewRatio || !diagram.cameraRatio || !canvasSize || canvasSize.w === 0 || canvasSize.h === 0) {
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
        touchAction: 'none',
      }}
      onWheel={(e) => {
        e.preventDefault();
        const cur = panZoom || diagram.computeFitAll();
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
        const cur = panZoom || diagram.computeFitAll();
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
        {tabs.filter(t => !t.closable || t.visible !== false).map(tab => (
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
        <div style={{ flex: 1 }} />
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
        borderBottom: '1px solid #1a1d24', flexShrink: 0, background: '#0a0c10',
      }}>
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
        <StructuralEditor
          key={activeTab.id}
          ref={editorRef}
          initialDsl={activeTab.dsl}
          onModelChange={handleModelChange}
          height="100%"
        />
      </div>
    </div>
  );

  const bladeBarItem = (id: string, label: string, active: boolean, onClick: () => void) => (
    <div
      key={id}
      onClick={onClick}
      style={{
        writingMode: 'vertical-rl',
        textOrientation: 'mixed',
        transform: 'rotate(180deg)',
        padding: '14px 0',
        fontSize: 10,
        fontFamily: FONT,
        fontWeight: 600,
        letterSpacing: 1.5,
        cursor: 'pointer',
        color: active ? '#a78bfa' : '#4a4f59',
        background: active ? 'rgba(167,139,250,0.06)' : 'transparent',
        transition: 'all 0.15s ease',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLDivElement).style.color = '#8a8f98';
          (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLDivElement).style.color = '#4a4f59';
          (e.currentTarget as HTMLDivElement).style.background = 'transparent';
        }
      }}
    >
      {label}
    </div>
  );

  return (
    <div style={{
      width: '100%', height: '100dvh', display: 'flex', flexDirection: 'column',
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
          -webkit-appearance: none; width: ${isBlade ? 20 : 14}px; height: ${isBlade ? 20 : 14}px;
          border-radius: 50%; background: #a78bfa; cursor: pointer; border: 2px solid #0e1117;
        }
      `}</style>

      {/* Header */}
      <div style={{
        padding: isBlade ? '8px 12px' : '10px 20px',
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
        {(!isBlade || activeBlade === 'editor' || activeBlade === 'viewer') && (<div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {[
            { label: 'Debug', active: debugMode, onClick: () => setDebugMode(!debugMode) },
            { label: 'Fit All', active: false, onClick: () => { const fit = diagram.computeFitAll(); setPanZoom(fit); setFixedCamera(true); } },
            { label: 'Lock View', active: fixedCamera, onClick: () => { const next = !fixedCamera; setFixedCamera(next); if (!next) { setPanZoom(null); } } },
            { label: 'Viewport', active: previewRatio, onClick: () => setPreviewRatio(!previewRatio) },
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
        </div>)}
      </div>

      {/* Body */}
      {isBlade ? (
        /* Blade mode: 4 blades, one content area at a time */
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
          {/* Left blade bar — 4 blades */}
          <div style={{
            width: 32, height: '100%', flexShrink: 0,
            background: '#08090d', borderRight: '1px solid #1a1d24',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
          }}>
            {bladeBarItem('samples', 'SAMPLES', activeBlade === 'samples', () => setActiveBlade('samples'))}
            {bladeBarItem('files', 'FILES', activeBlade === 'files', () => setActiveBlade('files'))}
            {bladeBarItem('editor', 'EDITOR', activeBlade === 'editor', () => setActiveBlade('editor'))}
            {bladeBarItem('viewer', 'VIEWER', activeBlade === 'viewer', () => setActiveBlade('viewer'))}
          </div>

          {/* Content area — all mounted, only one visible */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
            <div style={{ flex: 1, overflow: 'auto', display: activeBlade === 'samples' ? 'block' : 'none' }}>
              <V2SampleBrowser activeSampleId={activeSampleId} onSelect={handleSampleClick} />
            </div>
            <div style={{ flex: 1, overflow: 'auto', display: activeBlade === 'files' ? 'block' : 'none' }}>
              <TabFileManager
                tabs={tabs} activeTabId={activeTabId} onSelectTab={setActiveTabId}
                onToggleVisible={handleToggleVisible} onDuplicateTab={handleDuplicateTab} onDeleteTab={closeTab}
              />
            </div>
            <div style={{ flex: 1, overflow: 'hidden', display: activeBlade === 'editor' ? 'flex' : 'none', flexDirection: 'column' }}>
              {editorContent}
            </div>
            <div style={{ flex: 1, display: activeBlade === 'viewer' ? 'flex' : 'none', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                {canvasContent}
              </div>
              {timelineContent}
            </div>
          </div>
        </div>
      ) : (
        <div
          ref={bodyRef}
          style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0, userSelect: isDragging ? 'none' : 'auto' }}
          onMouseMove={(e) => {
            if (!dragging.current || !bodyRef.current) return;
            const panelsWidth = 36 + ((showBrowser || showFileManager) ? 240 : 0);
            const bodyLeft = bodyRef.current.getBoundingClientRect().left;
            setEditorWidth(Math.max(e.clientX - bodyLeft - panelsWidth, 200));
          }}
          onMouseUp={() => { dragging.current = false; setIsDragging(false); }}
          onMouseLeave={() => { dragging.current = false; setIsDragging(false); }}
        >
          {/* Left blade bar */}
          <div style={{
            width: 32, height: '100%', flexShrink: 0,
            background: '#08090d', borderRight: '1px solid #1a1d24',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
          }}>
            {bladeBarItem('samples', 'SAMPLES', showBrowser, () => { setShowBrowser(!showBrowser); if (!showBrowser) setShowFileManager(false); })}
            {bladeBarItem('files', 'FILES', showFileManager, () => { setShowFileManager(!showFileManager); if (!showFileManager) setShowBrowser(false); })}
          </div>

          {/* Side panel — slides in/out */}
          <div style={{
            width: (showBrowser || showFileManager) ? 240 : 0,
            height: '100%',
            flexShrink: 0,
            overflow: 'hidden',
            transition: 'width 0.2s ease',
          }}>
            {showBrowser && (
              <V2SampleBrowser
                activeSampleId={activeSampleId}
                onSelect={handleSampleClick}
              />
            )}
            {showFileManager && (
              <TabFileManager
                tabs={tabs}
                activeTabId={activeTabId}
                onSelectTab={setActiveTabId}
                onToggleVisible={handleToggleVisible}
                onDuplicateTab={handleDuplicateTab}
                onDeleteTab={closeTab}
              />
            )}
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
