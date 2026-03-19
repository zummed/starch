import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useDiagram } from './components/Diagram';
import { Timeline } from './components/Timeline';
import { Editor } from './components/Editor';
import { SampleBrowser } from './components/SampleBrowser';
import { CATEGORIES, SAMPLES } from './samples';
import { SvgCanvas } from './renderer/svg/SvgCanvas';
import { BoxRenderer } from './renderer/svg/BoxRenderer';
import { CircleRenderer } from './renderer/svg/CircleRenderer';
import { LabelRenderer } from './renderer/svg/LabelRenderer';
import { TableRenderer } from './renderer/svg/TableRenderer';
import { TextblockRenderer } from './renderer/svg/TextblockRenderer';
import { LineRenderer } from './renderer/svg/LineRenderer';
import { PathRenderer } from './renderer/svg/PathRenderer';
import type { SceneObject, StarchEvent } from './core/types';
import { resolveCamera, type ViewBox } from './engine/camera';
import type { Sample } from './components/SampleBrowser';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";

const DEFAULT_DSL = SAMPLES[0]?.dsl || '{ objects: [], animate: { duration: 1, keyframes: [] } }';


interface EditorTab {
  id: string;
  label: string;
  dsl: string;
  closable: boolean;
}

let nextTabId = 1;

const STORAGE_KEY = 'starch-tabs';
const PREFS_KEY = 'starch-prefs';

function loadTabs(): { tabs: EditorTab[]; activeTabId: string } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      if (Array.isArray(data.tabs) && data.tabs.length > 0) {
        const tabs = data.tabs as EditorTab[];
        if (!tabs.find(t => t.id === 'sample')) {
          tabs.unshift({ id: 'sample', label: 'Sample', dsl: DEFAULT_DSL, closable: false });
        }
        // Restore nextTabId to avoid collisions
        const maxId = tabs.reduce((max, t) => {
          const m = t.id.match(/^tab-(\d+)$/);
          return m ? Math.max(max, parseInt(m[1])) : max;
        }, 0);
        nextTabId = maxId + 1;
        return { tabs, activeTabId: data.activeTabId || tabs[0].id };
      }
    }
  } catch { /* ignore corrupt storage */ }
  return {
    tabs: [{ id: 'sample', label: 'Sample', dsl: DEFAULT_DSL, closable: false }],
    activeTabId: 'sample',
  };
}

function loadPrefs(): { showBrowser: boolean; showEditor: boolean; editorWidth: number; debugMode: boolean } {
  try {
    const stored = localStorage.getItem(PREFS_KEY);
    if (stored) return { ...{ showBrowser: true, showEditor: true, editorWidth: 360, debugMode: false }, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return { showBrowser: true, showEditor: true, editorWidth: 360, debugMode: false };
}

export default function App() {
  const initial = useRef(loadTabs());
  const initialPrefs = useRef(loadPrefs());
  const [tabs, setTabs] = useState<EditorTab[]>(initial.current.tabs);
  const [activeTabId, setActiveTabId] = useState(initial.current.activeTabId);
  const [showEditor, setShowEditor] = useState(initialPrefs.current.showEditor);
  const [showBrowser, setShowBrowser] = useState(initialPrefs.current.showBrowser);
  const [debugMode, setDebugMode] = useState(initialPrefs.current.debugMode);
  const [previewRatio, setPreviewRatio] = useState(false);
  const [fitAll, setFitAll] = useState(false);
  const [fixedCamera, setFixedCamera] = useState(false);
  const [copiedCamera, setCopiedCamera] = useState(false);
  const [panZoom, setPanZoom] = useState<{ x: number; y: number; zoom: number } | null>(null);
  const [chapterText, setChapterText] = useState<{ title: string; description?: string } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [editorWidth, setEditorWidth] = useState(initialPrefs.current.editorWidth);
  const [isDragging, setIsDragging] = useState(false);
  const [activeSampleId, setActiveSampleId] = useState<string | null>(SAMPLES[0]?.id || null);
  const dragging = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  const activeDsl = activeTab.dsl;

  // Persist tabs and prefs to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeTabId }));
  }, [tabs, activeTabId]);

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ showBrowser, showEditor, editorWidth, debugMode }));
  }, [showBrowser, showEditor, editorWidth, debugMode]);

  const handleEvent = useCallback((event: StarchEvent) => {
    if (event.type === 'chapterEnter' && event.chapter) {
      setChapterText({ title: event.chapter.title, description: event.chapter.description });
    }
  }, []);

  const safeDsl = useMemo(() => {
    try {
      setParseError(null);
      return activeDsl;
    } catch (e) {
      setParseError((e as Error).message);
      return '';
    }
  }, [activeDsl]);

  const diagram = useDiagram({
    dsl: safeDsl,
    autoplay: false,
    speed: 1,
    debug: debugMode,
    onEvent: handleEvent,
  });

  // Seek to end when DSL changes (so samples show their final state)
  const lastDslRef = useRef(safeDsl);
  if (lastDslRef.current !== safeDsl) {
    lastDslRef.current = safeDsl;
    requestAnimationFrame(() => diagram.seek(diagram.duration));
  }

  const updateTabDsl = useCallback((dsl: string) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, dsl } : t));
  }, [activeTabId]);

  // Update tab label from parsed diagram name
  const lastNameRef = useRef(diagram.name);
  if (diagram.name !== lastNameRef.current) {
    lastNameRef.current = diagram.name;
    if (diagram.name && activeTabId !== 'sample') {
      setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, label: diagram.name! } : t));
    }
  }

  const handleSampleClick = useCallback((sample: Sample) => {
    // Update or recreate the Sample tab and switch to it
    setTabs(prev => {
      const existing = prev.find(t => t.id === 'sample');
      if (existing) {
        return prev.map(t => t.id === 'sample' ? { ...t, dsl: sample.dsl } : t);
      }
      return [{ id: 'sample', label: 'Sample', dsl: sample.dsl, closable: true }, ...prev];
    });
    setActiveTabId('sample');
    setActiveSampleId(sample.id);
    setChapterText(null);
  }, []);

  const addTab = useCallback(() => {
    const id = 'tab-' + (nextTabId++);
    const newTab: EditorTab = {
      id,
      label: 'Untitled',
      dsl: '{\n  objects: [],\n  animate: {\n    duration: 3,\n    loop: false,\n    keyframes: [],\n  },\n}',
      closable: true,
    };
    setTabs(prev => [...prev, newTab]);
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

  const renderObject = useCallback(
    (id: string, obj: SceneObject) => {
      let p = (diagram.animatedProps[id] || obj.props) as Record<string, unknown>;

      // Debug mode: show everything — full arrows, visible hidden objects
      // Overridden objects get a red tint so it's obvious they're debug-only
      if (debugMode) {
        p = { ...p };
        let debugOverridden = false;
        // Show all arrows at full progress
        if (obj.type === 'line' && (p.progress as number) < 1) {
          p.progress = 1;
          debugOverridden = true;
        }
        // Make hidden/transparent objects visible (dimmed)
        const opacity = (p.opacity as number) ?? 1;
        if (opacity < 0.1) {
          p.opacity = 0.3;
          debugOverridden = true;
        }
        // Show invisible objects
        if ((p.visible as boolean) === false) {
          p.visible = true;
          p.opacity = Math.min((p.opacity as number) ?? 1, 0.3);
          debugOverridden = true;
        }
        // Red tint on debug-overridden objects
        if (debugOverridden) {
          p.stroke = '#ef444480';
        }
      }

      const isVisible = (p.visible as boolean) ?? true;
      if (!isVisible && !debugMode) return null;

      switch (obj.type) {
        case 'camera':
          return null;
        case 'point':
          if (!debugMode) return null;
          return (
            <g key={id} transform={`translate(${(p.x as number) || 0}, ${(p.y as number) || 0})`} opacity={0.5}>
              <line x1={-6} y1={0} x2={6} y2={0} stroke="#ef4444" strokeWidth={1} />
              <line x1={0} y1={-6} x2={0} y2={6} stroke="#ef4444" strokeWidth={1} />
              <text x={8} y={-4} fill="#ef4444" fontSize={9} fontFamily={FONT}>{id}</text>
            </g>
          );
        case 'box':
          return <BoxRenderer key={id} props={p} />;
        case 'circle':
          return <CircleRenderer key={id} props={p} />;
        case 'label':
          return <LabelRenderer key={id} props={p} />;
        case 'table':
          return <TableRenderer key={id} props={p} />;
        case 'line':
          return (
            <LineRenderer
              key={id}
              id={id}
              props={p}
              objects={diagram.objects}
              allProps={diagram.animatedProps}
              debug={debugMode}
            />
          );
      case 'textblock':
          return <TextblockRenderer key={id} id={id} props={p} allProps={diagram.animatedProps} />;
        case 'path':
          return <PathRenderer key={id} props={p} debug={debugMode} />;
        default:
          return null;
      }
    },
    [diagram.animatedProps, diagram.objects, debugMode],
  );

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#0e1117',
        fontFamily: FONT,
        color: '#c9cdd4',
        overflow: 'hidden',
      }}
    >
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
          -webkit-appearance: none; height: 4px; background: #1e2028;
          border-radius: 2px; outline: none;
        }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none; width: 14px; height: 14px;
          border-radius: 50%; background: #a78bfa; cursor: pointer;
          border: 2px solid #0e1117;
        }
      `}</style>

      {/* Header */}
      <div
        style={{
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #1a1d24',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#a78bfa',
              boxShadow: '0 0 8px rgba(167,139,250,0.5)',
            }}
          />
          <span style={{ fontWeight: 700, fontSize: 14, color: '#e2e5ea' }}>
            starch
          </span>
          <span style={{ fontSize: 10, color: '#3a3f49', marginLeft: 2 }}>
            animated diagrams
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={() => setShowBrowser(!showBrowser)}
            style={{
              padding: '5px 12px',
              borderRadius: 6,
              border: `1px solid ${showBrowser ? '#a78bfa' : '#2a2d35'}`,
              background: showBrowser ? 'rgba(167,139,250,0.06)' : '#14161c',
              color: showBrowser ? '#a78bfa' : '#6b7280',
              fontSize: 11,
              fontFamily: FONT,
              cursor: 'pointer',
            }}
          >
            Samples
          </button>
          <div style={{ width: 1, height: 20, background: '#1e2028', margin: '0 4px' }} />
          {[
            { label: 'Debug', active: debugMode, onClick: () => setDebugMode(!debugMode) },
            ...(diagram.viewport ? [{ label: 'Viewport', active: previewRatio, onClick: () => setPreviewRatio(!previewRatio) }] : []),
            { label: 'Fit All', active: fitAll, onClick: () => {
              const next = !fitAll;
              setFitAll(next);
              setPanZoom(null);
              if (next && !fixedCamera) setFixedCamera(true);
            }},
            { label: 'Lock View', active: fixedCamera, onClick: () => {
              const next = !fixedCamera;
              setFixedCamera(next);
              if (!next) { setPanZoom(null); setFitAll(false); }
            }},
          ].map(btn => (
            <button
              key={btn.label}
              onClick={btn.onClick}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: `1px solid ${btn.active ? '#a78bfa' : '#2a2d35'}`,
                background: btn.active ? 'rgba(167,139,250,0.1)' : '#14161c',
                color: btn.active ? '#a78bfa' : '#6b7280',
                fontSize: 11,
                fontFamily: FONT,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {btn.label}
            </button>
          ))}
          <button
            onClick={() => { const next = !showEditor; setShowEditor(next); if (!next) setShowBrowser(false); }}
            style={{
              padding: '5px 12px',
              borderRadius: 6,
              border: '1px solid #2a2d35',
              background: '#14161c',
              color: '#6b7280',
              fontSize: 11,
              fontFamily: FONT,
              cursor: 'pointer',
            }}
          >
            {showEditor ? 'Hide' : 'Edit'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div
        ref={bodyRef}
        style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0, userSelect: isDragging ? 'none' : 'auto' }}
        onMouseMove={(e) => {
          if (!dragging.current || !bodyRef.current) return;
          // Calculate editor width relative to where the editor panel starts
          const browserWidth = showBrowser ? 280 : 0;
          const bodyLeft = bodyRef.current.getBoundingClientRect().left;
          const newWidth = Math.max(e.clientX - bodyLeft - browserWidth, 200);
          setEditorWidth(newWidth);
        }}
        onMouseUp={() => { dragging.current = false; setIsDragging(false); }}
        onMouseLeave={() => { dragging.current = false; setIsDragging(false); }}
      >
        {showBrowser && (
          <SampleBrowser
            categories={CATEGORIES}
            samples={SAMPLES}
            activeSampleId={activeSampleId}
            onSelect={handleSampleClick}
          />
        )}
        {showEditor && (
          <>
            <div style={{ width: editorWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid #1a1d24', minHeight: 0, overflow: 'hidden' }}>
              {/* Tab bar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                borderBottom: '1px solid #1a1d24',
                flexShrink: 0,
                background: '#0a0c10',
                overflow: 'hidden',
              }}>
                {tabs.map(tab => (
                  <div
                    key={tab.id}
                    onClick={() => setActiveTabId(tab.id)}
                    style={{
                      padding: '6px 12px',
                      fontSize: 11,
                      fontFamily: FONT,
                      cursor: 'pointer',
                      color: tab.id === activeTabId ? '#e2e5ea' : '#6b7280',
                      background: tab.id === activeTabId ? '#0e1117' : 'transparent',
                      borderBottom: tab.id === activeTabId ? '2px solid #a78bfa' : '2px solid transparent',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      whiteSpace: 'nowrap',
                      userSelect: 'none',
                    }}
                  >
                    {tab.label}
                  </div>
                ))}
                <div
                  onClick={addTab}
                  style={{
                    padding: '6px 10px',
                    fontSize: 13,
                    color: '#4a4f59',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  +
                </div>
              </div>
              <Editor value={activeDsl} onChange={updateTabDsl} parseError={parseError} onClose={tabs.length > 1 ? () => closeTab(activeTabId) : undefined} />
            </div>
            <div
              onMouseDown={(e) => { e.preventDefault(); dragging.current = true; setIsDragging(true); }}
              style={{
                width: 5,
                cursor: 'col-resize',
                background: isDragging ? '#22d3ee' : 'transparent',
                flexShrink: 0,
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#22d3ee40'; }}
              onMouseLeave={(e) => { if (!dragging.current) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
            />
          </>
        )}

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              flex: 1, position: 'relative', overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: previewRatio && diagram.viewport ? '#080a0e' : undefined,
              cursor: 'grab',
            }}
            onWheel={(e) => {
              e.preventDefault();
              const vw = diagram.viewport?.width ?? 800;
              const vh = diagram.viewport?.height ?? 500;
              const cur = panZoom || (fitAll
                ? (() => { const vb = resolveCamera({ fit: 'all' }, diagram.animatedProps, diagram.objects, vw, vh); return { x: vb.x + vb.width / 2, y: vb.y + vb.height / 2, zoom: vw / vb.width }; })()
                : diagram.cameraViewBox
                  ? { x: diagram.cameraViewBox.x + diagram.cameraViewBox.width / 2, y: diagram.cameraViewBox.y + diagram.cameraViewBox.height / 2, zoom: vw / diagram.cameraViewBox.width }
                  : { x: vw / 2, y: vh / 2, zoom: 1 });

              // Zoom toward mouse pointer
              const rect = e.currentTarget.getBoundingClientRect();
              const mx = (e.clientX - rect.left) / rect.width;   // 0..1
              const my = (e.clientY - rect.top) / rect.height;    // 0..1
              const viewW = vw / cur.zoom;
              const viewH = vh / cur.zoom;
              // World-space position of the mouse
              const worldX = cur.x - viewW / 2 + mx * viewW;
              const worldY = cur.y - viewH / 2 + my * viewH;

              const factor = e.deltaY > 0 ? 0.9 : 1.1;
              const newZoom = Math.max(0.1, Math.min(20, cur.zoom * factor));
              const newViewW = vw / newZoom;
              const newViewH = vh / newZoom;
              // Keep worldX/worldY at the same screen fraction (mx, my)
              const newCx = worldX + newViewW * (0.5 - mx);
              const newCy = worldY + newViewH * (0.5 - my);

              setPanZoom({ x: newCx, y: newCy, zoom: newZoom });
              setFitAll(false);
              if (!fixedCamera) setFixedCamera(true);
            }}
            onMouseDown={(e) => {
              if (e.button !== 0) return; // left click only
              e.preventDefault();
              const startX = e.clientX;
              const startY = e.clientY;
              const vw = diagram.viewport?.width ?? 800;
              const vh = diagram.viewport?.height ?? 500;
              const rect = e.currentTarget.getBoundingClientRect();
              const cur = panZoom || (fitAll
                ? (() => { const vb = resolveCamera({ fit: 'all' }, diagram.animatedProps, diagram.objects, vw, vh); return { x: vb.x + vb.width / 2, y: vb.y + vb.height / 2, zoom: vw / vb.width }; })()
                : diagram.cameraViewBox
                  ? { x: diagram.cameraViewBox.x + diagram.cameraViewBox.width / 2, y: diagram.cameraViewBox.y + diagram.cameraViewBox.height / 2, zoom: vw / diagram.cameraViewBox.width }
                  : { x: vw / 2, y: vh / 2, zoom: 1 });
              // Scale mouse pixels to world units based on current zoom and container size
              const pixelToWorld = (vw / cur.zoom) / rect.width;
              const onMove = (me: MouseEvent) => {
                const dx = (me.clientX - startX) * pixelToWorld;
                const dy = (me.clientY - startY) * pixelToWorld;
                setPanZoom({ x: cur.x - dx, y: cur.y - dy, zoom: cur.zoom });
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
            <div style={previewRatio && diagram.viewport ? {
              width: '100%',
              maxHeight: '100%',
              aspectRatio: `${diagram.viewport.width} / ${diagram.viewport.height}`,
              position: 'relative',
              overflow: 'hidden',
              borderRadius: 4,
              boxShadow: '0 0 0 1px rgba(255,255,255,0.05)',
            } : { width: '100%', height: '100%', position: 'relative' }}>
            <SvgCanvas background={diagram.background} viewBox={(() => {
              const vw = diagram.viewport?.width ?? 800;
              const vh = diagram.viewport?.height ?? 500;
              // panZoom always takes priority when set (user has manually navigated)
              if (panZoom) {
                const pw = vw / panZoom.zoom;
                const ph = vh / panZoom.zoom;
                return { x: panZoom.x - pw / 2, y: panZoom.y - ph / 2, width: pw, height: ph } as ViewBox;
              }
              // Fit All
              if (fitAll) {
                return resolveCamera({ fit: 'all' }, diagram.animatedProps, diagram.objects, vw, vh);
              }
              // When fixedCamera is off, let the diagram's camera work
              if (!fixedCamera) {
                return diagram.cameraViewBox;
              }
              // fixedCamera on but no panZoom — no viewBox override
              return diagram.cameraViewBox;
            })()}>
              {diagram.renderOrder.map(([id, obj]) => renderObject(id, obj))}
            </SvgCanvas>

            {/* Chapter text overlay */}
            {chapterText && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 20,
                  left: 20,
                  right: 20,
                  padding: '12px 16px',
                  background: 'rgba(14,17,23,0.9)',
                  border: '1px solid #a78bfa40',
                  borderRadius: 8,
                  fontFamily: FONT,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: '#a78bfa', marginBottom: 4 }}>
                  {chapterText.title}
                </div>
                {chapterText.description && (
                  <div style={{ fontSize: 12, color: '#8a8f98' }}>
                    {chapterText.description}
                  </div>
                )}
                <button
                  onClick={() => {
                    setChapterText(null);
                    diagram.setPlaying(true);
                  }}
                  style={{
                    marginTop: 8,
                    padding: '4px 12px',
                    borderRadius: 4,
                    border: '1px solid #a78bfa40',
                    background: 'transparent',
                    color: '#a78bfa',
                    fontSize: 11,
                    fontFamily: FONT,
                    cursor: 'pointer',
                  }}
                >
                  Continue
                </button>
              </div>
            )}
            {/* Copy camera position button */}
            {(panZoom || fitAll || diagram.cameraViewBox) && (
              <button
                onClick={() => {
                  const vw = diagram.viewport?.width ?? 800;
                  const vh = diagram.viewport?.height ?? 500;
                  let cx: number, cy: number, zoom: number;
                  if (panZoom) {
                    cx = panZoom.x;
                    cy = panZoom.y;
                    zoom = panZoom.zoom;
                  } else if (fitAll) {
                    const vb = resolveCamera({ fit: 'all' }, diagram.animatedProps, diagram.objects, vw, vh);
                    cx = vb.x + vb.width / 2;
                    cy = vb.y + vb.height / 2;
                    zoom = Math.round((vw / vb.width) * 100) / 100;
                  } else if (diagram.cameraViewBox) {
                    cx = diagram.cameraViewBox.x + diagram.cameraViewBox.width / 2;
                    cy = diagram.cameraViewBox.y + diagram.cameraViewBox.height / 2;
                    zoom = Math.round((vw / diagram.cameraViewBox.width) * 100) / 100;
                  } else return;
                  cx = Math.round(cx);
                  cy = Math.round(cy);
                  const snippet = `{ camera: "cam", target: [${cx}, ${cy}], zoom: ${zoom} }`;
                  navigator.clipboard.writeText(snippet);
                  setCopiedCamera(true);
                  setTimeout(() => setCopiedCamera(false), 1500);
                }}
                style={{
                  position: 'absolute',
                  bottom: 8,
                  right: 8,
                  padding: '4px 10px',
                  fontSize: 10,
                  fontFamily: FONT,
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: copiedCamera ? 'rgba(52,211,153,0.15)' : 'rgba(14,17,23,0.8)',
                  color: copiedCamera ? '#34d399' : 'rgba(255,255,255,0.5)',
                  cursor: 'pointer',
                  zIndex: 10,
                }}
              >
                {copiedCamera ? 'Copied!' : 'Copy Camera'}
              </button>
            )}
            </div>
          </div>

          <Timeline
            time={diagram.time}
            duration={diagram.duration}
            playing={diagram.playing}
            speed={diagram.speed}
            chapters={diagram.chapters}
            onSeek={(t) => {
              diagram.seek(t);
              diagram.setPlaying(false);
            }}
            onTogglePlay={() => {
              if (!diagram.playing && diagram.time >= diagram.duration - 0.01) {
                diagram.seek(0);
              }
              diagram.setPlaying(!diagram.playing);
            }}
            onRestart={() => {
              diagram.seek(0);
              diagram.setPlaying(true);
              setChapterText(null);
            }}
            onSpeedChange={diagram.setSpeed}
          />
        </div>
      </div>
    </div>
  );
}
