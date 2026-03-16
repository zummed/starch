import { useState, useCallback, useMemo, useRef } from 'react';
import { useDiagram } from './components/Diagram';
import { Timeline } from './components/Timeline';
import { Editor } from './components/Editor';
import { SvgCanvas } from './renderer/svg/SvgCanvas';
import { BoxRenderer } from './renderer/svg/BoxRenderer';
import { CircleRenderer } from './renderer/svg/CircleRenderer';
import { LabelRenderer } from './renderer/svg/LabelRenderer';
import { TableRenderer } from './renderer/svg/TableRenderer';
import { LineRenderer } from './renderer/svg/LineRenderer';
import { PathRenderer } from './renderer/svg/PathRenderer';
import type { SceneObject, StarchEvent } from './core/types';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";

const EXAMPLES: Record<string, string> = {
  'State Machine': `{
  // HTTP Connection State Machine
  objects: [
    { label: "title", at: [400, 35], text: "Connection Lifecycle", size: 18, color: "#e2e5ea", bold: true },

    { circle: "start", at: [400, 90], r: 12, colour: "#22d3ee", fill: "#22d3ee" },

    { box: "idle", at: [400, 170],
      colour: "#22d3ee", radius: 23, text: "Idle", anchor: "bottom" },

    { box: "connecting", at: [180, 300], colour: "#fbbf24", text: "Connecting", anchor: "top" },
    { box: "connected", at: [400, 430], colour: "#34d399", text: "Connected", anchor: "top" },
    { box: "error", at: [620, 300], colour: "#ef4444", text: "Error", anchor: "top" },

    { line: "s0", from: "start", to: "idle", colour: "#22d3ee", label: "init" },
    { line: "s1", from: "idle", to: "connecting", colour: "#fbbf24", label: "connect()", bend: -30 },
    { line: "s2", from: "connecting", to: "connected", colour: "#34d399", label: "TCP established", bend: -30 },
    { line: "s3", from: "connecting", to: "error", colour: "#ef4444", label: "timeout / refused", bend: 30 },
    { line: "s4", from: "error", to: "idle", colour: "#8a8f98", label: "retry()", dashed: true, bend: -30 },
    { line: "s5", from: "connected", to: "idle", colour: "#8a8f98", label: "close()", dashed: true, bend: 30 },
  ],
  animate: {
    duration: 9, loop: false,
    // Effects: pulse, flash, shake, glow are additive and decay automatically
    keyframes: [
      { time: 0.0, changes: { start: { scale: 1.3 } } },
      { time: 0.4, changes: { start: { scale: 1, easing: "easeOutCubic" }, s0: { progress: 0 } } },
      { time: 1.2, changes: {
        s0: { progress: 1, easing: "easeInOut" },
        idle: { pulse: 0.12 },
        s1: { progress: 0 },
      } },
      { time: 2.5, changes: {
        idle: { pulse: 0.12 },
        s1: { progress: 1, easing: "easeInOut" },
        connecting: { pulse: 0.12 },
        s2: { progress: 0 },
      } },
      { time: 3.8, changes: {
        s2: { progress: 1, easing: "easeInOut" },
        connecting: { pulse: 0.12 },
        connected: { pulse: 0.12 },
      } },
      { time: 4.2, changes: { s5: { progress: 0 } } },
      { time: 5.4, changes: {
        s5: { progress: 1, easing: "easeInOut" },
        connected: { pulse: 0.12 },
        idle: { pulse: 0.12 },
        s1: { progress: 0, easing: "snap" },
      } },
      { time: 6.8, changes: {
        idle: { pulse: 0.12 },
        s1: { progress: 1, easing: "easeInOut" },
        connecting: { pulse: 0.12 },
        s3: { progress: 0 },
      } },
      { time: 8.0, changes: {
        connecting: { pulse: 0.12 },
        s3: { progress: 1, easing: "easeInOut" },
        error: { pulse: 0.15, shake: 3 },
        s4: { progress: 0 },
      } },
      { time: 9.0, changes: {
        s4: { progress: 1, easing: "easeInOut" },
        error: { pulse: 0.15 },
        idle: { pulse: 0.12 },
      } },
    ],
  },
}`,

  'Data Pipeline': `{
  // ETL Pipeline
  objects: [
    { label: "title", at: [450, 30], text: "ETL Pipeline", size: 18, color: "#e2e5ea", bold: true },

    { box: "ingest", at: [100, 120], colour: "#60a5fa", text: "Ingest" },
    { box: "validate", at: [300, 120], colour: "#60a5fa", text: "Validate" },
    { box: "transform", at: [500, 120], colour: "#a78bfa", text: "Transform" },
    { box: "load", at: [700, 120], colour: "#34d399", text: "Load" },

    { table: "schema", at: [300, 280], opacity: 0.4,
      cols: ["Field", "Type", "Nullable"],
      rows: [["id", "u64", "no"], ["name", "String", "no"], ["score", "f64", "yes"], ["ts", "DateTime", "no"]] },

    { table: "metrics", at: [650, 310], opacity: 0.4,
      cols: ["Metric", "Value"],
      rows: [["rows/s", "12,450"], ["errors", "0.02%"], ["p99 lat", "23ms"]] },

    { line: "l1", from: "ingest", to: "validate", colour: "#60a5fa", label: "raw bytes", labelRotation: 90, progress: 0 },
    { line: "l2", from: "validate", to: "transform", colour: "#a78bfa", label: "parsed rows", labelRotation: 90, progress: 0 },
    { line: "l3", from: "transform", to: "load", colour: "#34d399", label: "clean records", labelRotation: 90, progress: 0 },
    { line: "l4", from: "validate", to: "schema", colour: "#3a3f49", label: "check against", dashed: true, progress: 0 },
    { line: "l5", from: "load", to: "metrics", colour: "#3a3f49", label: "report", dashed: true, progress: 0 },
  ],
  animate: {
    duration: 6, loop: false,
    keyframes: [
      { time: 1.0, changes: {
        l1: { progress: 1, easing: "easeInOut" },
        ingest: { pulse: 0.1 },
        validate: { pulse: 0.1 },
      } },
      { time: 2.0, changes: {
        l4: { progress: 1, easing: "easeInOut" },
        schema: { opacity: 1, easing: "easeOut" },
      } },
      { time: 3.0, changes: {
        l2: { progress: 1, easing: "easeInOut" },
        validate: { pulse: 0.1 },
        transform: { pulse: 0.1 },
      } },
      { time: 4.0, changes: {
        l3: { progress: 1, easing: "easeInOut" },
        transform: { pulse: 0.1 },
        load: { pulse: 0.1 },
      } },
      { time: 5.0, changes: {
        l5: { progress: 1, easing: "easeInOut" },
        metrics: { opacity: 1, easing: "easeOut" },
      } },
    ],
  },
}`,

  'Chapters': `{
  // Chapter Demo - Connection Setup
  objects: [
    { label: "title", at: [400, 35], text: "Connection Setup", size: 18, color: "#e2e5ea", bold: true },

    { box: "client", at: [150, 200], colour: "#60a5fa", text: "Client" },
    { box: "server", at: [650, 200], colour: "#34d399", text: "Server" },
    { box: "db", at: [650, 380], colour: "#a78bfa", text: "Database" },

    { path: "flowPath", points: [{x:210,y:200}, {x:400,y:200}, {x:590,y:200}], visible: false, colour: "#60a5fa" },

    { line: "syn", from: "client", to: "server", colour: "#60a5fa", label: "SYN" },
    { line: "ack", from: "server", to: "client", colour: "#34d399", label: "SYN-ACK", bend: 30 },
    { line: "query", from: "server", to: "db", colour: "#a78bfa", label: "SELECT *" },
  ],
  animate: {
    duration: 10, loop: false,
    chapters: [
      { time: 0.0, title: "Start", description: "Client initiates a TCP connection" },
      { time: 3.0, title: "Handshake", description: "Server responds with SYN-ACK" },
      { time: 6.0, title: "Query", description: "Server queries the database" },
    ],
    keyframes: [
      { time: 0.0, changes: { client: { pulse: 0.15 }, syn: { progress: 0 } } },
      { time: 2.5, changes: {
        syn: { progress: 1, easing: "easeInOut" },
        client: { pulse: 0.15 },
        server: { pulse: 0.15 },
        ack: { progress: 0 },
      } },
      { time: 5.5, changes: {
        ack: { progress: 1, easing: "easeInOut" },
        server: { pulse: 0.15 },
        client: { pulse: 0.1 },
        query: { progress: 0 },
      } },
      { time: 8.5, changes: {
        query: { progress: 1, easing: "easeInOut" },
        server: { pulse: 0.15 },
        db: { pulse: 0.15, glow: 3 },
      } },
    ],
  },
}`,

  'Container Layout': `{
  // Container Layout Demo — using flexbox-style group property
  objects: [
    { label: "title", at: [400, 35], text: "Container Layout", size: 18, color: "#e2e5ea", bold: true },

    // Row container (a box that acts as a flex container)
    { box: "row1", at: [400, 120], direction: "row", gap: 30, padding: 16,
      colour: "#2a2d35", radius: 12 },

    // Status boxes — declare their container via group
    { box: "s1", colour: "#22d3ee", text: "Idle", group: "row1" },
    { box: "s2", colour: "#fbbf24", text: "Active", group: "row1" },
    { box: "s3", colour: "#34d399", text: "Done", group: "row1" },

    // Column container
    { box: "col1", at: [400, 300], direction: "column", gap: 20, padding: 16,
      colour: "#2a2d35", radius: 12 },

    // Detail boxes
    { box: "d1", size: [200, 40], colour: "#60a5fa", radius: 6, text: "Step 1: Initialize", group: "col1" },
    { box: "d2", size: [200, 40], colour: "#a78bfa", radius: 6, text: "Step 2: Process", group: "col1" },
    { box: "d3", size: [200, 40], colour: "#f472b6", radius: 6, text: "Step 3: Complete", group: "col1" },

    { line: "l1", from: "s1", to: "d1", colour: "#3a3f49", dashed: true },
    { line: "l2", from: "s2", to: "d2", colour: "#3a3f49", dashed: true },
    { line: "l3", from: "s3", to: "d3", colour: "#3a3f49", dashed: true },
  ],
  animate: {
    duration: 6, loop: false,
    keyframes: [
      { time: 0.4, changes: { s1: { pulse: 0.15 }, l1: { progress: 0 } } },
      { time: 1.2, changes: { l1: { progress: 1, easing: "easeInOut" }, d1: { pulse: 0.08 } } },
      { time: 2.4, changes: { s2: { pulse: 0.15 }, l2: { progress: 0 } } },
      { time: 3.2, changes: { l2: { progress: 1, easing: "easeInOut" }, d2: { pulse: 0.08 } } },
      { time: 4.4, changes: { s3: { pulse: 0.15 }, l3: { progress: 0 } } },
      { time: 5.2, changes: { l3: { progress: 1, easing: "easeInOut" }, d3: { pulse: 0.08 } } },
    ],
  },
}`,

  'Slack Bot': `{
  // Slack Bot Interaction
  objects: [
    { label: "title", at: [400, 30], text: "Slack Bot Interaction", size: 18, color: "#e2e5ea", bold: true },

    // Bot State Machine (left)
    { label: "smLabel", at: [150, 75], text: "Bot States", size: 12, color: "#4a4f59" },
    { box: "idle", at: [150, 140], colour: "#22d3ee", radius: 20, text: "Idle" },
    { box: "parsing", at: [150, 230], colour: "#fbbf24", text: "Parsing" },
    { box: "processing", at: [150, 320], colour: "#a78bfa", text: "Processing" },
    { box: "replying", at: [150, 410], colour: "#34d399", text: "Replying" },

    { line: "t1", from: "idle", to: "parsing", colour: "#fbbf24", label: "event" },
    { line: "t2", from: "parsing", to: "processing", colour: "#a78bfa", label: "valid" },
    { line: "t3", from: "processing", to: "replying", colour: "#34d399", label: "done" },
    { line: "t4", from: "replying", to: "idle", colour: "#22d3ee", dashed: true, label: "reset", bend: -50 },

    // Slack Channel (right)
    { label: "slackLabel", at: [600, 75], text: "Slack Channel", size: 12, color: "#4a4f59" },
    { box: "channel", at: [600, 110], size: [250, 34], colour: "#2a2d35", radius: 6, text: "# ops-deploy", textColor: "#e2e5ea" },
    { box: "msg1", at: [600, 180], size: [230, 50], colour: "#3a3f49", text: "/deploy staging", textColor: "#60a5fa", opacity: 0 },
    { box: "msg2", at: [600, 265], size: [230, 50], colour: "#352d5e", text: "Deploying staging...", textColor: "#a78bfa", opacity: 0 },
    { box: "msg3", at: [600, 350], size: [230, 50], colour: "#1e4a3a", text: "Deploy complete!", textColor: "#34d399", opacity: 0 },

    // Flow arrows
    { line: "webhook", from: "msg1", to: "parsing", colour: "#60a5fa", label: "Events API", dashed: true, bend: 40 },
    { line: "apiReply", from: "replying", to: "msg2", colour: "#34d399", label: "Web API", dashed: true },
  ],
  animate: {
    duration: 10, loop: false,
    keyframes: [
      { time: 0.0, changes: { idle: { pulse: 0.12 } } },
      { time: 0.5, changes: { msg1: { opacity: 0 } } },
      { time: 1.0, changes: { msg1: { opacity: 1, pulse: 0.06 }, webhook: { progress: 0 } } },
      { time: 2.3, changes: { webhook: { progress: 1, easing: "easeInOut" }, t1: { progress: 0 } } },
      { time: 3.0, changes: {
        t1: { progress: 1, easing: "easeInOut" },
        idle: { pulse: 0.12 },
        parsing: { pulse: 0.12 },
        t2: { progress: 0 },
      } },
      { time: 4.2, changes: {
        t2: { progress: 1, easing: "easeInOut" },
        parsing: { pulse: 0.12 },
        processing: { pulse: 0.12 },
        t3: { progress: 0 },
      } },
      { time: 5.4, changes: {
        t3: { progress: 1, easing: "easeInOut" },
        processing: { pulse: 0.12 },
        replying: { pulse: 0.12 },
        apiReply: { progress: 0 },
      } },
      { time: 6.8, changes: { apiReply: { progress: 1, easing: "easeInOut" }, msg2: { opacity: 0 } } },
      { time: 7.2, changes: { msg2: { opacity: 1, pulse: 0.06 }, t4: { progress: 0 } } },
      { time: 8.3, changes: {
        t4: { progress: 1, easing: "easeInOut" },
        replying: { pulse: 0.12 },
        idle: { pulse: 0.12 },
        msg3: { opacity: 0 },
      } },
      { time: 8.8, changes: { msg3: { opacity: 1, pulse: 0.08 } } },
    ],
  },
}`,

  'Path Motion': `{
  // Objects following a smooth closed path
  // Uses per-object keyframe shorthand: { targetId: [[time, prop, value, easing?]] }
  objects: [
    { label: "title", at: [400, 45], text: "Objects in Motion", size: 18, color: "#e2e5ea", bold: true },
    { label: "sub", at: [400, 72], text: "follow + pathProgress", size: 11, color: "#4a4f59" },

    // Closed curved track (invisible by default — toggle Debug to see it)
    { line: "track", closed: true, visible: false, arrow: false, dashed: true, colour: "#2a2d35",
      bend: [{x:630,y:240}, {x:400,y:350}, {x:170,y:240}, {x:400,y:130}] },

    // Each object follows the track, offset by 0.25 (90°)
    { box: "bx", follow: "track", size: [80, 36], colour: "#60a5fa", text: "Box", radius: 6 },
    { circle: "cr", follow: "track", r: 22, colour: "#34d399" },
    { label: "lb", follow: "track", text: "Label", size: 14, color: "#fbbf24", bold: true },
    { table: "tb", follow: "track", cols: ["K", "V"], rows: [["id", "42"]] },
  ],
  animate: {
    duration: 8, loop: true,
    keyframes: {
      bx: [[0, "pathProgress", 0],    [8, "pathProgress", 1, "linear"]],
      cr: [[0, "pathProgress", 0.25], [8, "pathProgress", 1.25, "linear"]],
      lb: [[0, "pathProgress", 0.5],  [8, "pathProgress", 1.5, "linear"]],
      tb: [[0, "pathProgress", 0.75], [8, "pathProgress", 1.75, "linear"]],
    },
  },
}`,

  'Easing Demo': `{
  // Easing comparison
  objects: [
    { label: "title", at: [400, 30], text: "Easing Functions", size: 18, color: "#e2e5ea", bold: true },

    { label: "t1", at: [100, 80], text: "linear", size: 11, color: "#4a4f59" },
    { label: "t2", at: [100, 130], text: "easeInOut", size: 11, color: "#4a4f59" },
    { label: "t3", at: [100, 180], text: "easeOutCubic", size: 11, color: "#4a4f59" },
    { label: "t4", at: [100, 230], text: "easeOutBack", size: 11, color: "#4a4f59" },
    { label: "t5", at: [100, 280], text: "bounce", size: 11, color: "#4a4f59" },
    { label: "t6", at: [100, 330], text: "elastic", size: 11, color: "#4a4f59" },
    { label: "t7", at: [100, 380], text: "spring", size: 11, color: "#4a4f59" },
    { label: "t8", at: [100, 430], text: "snap", size: 11, color: "#4a4f59" },

    { box: "b1", at: [200, 80], size: [60, 26], colour: "#60a5fa", radius: 4 },
    { box: "b2", at: [200, 130], size: [60, 26], colour: "#22d3ee", radius: 4 },
    { box: "b3", at: [200, 180], size: [60, 26], colour: "#34d399", radius: 4 },
    { box: "b4", at: [200, 230], size: [60, 26], colour: "#a78bfa", radius: 4 },
    { box: "b5", at: [200, 280], size: [60, 26], colour: "#f472b6", radius: 4 },
    { box: "b6", at: [200, 330], size: [60, 26], colour: "#fbbf24", radius: 4 },
    { box: "b7", at: [200, 380], size: [60, 26], colour: "#fb923c", radius: 4 },
    { box: "b8", at: [200, 430], size: [60, 26], colour: "#ef4444", radius: 4 },
  ],
  animate: {
    duration: 3, loop: false,
    keyframes: [
      { time: 3.0, changes: {
        b1: { x: 650, easing: "linear" },
        b2: { x: 650, easing: "easeInOut" },
        b3: { x: 650, easing: "easeOutCubic" },
        b4: { x: 650, easing: "easeOutBack" },
        b5: { x: 650, easing: "bounce" },
        b6: { x: 650, easing: "elastic" },
        b7: { x: 650, easing: "spring" },
        b8: { x: 650, easing: "snap" },
      } },
    ],
  },
}`,
};

export default function App() {
  const [dsl, setDsl] = useState(EXAMPLES['State Machine']);
  const [activeExample, setActiveExample] = useState('State Machine');
  const [showEditor, setShowEditor] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [chapterText, setChapterText] = useState<{ title: string; description?: string } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [editorWidth, setEditorWidth] = useState(360);
  const [isDragging, setIsDragging] = useState(false);
  const dragging = useRef(false);

  const handleEvent = useCallback((event: StarchEvent) => {
    if (event.type === 'chapterEnter' && event.chapter) {
      setChapterText({ title: event.chapter.title, description: event.chapter.description });
    }
  }, []);

  const safeDsl = useMemo(() => {
    try {
      setParseError(null);
      return dsl;
    } catch (e) {
      setParseError((e as Error).message);
      return '';
    }
  }, [dsl]);

  const diagram = useDiagram({
    dsl: safeDsl,
    autoplay: true,
    speed: 1,
    debug: debugMode,
    onEvent: handleEvent,
  });

  const renderObject = useCallback(
    (id: string, obj: SceneObject) => {
      const p = (diagram.animatedProps[id] || obj.props) as Record<string, unknown>;

      // Hidden objects only render in debug mode
      const isVisible = (p.visible as boolean) ?? true;
      if (!isVisible && !debugMode) return null;

      switch (obj.type) {
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
          {Object.keys(EXAMPLES).map((name) => (
            <button
              key={name}
              onClick={() => {
                setDsl(EXAMPLES[name]);
                setActiveExample(name);
                setChapterText(null);
                diagram.seek(0);
                diagram.setPlaying(true);
              }}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                border: `1px solid ${activeExample === name ? '#22d3ee' : '#2a2d35'}`,
                background:
                  activeExample === name ? 'rgba(34,211,238,0.06)' : '#14161c',
                color: activeExample === name ? '#22d3ee' : '#6b7280',
                fontSize: 11,
                fontFamily: FONT,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {name}
            </button>
          ))}
          <div style={{ width: 1, height: 20, background: '#1e2028', margin: '0 4px' }} />
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              color: '#6b7280',
              cursor: 'pointer',
              fontFamily: FONT,
            }}
          >
            <input
              type="checkbox"
              checked={debugMode}
              onChange={(e) => setDebugMode(e.target.checked)}
              style={{ accentColor: '#a78bfa' }}
            />
            Debug
          </label>
          <button
            onClick={() => setShowEditor(!showEditor)}
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
        style={{ flex: 1, display: 'flex', overflow: 'hidden', userSelect: isDragging ? 'none' : 'auto' }}
        onMouseMove={(e) => {
          if (!dragging.current) return;
          const newWidth = Math.max(e.clientX, 200);
          setEditorWidth(newWidth);
        }}
        onMouseUp={() => { dragging.current = false; setIsDragging(false); }}
        onMouseLeave={() => { dragging.current = false; setIsDragging(false); }}
      >
        {showEditor && (
          <>
            <Editor value={dsl} onChange={(v) => { setDsl(v); setActiveExample(''); }} parseError={parseError} width={editorWidth} />
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
          <div style={{ flex: 1, position: 'relative' }}>
            <SvgCanvas>
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
            onTogglePlay={() => diagram.setPlaying(!diagram.playing)}
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
