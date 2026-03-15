import { useState, useCallback, useMemo } from 'react';
import { useDiagram } from './components/Diagram';
import { Timeline } from './components/Timeline';
import { Editor } from './components/Editor';
import { SvgCanvas } from './renderer/svg/SvgCanvas';
import { BoxRenderer } from './renderer/svg/BoxRenderer';
import { CircleRenderer } from './renderer/svg/CircleRenderer';
import { TextRenderer } from './renderer/svg/TextRenderer';
import { TableRenderer } from './renderer/svg/TableRenderer';
import { LineRenderer } from './renderer/svg/LineRenderer';
import { PathRenderer } from './renderer/svg/PathRenderer';
import { GroupRenderer } from './renderer/svg/GroupRenderer';
import type { SceneObject, StarchEvent } from './core/types';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";

const EXAMPLES: Record<string, string> = {
  'State Machine': `# HTTP Connection State Machine

text title {
  x: 400
  y: 35
  text: "Connection Lifecycle"
  size: 18
  color: #e2e5ea
  bold: true
}

circle start {
  x: 400
  y: 90
  r: 12
  fill: #22d3ee
  stroke: #22d3ee
}

box idle {
  x: 400
  y: 170
  size: 130 46
  fill: #0f1923
  stroke: #22d3ee
  radius: 23
  text: "Idle"
  anchor: bottom
}

box connecting {
  x: 180
  y: 300
  size: 150 46
  fill: #191710
  stroke: #fbbf24
  radius: 8
  text: "Connecting"
  anchor: top
}

box connected {
  x: 400
  y: 430
  size: 150 46
  fill: #0f1916
  stroke: #34d399
  radius: 8
  text: "Connected"
  anchor: top
}

box error {
  x: 620
  y: 300
  size: 130 46
  fill: #1c0f0f
  stroke: #ef4444
  radius: 8
  text: "Error"
  anchor: top
}

line s0 { from: start  to: idle  stroke: #22d3ee  label: "init" }
line s1 { from: idle  to: connecting  stroke: #fbbf24  label: "connect()" }
line s2 { from: connecting  to: connected  stroke: #34d399  label: "TCP established" }
line s3 { from: connecting  to: error  stroke: #ef4444  label: "timeout / refused" }
line s4 { from: error  to: idle  stroke: #8a8f98  label: "retry()"  dashed: true }
line s5 { from: connected  to: idle  stroke: #8a8f98  label: "close()"  dashed: true }

@animate duration:8s loop:true {
  0.0s: start.scale = 1.3
  0.4s: start.scale = 1 ease:easeOutCubic
  0.2s: s0.progress = 0
  0.8s: s0.progress = 1 ease:easeInOut
  0.8s: idle.scale = 1.12
  1.2s: idle.scale = 1 ease:easeOutBack
  1.2s: s1.progress = 0
  2.0s: s1.progress = 1 ease:easeInOut
  2.0s: connecting.scale = 1.12, connecting.fill = #2a2410
  2.5s: connecting.scale = 1 ease:easeOutBack, connecting.fill = #191710 ease:easeOut
  2.5s: s2.progress = 0
  3.3s: s2.progress = 1 ease:easeInOut
  3.3s: connected.scale = 1.12, connected.fill = #1a2e22
  3.8s: connected.scale = 1 ease:easeOutBack, connected.fill = #0f1916 ease:easeOut
  4.2s: s5.progress = 0
  5.0s: s5.progress = 1 ease:easeInOut
  5.0s: idle.scale = 1.12
  5.4s: idle.scale = 1 ease:easeOutBack
  5.4s: s1.progress = 0
  6.0s: s1.progress = 1 ease:easeInOut
  6.0s: connecting.scale = 1.12
  6.3s: connecting.scale = 1 ease:easeOutBack
  6.3s: s3.progress = 0
  7.0s: s3.progress = 1 ease:easeInOut
  7.0s: error.scale = 1.15, error.fill = #2c1010
  7.4s: error.scale = 1 ease:bounce, error.fill = #1c0f0f ease:easeOut
  7.4s: s4.progress = 0
  8.0s: s4.progress = 1 ease:easeInOut
}`,

  'Data Pipeline': `# ETL Pipeline

text title { x: 450  y: 30  text: "ETL Pipeline"  size: 18  color: #e2e5ea  bold: true }

box ingest    { x: 100  y: 120  size: 130 50  fill: #131825  stroke: #60a5fa  text: "Ingest" }
box validate  { x: 300  y: 120  size: 130 50  fill: #131825  stroke: #60a5fa  text: "Validate" }
box transform { x: 500  y: 120  size: 140 50  fill: #131825  stroke: #a78bfa  text: "Transform" }
box load      { x: 700  y: 120  size: 130 50  fill: #131825  stroke: #34d399  text: "Load" }

table schema {
  x: 300
  y: 280
  cols: Field | Type | Nullable
  row: id | u64 | no
  row: name | String | no
  row: score | f64 | yes
  row: ts | DateTime | no
}

table metrics {
  x: 650
  y: 310
  cols: Metric | Value
  row: rows/s | 12,450
  row: errors | 0.02%
  row: p99 lat | 23ms
}

line l1 { from: ingest    to: validate   stroke: #60a5fa  label: "raw bytes" }
line l2 { from: validate  to: transform  stroke: #a78bfa  label: "parsed rows" }
line l3 { from: transform to: load       stroke: #34d399  label: "clean records" }
line l4 { from: validate  to: schema     stroke: #3a3f49  label: "check against"  dashed: true }
line l5 { from: load      to: metrics    stroke: #3a3f49  label: "report"  dashed: true }

@animate duration:6s loop:true {
  0.0s: ingest.scale = 1.1, ingest.fill = #1a2540
  0.4s: ingest.scale = 1 ease:easeOutBack, ingest.fill = #131825 ease:easeOut
  0.3s: l1.progress = 0
  1.0s: l1.progress = 1 ease:easeInOut
  1.0s: validate.scale = 1.1
  1.4s: validate.scale = 1 ease:easeOutBack
  1.0s: l4.progress = 0
  1.8s: l4.progress = 1 ease:easeInOut
  1.4s: schema.opacity = 0.4
  2.0s: schema.opacity = 1 ease:easeOut
  1.5s: l2.progress = 0
  2.3s: l2.progress = 1 ease:easeInOut
  2.3s: transform.scale = 1.1, transform.fill = #1c1840
  2.7s: transform.scale = 1 ease:easeOutBack, transform.fill = #131825 ease:easeOut
  2.7s: l3.progress = 0
  3.5s: l3.progress = 1 ease:easeInOut
  3.5s: load.scale = 1.1, load.fill = #132e22
  3.9s: load.scale = 1 ease:easeOutBack, load.fill = #131825 ease:easeOut
  3.5s: l5.progress = 0
  4.3s: l5.progress = 1 ease:easeInOut
  4.3s: metrics.opacity = 0.4
  5.0s: metrics.opacity = 1 ease:easeOut
}`,

  'Chapters': `# Chapter Demo - Connection Setup

text title { x: 400  y: 35  text: "Connection Setup"  size: 18  color: #e2e5ea  bold: true }

box client { x: 150  y: 200  size: 120 50  fill: #131825  stroke: #60a5fa  text: "Client" }
box server { x: 650  y: 200  size: 120 50  fill: #131825  stroke: #34d399  text: "Server" }
box db { x: 650  y: 380  size: 120 50  fill: #131825  stroke: #a78bfa  text: "Database" }

# Guide path showing the flow route
path flowPath {
  points: 210,200 400,200 590,200
  visible: false
  stroke: #60a5fa
}

line syn { from: client  to: server  stroke: #60a5fa  label: "SYN" }
line ack { from: server  to: client  stroke: #34d399  label: "SYN-ACK" }
line query { from: server  to: db  stroke: #a78bfa  label: "SELECT *" }

@animate duration:10s loop:false {
  @chapter 0.0s "Start" "Client initiates a TCP connection"
  @chapter 3.0s "Handshake" "Server responds with SYN-ACK"
  @chapter 6.0s "Query" "Server queries the database"

  0.0s: client.scale = 1.15
  0.5s: client.scale = 1 ease:easeOutBack
  0.5s: syn.progress = 0
  2.5s: syn.progress = 1 ease:easeInOut
  2.5s: server.scale = 1.15
  3.0s: server.scale = 1 ease:easeOutBack
  3.0s: ack.progress = 0
  5.5s: ack.progress = 1 ease:easeInOut
  5.5s: client.scale = 1.1
  6.0s: client.scale = 1 ease:easeOutBack
  6.0s: query.progress = 0
  8.5s: query.progress = 1 ease:easeInOut
  8.5s: db.scale = 1.15, db.fill = #1c1840
  9.5s: db.scale = 1 ease:easeOutBack, db.fill = #131825 ease:easeOut
}`,

  'State Machine (Composite)': `# State Machine using composite object

state_machine fsm {
  x: 200
  y: 200
  direction: horizontal
  spacing: 180
  initialState: idle
  finalStates: closed

  stateFill: #0f1923
  stateStroke: #22d3ee
  stateWidth: 130
  stateHeight: 46
  stateRadius: 8
  transitionStroke: #60a5fa
  markerFill: #22d3ee
  markerStroke: #22d3ee

  state idle { label: "Idle"; fill: #0f1923; stroke: #22d3ee }
  state connecting { label: "Connecting"; fill: #191710; stroke: #fbbf24 }
  state connected { label: "Connected"; fill: #0f1916; stroke: #34d399 }
  state closed { label: "Closed"; fill: #1c0f0f; stroke: #ef4444 }

  transition idle -> connecting { label: "connect()" }
  transition connecting -> connected { label: "established" }
  transition connected -> closed { label: "close()" }
  transition connecting -> idle { label: "timeout"; dashed: true }
}

text title {
  x: 400
  y: 80
  text: "Connection State Machine"
  size: 18
  color: #e2e5ea
  bold: true
}

@animate duration:8s loop:true {
  0.2s: fsm__initial__arrow.progress = 0
  0.8s: fsm__initial__arrow.progress = 1 ease:easeInOut
  0.8s: fsm__state__idle.scale = 1.12
  1.2s: fsm__state__idle.scale = 1 ease:easeOutBack
  1.2s: fsm__transition__idle__connecting.progress = 0
  2.0s: fsm__transition__idle__connecting.progress = 1 ease:easeInOut
  2.0s: fsm__state__connecting.scale = 1.12
  2.5s: fsm__state__connecting.scale = 1 ease:easeOutBack
  2.5s: fsm__transition__connecting__connected.progress = 0
  3.5s: fsm__transition__connecting__connected.progress = 1 ease:easeInOut
  3.5s: fsm__state__connected.scale = 1.12
  4.0s: fsm__state__connected.scale = 1 ease:easeOutBack
  4.0s: fsm__transition__connected__closed.progress = 0
  5.0s: fsm__transition__connected__closed.progress = 1 ease:easeInOut
  5.0s: fsm__state__closed.scale = 1.15
  5.5s: fsm__state__closed.scale = 1 ease:bounce
  6.0s: fsm__final__closed__arrow.progress = 0
  7.0s: fsm__final__closed__arrow.progress = 1 ease:easeInOut
}`,

  'Slack Bot': `# Slack Bot Interaction

text title { x: 400 y: 30 text: "Slack Bot Interaction" size: 18 color: #e2e5ea bold: true }

# ── Bot State Machine (left) ──
text smLabel { x: 150 y: 75 text: "Bot States" size: 12 color: #4a4f59 }

box idle { x: 150 y: 140 size: 120 40 fill: #0f1923 stroke: #22d3ee radius: 20 text: "Idle" }
box parsing { x: 150 y: 230 size: 120 40 fill: #191710 stroke: #fbbf24 radius: 8 text: "Parsing" }
box processing { x: 150 y: 320 size: 140 40 fill: #131825 stroke: #a78bfa radius: 8 text: "Processing" }
box replying { x: 150 y: 410 size: 120 40 fill: #0f1916 stroke: #34d399 radius: 8 text: "Replying" }

line t1 { from: idle to: parsing stroke: #fbbf24 label: "event" }
line t2 { from: parsing to: processing stroke: #a78bfa label: "valid" }
line t3 { from: processing to: replying stroke: #34d399 label: "done" }
line t4 { from: replying to: idle stroke: #22d3ee dashed: true label: "reset" }

# ── Slack Channel (right) ──
text slackLabel { x: 600 y: 75 text: "Slack Channel" size: 12 color: #4a4f59 }

box channel { x: 600 y: 110 size: 250 34 fill: #14161c stroke: #2a2d35 radius: 6 text: "# ops-deploy" textColor: #e2e5ea }

box msg1 { x: 600 y: 180 size: 230 50 fill: #1e2028 stroke: #3a3f49 radius: 8 text: "/deploy staging" textColor: #60a5fa opacity: 0 }

box msg2 { x: 600 y: 265 size: 230 50 fill: #1c1830 stroke: #352d5e radius: 8 text: "Deploying staging..." textColor: #a78bfa opacity: 0 }

box msg3 { x: 600 y: 350 size: 230 50 fill: #0f1916 stroke: #1e4a3a radius: 8 text: "Deploy complete!" textColor: #34d399 opacity: 0 }

# ── Flow arrows ──
line webhook { from: msg1 to: parsing stroke: #60a5fa label: "Events API" dashed: true }
line apiReply { from: replying to: msg2 stroke: #34d399 label: "Web API" dashed: true }

@animate duration:10s loop:true {
  0.0s: idle.scale = 1.12
  0.4s: idle.scale = 1 ease:easeOutBack

  0.5s: msg1.opacity = 0
  1.0s: msg1.opacity = 1 ease:easeOut
  1.0s: msg1.scale = 1.06
  1.3s: msg1.scale = 1 ease:easeOutBack

  1.3s: webhook.progress = 0
  2.3s: webhook.progress = 1 ease:easeInOut

  2.3s: t1.progress = 0
  3.0s: t1.progress = 1 ease:easeInOut
  3.0s: parsing.scale = 1.12, parsing.fill = #2a2410
  3.4s: parsing.scale = 1 ease:easeOutBack, parsing.fill = #191710 ease:easeOut

  3.4s: t2.progress = 0
  4.2s: t2.progress = 1 ease:easeInOut
  4.2s: processing.scale = 1.12, processing.fill = #1c1840
  4.6s: processing.scale = 1 ease:easeOutBack, processing.fill = #131825 ease:easeOut

  4.6s: t3.progress = 0
  5.4s: t3.progress = 1 ease:easeInOut
  5.4s: replying.scale = 1.12, replying.fill = #1a2e22
  5.8s: replying.scale = 1 ease:easeOutBack, replying.fill = #0f1916 ease:easeOut

  5.8s: apiReply.progress = 0
  6.8s: apiReply.progress = 1 ease:easeInOut

  6.8s: msg2.opacity = 0
  7.2s: msg2.opacity = 1 ease:easeOut
  7.2s: msg2.scale = 1.06
  7.5s: msg2.scale = 1 ease:easeOutBack

  7.5s: t4.progress = 0
  8.3s: t4.progress = 1 ease:easeInOut
  8.3s: idle.scale = 1.12
  8.6s: idle.scale = 1 ease:easeOutBack

  8.3s: msg3.opacity = 0
  8.8s: msg3.opacity = 1 ease:easeOut
  8.8s: msg3.scale = 1.08
  9.2s: msg3.scale = 1 ease:easeOutBack
}`,

  'Easing Demo': `# Easing comparison

text title { x: 400  y: 30  text: "Easing Functions"  size: 18  color: #e2e5ea  bold: true }

text t1 { x: 100  y: 80   text: "linear"       size: 11  color: #4a4f59 }
text t2 { x: 100  y: 130  text: "easeInOut"     size: 11  color: #4a4f59 }
text t3 { x: 100  y: 180  text: "easeOutCubic"  size: 11  color: #4a4f59 }
text t4 { x: 100  y: 230  text: "easeOutBack"   size: 11  color: #4a4f59 }
text t5 { x: 100  y: 280  text: "bounce"        size: 11  color: #4a4f59 }
text t6 { x: 100  y: 330  text: "elastic"       size: 11  color: #4a4f59 }
text t7 { x: 100  y: 380  text: "spring"        size: 11  color: #4a4f59 }
text t8 { x: 100  y: 430  text: "snap"          size: 11  color: #4a4f59 }

box b1 { x: 200  y: 80   size: 60 26  fill: #131825  stroke: #60a5fa  radius: 4 }
box b2 { x: 200  y: 130  size: 60 26  fill: #131825  stroke: #22d3ee  radius: 4 }
box b3 { x: 200  y: 180  size: 60 26  fill: #131825  stroke: #34d399  radius: 4 }
box b4 { x: 200  y: 230  size: 60 26  fill: #131825  stroke: #a78bfa  radius: 4 }
box b5 { x: 200  y: 280  size: 60 26  fill: #131825  stroke: #f472b6  radius: 4 }
box b6 { x: 200  y: 330  size: 60 26  fill: #131825  stroke: #fbbf24  radius: 4 }
box b7 { x: 200  y: 380  size: 60 26  fill: #131825  stroke: #fb923c  radius: 4 }
box b8 { x: 200  y: 430  size: 60 26  fill: #131825  stroke: #ef4444  radius: 4 }

@animate duration:4s loop:true {
  0.0s: b1.x = 200, b2.x = 200, b3.x = 200, b4.x = 200
  0.0s: b5.x = 200, b6.x = 200, b7.x = 200, b8.x = 200
  2.0s: b1.x = 650 ease:linear
  2.0s: b2.x = 650 ease:easeInOut
  2.0s: b3.x = 650 ease:easeOutCubic
  2.0s: b4.x = 650 ease:easeOutBack
  2.0s: b5.x = 650 ease:bounce
  2.0s: b6.x = 650 ease:elastic
  2.0s: b7.x = 650 ease:spring
  2.0s: b8.x = 650 ease:snap
  3.0s: b1.x = 650, b2.x = 650, b3.x = 650, b4.x = 650
  3.0s: b5.x = 650, b6.x = 650, b7.x = 650, b8.x = 650
  4.0s: b1.x = 200 ease:linear
  4.0s: b2.x = 200 ease:easeInOut
  4.0s: b3.x = 200 ease:easeOutCubic
  4.0s: b4.x = 200 ease:easeOutBack
  4.0s: b5.x = 200 ease:bounce
  4.0s: b6.x = 200 ease:elastic
  4.0s: b7.x = 200 ease:spring
  4.0s: b8.x = 200 ease:snap
}`,
};

export default function App() {
  const [dsl, setDsl] = useState(EXAMPLES['State Machine']);
  const [activeExample, setActiveExample] = useState('State Machine');
  const [showEditor, setShowEditor] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [chapterText, setChapterText] = useState<{ title: string; description?: string } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

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
      switch (obj.type) {
        case 'box':
          return <BoxRenderer key={id} props={p} />;
        case 'circle':
          return <CircleRenderer key={id} props={p} />;
        case 'text':
          return <TextRenderer key={id} props={p} />;
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
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {showEditor && (
          <Editor value={dsl} onChange={(v) => { setDsl(v); setActiveExample(''); }} parseError={parseError} />
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
