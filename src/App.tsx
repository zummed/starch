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
import { GroupRenderer } from './renderer/svg/GroupRenderer';
import type { SceneObject, StarchEvent } from './core/types';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";

const EXAMPLES: Record<string, string> = {
  'State Machine': `{
  // HTTP Connection State Machine — using shorthand syntax
  objects: [
    { label: "title", at: [400, 35], text: "Connection Lifecycle", size: 18, color: "#e2e5ea", bold: true },

    { circle: "start", at: [400, 90], r: 12, colour: "#22d3ee", fill: "#22d3ee" },

    { box: "idle", at: [400, 170], size: [130, 46],
      colour: "#22d3ee", radius: 23, text: "Idle", anchor: "bottom" },

    { box: "connecting", at: [180, 300], size: [150, 46],
      colour: "#fbbf24", text: "Connecting", anchor: "top" },

    { box: "connected", at: [400, 430], size: [150, 46],
      colour: "#34d399", text: "Connected", anchor: "top" },

    { box: "error", at: [620, 300], size: [130, 46],
      colour: "#ef4444", text: "Error", anchor: "top" },

    { line: "s0", from: "start", to: "idle", colour: "#22d3ee", label: "init" },
    { line: "s1", from: "idle", to: "connecting", colour: "#fbbf24", label: "connect()", bend: -30 },
    { line: "s2", from: "connecting", to: "connected", colour: "#34d399", label: "TCP established", bend: -30 },
    { line: "s3", from: "connecting", to: "error", colour: "#ef4444", label: "timeout / refused", bend: 30 },
    { line: "s4", from: "error", to: "idle", colour: "#8a8f98", label: "retry()", dashed: true, bend: -30 },
    { line: "s5", from: "connected", to: "idle", colour: "#8a8f98", label: "close()", dashed: true, bend: 30 },
  ],
  animate: {
    duration: 8, loop: false,
    // Target-grouped keyframes — much less repetition
    keyframes: {
      start: [
        [0.0, "scale", 1.3],
        [0.4, "scale", 1, "easeOutCubic"],
      ],
      s0: [
        [0.2, "progress", 0],
        [0.8, "progress", 1, "easeInOut"],
      ],
      idle: [
        [0.8, "scale", 1.12],
        [1.2, "scale", 1, "easeOutBack"],
        [5.0, "scale", 1.12],
        [5.4, "scale", 1, "easeOutBack"],
      ],
      s1: [
        [1.2, "progress", 0],
        [2.0, "progress", 1, "easeInOut"],
        [5.39, "progress", 1],
        [5.4, "progress", 0, "snap"],
        [6.0, "progress", 1, "easeInOut"],
      ],
      connecting: [
        [2.0, "scale", 1.12],
        [2.0, "fill", "#2a2410"],
        [2.5, "scale", 1, "easeOutBack"],
        [2.5, "fill", "#191710", "easeOut"],
        [6.0, "scale", 1.12],
        [6.3, "scale", 1, "easeOutBack"],
      ],
      s2: [
        [2.5, "progress", 0],
        [3.3, "progress", 1, "easeInOut"],
      ],
      connected: [
        [3.3, "scale", 1.12],
        [3.3, "fill", "#1a2e22"],
        [3.8, "scale", 1, "easeOutBack"],
        [3.8, "fill", "#0f1916", "easeOut"],
      ],
      s5: [
        [4.2, "progress", 0],
        [5.0, "progress", 1, "easeInOut"],
      ],
      s3: [
        [6.3, "progress", 0],
        [7.0, "progress", 1, "easeInOut"],
      ],
      error: [
        [7.0, "scale", 1.15],
        [7.0, "fill", "#2c1010"],
        [7.4, "scale", 1, "bounce"],
        [7.4, "fill", "#1c0f0f", "easeOut"],
      ],
      s4: [
        [7.4, "progress", 0],
        [8.0, "progress", 1, "easeInOut"],
      ],
    },
  },
}`,

  'Data Pipeline': `{
  // ETL Pipeline
  objects: [
    { label: "title", at: [450, 30], text: "ETL Pipeline", size: 18, color: "#e2e5ea", bold: true },

    { box: "ingest", at: [100, 120], size: [130, 50], colour: "#60a5fa", text: "Ingest" },
    { box: "validate", at: [300, 120], size: [130, 50], colour: "#60a5fa", text: "Validate" },
    { box: "transform", at: [500, 120], size: [140, 50], colour: "#a78bfa", text: "Transform" },
    { box: "load", at: [700, 120], size: [130, 50], colour: "#34d399", text: "Load" },

    { table: "schema", at: [300, 280],
      cols: ["Field", "Type", "Nullable"],
      rows: [["id", "u64", "no"], ["name", "String", "no"], ["score", "f64", "yes"], ["ts", "DateTime", "no"]] },

    { table: "metrics", at: [650, 310],
      cols: ["Metric", "Value"],
      rows: [["rows/s", "12,450"], ["errors", "0.02%"], ["p99 lat", "23ms"]] },

    { line: "l1", from: "ingest", to: "validate", colour: "#60a5fa", label: "raw bytes", labelRotation: 90 },
    { line: "l2", from: "validate", to: "transform", colour: "#a78bfa", label: "parsed rows", labelRotation: 90 },
    { line: "l3", from: "transform", to: "load", colour: "#34d399", label: "clean records", labelRotation: 90 },
    { line: "l4", from: "validate", to: "schema", colour: "#3a3f49", label: "check against", dashed: true },
    { line: "l5", from: "load", to: "metrics", colour: "#3a3f49", label: "report", dashed: true },
  ],
  animate: {
    duration: 6, loop: false,
    keyframes: {
      ingest: [
        [0.0, "scale", 1.1],
        [0.0, "fill", "#1a2540"],
        [0.4, "scale", 1, "easeOutBack"],
        [0.4, "fill", "#131825", "easeOut"],
      ],
      l1: [
        [0.3, "progress", 0],
        [1.0, "progress", 1, "easeInOut"],
      ],
      validate: [
        [1.0, "scale", 1.1],
        [1.4, "scale", 1, "easeOutBack"],
      ],
      l4: [
        [1.0, "progress", 0],
        [1.8, "progress", 1, "easeInOut"],
      ],
      schema: [
        [1.4, "opacity", 0.4],
        [2.0, "opacity", 1, "easeOut"],
      ],
      l2: [
        [1.5, "progress", 0],
        [2.3, "progress", 1, "easeInOut"],
      ],
      transform: [
        [2.3, "scale", 1.1],
        [2.3, "fill", "#1c1840"],
        [2.7, "scale", 1, "easeOutBack"],
        [2.7, "fill", "#131825", "easeOut"],
      ],
      l3: [
        [2.7, "progress", 0],
        [3.5, "progress", 1, "easeInOut"],
      ],
      load: [
        [3.5, "scale", 1.1],
        [3.5, "fill", "#132e22"],
        [3.9, "scale", 1, "easeOutBack"],
        [3.9, "fill", "#131825", "easeOut"],
      ],
      l5: [
        [3.5, "progress", 0],
        [4.3, "progress", 1, "easeInOut"],
      ],
      metrics: [
        [4.3, "opacity", 0.4],
        [5.0, "opacity", 1, "easeOut"],
      ],
    },
  },
}`,

  'Chapters': `{
  // Chapter Demo - Connection Setup
  objects: [
    { label: "title", at: [400, 35], text: "Connection Setup", size: 18, color: "#e2e5ea", bold: true },

    { box: "client", at: [150, 200], size: [120, 50], colour: "#60a5fa", text: "Client" },
    { box: "server", at: [650, 200], size: [120, 50], colour: "#34d399", text: "Server" },
    { box: "db", at: [650, 380], size: [120, 50], colour: "#a78bfa", text: "Database" },

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
    keyframes: {
      client: [
        [0.0, "scale", 1.15],
        [0.5, "scale", 1, "easeOutBack"],
        [5.5, "scale", 1.1],
        [6.0, "scale", 1, "easeOutBack"],
      ],
      syn: [
        [0.5, "progress", 0],
        [2.5, "progress", 1, "easeInOut"],
      ],
      server: [
        [2.5, "scale", 1.15],
        [3.0, "scale", 1, "easeOutBack"],
      ],
      ack: [
        [3.0, "progress", 0],
        [5.5, "progress", 1, "easeInOut"],
      ],
      query: [
        [6.0, "progress", 0],
        [8.5, "progress", 1, "easeInOut"],
      ],
      db: [
        [8.5, "scale", 1.15],
        [8.5, "fill", "#1c1840"],
        [9.5, "scale", 1, "easeOutBack"],
        [9.5, "fill", "#131825", "easeOut"],
      ],
    },
  },
}`,

  'Container Layout': `{
  // Container Layout Demo
  objects: [
    { label: "title", at: [400, 35], text: "Container Layout", size: 18, color: "#e2e5ea", bold: true },

    // A row of status boxes
    { box: "s1", size: [110, 46], colour: "#22d3ee", text: "Idle" },
    { box: "s2", size: [110, 46], colour: "#fbbf24", text: "Active" },
    { box: "s3", size: [110, 46], colour: "#34d399", text: "Done" },

    { group: "row1", at: [400, 120], direction: "row", gap: 30, padding: 16,
      colour: "#2a2d35", radius: 12, children: ["s1", "s2", "s3"] },

    // A column of detail boxes
    { box: "d1", size: [200, 40], colour: "#60a5fa", radius: 6, text: "Step 1: Initialize" },
    { box: "d2", size: [200, 40], colour: "#a78bfa", radius: 6, text: "Step 2: Process" },
    { box: "d3", size: [200, 40], colour: "#f472b6", radius: 6, text: "Step 3: Complete" },

    { group: "col1", at: [400, 300], direction: "column", gap: 20, padding: 16,
      colour: "#2a2d35", radius: 12, children: ["d1", "d2", "d3"] },

    { line: "l1", from: "s1", to: "d1", colour: "#3a3f49", dashed: true },
    { line: "l2", from: "s2", to: "d2", colour: "#3a3f49", dashed: true },
    { line: "l3", from: "s3", to: "d3", colour: "#3a3f49", dashed: true },
  ],
  animate: {
    duration: 6, loop: false,
    keyframes: {
      s1: [
        [0.0, "scale", 1.15],
        [0.4, "scale", 1, "easeOutBack"],
      ],
      l1: [
        [0.4, "progress", 0],
        [1.2, "progress", 1, "easeInOut"],
      ],
      d1: [
        [1.2, "scale", 1.08],
        [1.6, "scale", 1, "easeOutBack"],
      ],
      s2: [
        [2.0, "scale", 1.15],
        [2.4, "scale", 1, "easeOutBack"],
      ],
      l2: [
        [2.4, "progress", 0],
        [3.2, "progress", 1, "easeInOut"],
      ],
      d2: [
        [3.2, "scale", 1.08],
        [3.6, "scale", 1, "easeOutBack"],
      ],
      s3: [
        [4.0, "scale", 1.15],
        [4.4, "scale", 1, "easeOutBack"],
      ],
      l3: [
        [4.4, "progress", 0],
        [5.2, "progress", 1, "easeInOut"],
      ],
      d3: [
        [5.2, "scale", 1.08],
        [5.6, "scale", 1, "easeOutBack"],
      ],
    },
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
    { box: "processing", at: [150, 320], size: [140, 40], colour: "#a78bfa", text: "Processing" },
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
    keyframes: {
      idle: [
        [0.0, "scale", 1.12],
        [0.4, "scale", 1, "easeOutBack"],
        [8.3, "scale", 1.12],
        [8.6, "scale", 1, "easeOutBack"],
      ],
      msg1: [
        [0.5, "opacity", 0],
        [1.0, "opacity", 1, "easeOut"],
        [1.0, "scale", 1.06],
        [1.3, "scale", 1, "easeOutBack"],
      ],
      webhook: [
        [1.3, "progress", 0],
        [2.3, "progress", 1, "easeInOut"],
      ],
      t1: [
        [2.3, "progress", 0],
        [3.0, "progress", 1, "easeInOut"],
      ],
      parsing: [
        [3.0, "scale", 1.12],
        [3.0, "fill", "#2a2410"],
        [3.4, "scale", 1, "easeOutBack"],
        [3.4, "fill", "#191710", "easeOut"],
      ],
      t2: [
        [3.4, "progress", 0],
        [4.2, "progress", 1, "easeInOut"],
      ],
      processing: [
        [4.2, "scale", 1.12],
        [4.2, "fill", "#1c1840"],
        [4.6, "scale", 1, "easeOutBack"],
        [4.6, "fill", "#131825", "easeOut"],
      ],
      t3: [
        [4.6, "progress", 0],
        [5.4, "progress", 1, "easeInOut"],
      ],
      replying: [
        [5.4, "scale", 1.12],
        [5.4, "fill", "#1a2e22"],
        [5.8, "scale", 1, "easeOutBack"],
        [5.8, "fill", "#0f1916", "easeOut"],
      ],
      apiReply: [
        [5.8, "progress", 0],
        [6.8, "progress", 1, "easeInOut"],
      ],
      msg2: [
        [6.8, "opacity", 0],
        [7.2, "opacity", 1, "easeOut"],
        [7.2, "scale", 1.06],
        [7.5, "scale", 1, "easeOutBack"],
      ],
      t4: [
        [7.5, "progress", 0],
        [8.3, "progress", 1, "easeInOut"],
      ],
      msg3: [
        [8.3, "opacity", 0],
        [8.8, "opacity", 1, "easeOut"],
        [8.8, "scale", 1.08],
        [9.2, "scale", 1, "easeOutBack"],
      ],
    },
  },
}`,

  'Path Motion': `{
  // Objects following a smooth closed path
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
    keyframes: {
      b1: [[3.0, "x", 650, "linear"]],
      b2: [[3.0, "x", 650, "easeInOut"]],
      b3: [[3.0, "x", 650, "easeOutCubic"]],
      b4: [[3.0, "x", 650, "easeOutBack"]],
      b5: [[3.0, "x", 650, "bounce"]],
      b6: [[3.0, "x", 650, "elastic"]],
      b7: [[3.0, "x", 650, "spring"]],
      b8: [[3.0, "x", 650, "snap"]],
    },
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

      // Any object with children is rendered as a container
      const children = p.children as string[] | undefined;
      if (children && children.length > 0 && obj.type !== 'group') {
        return (
          <GroupRenderer
            key={id}
            props={p}
            objects={diagram.objects}
            allProps={diagram.animatedProps}
            renderObject={renderObject}
          />
        );
      }

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
        case 'group':
          return (
            <GroupRenderer
              key={id}
              props={p}
              objects={diagram.objects}
              allProps={diagram.animatedProps}
              renderObject={renderObject}
            />
          );
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
