/**
 * The learn track — a curriculum, not a catalogue.
 *
 * Read top to bottom. Lessons 01–13 build one diagram (a client talking to an
 * API and a database) so each step is a diff against the one before it: you
 * hand-compose a box, then watch a template replace it; you learn a template's
 * part names, then animate one. Lessons 14–22 are staged more freely, because
 * layout and camera each want a scene built to show them off.
 *
 * Every lesson declares what it is the first to introduce in `teaches`.
 * `curriculum.test.ts` enforces that those are unique and that the numbering
 * matches array order, so the sequence can't rot into a pile.
 */
import type { V2Sample } from './types';

export const learnSamples: V2Sample[] = [

  // ─── BASICS ────────────────────────────────────────────────────
  {
    name: '01-hello',
    category: 'Basics',
    track: 'learn',
    description: 'One shape. An id, a kind, a size, a colour, a position — that is the whole of a starch line',
    teaches: ['id', 'rect', 'fill', 'at'],
    dsl: `\
client: rect 140x60 fill steelblue at 200,150`,
  },
  {
    name: '02-shapes-and-text',
    category: 'Basics',
    track: 'learn',
    description: 'The other primitives — text and ellipse — plus rounded corners and an outline',
    teaches: ['text', 'ellipse', 'radius', 'stroke', 'text.size'],
    dsl: `\
client: rect 140x60 radius=8 fill steelblue stroke dodgerblue width=2 at 200,150
label: text "Client" size=14 fill whitesmoke at 200,150
status: ellipse 12x12 fill limegreen at 255,128`,
  },
  {
    name: '03-composing',
    category: 'Basics',
    track: 'learn',
    description: 'Three loose shapes become one thing. Indent them under a parent and they move together — child positions are relative to it',
    teaches: ['objects', 'children', 'relative-position'],
    dsl: `\
objects
  client: at 200,150
    client.bg: rect 140x60 radius=8 fill steelblue stroke dodgerblue width=2
    client.label: text "Client" size=14 fill whitesmoke
    client.status: ellipse 12x12 fill limegreen at 55,-22

  hint: text "drag the parent — the label and dot follow" size=11 fill dimgray at 200,240`,
  },
  {
    name: '04-inheritance',
    category: 'Basics',
    track: 'learn',
    description: 'A second node, and a shortcut — set fill on the parent and unstyled children pick it up. Ids are global, so children are named parent.child',
    teaches: ['inheritance'],
    dsl: `\
objects
  client: fill steelblue at 130,150
    client.bg: rect 140x60 radius=8 stroke dodgerblue width=2
    client.label: text "Client" size=14 fill whitesmoke

  api: fill steelblue at 380,150
    api.bg: rect 140x60 radius=8 stroke dodgerblue width=2
    api.label: text "API" size=14 fill whitesmoke
    api.status: ellipse 12x12 fill limegreen at 55,-22

  hint: text "each bg inherits its parent fill; the labels set their own" size=11 fill dimgray at 255,250`,
  },

  // ─── SHAPES ────────────────────────────────────────────────────
  {
    name: '05-templates',
    category: 'Shapes',
    track: 'learn',
    description: 'The same two nodes as lesson 04, in two lines. A template builds the background and label for you',
    teaches: ['templates', 'box', 'template-props'],
    dsl: `\
objects
  client: box "Client" color=steelblue at 130,150
  api: box "API" color=mediumseagreen at 380,150
  db: box "Database" color=goldenrod at 620,150

  hint: text "three lines replace the twelve from lesson 04" size=11 fill dimgray at 380,250`,
  },
  {
    name: '06-template-parts',
    category: 'Shapes',
    track: 'learn',
    description: 'What a template actually built. Each one makes children with predictable names — these are the paths lesson 13 animates',
    teaches: ['template-parts', 'card', 'pill', 'note', 'circle', 'text.align', 'text.mono'],
    dsl: `\
objects
  title: text "every template builds named parts" size=14 bold align=start fill slategray at 60,40

  b: box "Client" color=steelblue at 60,100
  b_parts: text "b.bg   b.label" size=11 mono align=start fill gray at 260,100

  c: card "API" body="routes requests" color=mediumseagreen at 60,190
  c_parts: text "c.bg   c.header   c.divider   c.body" size=11 mono align=start fill gray at 260,190

  p: pill "cache" color=orchid at 60,290
  p_parts: text "p.bg   p.label" size=11 mono align=start fill gray at 260,290

  r: circle "Job" color=goldenrod at 60,370
  r_parts: text "r.shape   r.label" size=11 mono align=start fill gray at 260,370

  n: note "Remember" at 60,460
  n_parts: text "n.bg   n.fold   n.label" size=11 mono align=start fill gray at 260,470

  hint: text "you cannot redeclare a part in the objects block — shape it with the template's own props (color=, body=, maxWidth=)" size=10 align=start fill dimgray at 60,540`,
  },

  // ─── CONNECTIONS ───────────────────────────────────────────────
  {
    name: '07-connections',
    category: 'Connections',
    track: 'learn',
    description: 'Join the nodes up. Connections snap to edges rather than centres, and follow whatever they are attached to',
    teaches: ['arrow', 'line', 'arrow-shorthand', 'gap', 'edge-snapping'],
    dsl: `\
objects
  client: box "Client" color=steelblue at 110,150
  api: box "API" color=mediumseagreen at 380,150
  db: box "Database" color=goldenrod at 650,150

  req: arrow from=client to=api label="request" color=slategray
  qry: arrow from=api to=db label="query" gap=6 color=slategray
  back: db -> client bend=-1.4 gap=6 stroke dimgray width=1

  hint: text "arrow from=/to= and the a -> b shorthand build the same thing" size=11 fill dimgray at 380,250`,
  },
  {
    name: '08-routing',
    category: 'Connections',
    track: 'learn',
    description: 'Three ways to stop a connection running straight through something — bend it, route it through waypoints, or smooth it into a spline',
    teaches: ['bend', 'waypoints', 'corner-radius', 'smooth'],
    dsl: `\
objects
  client: box "Client" color=steelblue at 80,90
  api: box "API" color=mediumseagreen at 500,90
  worker: box "Worker" color=orchid at 80,320
  queue: box "Queue" color=goldenrod at 500,320

  bent: client -> api bend=1.4 gap=6 stroke slategray width=2
  routed: worker -> (290,320) -> (290,400) -> queue radius=16 gap=6 stroke slategray width=2
  splined: client -> (210,210) -> (370,170) -> queue smooth gap=6 stroke orchid width=2

  l1: text "bend=1.4" size=11 mono fill gray at 290,50
  l2: text "smooth through waypoints" size=11 mono fill gray at 330,230
  l3: text "waypoints + radius=16" size=11 mono fill gray at 290,430`,
  },

  // ─── STYLING ───────────────────────────────────────────────────
  {
    name: '09-styles',
    category: 'Styling',
    track: 'learn',
    description: 'Name a set of properties once and apply it with @. A node can still override anything the style set',
    teaches: ['style', 'style-reference', 'style-override'],
    dsl: `\
style service
  fill #16202e
  stroke steelblue width=2

style hot
  fill #2a1420
  stroke crimson width=2

objects
  a: rect 140x60 radius=8 @service at 130,140
  b: rect 140x60 radius=8 @service at 330,140
  c: rect 140x60 radius=8 @hot at 530,140
  d: rect 140x60 radius=8 @service stroke gold width=3 at 330,250

  hint: text "d is @service with its stroke overridden" size=11 fill dimgray at 330,320`,
  },

  // ─── ANIMATION ─────────────────────────────────────────────────
  {
    name: '10-first-animation',
    category: 'Animation',
    track: 'learn',
    description: 'An animate block is a list of times and the values properties should hold by then. Everything in between is interpolated',
    teaches: ['animate', 'loop', 'keyframes', 'opacity'],
    dsl: `\
objects
  client: box "Client" color=steelblue at 130,150
  api: box "API" color=mediumseagreen opacity 0 at 380,150
  db: box "Database" color=goldenrod opacity 0 at 620,150

animate 4 loop
  1 api.opacity: 1
  2 db.opacity: 1
  4
    api.opacity: 0
    db.opacity: 0`,
  },
  {
    name: '11-motion',
    category: 'Animation',
    track: 'learn',
    description: 'Position is animatable like anything else — transform.x and transform.y move a packet along the route',
    teaches: ['transform.x', 'transform.y'],
    dsl: `\
objects
  packet: ellipse 16x16 fill gold at 130,150
  client: box "Client" color=steelblue at 130,230
  api: box "API" color=mediumseagreen at 380,230
  db: box "Database" color=goldenrod at 620,230

animate 4 loop
  1.3 packet.transform.x: 380
  2.6 packet.transform.x: 620
  4 packet.transform.x: 130`,
  },
  {
    name: '12-easing',
    category: 'Animation',
    track: 'learn',
    description: 'Easing shapes the path between keyframes. Set a default on the block, override it per track with { value, easing }',
    teaches: ['easing', 'per-track-easing'],
    dsl: `\
objects
  linearBox: rect 44x44 radius=6 fill slategray at 160,90
  smoothBox: rect 44x44 radius=6 fill steelblue at 160,170
  springBox: rect 44x44 radius=6 fill mediumseagreen at 160,250
  bounceBox: rect 44x44 radius=6 fill goldenrod at 160,330

  l1: text "linear" size=11 mono align=end fill gray at 125,90
  l2: text "easeInOut" size=11 mono align=end fill gray at 125,170
  l3: text "spring" size=11 mono align=end fill gray at 125,250
  l4: text "bounce" size=11 mono align=end fill gray at 125,330

animate 4 loop easing=linear
  2
    linearBox.transform.x: 560
    smoothBox.transform.x: { value: 560, easing: "easeInOut" }
    springBox.transform.x: { value: 560, easing: "spring" }
    bounceBox.transform.x: { value: 560, easing: "bounce" }
  4
    linearBox.transform.x: 160
    smoothBox.transform.x: { value: 160, easing: "easeInOut" }
    springBox.transform.x: { value: 160, easing: "spring" }
    bounceBox.transform.x: { value: 160, easing: "bounce" }`,
  },
  {
    name: '13-animating-parts',
    category: 'Animation',
    track: 'learn',
    description: 'Lesson 06 named the parts, lesson 10 animated a property — put them together and a template lights up from the inside',
    teaches: ['part-animation', 'stroke.color'],
    dsl: `\
objects
  api: card "API" body="routes requests" color=mediumseagreen at 200,150
  db: box "Database" color=goldenrod at 480,150

  hint: text "api.header.fill and db.bg.stroke.color are ordinary track paths" size=11 fill dimgray at 340,270

animate 4 loop easing=easeInOut
  1.5
    api.header.fill: crimson
    db.bg.stroke.color: crimson
  3
    api.header.fill: mediumseagreen
    db.bg.stroke.color: goldenrod`,
  },
  {
    name: '14-staggered-cards',
    category: 'Animation',
    track: 'learn',
    description: 'Rhythm comes from offsetting keyframe times. The same two tracks per card, one second apart, with spring easing',
    teaches: ['stagger'],
    dsl: `\
objects
  ingest: card "Ingest" body="raw events" color=steelblue opacity 0 at 40,120
  parse: card "Parse" body="into records" color=mediumseagreen opacity 0 at 40,120
  store: card "Store" body="time series" color=darkorange opacity 0 at 40,120

animate 5 loop
  1
    ingest.opacity: 1
    ingest.transform.x: { value: 130, easing: "spring" }
  2
    parse.opacity: 1
    parse.transform.x: { value: 330, easing: "spring" }
  3
    store.opacity: 1
    store.transform.x: { value: 530, easing: "spring" }`,
  },

  // ─── LAYOUT ──────────────────────────────────────────────────────
  {
    name: '15-layout-flex',
    category: 'Layout',
    track: 'learn',
    description: 'Stop placing things by hand. A flex parent positions its children — and keeps doing so as the gap and a sibling width animate',
    teaches: ['layout', 'layout.flex', 'layout.gap', 'layout.justify', 'layout.grow'],
    dsl: `\
objects
  row: rect 400x80 fill darkslategray stroke dimgray width=1 layout flex row gap=10 justify=center align=center at 250,60
    a: rect 80x50 radius=4 fill steelblue
    b: rect 80x50 radius=4 fill limegreen
    c: rect 80x50 radius=4 fill crimson

  growRow: rect 400x60 fill darkslategray layout flex row gap=5 at 250,160
    fixed: rect 60x40 radius=4 fill steelblue
    grows: rect 60x40 radius=4 fill limegreen layout grow=1
    fixed2: rect 60x40 radius=4 fill crimson

animate 6 loop easing=easeInOut
  3
    row.layout.gap: 60
    growRow.fixed.rect.w: 180
  6
    row.layout.gap: 10
    growRow.fixed.rect.w: 60`,
  },
  {
    name: '16-layout-grid',
    category: 'Layout',
    track: 'learn',
    description: 'Grid places children in columns. The chart spans two cells, then narrows to one — and the auto-placed sidebar slides across to fill the gap',
    teaches: ['layout.grid', 'layout.columns', 'layout.colSpan', 'layout.padding'],
    dsl: `\
objects
  dashboard: rect 340x240 fill darkslategray stroke dimgray width=1 layout grid columns=3 gap=8 padding=10 align=start at 250,150
    m1: rect 0x60 radius=4 fill steelblue
    m2: rect 0x60 radius=4 fill limegreen
    m3: rect 0x60 radius=4 fill crimson
    chart: rect 0x100 radius=4 fill slategray layout gridCol=1 colSpan=2
    sidebar: rect 0x100 radius=4 fill mediumpurple

animate 6 loop easing=easeInOut
  3 dashboard.chart.layout.colSpan: 1
  6 dashboard.chart.layout.colSpan: 2`,
  },
  {
    name: '17-layout-circular',
    category: 'Layout',
    track: 'learn',
    description: 'Circular rings its children evenly. Animating startAngle advances the whole ring one slot per second, like a carousel',
    teaches: ['layout.circular', 'layout.radius', 'layout.startAngle'],
    dsl: `\
objects
  ring: ellipse 220x220 stroke slategray width=1 layout circular radius=110 startAngle=0 at 250,170
    n1: rect 50x30 radius=4 fill steelblue
    n2: rect 50x30 radius=4 fill coral
    n3: rect 50x30 radius=4 fill seagreen
    n4: rect 50x30 radius=4 fill gold
    n5: rect 50x30 radius=4 fill mediumpurple
    n6: rect 50x30 radius=4 fill tomato

animate 6 loop easing=easeInOut
  1 ring.layout.startAngle: 60
  2 ring.layout.startAngle: 120
  3 ring.layout.startAngle: 180
  4 ring.layout.startAngle: 240
  5 ring.layout.startAngle: 300
  6 ring.layout.startAngle: 360`,
  },
  {
    name: '18-layout-slots',
    category: 'Layout',
    track: 'learn',
    description: 'A slot says which container a node belongs to. Animate the slot and the node moves between containers, both sides reflowing around it',
    teaches: ['layout.slot'],
    dsl: `\
objects
  left: fill darkslategray stroke steelblue width=1 layout flex column gap=8 padding=10 at 120,300
  right: fill darkslategray stroke indianred width=1 layout flex column gap=8 padding=10 at 380,300
  itemA: rect 120x30 radius=4 fill steelblue layout slot=left
  itemB: rect 120x30 radius=4 fill limegreen layout slot=right
  mover: rect 120x30 radius=4 fill goldenrod layout slot=left

animate 4 loop easing=easeInOut
  2 mover.layout.slot: right
  4 mover.layout.slot: left`,
  },

  // ─── CAMERA ──────────────────────────────────────────────────────
  {
    name: '19-camera-basics',
    category: 'Camera',
    track: 'learn',
    description: 'A camera decides what the viewport shows. Point it at coordinates or at a node id, and animate the zoom',
    teaches: ['camera', 'camera.look', 'camera.zoom'],
    dsl: `\
objects
  cam: camera look=(300,200) zoom=1
  outer: rect 400x300 radius=12 stroke steelblue width=2 at 300,200
  a: rect 80x80 radius=8 fill deepskyblue at 160,200
  b: rect 80x80 radius=8 fill mediumvioletred at 440,200
  dot: ellipse 12x12 fill goldenrod at 300,200

animate 8 loop easing=easeInOutCubic
  2 cam.camera.zoom: 3
  4
    cam.camera.look: a
    cam.camera.zoom: 3
  6
    cam.camera.look: b
    cam.camera.zoom: 3
  8
    cam.camera.look: (300,200)
    cam.camera.zoom: 1`,
  },
  {
    name: '20-camera-look-fit',
    category: 'Camera',
    track: 'learn',
    description: 'Give look a set of nodes instead of a point and the camera frames them — including "all", which fits the whole scene',
    teaches: ['camera.fit'],
    dsl: `\
objects
  cam: camera look=all
  a: rect 60x60 radius=6 fill crimson at 50,100
  b: rect 60x60 radius=6 fill limegreen at 300,50
  c: rect 60x60 radius=6 fill royalblue at 550,300

animate 8 loop easing=easeInOut
  2 cam.camera.look: (a)
  4 cam.camera.look: (a,b)
  6 cam.camera.look: (c)
  8 cam.camera.look: all`,
  },
  {
    name: '21-camera-follow',
    category: 'Camera',
    track: 'learn',
    description: 'Point look at a node that is itself animating and the camera tracks it — the scene moves past a stationary subject',
    teaches: ['camera-follow'],
    dsl: `\
objects
  cam: camera look=mover zoom=2
  mover: ellipse 15x15 fill goldenrod at 50,200
  track: rect 600x4 radius=2 fill darkslategray at 300,200
  post1: rect 4x30 fill dimgray at 100,200
  post2: rect 4x30 fill dimgray at 300,200
  post3: rect 4x30 fill dimgray at 500,200

animate 4 loop easing=easeInOut
  2 mover.transform.x: 550
  4 mover.transform.x: 50`,
  },

  // ─── SHOWCASE ────────────────────────────────────────────────────
  {
    name: '22-request-flow',
    category: 'Showcase',
    track: 'learn',
    description: 'Everything so far in one scene — templates, connections, staggered fades and easing. This is the diagram the curriculum was building towards',
    teaches: [],
    dsl: `\
objects
  client: box "Client" color=#22d3ee at 90,120
  api: box "API" color=#34d399 opacity 0 at 330,120
  db: box "Database" color=#fbbf24 opacity 0 at 570,120
  cache: box "Cache" color=#f472b6 opacity 0 at 330,270

  req: arrow from=client to=api label="request" color=#7d8590 opacity 0
  q: arrow from=api to=db label="query" color=#7d8590 opacity 0
  hit: arrow from=api to=cache label="hot path" color=#7d8590 opacity 0

animate 7 loop easing=easeInOut
  0.9
    api.opacity: 1
    req.opacity: 1
  1.8
    db.opacity: 1
    q.opacity: 1
  2.7
    cache.opacity: 1
    hit.opacity: 1`,
  },
];
