/**
 * V2 Samples — showcase of the compositional object model.
 * All samples use DSL format.
 */

export interface V2Sample {
  name: string;
  category: string;
  description: string;
  dsl: string;
}

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
    description: `All ${ALL_EASINGS.length} easing functions compared side by side`,
    dsl: `objects
${objectLines.join('\n')}

animate 3s loop
  1.5
${moveLines.join('\n')}
  3
${resetLines.join('\n')}`,
  };
}

export const v2Samples: V2Sample[] = [

  // ─── PRIMITIVES ────────────────────────────────────────────────
  {
    name: 'rect',
    category: 'Primitives',
    description: 'Rectangle with fill, stroke, and rounded corners',
    dsl: `\
box: rect 140x80 radius=8 fill steelblue stroke darkblue width=2 at 200,150`,
  },
  {
    name: 'ellipse',
    category: 'Primitives',
    description: 'Ellipse with separate radii',
    dsl: `\
circle: ellipse 50x50 fill forestgreen stroke darkgreen width=2 at 200,150
oval: ellipse 70x35 fill darkorange stroke saddlebrown width=2 at 400,150`,
  },
  {
    name: 'text',
    category: 'Primitives',
    description: 'Text node with size, bold, and alignment',
    dsl: `\
title: text "Hello World" size=24 bold fill whitesmoke at 200,100
subtitle: text "A subtitle in monospace" size=14 mono fill darkgray at 200,140`,
  },
  {
    name: 'path',
    category: 'Primitives',
    description: 'Path from a list of points — open or closed',
    dsl: `\
objects
  triangle:
    path (0,-40) (40,30) (-40,30) closed
    fill darkorchid
    stroke indigo width=2
    at 150,150
  zigzag:
    path (0,0) (30,-30) (60,0) (90,-30) (120,0)
    stroke goldenrod width=2
    at 280,150`,
  },
  {
    name: 'dash-patterns',
    category: 'Primitives',
    description: 'Dash patterns on paths — solid, dashed, dotted',
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

  // ─── COMPOSITION ───────────────────────────────────────────────
  {
    name: 'box-composition',
    category: 'Composition',
    description: 'A "box" is a parent node with a rect background and a text label as children',
    dsl: `\
objects
  mybox: at 200,150
    bg: rect 160x70 radius=8 fill midnightblue stroke dodgerblue width=2
    label: text "Composed Box" size=14 align=middle fill gainsboro`,
  },
  {
    name: 'line-composition',
    category: 'Composition',
    description: 'Two boxes connected by a path — the line and its label are children of a group node',
    dsl: `\
objects
  a: at 100,150
    a.bg: rect 100x50 radius=6 fill midnightblue stroke dodgerblue width=2
    a.label: text "Source" size=12 align=middle fill gainsboro
  b: at 400,150
    b.bg: rect 100x50 radius=6 fill darkred stroke crimson width=2
    b.label: text "Target" size=12 align=middle fill gainsboro
  line: a -> b stroke darkgray width=2
  lineLabel: text "sends data" size=11 fill darkgray at 250,130`,
  },
  {
    name: 'nested-children',
    category: 'Composition',
    description: 'Deep nesting — every leaf property is animatable via dot-notation',
    dsl: `\
objects
  card: at 200,150
    bg: rect 160x100 radius=6 fill midnightblue stroke steelblue width=2
    title: text "Card Title" size=14 bold fill gainsboro at 0,-20
    badge: ellipse 8x8 fill limegreen at 55,-30
    body: text "Some description text" size=11 fill darkgray at 0,15

animate 3s loop
  1.5
    card.bg.fill: midnightblue
    card.badge.fill: crimson
  3
    card.bg.fill: midnightblue
    card.badge.fill: limegreen`,
  },

  // ─── COLORS ────────────────────────────────────────────────────
  {
    name: 'color-animation',
    category: 'Colors',
    description: 'Animate whole fill colors — named, hex, rgb, and hsl formats all interpolate smoothly',
    dsl: `\
a: rect 80x80 radius=8 fill red at 60,100
b: rect 80x80 radius=8 fill #3366ff at 170,100
c: rect 80x80 radius=8 fill rgb 60 200 80 at 280,100
d: rect 80x80 radius=8 fill hsl 60 80 50 at 390,100

animate 6s loop
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
    name: 'hue-shortest-arc',
    category: 'Colors',
    description: 'Hue interpolation takes the shortest arc — 350 to 10 goes through 0, not 180',
    dsl: `\
box: rect 100x80 radius=8 fill crimson at 200,150
label: text "350 → 10 (short arc)" size=11 fill darkgray at 200,210

animate 3s loop
  1.5 box.fill: orangered
  3 box.fill: crimson`,
  },

  // ─── STYLES ────────────────────────────────────────────────────
  {
    name: 'named-styles',
    category: 'Styles',
    description: 'Define reusable styles — node properties override style defaults',
    dsl: `\
style primary
  fill steelblue
  stroke darkblue width=2

style danger
  fill firebrick
  stroke darkred width=2

a: rect 100x60 radius=6 @primary at 100,150
b: rect 100x60 radius=6 @danger at 230,150
c: rect 100x60 radius=6 @primary fill limegreen at 360,150`,
  },
  {
    name: 'style-animation',
    category: 'Styles',
    description: 'Animate a style — all nodes using it change together',
    dsl: `\
style theme
  fill steelblue

a: rect 80x80 radius=8 @theme at 120,140
b: rect 80x80 radius=8 @theme at 230,140
c: rect 80x80 radius=8 @theme at 340,140

animate 4s loop
  2 theme.fill: crimson
  4 theme.fill: steelblue`,
  },

  // ─── ANIMATION ─────────────────────────────────────────────────
  buildEasingSample(),
  {
    name: 'position-animation',
    category: 'Animation',
    description: 'Animate position — a box moves across the canvas',
    dsl: `\
mover: rect 50x50 radius=25 fill darkorchid at 100,150

animate 4s loop easing=easeInOut
  1
    mover.transform.x: 400
    mover.transform.y: 100
  2
    mover.transform.x: 400
    mover.transform.y: 250
  3
    mover.transform.x: 100
    mover.transform.y: 250
  4
    mover.transform.x: 100
    mover.transform.y: 150`,
  },
  {
    name: 'opacity-animation',
    category: 'Animation',
    description: 'Animate opacity — fade in and out',
    dsl: `\
box: rect 100x100 radius=8 fill dodgerblue opacity 0 at 200,140

animate 3s loop
  1.5 box.opacity: 1
  3 box.opacity: 0`,
  },

  // ─── CONNECTIONS ───────────────────────────────────────────────
  {
    name: 'edge-snapping',
    category: 'Connections',
    description: 'Lines snap to object edges, not centers — with gap spacing',
    dsl: `\
a: rect 80x50 radius=6 fill darkslateblue stroke dodgerblue width=2 at 100,150
b: rect 80x50 radius=6 fill forestgreen stroke limegreen width=2 at 380,150
line: a -> b gap=4 stroke darkgray width=2`,
  },
  {
    name: 'arrow',
    category: 'Connections',
    description: 'Arrow template — smart connection with arrowhead and label',
    dsl: `\
objects
  a: at 100,150
    a.bg: rect 100x50 radius=6 fill midnightblue stroke dodgerblue width=2
    a.label: text "Source" size=12 fill gainsboro
  b: at 400,150
    b.bg: rect 100x50 radius=6 fill darkred stroke crimson width=2
    b.label: text "Target" size=12 fill gainsboro
  conn: template arrow from=a to=b label="sends data" colour=darkgray`,
  },
  {
    name: 'smooth-bend',
    category: 'Connections',
    description: 'Smooth quadratic bend — animate the curve amount',
    dsl: `\
a: rect 60x40 radius=6 fill darkslateblue stroke dodgerblue width=2 at 120,150
b: rect 60x40 radius=6 fill firebrick stroke crimson width=2 at 380,150
line: a -> b bend=0 gap=4 stroke darkgray width=2

animate 4s loop
  1 line.path.bend: 1.5
  2 line.path.bend: 0
  3 line.path.bend: -1.5
  4 line.path.bend: 0`,
  },
  {
    name: 'smooth-spline',
    category: 'Connections',
    description: 'Smooth Catmull-Rom spline through waypoints',
    dsl: `\
a: ellipse 20x20 fill steelblue at 80,150
b: ellipse 20x20 fill firebrick at 420,150
line: a -> (180,80) -> (250,220) -> (340,80) -> b smooth gap=4 stroke limegreen width=2`,
  },
  {
    name: 'routed-polyline',
    category: 'Connections',
    description: 'Polyline routed through waypoints with rounded corners',
    dsl: `\
a: rect 60x40 radius=4 fill darkslateblue stroke dodgerblue width=2 at 80,100
b: rect 60x40 radius=4 fill firebrick stroke crimson width=2 at 420,200
line: a -> (250,100) -> (250,200) -> b radius=15 gap=4 stroke darkgray width=2`,
  },

  // ─── INHERITANCE ───────────────────────────────────────────────
  {
    name: 'fill-inheritance',
    category: 'Inheritance',
    description: 'Children inherit fill from parent — explicit fill overrides',
    dsl: `\
objects
  group: fill steelblue at 200,130
    inherits: rect 70x70 radius=6
    overrides: rect 70x70 radius=6 fill red at 90,0`,
  },
  {
    name: 'opacity-inheritance',
    category: 'Inheritance',
    description: 'Opacity inherits like fill — child 0.8 overrides parent 0.5, child without opacity inherits 0.5',
    dsl: `\
objects
  parent: opacity 0.5 at 120,130
    inherits: rect 80x80 radius=8 fill dodgerblue
    overrides: rect 80x80 radius=8 fill dodgerblue opacity 0.8 at 100,0
  reference: rect 80x80 radius=8 fill dodgerblue at 370,130
  l1: text "inherits 0.5" size=10 fill gray at 120,240
  l2: text "overrides to 0.8" size=10 fill gray at 220,240
  l3: text "full opacity" size=10 fill gray at 370,240`,
  },

  // ─── LAYOUT ────────────────────────────────────────────────────
  {
    name: 'flex-row',
    category: 'Layout',
    description: 'Flex row layout — children positioned automatically with gap',
    dsl: `\
objects
  row: rect 400x80 fill darkslategray stroke dimgray width=1 at 200,150
    layout flex row gap=10
    a: rect 80x50 radius=4 fill steelblue
    b: rect 80x50 radius=4 fill limegreen
    c: rect 80x50 radius=4 fill crimson`,
  },
  {
    name: 'flex-grow',
    category: 'Layout',
    description: 'Flex grow — distributes extra space proportionally',
    dsl: `\
objects
  row: rect 400x60 fill darkslategray at 200,150
    layout flex row gap=5
    fixed: rect 60x40 radius=4 fill steelblue
    grows: rect 60x40 radius=4 fill limegreen
      layout grow=1
    fixed2: rect 60x40 radius=4 fill crimson`,
  },
  {
    name: 'slot-animation',
    category: 'Layout',
    description: 'Animate an item between containers using slot — smooth position transition',
    dsl: `\
objects
  left: fill darkslategray stroke steelblue width=1 at 120,150
    layout flex column gap=8 padding=10
  right: fill darkslategray stroke indianred width=1 at 350,150
    layout flex column gap=8 padding=10
  itemA: rect 120x30 radius=4 fill steelblue
    layout slot=left
  itemB: rect 120x30 radius=4 fill limegreen
    layout slot=right
  mover: rect 120x30 radius=4 fill goldenrod
    layout slot=left

animate 4s loop easing=easeInOut
  2 mover.layout.slot: right
  4 mover.layout.slot: left`,
  },

  // ─── Camera ──────────────────────────────────────────────────────
  {
    name: 'camera-target',
    category: 'Camera',
    description: 'Camera targeting coordinates, node IDs, and node+offset',
    dsl: `\
objects
  cam: camera look=(300,200) zoom=1.5
  a: rect 80x80 radius=8 fill deepskyblue at 100,200
  b: rect 80x80 radius=8 fill mediumvioletred at 500,200
  label_a: text "A" size=14 fill gainsboro at 100,200
  label_b: text "B" size=14 fill gainsboro at 500,200

animate 6s loop easing=easeInOut
  1.5 cam.camera.look: a
  3 cam.camera.look: b
  4.5 cam.camera.look: (b,0,-100)
  6 cam.camera.look: (300,200)`,
  },
  {
    name: 'camera-zoom',
    category: 'Camera',
    description: 'Zoom in and out with easing',
    dsl: `\
objects
  cam: camera look=(300,200) zoom=1
  outer: rect 400x300 radius=12 stroke steelblue width=2 at 300,200
  inner: rect 120x80 radius=8 fill mediumseagreen at 300,200
  dot: ellipse 10x10 fill goldenrod at 300,200

animate 4s loop easing=easeInOutCubic
  2 cam.camera.zoom: 4
  4 cam.camera.zoom: 1`,
  },
  {
    name: 'camera-look-fit',
    category: 'Camera',
    description: 'Look with fit — focus on specific nodes or all nodes',
    dsl: `\
objects
  cam: camera look=all
  a: rect 60x60 radius=6 fill crimson at 50,100
  b: rect 60x60 radius=6 fill limegreen at 300,50
  c: rect 60x60 radius=6 fill royalblue at 550,300

animate 8s loop easing=easeInOut
  2 cam.camera.look: (a)
  4 cam.camera.look: (a,b)
  6 cam.camera.look: (c)
  8 cam.camera.look: all`,
  },
  {
    name: 'camera-follow',
    category: 'Camera',
    description: 'Camera tracks a moving object',
    dsl: `\
objects
  cam: camera look=mover zoom=2
  mover: ellipse 15x15 fill goldenrod at 50,200
  track: rect 600x4 radius=2 fill darkslategray at 300,200
  post1: rect 4x30 fill dimgray at 100,200
  post2: rect 4x30 fill dimgray at 300,200
  post3: rect 4x30 fill dimgray at 500,200

animate 4s loop easing=easeInOut
  2 mover.transform.x: 550
  4 mover.transform.x: 50`,
  },
  {
    name: 'camera-ratio',
    category: 'Camera',
    description: 'Animated aspect ratio — zoomed in, panning across objects',
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

animate 8s loop easing=easeInOutCubic
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
    description: 'Rotating camera view with easing',
    dsl: `\
objects
  cam: camera look=(300,200) zoom=1.5 rotation=0
  center: ellipse 20x20 fill gold at 300,200
  n: rect 30x30 radius=4 fill indianred at 300,100
  e: rect 30x30 radius=4 fill yellowgreen at 400,200
  s: rect 30x30 radius=4 fill darkturquoise at 300,300
  w: rect 30x30 radius=4 fill darkorchid at 200,200

animate 6s loop easing=easeInOutCubic
  3 cam.transform.rotation: 180
  6 cam.transform.rotation: 360`,
  },
  {
    name: 'camera-switch',
    category: 'Camera',
    description: 'Switching between multiple cameras (cut transitions)',
    dsl: `\
objects
  cam1: camera look=a zoom=2 active
  cam2: camera look=b zoom=2
  a: rect 80x80 radius=8 fill deepskyblue at 100,200
  b: rect 80x80 radius=8 fill mediumvioletred at 500,200
  la: text "Cam 1" size=10 fill silver at 100,250
  lb: text "Cam 2" size=10 fill silver at 500,250

animate 4s loop
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
    description: 'Cinematic sequence — aggressive zoom, rocking pan, gentle pullback',
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

animate 14s loop
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
  // ─── SHAPE SETS ──────────────────────────────────────────────
  {
    name: 'core-shapes',
    category: 'Shape Sets',
    description: 'Reference grid of all core shape set templates',
    dsl: `\
name "Core Shapes"
background #14161c

objects
  title: text "core" size=20 bold fill slategray at 300,30

  bl: text "box" size=10 fill gray at 80,80
  b: box "Box" 120x60 color=steelblue
    at 80,120

  cl: text "circle" size=10 fill gray at 240,80
  c: circle "Circle" 30 color=mediumseagreen
    at 240,120

  pl: text "pill" size=10 fill gray at 400,80
  p: pill "Status" color=darkorange
    at 400,120

  cdl: text "card" size=10 fill gray at 80,200
  cd: card "Card" 180x100 color=mediumpurple
    at 80,260

  nl: text "note" size=10 fill gray at 280,200
  n: note "Remember"
    at 280,260

  gl: text "group" size=10 fill gray at 80,370
  g: group "Group" 180x100 color=teal
    at 80,420

  al: text "arrow" size=10 fill gray at 340,370
  a_src: rect 40x30 radius=4 fill midnightblue stroke steelblue width=1 at 340,410
  a_dst: rect 40x30 radius=4 fill midnightblue stroke steelblue width=1 at 500,410
  a: arrow from=a_src to=a_dst label="arrow" color=steelblue

  ll: text "line" size=10 fill gray at 340,460
  l_src: rect 40x30 radius=4 fill midnightblue stroke steelblue width=1 at 340,500
  l_dst: rect 40x30 radius=4 fill midnightblue stroke steelblue width=1 at 500,500
  l: line from=l_src to=l_dst color=coral`,
  },
  {
    name: 'state-shapes',
    category: 'Shape Sets',
    description: 'Reference grid of all state shape set templates',
    dsl: `\
name "State Shapes"
background #14161c
use [core, state]

objects
  title: text "state" size=20 bold fill slategray at 300,30

  nl: text "state.node" size=10 fill gray at 100,70
  n: state.node "Idle" color=steelblue
    at 100,110

  n2l: text "state.node (with actions)" size=10 fill gray at 340,70
  n2: state.node "Active" 160x70 entry="startTimer" exit="cleanup" color=mediumseagreen
    at 340,110

  il: text "state.initial" size=10 fill gray at 100,200
  i: state.initial color=whitesmoke
    at 100,230

  fl: text "state.final" size=10 fill gray at 240,200
  f: state.final color=whitesmoke
    at 240,230

  chl: text "state.choice" size=10 fill gray at 380,200
  ch: state.choice color=goldenrod
    at 380,230

  rl: text "state.region" size=10 fill gray at 100,290
  r: state.region "Region A" 400x120 color=slategray
    at 100,330`,
  },
];

export function getV2SampleCategories(): string[] {
  return [...new Set(v2Samples.map(s => s.category))];
}

export function getV2SamplesByCategory(category: string): V2Sample[] {
  return v2Samples.filter(s => s.category === category);
}
