import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useDiagram } from './components/Diagram';
import { Timeline } from './components/Timeline';
import { Editor } from './components/Editor';
import { SampleBrowser } from './components/SampleBrowser';
import { CATEGORIES, SAMPLES } from './samples';
import { SvgCanvas } from './renderer/svg/SvgCanvas';
import type { StarchEvent } from './core/types';
import type { ViewBox as CameraViewBox } from './v2/renderer/camera';
import type { Sample } from './components/SampleBrowser';
import type { RenderNode } from './v2/renderer/renderTree';

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

/** Render a v2 RenderNode tree to React SVG elements */
function RenderNodeComponent({ node }: { node: RenderNode }): React.ReactElement {
  const gProps: Record<string, string | number> = {};
  if (node.groupTransform) gProps.transform = node.groupTransform;
  if (node.opacity < 1) gProps.opacity = node.opacity;

  return (
    <g key={node.id} data-id={node.id} {...gProps}>
      {node.geometry && (() => {
        const { tag, attrs } = node.geometry;
        const svgAttrs: Record<string, string | number> = {};
        for (const [k, v] of Object.entries(attrs)) {
          const reactKey = k === 'stroke-width' ? 'strokeWidth'
            : k === 'text-anchor' ? 'textAnchor'
            : k === 'dominant-baseline' ? 'dominantBaseline'
            : k === 'font-size' ? 'fontSize'
            : k === 'font-weight' ? 'fontWeight'
            : k === 'font-family' ? 'fontFamily'
            : k === 'stroke-dasharray' ? 'strokeDasharray'
            : k === 'stroke-dashoffset' ? 'strokeDashoffset'
            : k === 'stroke-linecap' ? 'strokeLinecap'
            : k;
          svgAttrs[reactKey] = v;
        }
        if (tag === 'text') {
          return <text {...svgAttrs}>{node.textContent}</text>;
        }
        const Tag = tag as any;
        return <Tag {...svgAttrs} />;
      })()}
      {node.children.map(child => (
        <RenderNodeComponent key={child.id} node={child} />
      ))}
    </g>
  );
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

  // Seek to end when DSL changes
  const lastDslRef = useRef(safeDsl);
  if (lastDslRef.current !== safeDsl) {
    lastDslRef.current = safeDsl;
    requestAnimationFrame(() => diagram.seek(diagram.duration));
  }

  const updateTabDsl = useCallback((dsl: string) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, dsl } : t));
  }, [activeTabId]);

  const handleSampleClick = useCallback((sample: Sample) => {
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

  // Convert v2 ViewBox to the format SvgCanvas expects
  const svgViewBox = useMemo(() => {
    if (!diagram.cameraViewBox) return undefined;
    const vb = diagram.cameraViewBox;
    return { x: vb.x, y: vb.y, width: vb.w, height: vb.h };
  }, [diagram.cameraViewBox]);

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
              width: 7, height: 7, borderRadius: '50%',
              background: '#a78bfa', boxShadow: '0 0 8px rgba(167,139,250,0.5)',
            }}
          />
          <span style={{ fontWeight: 700, fontSize: 14, color: '#e2e5ea' }}>starch</span>
          <span style={{ fontSize: 10, color: '#3a3f49', marginLeft: 2 }}>animated diagrams</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={() => setShowBrowser(!showBrowser)}
            style={{
              padding: '5px 12px', borderRadius: 6,
              border: `1px solid ${showBrowser ? '#a78bfa' : '#2a2d35'}`,
              background: showBrowser ? 'rgba(167,139,250,0.06)' : '#14161c',
              color: showBrowser ? '#a78bfa' : '#6b7280',
              fontSize: 11, fontFamily: FONT, cursor: 'pointer',
            }}
          >
            Samples
          </button>
          <div style={{ width: 1, height: 20, background: '#1e2028', margin: '0 4px' }} />
          {[
            { label: 'Debug', active: debugMode, onClick: () => setDebugMode(!debugMode) },
            ...(diagram.viewport ? [{ label: 'Viewport', active: previewRatio, onClick: () => setPreviewRatio(!previewRatio) }] : []),
          ].map(btn => (
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
          ))}
          <button
            onClick={() => { const next = !showEditor; setShowEditor(next); if (!next) setShowBrowser(false); }}
            style={{
              padding: '5px 12px', borderRadius: 6, border: '1px solid #2a2d35',
              background: '#14161c', color: '#6b7280', fontSize: 11, fontFamily: FONT, cursor: 'pointer',
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
                      display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', userSelect: 'none',
                    }}
                  >
                    {tab.label}
                  </div>
                ))}
                <div onClick={addTab} style={{ padding: '6px 10px', fontSize: 13, color: '#4a4f59', cursor: 'pointer', userSelect: 'none' }}>+</div>
              </div>
              <Editor value={activeDsl} onChange={updateTabDsl} parseError={parseError} onClose={tabs.length > 1 ? () => closeTab(activeTabId) : undefined} />
            </div>
            <div
              onMouseDown={(e) => { e.preventDefault(); dragging.current = true; setIsDragging(true); }}
              style={{
                width: 5, cursor: 'col-resize',
                background: isDragging ? '#22d3ee' : 'transparent',
                flexShrink: 0, transition: 'background 0.15s',
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
            }}
          >
            <div style={previewRatio && diagram.viewport ? {
              width: '100%', maxHeight: '100%',
              aspectRatio: `${diagram.viewport.width} / ${diagram.viewport.height}`,
              position: 'relative', overflow: 'hidden', borderRadius: 4,
              boxShadow: '0 0 0 1px rgba(255,255,255,0.05)',
            } : { width: '100%', height: '100%', position: 'relative' }}>
              <SvgCanvas background={diagram.background} viewBox={svgViewBox}>
                {diagram.renderNodes.map(node => (
                  <RenderNodeComponent key={node.id} node={node} />
                ))}
              </SvgCanvas>

              {/* Chapter text overlay */}
              {chapterText && (
                <div
                  style={{
                    position: 'absolute', bottom: 20, left: 20, right: 20, padding: '12px 16px',
                    background: 'rgba(14,17,23,0.9)', border: '1px solid #a78bfa40', borderRadius: 8, fontFamily: FONT,
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#a78bfa', marginBottom: 4 }}>{chapterText.title}</div>
                  {chapterText.description && <div style={{ fontSize: 12, color: '#8a8f98' }}>{chapterText.description}</div>}
                  <button
                    onClick={() => { setChapterText(null); diagram.setPlaying(true); }}
                    style={{
                      marginTop: 8, padding: '4px 12px', borderRadius: 4, border: '1px solid #a78bfa40',
                      background: 'transparent', color: '#a78bfa', fontSize: 11, fontFamily: FONT, cursor: 'pointer',
                    }}
                  >
                    Continue
                  </button>
                </div>
              )}
            </div>
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
            onRestart={() => { diagram.seek(0); diagram.setPlaying(true); setChapterText(null); }}
            onSpeedChange={diagram.setSpeed}
          />
        </div>
      </div>
    </div>
  );
}
