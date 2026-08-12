/**
 * The reference track — exhaustive grids, no narrative.
 *
 * These exist to be looked things up in, not read in order: every shape in a
 * set side by side, every easing curve racing, every colour format. Where a
 * learn lesson shows one representative case and moves on, these show the
 * whole axis.
 *
 * Categories here are topical on purpose, so a reference grid files itself
 * next to the lessons it backs up — `track` is what separates the two roles.
 */
import type { V2Sample } from './types';

const ALL_EASINGS = [
  'linear', 'easeIn', 'easeOut', 'easeInOut',
  'easeInCubic', 'easeOutCubic', 'easeInOutCubic',
  'easeInQuart', 'easeOutQuart', 'easeInOutQuart',
  'easeInBack', 'easeOutBack',
  'bounce', 'elastic', 'spring',
  'snap', 'step',
];

const EASING_COLORS = [
  'red', 'orangered', 'orange', 'gold', 'yellow',
  'lawngreen', 'lime', 'springgreen', 'mediumspringgreen',
  'cyan', 'deepskyblue', 'dodgerblue', 'blue',
  'slateblue', 'purple', 'magenta', 'deeppink',
];

function buildEasingSample(): V2Sample {
  const startX = 120;
  const endX = 500;
  const spacing = 22;
  const startY = 30;

  const objectLines = ALL_EASINGS.flatMap((name, i) => {
    const y = startY + i * spacing;
    const color = EASING_COLORS[i];
    return [
      `  ${name}: rect 16x16 radius=3 fill ${color} at ${startX},${y}`,
      `  l_${name}: text "${name}" size=9 align=end fill gray at ${startX - 10},${y}`,
    ];
  });

  const resetLines = ALL_EASINGS.map(name => `    ${name}.transform.x: ${startX}`);
  const moveLines = ALL_EASINGS.map(name => `    ${name}.transform.x: { value: ${endX}, easing: "${name}" }`);

  return {
    name: 'easing-comparison',
    category: 'Animation',
    track: 'reference',
    description: `All ${ALL_EASINGS.length} easing functions compared side by side`,
    teaches: [],
    dsl: `objects
${objectLines.join('\n')}

animate 3 loop
  1.5
${moveLines.join('\n')}
  3
${resetLines.join('\n')}`,
  };
}

export const referenceSamples: V2Sample[] = [

  // ─── SHAPES ────────────────────────────────────────────────────
  {
    name: 'template-tour',
    category: 'Shapes',
    track: 'reference',
    description: 'One of each core template, connected with a labelled arrow',
    teaches: [],
    dsl: `\
objects
  api: box "API gateway" color=steelblue at 100,70
  worker: circle "Worker" color=mediumseagreen at 340,70
  status: pill "healthy" color=darkorange at 500,70
  doc: note "Plain text in, diagrams out." at 100,210
  info: card "Card" body="With body text" color=mediumpurple at 340,215
  link: arrow from=api to=worker label="jobs" color=steelblue`,
  },
  {
    name: 'core-shapes',
    category: 'Shapes',
    track: 'reference',
    description: 'Reference grid of the core shape set — every template at several content widths',
    teaches: [],
    dsl: `\
name "Core Shapes"
background #14161c

objects
  title: text "core" size=20 bold fill slategray at 350,30

  // ─── box row ───────────────────────────────────
  box_l: text "box" size=10 fill gray at 0,60

  b1: box "Short" color=steelblue
    at 0,100
  b2: box "Auto-sized to fit content" color=steelblue
    at 200,100
  b3: box "Wraps when text exceeds the max width limit" maxWidth=180 color=steelblue
    at 420,100
  b4: box "Line one\\nLine two\\nLine three" color=steelblue
    at 620,100

  // ─── circle row ────────────────────────────────
  circ_l: text "circle" size=10 fill gray at 0,180

  c1: circle "Hi" color=mediumseagreen
    at 0,230
  c2: circle "Auto-sized" color=mediumseagreen
    at 160,230
  c3: circle "Longer label here" color=mediumseagreen
    at 370,230

  // ─── pill row ──────────────────────────────────
  pill_l: text "pill" size=10 fill gray at 0,310

  p1: pill "Tag" color=darkorange
    at 0,340
  p2: pill "Status badge" color=darkorange
    at 130,340
  p3: pill "A much longer pill label" color=darkorange
    at 350,340

  // ─── card row ──────────────────────────────────
  card_l: text "card" size=10 fill gray at 0,390

  cd1: card "Simple Card" color=mediumpurple
    at 0,450
  cd2: card "With Body" body="Detail text\\nover two lines" color=mediumpurple
    at 190,450
  cd3: card "Wide" body="Body wraps at maxWidth" maxWidth=160 color=mediumpurple
    at 400,450

  // ─── note row ──────────────────────────────────
  note_l: text "note" size=10 fill gray at 0,550

  n1: note "Remember"
    at 0,600
  n2: note "A longer note that will wrap across multiple lines nicely"
    at 200,600
  n3: note "Line one\\nLine two"
    at 450,600

  // ─── group row ─────────────────────────────────
  grp_l: text "group" size=10 fill gray at 0,700

  g: group "Group" 180x100 color=teal
    at 0,770

  g2: group "With children" direction=row gap=16 color=teal
    at 260,770
    g2_a: box "A" color=steelblue
    g2_b: box "B" color=darkorange

  // ─── arrow / line row ──────────────────────────
  conn_l: text "arrow / line" size=10 fill gray at 0,860

  a_src: rect 40x30 radius=4 fill midnightblue stroke steelblue width=1 at 0,900
  a_dst: rect 40x30 radius=4 fill midnightblue stroke steelblue width=1 at 200,900
  a: arrow from=a_src to=a_dst label="arrow" color=steelblue

  l_src: rect 40x30 radius=4 fill midnightblue stroke steelblue width=1 at 320,900
  l_dst: rect 40x30 radius=4 fill midnightblue stroke steelblue width=1 at 520,900
  l: line from=l_src to=l_dst label="line" color=coral

  p_src: rect 40x30 radius=4 fill midnightblue stroke steelblue width=1 at 640,900
  p_dst: rect 40x30 radius=4 fill midnightblue stroke steelblue width=1 at 840,900
  p: arrow from=p_src to=p_dst label="plate" labelBg=plate color=steelblue`,
  },
  {
    name: 'state-shapes',
    category: 'Shapes',
    track: 'reference',
    description: 'Reference grid of the state shape set — use [core, state] to reach it',
    teaches: [],
    dsl: `\
name "State Shapes"
background #14161c
use [core, state]

objects
  title: text "state" size=20 bold fill slategray at 350,30

  // ─── state.node row ───────────────────────────
  node_l: text "state.node" size=10 fill gray at 0,60

  sn1: state.node "Idle" color=steelblue
    at 0,100
  sn2: state.node "Processing" entry="start" exit="stop" color=mediumseagreen
    at 180,100
  sn3: state.node "Active" entry="initTimer\\nloadConfig" exit="saveState\\ncleanup" color=darkorange
    at 420,100
  sn4: state.node "Auto-sized long name" color=steelblue
    at 660,100

  // ─── state.initial / final / choice row ───────
  misc_l: text "initial / final / choice" size=10 fill gray at 0,200

  si: state.initial color=whitesmoke
    at 0,240
  si_l: text "initial" size=9 fill gray at 0,265

  sf: state.final color=whitesmoke
    at 100,240
  sf_l: text "final" size=9 fill gray at 100,265

  sc: state.choice color=goldenrod
    at 200,240
  sc_l: text "choice" size=9 fill gray at 200,265

  // ─── state.region row ─────────────────────────
  reg_l: text "state.region" size=10 fill gray at 0,300

  sr: state.region "Region A" 400x120 color=slategray
    at 0,370`,
  },
  {
    name: 'primitive-shapes',
    category: 'Shapes',
    track: 'reference',
    description: 'The primitives a template is built from — rect, ellipse, text and path, with their own properties',
    teaches: [],
    dsl: `\
objects
  r1: rect 140x80 radius=8 fill steelblue stroke darkblue width=2 at 100,80
  r_l: text "rect" size=10 mono fill gray at 100,150

  e1: ellipse 50x50 fill forestgreen stroke darkgreen width=2 at 300,80
  e2: ellipse 70x35 fill darkorange stroke saddlebrown width=2 at 440,80
  e_l: text "ellipse" size=10 mono fill gray at 370,150

  t1: text "Hello World" size=24 bold fill whitesmoke at 640,60
  t2: text "monospace, smaller" size=12 mono fill darkgray at 640,95
  t_l: text "text" size=10 mono fill gray at 640,150

  tri: path (0,-40) (40,30) (-40,30) closed
    fill darkorchid
    stroke indigo width=2
    at 120,270
  zig: path (0,0) (30,-30) (60,0) (90,-30) (120,0)
    stroke goldenrod width=2
    at 260,270
  p_l: text "path — open, or closed to fill it" size=10 mono fill gray at 250,340`,
  },
  {
    name: 'dash-patterns',
    category: 'Shapes',
    track: 'reference',
    description: 'Dash patterns on paths — solid, dashed, dotted',
    teaches: [],
    dsl: `\
solid: path (0,0) (250,0) stroke silver width=2 at 100,100
dashed: path (0,0) (250,0) stroke silver width=2 at 100,140
  dash dashed length=10 gap=5
dotted: path (0,0) (250,0) stroke silver width=2 at 100,180
  dash dotted length=2 gap=6
l1: text "solid" size=11 fill gray at 50,100
l2: text "dashed" size=11 fill gray at 42,140
l3: text "dotted" size=11 fill gray at 42,180`,
  },

  // ─── BASICS ────────────────────────────────────────────────────
  {
    name: 'opacity-composition',
    category: 'Basics',
    track: 'reference',
    description: "Opacity composites rather than overriding — a child's own opacity multiplies its parent's, so 0.8 inside 0.5 renders at 0.4",
    teaches: [],
    dsl: `\
objects
  parent: opacity 0.5 at 120,130
    inherits: rect 80x80 radius=8 fill dodgerblue
    composes: rect 80x80 radius=8 fill dodgerblue opacity 0.8 at 100,0
  reference: rect 80x80 radius=8 fill dodgerblue at 370,130
  l1: text "inherits 0.5" size=10 fill gray at 120,240
  l2: text "0.8 x 0.5 = 0.4" size=10 fill gray at 220,240
  l3: text "full opacity" size=10 fill gray at 370,240`,
  },

  // ─── STYLING ───────────────────────────────────────────────────
  {
    name: 'color-formats',
    category: 'Styling',
    track: 'reference',
    description: 'Every colour format — named, hex, rgb and hsl — and all four interpolate the same way',
    teaches: [],
    dsl: `\
a: rect 80x80 radius=8 fill red at 60,100
b: rect 80x80 radius=8 fill #3366ff at 170,100
c: rect 80x80 radius=8 fill rgb 60 200 80 at 280,100
d: rect 80x80 radius=8 fill hsl 60 80 50 at 390,100

la: text "named" size=10 mono fill gray at 60,160
lb: text "#hex" size=10 mono fill gray at 170,160
lc: text "rgb" size=10 mono fill gray at 280,160
ld: text "hsl" size=10 mono fill gray at 390,160

animate 6 loop
  3 a.fill: blue
  3 b.fill: #ff6633
  3 c.fill: rgb 200 60 180
  3 d.fill: hsl 280 70 55

  6 a.fill: red
  6 b.fill: #3366ff
  6 c.fill: rgb 60 200 80
  6 d.fill: hsl 60 80 50`,
  },
  {
    name: 'style-animation',
    category: 'Styling',
    track: 'reference',
    description: 'A style is animatable as one track — every node using it changes together',
    teaches: [],
    dsl: `\
style theme
  fill steelblue

a: rect 80x80 radius=8 @theme at 120,140
b: rect 80x80 radius=8 @theme at 230,140
c: rect 80x80 radius=8 @theme at 340,140

animate 4 loop
  2 theme.fill: crimson
  4 theme.fill: steelblue`,
  },

  // ─── ANIMATION ─────────────────────────────────────────────────
  buildEasingSample(),

  // ─── LAYOUT ──────────────────────────────────────────────────────
  {
    name: 'layout-cross-strategy',
    category: 'Layout',
    track: 'reference',
    description: 'Slots reach across strategies — items move from a flex column into a grid and back',
    teaches: [],
    dsl: `\
objects
  inbox: rect 160x180 fill darkslategray stroke steelblue width=1 layout flex column gap=8 padding=10 at 120,160
  board: rect 240x180 fill darkslategray stroke indianred width=1 layout grid columns=2 gap=8 padding=10 at 370,160
  task1: rect 130x30 radius=4 fill steelblue layout slot=inbox
  task2: rect 130x30 radius=4 fill limegreen layout slot=inbox
  task3: rect 130x30 radius=4 fill goldenrod layout slot=inbox

animate 6 loop easing=easeInOut
  2 task1.layout.slot: board
  4 task2.layout.slot: board
  6
    task1.layout.slot: inbox
    task2.layout.slot: inbox`,
  },

  // ─── CAMERA ──────────────────────────────────────────────────────
  {
    name: 'camera-offset-target',
    category: 'Camera',
    track: 'reference',
    description: 'Every form look= accepts — coordinates, a node id, and a node with an offset',
    teaches: [],
    dsl: `\
objects
  cam: camera look=(300,200) zoom=1.5
  a: rect 80x80 radius=8 fill deepskyblue at 100,200
  b: rect 80x80 radius=8 fill mediumvioletred at 500,200
  label_a: text "A" size=14 fill gainsboro at 100,200
  label_b: text "B" size=14 fill gainsboro at 500,200

animate 6 loop easing=easeInOut
  1.5 cam.camera.look: a
  3 cam.camera.look: b
  4.5 cam.camera.look: (b,0,-100)
  6 cam.camera.look: (300,200)`,
  },
  {
    name: 'camera-ratio',
    category: 'Camera',
    track: 'reference',
    description: 'Animated aspect ratio — zoomed in, panning across objects',
    teaches: [],
    dsl: `\
objects
  cam: camera look=(100,130) zoom=3 ratio=1.78
  a: rect 80x80 radius=6 fill cornflowerblue at 100,60
  b: rect 80x80 radius=6 fill mediumseagreen at 300,60
  c: rect 80x80 radius=6 fill peru at 500,60
  d: rect 80x80 radius=6 fill palevioletred at 100,200
  e: rect 80x80 radius=6 fill mediumpurple at 300,200
  hint-bg: rect 220x24 radius=4 fill black a=0.7 at 300,200
  hint: text "Click Viewport button to preview ratio" size=10 align=middle fill whitesmoke at 300,200
  f: rect 80x80 radius=6 fill gold at 500,200
  g: rect 80x80 radius=6 fill darkturquoise at 100,340
  h: rect 80x80 radius=6 fill indianred at 300,340
  i: rect 80x80 radius=6 fill yellowgreen at 500,340

animate 8 loop easing=easeInOutCubic
  2
    cam.camera.look: (200,130)
    cam.camera.zoom: 2.5
    cam.camera.ratio: 2.35
  4
    cam.camera.look: (400,200)
    cam.camera.zoom: 2
    cam.camera.ratio: 1.78
  6
    cam.camera.look: (300,340)
    cam.camera.zoom: 3
    cam.camera.ratio: 2.35
  8
    cam.camera.look: (100,130)
    cam.camera.zoom: 3
    cam.camera.ratio: 1.78`,
  },
  {
    name: 'camera-rotation',
    category: 'Camera',
    track: 'reference',
    description: 'Rotating camera view with easing',
    teaches: [],
    dsl: `\
objects
  cam: camera look=(300,200) zoom=1.5 rotation=0
  center: ellipse 20x20 fill gold at 300,200
  n: rect 30x30 radius=4 fill indianred at 300,100
  e: rect 30x30 radius=4 fill yellowgreen at 400,200
  s: rect 30x30 radius=4 fill darkturquoise at 300,300
  w: rect 30x30 radius=4 fill darkorchid at 200,200

animate 6 loop easing=easeInOutCubic
  3 cam.transform.rotation: 180
  6 cam.transform.rotation: 360`,
  },
  {
    name: 'camera-switch',
    category: 'Camera',
    track: 'reference',
    description: 'Switching between multiple cameras (cut transitions)',
    teaches: [],
    dsl: `\
objects
  cam1: camera look=a zoom=2 active
  cam2: camera look=b zoom=2
  a: rect 80x80 radius=8 fill deepskyblue at 100,200
  b: rect 80x80 radius=8 fill mediumvioletred at 500,200
  la: text "Cam 1" size=10 fill silver at 100,250
  lb: text "Cam 2" size=10 fill silver at 500,250

animate 4 loop
  2
    cam1.camera.active: false
    cam2.camera.active: true
  4
    cam1.camera.active: true
    cam2.camera.active: false`,
  },
  {
    name: 'camera-combined',
    category: 'Camera',
    track: 'reference',
    description: 'Cinematic sequence — aggressive zoom, rocking pan, gentle pullback',
    teaches: [],
    dsl: `\
objects
  cam: camera look=all zoom=1 ratio=1.78 rotation=0
  a: rect 70x70 radius=6 fill cornflowerblue at 80,80
  b: rect 70x70 radius=6 fill mediumseagreen at 250,80
  c: rect 70x70 radius=6 fill peru at 420,80
  d: rect 70x70 radius=6 fill palevioletred at 80,250
  e: rect 70x70 radius=6 fill mediumpurple at 250,250
  f: rect 70x70 radius=6 fill gold at 420,250
  g: rect 70x70 radius=6 fill darkturquoise at 80,420
  h: rect 70x70 radius=6 fill indianred at 250,420
  i: rect 70x70 radius=6 fill yellowgreen at 420,420

animate 14 loop
  1.5 easing=easeInCubic
    cam.camera.look: e
    cam.camera.zoom: 5
    cam.transform.rotation: 25
  3 easing=easeOutCubic
    cam.camera.look: e
    cam.camera.zoom: 2.5
    cam.transform.rotation: 0
  4.5 easing=easeInOutCubic
    cam.camera.look: a
    cam.camera.zoom: 3
    cam.transform.rotation: -8
  5.5 easing=easeInOutCubic
    cam.camera.look: c
    cam.camera.zoom: 3
    cam.transform.rotation: 8
  6.5 easing=easeInOutCubic
    cam.camera.look: i
    cam.camera.zoom: 3
    cam.transform.rotation: -8
  7.5 easing=easeInOutCubic
    cam.camera.look: g
    cam.camera.zoom: 3
    cam.transform.rotation: 8
  8.5 easing=easeOutCubic
    cam.camera.look: e
    cam.camera.zoom: 2.5
    cam.transform.rotation: 0
  14 easing=easeInOutCubic
    cam.camera.look: all
    cam.camera.zoom: 1
    cam.transform.rotation: 0
    cam.camera.ratio: 1.78`,
  },
];
