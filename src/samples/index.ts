/**
 * V2 Samples — showcase of the compositional object model.
 * All samples use raw node format — explicit HSL colors, no templates, no shortcuts.
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

function buildEasingSample(): V2Sample {
  const startX = 120;
  const endX = 500;
  const spacing = 22;
  const startY = 30;

  const objects = ALL_EASINGS.flatMap((name, i) => {
    const y = startY + i * spacing;
    const hue = Math.round((i / ALL_EASINGS.length) * 360);
    return [
      `{ id: "${name}", rect: { w: 16, h: 16, radius: 3 }, fill: { h: ${hue}, s: 70, l: 50 }, transform: { x: ${startX}, y: ${y} } }`,
      `{ id: "l_${name}", text: { content: "${name}", size: 9, align: "end" }, fill: { h: 0, s: 0, l: 45 }, transform: { x: ${startX - 10}, y: ${y} } }`,
    ];
  });

  const resetChanges = ALL_EASINGS.map(name => `"${name}.transform.x": ${startX}`).join(', ');
  const moveChanges = ALL_EASINGS.map(name => `"${name}.transform.x": { value: ${endX}, easing: "${name}" }`).join(',\n        ');

  return {
    name: 'easing-comparison',
    category: 'Animation',
    description: `All ${ALL_EASINGS.length} easing functions compared side by side`,
    dsl: `{
  objects: [
    ${objects.join(',\n    ')}
  ],
  animate: {
    duration: 3,
    loop: true,
    keyframes: [
      { time: 0, changes: { ${resetChanges} } },
      { time: 1.5, changes: {
        ${moveChanges}
      }},
      { time: 3, changes: { ${resetChanges} } }
    ]
  }
}`,
  };
}

export const v2Samples: V2Sample[] = [

  // ─── PRIMITIVES ────────────────────────────────────────────────
  {
    name: 'rect',
    category: 'Primitives',
    description: 'Rectangle with fill, stroke, and rounded corners',
    dsl: `{
  objects: [
    {
      id: "box",
      rect: { w: 140, h: 80, radius: 8 },
      fill: { h: 210, s: 70, l: 45 },
      stroke: { color: { h: 210, s: 80, l: 30 }, width: 2 },
      transform: { x: 200, y: 150 }
    }
  ]
}`,
  },
  {
    name: 'ellipse',
    category: 'Primitives',
    description: 'Ellipse with separate radii',
    dsl: `{
  objects: [
    {
      id: "circle",
      ellipse: { rx: 50, ry: 50 },
      fill: { h: 120, s: 60, l: 40 },
      stroke: { color: { h: 120, s: 70, l: 30 }, width: 2 },
      transform: { x: 200, y: 150 }
    },
    {
      id: "oval",
      ellipse: { rx: 70, ry: 35 },
      fill: { h: 30, s: 80, l: 50 },
      stroke: { color: { h: 30, s: 90, l: 35 }, width: 2 },
      transform: { x: 400, y: 150 }
    }
  ]
}`,
  },
  {
    name: 'text',
    category: 'Primitives',
    description: 'Text node with size, bold, and alignment',
    dsl: `{
  objects: [
    { id: "title", text: { content: "Hello World", size: 24, bold: true }, fill: { h: 0, s: 0, l: 95 }, transform: { x: 200, y: 100 } },
    { id: "subtitle", text: { content: "A subtitle in monospace", size: 14, mono: true }, fill: { h: 0, s: 0, l: 60 }, transform: { x: 200, y: 140 } }
  ]
}`,
  },
  {
    name: 'path',
    category: 'Primitives',
    description: 'Path from a list of points — open or closed',
    dsl: `{
  objects: [
    {
      id: "triangle",
      path: { points: [[0, -40], [40, 30], [-40, 30]], closed: true },
      fill: { h: 280, s: 60, l: 45 },
      stroke: { color: { h: 280, s: 70, l: 30 }, width: 2 },
      transform: { x: 150, y: 150 }
    },
    {
      id: "zigzag",
      path: { points: [[0, 0], [30, -30], [60, 0], [90, -30], [120, 0]], closed: false },
      stroke: { color: { h: 40, s: 90, l: 50 }, width: 2 },
      transform: { x: 280, y: 150 }
    }
  ]
}`,
  },
  {
    name: 'dash-patterns',
    category: 'Primitives',
    description: 'Dash patterns on paths — solid, dashed, dotted',
    dsl: `{
  objects: [
    { id: "solid", path: { points: [[0, 0], [250, 0]] }, stroke: { color: { h: 0, s: 0, l: 70 }, width: 2 }, transform: { x: 100, y: 100 } },
    { id: "dashed", path: { points: [[0, 0], [250, 0]] }, stroke: { color: { h: 0, s: 0, l: 70 }, width: 2 }, dash: { pattern: "dashed", length: 10, gap: 5 }, transform: { x: 100, y: 140 } },
    { id: "dotted", path: { points: [[0, 0], [250, 0]] }, stroke: { color: { h: 0, s: 0, l: 70 }, width: 2 }, dash: { pattern: "dotted", length: 2, gap: 6 }, transform: { x: 100, y: 180 } },
    { id: "l1", text: { content: "solid", size: 11 }, fill: { h: 0, s: 0, l: 50 }, transform: { x: 50, y: 100 } },
    { id: "l2", text: { content: "dashed", size: 11 }, fill: { h: 0, s: 0, l: 50 }, transform: { x: 42, y: 140 } },
    { id: "l3", text: { content: "dotted", size: 11 }, fill: { h: 0, s: 0, l: 50 }, transform: { x: 42, y: 180 } }
  ]
}`,
  },

  // ─── COMPOSITION ───────────────────────────────────────────────
  {
    name: 'box-composition',
    category: 'Composition',
    description: 'A "box" is a parent node with a rect background and a text label as children',
    dsl: `{
  objects: [
    {
      id: "mybox",
      transform: { x: 200, y: 150 },
      children: [
        { id: "bg", rect: { w: 160, h: 70, radius: 8 }, fill: { h: 210, s: 50, l: 20 }, stroke: { color: { h: 210, s: 70, l: 50 }, width: 2 } },
        { id: "label", text: { content: "Composed Box", size: 14, align: "middle" }, fill: { h: 0, s: 0, l: 90 } }
      ]
    }
  ]
}`,
  },
  {
    name: 'line-composition',
    category: 'Composition',
    description: 'Two boxes connected by a path — the line and its label are children of a group node',
    dsl: `{
  objects: [
    {
      id: "a",
      transform: { x: 100, y: 150 },
      children: [
        { id: "a.bg", rect: { w: 100, h: 50, radius: 6 }, fill: { h: 210, s: 50, l: 20 }, stroke: { color: { h: 210, s: 70, l: 50 }, width: 2 } },
        { id: "a.label", text: { content: "Source", size: 12, align: "middle" }, fill: { h: 0, s: 0, l: 90 } }
      ]
    },
    {
      id: "b",
      transform: { x: 400, y: 150 },
      children: [
        { id: "b.bg", rect: { w: 100, h: 50, radius: 6 }, fill: { h: 0, s: 50, l: 20 }, stroke: { color: { h: 0, s: 70, l: 50 }, width: 2 } },
        { id: "b.label", text: { content: "Target", size: 12, align: "middle" }, fill: { h: 0, s: 0, l: 90 } }
      ]
    },
    { id: "line", path: { route: ["a", "b"] }, stroke: { color: { h: 0, s: 0, l: 60 }, width: 2 } },
    { id: "lineLabel", text: { content: "sends data", size: 11 }, fill: { h: 0, s: 0, l: 60 }, transform: { x: 250, y: 130 } }
  ]
}`,
  },
  {
    name: 'nested-children',
    category: 'Composition',
    description: 'Deep nesting — every leaf property is animatable via dot-notation',
    dsl: `{
  objects: [
    {
      id: "card",
      transform: { x: 200, y: 150 },
      children: [
        { id: "bg", rect: { w: 160, h: 100, radius: 6 }, fill: { h: 210, s: 50, l: 18 }, stroke: { color: { h: 210, s: 70, l: 45 }, width: 2 } },
        { id: "title", text: { content: "Card Title", size: 14, bold: true }, fill: { h: 0, s: 0, l: 90 }, transform: { y: -20 } },
        { id: "badge", ellipse: { rx: 8, ry: 8 }, fill: { h: 120, s: 70, l: 45 }, transform: { x: 55, y: -30 } },
        { id: "body", text: { content: "Some description text", size: 11 }, fill: { h: 0, s: 0, l: 60 }, transform: { y: 15 } }
      ]
    }
  ],
  animate: {
    duration: 3,
    loop: true,
    keyframes: [
      { time: 0, changes: { "card.bg.fill": { h: 210, s: 50, l: 18 }, "card.badge.fill": { h: 120, s: 70, l: 45 } } },
      { time: 1.5, changes: { "card.bg.fill": { h: 0, s: 50, l: 18 }, "card.badge.fill": { h: 0, s: 70, l: 45 } } },
      { time: 3, changes: { "card.bg.fill": { h: 210, s: 50, l: 18 }, "card.badge.fill": { h: 120, s: 70, l: 45 } } }
    ]
  }
}`,
  },

  // ─── COLORS ────────────────────────────────────────────────────
  {
    name: 'hsl-colors',
    category: 'Colors',
    description: 'Colors are HSL objects — hue (0-360), saturation (0-100), lightness (0-100)',
    dsl: `{
  objects: [
    { id: "red", rect: { w: 60, h: 60, radius: 4 }, fill: { h: 0, s: 100, l: 50 }, transform: { x: 100, y: 150 } },
    { id: "green", rect: { w: 60, h: 60, radius: 4 }, fill: { h: 120, s: 70, l: 45 }, transform: { x: 180, y: 150 } },
    { id: "blue", rect: { w: 60, h: 60, radius: 4 }, fill: { h: 210, s: 100, l: 50 }, transform: { x: 260, y: 150 } },
    { id: "yellow", rect: { w: 60, h: 60, radius: 4 }, fill: { h: 50, s: 100, l: 50 }, transform: { x: 340, y: 150 } },
    { id: "purple", rect: { w: 60, h: 60, radius: 4 }, fill: { h: 280, s: 70, l: 50 }, transform: { x: 420, y: 150 } }
  ]
}`,
  },
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
  0 a.fill: red
  0 b.fill: #3366ff
  0 c.fill: rgb 60 200 80
  0 d.fill: hsl 60 80 50

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
    dsl: `{
  objects: [
    { id: "box", rect: { w: 100, h: 80, radius: 8 }, fill: { h: 350, s: 90, l: 50 }, transform: { x: 200, y: 150 } },
    { id: "label", text: { content: "350 → 10 (short arc)", size: 11 }, fill: { h: 0, s: 0, l: 60 }, transform: { x: 200, y: 210 } }
  ],
  animate: {
    duration: 3,
    loop: true,
    keyframes: [
      { time: 0, changes: { "box.fill": { h: 350, s: 90, l: 50 } } },
      { time: 1.5, changes: { "box.fill": { h: 10, s: 90, l: 50 } } },
      { time: 3, changes: { "box.fill": { h: 350, s: 90, l: 50 } } }
    ]
  }
}`,
  },

  // ─── STYLES ────────────────────────────────────────────────────
  {
    name: 'named-styles',
    category: 'Styles',
    description: 'Define reusable styles — node properties override style defaults',
    dsl: `{
  styles: {
    primary: { fill: { h: 210, s: 70, l: 45 }, stroke: { color: { h: 210, s: 80, l: 30 }, width: 2 } },
    danger: { fill: { h: 0, s: 80, l: 45 }, stroke: { color: { h: 0, s: 90, l: 30 }, width: 2 } }
  },
  objects: [
    { id: "a", rect: { w: 100, h: 60, radius: 6 }, style: "primary", transform: { x: 100, y: 150 } },
    { id: "b", rect: { w: 100, h: 60, radius: 6 }, style: "danger", transform: { x: 230, y: 150 } },
    { id: "c", rect: { w: 100, h: 60, radius: 6 }, style: "primary", fill: { h: 120, s: 70, l: 45 }, transform: { x: 360, y: 150 } }
  ]
}`,
  },
  {
    name: 'style-animation',
    category: 'Styles',
    description: 'Animate a style — all nodes using it change together',
    dsl: `{
  styles: {
    theme: { fill: { h: 210, s: 70, l: 45 } }
  },
  objects: [
    { id: "a", rect: { w: 80, h: 80, radius: 8 }, style: "theme", transform: { x: 120, y: 140 } },
    { id: "b", rect: { w: 80, h: 80, radius: 8 }, style: "theme", transform: { x: 230, y: 140 } },
    { id: "c", rect: { w: 80, h: 80, radius: 8 }, style: "theme", transform: { x: 340, y: 140 } }
  ],
  animate: {
    duration: 4,
    loop: true,
    keyframes: [
      { time: 0, changes: { "theme.fill": { h: 210, s: 70, l: 45 } } },
      { time: 2, changes: { "theme.fill": { h: 0, s: 70, l: 45 } } },
      { time: 4, changes: { "theme.fill": { h: 210, s: 70, l: 45 } } }
    ]
  }
}`,
  },

  // ─── ANIMATION ─────────────────────────────────────────────────
  buildEasingSample(),
  {
    name: 'position-animation',
    category: 'Animation',
    description: 'Animate position — a box moves across the canvas',
    dsl: `{
  objects: [
    { id: "mover", rect: { w: 50, h: 50, radius: 25 }, fill: { h: 280, s: 70, l: 50 }, transform: { x: 100, y: 150 } }
  ],
  animate: {
    duration: 4,
    loop: true,
    easing: "easeInOut",
    keyframes: [
      { time: 0, changes: { "mover.transform.x": 100, "mover.transform.y": 150 } },
      { time: 1, changes: { "mover.transform.x": 400, "mover.transform.y": 100 } },
      { time: 2, changes: { "mover.transform.x": 400, "mover.transform.y": 250 } },
      { time: 3, changes: { "mover.transform.x": 100, "mover.transform.y": 250 } },
      { time: 4, changes: { "mover.transform.x": 100, "mover.transform.y": 150 } }
    ]
  }
}`,
  },
  {
    name: 'opacity-animation',
    category: 'Animation',
    description: 'Animate opacity — fade in and out',
    dsl: `{
  objects: [
    { id: "box", rect: { w: 100, h: 100, radius: 8 }, fill: { h: 210, s: 70, l: 50 }, opacity: 0, transform: { x: 200, y: 140 } }
  ],
  animate: {
    duration: 3,
    loop: true,
    keyframes: [
      { time: 0, changes: { "box.opacity": 0 } },
      { time: 1.5, changes: { "box.opacity": 1 } },
      { time: 3, changes: { "box.opacity": 0 } }
    ]
  }
}`,
  },

  // ─── CONNECTIONS ───────────────────────────────────────────────
  {
    name: 'edge-snapping',
    category: 'Connections',
    description: 'Lines snap to object edges, not centers — with gap spacing',
    dsl: `{
  objects: [
    { id: "a", rect: { w: 80, h: 50, radius: 6 }, fill: { h: 210, s: 60, l: 35 }, stroke: { color: { h: 210, s: 70, l: 50 }, width: 2 }, transform: { x: 100, y: 150 } },
    { id: "b", rect: { w: 80, h: 50, radius: 6 }, fill: { h: 120, s: 60, l: 35 }, stroke: { color: { h: 120, s: 70, l: 50 }, width: 2 }, transform: { x: 380, y: 150 } },
    { id: "line", path: { route: ["a", "b"], gap: 4 }, stroke: { color: { h: 0, s: 0, l: 60 }, width: 2 } }
  ]
}`,
  },
  {
    name: 'arrow',
    category: 'Connections',
    description: 'Arrow template — smart connection with arrowhead and label',
    dsl: `{
  objects: [
    {
      id: "a", transform: { x: 100, y: 150 },
      children: [
        { id: "a.bg", rect: { w: 100, h: 50, radius: 6 }, fill: { h: 210, s: 50, l: 20 }, stroke: { color: { h: 210, s: 70, l: 50 }, width: 2 } },
        { id: "a.label", text: { content: "Source", size: 12 }, fill: { h: 0, s: 0, l: 90 } }
      ]
    },
    {
      id: "b", transform: { x: 400, y: 150 },
      children: [
        { id: "b.bg", rect: { w: 100, h: 50, radius: 6 }, fill: { h: 0, s: 50, l: 20 }, stroke: { color: { h: 0, s: 70, l: 50 }, width: 2 } },
        { id: "b.label", text: { content: "Target", size: 12 }, fill: { h: 0, s: 0, l: 90 } }
      ]
    },
    { template: "arrow", id: "conn", props: { from: "a", to: "b", label: "sends data", colour: { h: 0, s: 0, l: 60 } } }
  ]
}`,
  },
  {
    name: 'smooth-bend',
    category: 'Connections',
    description: 'Smooth quadratic bend — animate the curve amount',
    dsl: `{
  objects: [
    { id: "a", rect: { w: 60, h: 40, radius: 6 }, fill: { h: 210, s: 60, l: 35 }, stroke: { color: { h: 210, s: 70, l: 50 }, width: 2 }, transform: { x: 120, y: 150 } },
    { id: "b", rect: { w: 60, h: 40, radius: 6 }, fill: { h: 0, s: 60, l: 35 }, stroke: { color: { h: 0, s: 70, l: 50 }, width: 2 }, transform: { x: 380, y: 150 } },
    { id: "line", path: { route: ["a", "b"], bend: 0, gap: 4 }, stroke: { color: { h: 0, s: 0, l: 60 }, width: 2 } }
  ],
  animate: {
    duration: 4,
    loop: true,
    keyframes: [
      { time: 0, changes: { "line.path.bend": 0 } },
      { time: 1, changes: { "line.path.bend": 1.5 } },
      { time: 2, changes: { "line.path.bend": 0 } },
      { time: 3, changes: { "line.path.bend": -1.5 } },
      { time: 4, changes: { "line.path.bend": 0 } }
    ]
  }
}`,
  },
  {
    name: 'smooth-spline',
    category: 'Connections',
    description: 'Smooth Catmull-Rom spline through waypoints',
    dsl: `{
  objects: [
    { id: "a", ellipse: { rx: 20, ry: 20 }, fill: { h: 210, s: 60, l: 45 }, transform: { x: 80, y: 150 } },
    { id: "b", ellipse: { rx: 20, ry: 20 }, fill: { h: 0, s: 60, l: 45 }, transform: { x: 420, y: 150 } },
    { id: "line", path: { route: ["a", [180, 80], [250, 220], [340, 80], "b"], smooth: true, gap: 4 }, stroke: { color: { h: 120, s: 60, l: 50 }, width: 2 } }
  ]
}`,
  },
  {
    name: 'routed-polyline',
    category: 'Connections',
    description: 'Polyline routed through waypoints with rounded corners',
    dsl: `{
  objects: [
    { id: "a", rect: { w: 60, h: 40, radius: 4 }, fill: { h: 210, s: 60, l: 35 }, stroke: { color: { h: 210, s: 70, l: 50 }, width: 2 }, transform: { x: 80, y: 100 } },
    { id: "b", rect: { w: 60, h: 40, radius: 4 }, fill: { h: 0, s: 60, l: 35 }, stroke: { color: { h: 0, s: 70, l: 50 }, width: 2 }, transform: { x: 420, y: 200 } },
    { id: "line", path: { route: ["a", [250, 100], [250, 200], "b"], smooth: false, radius: 15, gap: 4 }, stroke: { color: { h: 0, s: 0, l: 60 }, width: 2 } }
  ]
}`,
  },

  // ─── INHERITANCE ───────────────────────────────────────────────
  {
    name: 'fill-inheritance',
    category: 'Inheritance',
    description: 'Children inherit fill from parent — explicit fill overrides',
    dsl: `{
  objects: [
    {
      id: "group",
      fill: { h: 210, s: 70, l: 45 },
      transform: { x: 200, y: 130 },
      children: [
        { id: "inherits", rect: { w: 70, h: 70, radius: 6 } },
        { id: "overrides", rect: { w: 70, h: 70, radius: 6 }, fill: { h: 0, s: 80, l: 50 }, transform: { x: 90, y: 0 } }
      ]
    }
  ]
}`,
  },
  {
    name: 'opacity-inheritance',
    category: 'Inheritance',
    description: 'Opacity inherits like fill — child 0.8 overrides parent 0.5, child without opacity inherits 0.5',
    dsl: `{
  objects: [
    {
      id: "parent",
      opacity: 0.5,
      transform: { x: 120, y: 130 },
      children: [
        {
          id: "inherits",
          rect: { w: 80, h: 80, radius: 8 },
          fill: { h: 210, s: 70, l: 50 }
        },
        {
          id: "overrides",
          rect: { w: 80, h: 80, radius: 8 },
          fill: { h: 210, s: 70, l: 50 },
          opacity: 0.8,
          transform: { x: 100, y: 0 }
        }
      ]
    },
    { id: "reference", rect: { w: 80, h: 80, radius: 8 }, fill: { h: 210, s: 70, l: 50 }, transform: { x: 370, y: 130 } },
    { id: "l1", text: { content: "inherits 0.5", size: 10 }, fill: { h: 0, s: 0, l: 50 }, transform: { x: 120, y: 240 } },
    { id: "l2", text: { content: "overrides to 0.8", size: 10 }, fill: { h: 0, s: 0, l: 50 }, transform: { x: 220, y: 240 } },
    { id: "l3", text: { content: "full opacity", size: 10 }, fill: { h: 0, s: 0, l: 50 }, transform: { x: 370, y: 240 } }
  ]
}`,
  },

  // ─── LAYOUT ────────────────────────────────────────────────────
  {
    name: 'flex-row',
    category: 'Layout',
    description: 'Flex row layout — children positioned automatically with gap',
    dsl: `{
  objects: [
    {
      id: "row",
      rect: { w: 400, h: 80 },
      fill: { h: 0, s: 0, l: 12 },
      stroke: { color: { h: 0, s: 0, l: 25 }, width: 1 },
      layout: { type: "flex", direction: "row", gap: 10 },
      transform: { x: 200, y: 150 },
      children: [
        { id: "a", rect: { w: 80, h: 50, radius: 4 }, fill: { h: 210, s: 70, l: 45 } },
        { id: "b", rect: { w: 80, h: 50, radius: 4 }, fill: { h: 120, s: 70, l: 45 } },
        { id: "c", rect: { w: 80, h: 50, radius: 4 }, fill: { h: 0, s: 70, l: 45 } }
      ]
    }
  ]
}`,
  },
  {
    name: 'flex-grow',
    category: 'Layout',
    description: 'Flex grow — distributes extra space proportionally',
    dsl: `{
  objects: [
    {
      id: "row",
      rect: { w: 400, h: 60 },
      fill: { h: 0, s: 0, l: 12 },
      layout: { type: "flex", direction: "row", gap: 5 },
      transform: { x: 200, y: 150 },
      children: [
        { id: "fixed", rect: { w: 60, h: 40, radius: 4 }, fill: { h: 210, s: 70, l: 45 } },
        { id: "grows", rect: { w: 60, h: 40, radius: 4 }, fill: { h: 120, s: 70, l: 45 }, layout: { grow: 1 } },
        { id: "fixed2", rect: { w: 60, h: 40, radius: 4 }, fill: { h: 0, s: 70, l: 45 } }
      ]
    }
  ]
}`,
  },
  {
    name: 'slot-animation',
    category: 'Layout',
    description: 'Animate an item between containers using slot — smooth position transition',
    dsl: `{
  objects: [
    {
      id: "left",
      fill: { h: 210, s: 30, l: 15 },
      stroke: { color: { h: 210, s: 50, l: 40 }, width: 1 },
      layout: { type: "flex", direction: "column", gap: 8, padding: 10 },
      transform: { x: 120, y: 150 }
    },
    {
      id: "right",
      fill: { h: 0, s: 30, l: 15 },
      stroke: { color: { h: 0, s: 50, l: 40 }, width: 1 },
      layout: { type: "flex", direction: "column", gap: 8, padding: 10 },
      transform: { x: 350, y: 150 }
    },
    { id: "itemA", rect: { w: 120, h: 30, radius: 4 }, fill: { h: 210, s: 60, l: 45 }, layout: { slot: "left" } },
    { id: "itemB", rect: { w: 120, h: 30, radius: 4 }, fill: { h: 120, s: 60, l: 45 }, layout: { slot: "right" } },
    { id: "mover", rect: { w: 120, h: 30, radius: 4 }, fill: { h: 40, s: 80, l: 50 }, layout: { slot: "left" } }
  ],
  animate: {
    duration: 4,
    loop: true,
    easing: "easeInOut",
    keyframes: [
      { time: 0, changes: { "mover.layout.slot": "left" } },
      { time: 2, changes: { "mover.layout.slot": "right" } },
      { time: 4, changes: { "mover.layout.slot": "left" } }
    ]
  }
}`,
  },

  // ─── Camera ──────────────────────────────────────────────────────
  {
    name: 'camera-target',
    category: 'Camera',
    description: 'Camera targeting coordinates, node IDs, and node+offset',
    dsl: `{
  objects: [
    { id: "cam", camera: { look: [300, 200], zoom: 1.5 } },
    { id: "a", rect: { w: 80, h: 80, radius: 8 }, fill: { h: 200, s: 70, l: 50 }, transform: { x: 100, y: 200 } },
    { id: "b", rect: { w: 80, h: 80, radius: 8 }, fill: { h: 340, s: 70, l: 50 }, transform: { x: 500, y: 200 } },
    { id: "label_a", text: { content: "A", size: 14 }, fill: { h: 0, s: 0, l: 90 }, transform: { x: 100, y: 200 } },
    { id: "label_b", text: { content: "B", size: 14 }, fill: { h: 0, s: 0, l: 90 }, transform: { x: 500, y: 200 } }
  ],
  animate: {
    duration: 6,
    loop: true,
    easing: "easeInOut",
    keyframes: [
      { time: 0, changes: { "cam.camera.look": [300, 200] } },
      { time: 1.5, changes: { "cam.camera.look": "a" } },
      { time: 3, changes: { "cam.camera.look": "b" } },
      { time: 4.5, changes: { "cam.camera.look": ["b", 0, -100] } },
      { time: 6, changes: { "cam.camera.look": [300, 200] } }
    ]
  }
}`,
  },
  {
    name: 'camera-zoom',
    category: 'Camera',
    description: 'Zoom in and out with easing',
    dsl: `{
  objects: [
    { id: "cam", camera: { look: [300, 200], zoom: 1 } },
    { id: "outer", rect: { w: 400, h: 300, radius: 12 }, stroke: { color: { h: 210, s: 50, l: 40 }, width: 2 }, transform: { x: 300, y: 200 } },
    { id: "inner", rect: { w: 120, h: 80, radius: 8 }, fill: { h: 160, s: 60, l: 45 }, transform: { x: 300, y: 200 } },
    { id: "dot", ellipse: { rx: 10, ry: 10 }, fill: { h: 40, s: 80, l: 55 }, transform: { x: 300, y: 200 } }
  ],
  animate: {
    duration: 4,
    loop: true,
    easing: "easeInOutCubic",
    keyframes: [
      { time: 0, changes: { "cam.camera.zoom": 1 } },
      { time: 2, changes: { "cam.camera.zoom": 4 } },
      { time: 4, changes: { "cam.camera.zoom": 1 } }
    ]
  }
}`,
  },
  {
    name: 'camera-look-fit',
    category: 'Camera',
    description: 'Look with fit — focus on specific nodes or all nodes',
    dsl: `{
  objects: [
    { id: "cam", camera: { look: "all" } },
    { id: "a", rect: { w: 60, h: 60, radius: 6 }, fill: { h: 0, s: 65, l: 50 }, transform: { x: 50, y: 100 } },
    { id: "b", rect: { w: 60, h: 60, radius: 6 }, fill: { h: 120, s: 65, l: 45 }, transform: { x: 300, y: 50 } },
    { id: "c", rect: { w: 60, h: 60, radius: 6 }, fill: { h: 240, s: 65, l: 50 }, transform: { x: 550, y: 300 } }
  ],
  animate: {
    duration: 8,
    loop: true,
    easing: "easeInOut",
    keyframes: [
      { time: 0, changes: { "cam.camera.look": "all" } },
      { time: 2, changes: { "cam.camera.look": ["a"] } },
      { time: 4, changes: { "cam.camera.look": ["a", "b"] } },
      { time: 6, changes: { "cam.camera.look": ["c"] } },
      { time: 8, changes: { "cam.camera.look": "all" } }
    ]
  }
}`,
  },
  {
    name: 'camera-follow',
    category: 'Camera',
    description: 'Camera tracks a moving object',
    dsl: `{
  objects: [
    { id: "cam", camera: { look: "mover", zoom: 2 } },
    { id: "mover", ellipse: { rx: 15, ry: 15 }, fill: { h: 40, s: 80, l: 55 }, transform: { x: 50, y: 200 } },
    { id: "track", rect: { w: 600, h: 4, radius: 2 }, fill: { h: 0, s: 0, l: 20 }, transform: { x: 300, y: 200 } },
    { id: "post1", rect: { w: 4, h: 30 }, fill: { h: 0, s: 0, l: 25 }, transform: { x: 100, y: 200 } },
    { id: "post2", rect: { w: 4, h: 30 }, fill: { h: 0, s: 0, l: 25 }, transform: { x: 300, y: 200 } },
    { id: "post3", rect: { w: 4, h: 30 }, fill: { h: 0, s: 0, l: 25 }, transform: { x: 500, y: 200 } }
  ],
  animate: {
    duration: 4,
    loop: true,
    easing: "easeInOut",
    keyframes: [
      { time: 0, changes: { "mover.transform.x": 50 } },
      { time: 2, changes: { "mover.transform.x": 550 } },
      { time: 4, changes: { "mover.transform.x": 50 } }
    ]
  }
}`,
  },
  {
    name: 'camera-ratio',
    category: 'Camera',
    description: 'Animated aspect ratio — zoomed in, panning across objects',
    dsl: `{
  objects: [
    { id: "cam", camera: { look: [100, 200], zoom: 3, ratio: 1.78 } },
    { id: "a", rect: { w: 80, h: 80, radius: 6 }, fill: { h: 210, s: 60, l: 50 }, transform: { x: 100, y: 60 } },
    { id: "b", rect: { w: 80, h: 80, radius: 6 }, fill: { h: 150, s: 60, l: 45 }, transform: { x: 300, y: 60 } },
    { id: "c", rect: { w: 80, h: 80, radius: 6 }, fill: { h: 30, s: 70, l: 50 }, transform: { x: 500, y: 60 } },
    { id: "d", rect: { w: 80, h: 80, radius: 6 }, fill: { h: 340, s: 60, l: 50 }, transform: { x: 100, y: 200 } },
    { id: "e", rect: { w: 80, h: 80, radius: 6 }, fill: { h: 270, s: 50, l: 55 }, transform: { x: 300, y: 200 } },
    { id: "hint-bg", rect: { w: 220, h: 24, radius: 4 }, fill: { h: 0, s: 0, l: 10, a: 0.7 }, transform: { x: 300, y: 200 } },
    { id: "hint", text: { content: "Click Viewport button to preview ratio", size: 10, align: "middle" }, fill: { h: 0, s: 0, l: 95 }, transform: { x: 300, y: 200 } },
    { id: "f", rect: { w: 80, h: 80, radius: 6 }, fill: { h: 60, s: 65, l: 50 }, transform: { x: 500, y: 200 } },
    { id: "g", rect: { w: 80, h: 80, radius: 6 }, fill: { h: 180, s: 55, l: 45 }, transform: { x: 100, y: 340 } },
    { id: "h", rect: { w: 80, h: 80, radius: 6 }, fill: { h: 0, s: 60, l: 50 }, transform: { x: 300, y: 340 } },
    { id: "i", rect: { w: 80, h: 80, radius: 6 }, fill: { h: 90, s: 55, l: 45 }, transform: { x: 500, y: 340 } }
  ],
  animate: {
    duration: 8,
    loop: true,
    easing: "easeInOutCubic",
    keyframes: [
      { time: 0, changes: { "cam.camera.look": [100, 130], "cam.camera.zoom": 3, "cam.camera.ratio": 1.78 } },
      { time: 2, changes: { "cam.camera.look": [200, 130], "cam.camera.zoom": 2.5, "cam.camera.ratio": 2.35 } },
      { time: 4, changes: { "cam.camera.look": [400, 200], "cam.camera.zoom": 2, "cam.camera.ratio": 1.78 } },
      { time: 6, changes: { "cam.camera.look": [300, 340], "cam.camera.zoom": 3, "cam.camera.ratio": 2.35 } },
      { time: 8, changes: { "cam.camera.look": [100, 130], "cam.camera.zoom": 3, "cam.camera.ratio": 1.78 } }
    ]
  }
}`,
  },
  {
    name: 'camera-rotation',
    category: 'Camera',
    description: 'Rotating camera view with easing',
    dsl: `{
  objects: [
    { id: "cam", camera: { look: [300, 200], zoom: 1.5 }, transform: { rotation: 0 } },
    { id: "center", ellipse: { rx: 20, ry: 20 }, fill: { h: 50, s: 80, l: 55 }, transform: { x: 300, y: 200 } },
    { id: "n", rect: { w: 30, h: 30, radius: 4 }, fill: { h: 0, s: 60, l: 50 }, transform: { x: 300, y: 100 } },
    { id: "e", rect: { w: 30, h: 30, radius: 4 }, fill: { h: 90, s: 60, l: 45 }, transform: { x: 400, y: 200 } },
    { id: "s", rect: { w: 30, h: 30, radius: 4 }, fill: { h: 180, s: 60, l: 45 }, transform: { x: 300, y: 300 } },
    { id: "w", rect: { w: 30, h: 30, radius: 4 }, fill: { h: 270, s: 60, l: 50 }, transform: { x: 200, y: 200 } }
  ],
  animate: {
    duration: 6,
    loop: true,
    easing: "easeInOutCubic",
    keyframes: [
      { time: 0, changes: { "cam.transform.rotation": 0 } },
      { time: 3, changes: { "cam.transform.rotation": 180 } },
      { time: 6, changes: { "cam.transform.rotation": 360 } }
    ]
  }
}`,
  },
  {
    name: 'camera-switch',
    category: 'Camera',
    description: 'Switching between multiple cameras (cut transitions)',
    dsl: `{
  objects: [
    { id: "cam1", camera: { look: "a", zoom: 2, active: true } },
    { id: "cam2", camera: { look: "b", zoom: 2, active: false } },
    { id: "a", rect: { w: 80, h: 80, radius: 8 }, fill: { h: 200, s: 70, l: 50 }, transform: { x: 100, y: 200 } },
    { id: "b", rect: { w: 80, h: 80, radius: 8 }, fill: { h: 340, s: 70, l: 50 }, transform: { x: 500, y: 200 } },
    { id: "la", text: { content: "Cam 1", size: 10 }, fill: { h: 0, s: 0, l: 70 }, transform: { x: 100, y: 250 } },
    { id: "lb", text: { content: "Cam 2", size: 10 }, fill: { h: 0, s: 0, l: 70 }, transform: { x: 500, y: 250 } }
  ],
  animate: {
    duration: 4,
    loop: true,
    keyframes: [
      { time: 0, changes: { "cam1.camera.active": true, "cam2.camera.active": false } },
      { time: 2, changes: { "cam1.camera.active": false, "cam2.camera.active": true } },
      { time: 4, changes: { "cam1.camera.active": true, "cam2.camera.active": false } }
    ]
  }
}`,
  },
  {
    name: 'camera-combined',
    category: 'Camera',
    description: 'Cinematic sequence — aggressive zoom, rocking pan, gentle pullback',
    dsl: `{
  objects: [
    { id: "cam", camera: { look: "all", zoom: 1, ratio: 1.78 }, transform: { rotation: 0 } },
    { id: "a", rect: { w: 70, h: 70, radius: 6 }, fill: { h: 210, s: 60, l: 50 }, transform: { x: 80, y: 80 } },
    { id: "b", rect: { w: 70, h: 70, radius: 6 }, fill: { h: 150, s: 55, l: 45 }, transform: { x: 250, y: 80 } },
    { id: "c", rect: { w: 70, h: 70, radius: 6 }, fill: { h: 30, s: 70, l: 50 }, transform: { x: 420, y: 80 } },
    { id: "d", rect: { w: 70, h: 70, radius: 6 }, fill: { h: 340, s: 60, l: 50 }, transform: { x: 80, y: 250 } },
    { id: "e", rect: { w: 70, h: 70, radius: 6 }, fill: { h: 270, s: 50, l: 55 }, transform: { x: 250, y: 250 } },
    { id: "f", rect: { w: 70, h: 70, radius: 6 }, fill: { h: 60, s: 65, l: 48 }, transform: { x: 420, y: 250 } },
    { id: "g", rect: { w: 70, h: 70, radius: 6 }, fill: { h: 180, s: 55, l: 42 }, transform: { x: 80, y: 420 } },
    { id: "h", rect: { w: 70, h: 70, radius: 6 }, fill: { h: 0, s: 60, l: 48 }, transform: { x: 250, y: 420 } },
    { id: "i", rect: { w: 70, h: 70, radius: 6 }, fill: { h: 90, s: 55, l: 42 }, transform: { x: 420, y: 420 } }
  ],
  animate: {
    duration: 14,
    loop: true,
    keyframes: [
      { time: 0,   changes: { "cam.camera.look": "all", "cam.camera.zoom": 1, "cam.transform.rotation": 0, "cam.camera.ratio": 1.78 }, easing: "easeInOutCubic" },
      { time: 1.5, changes: { "cam.camera.look": "e", "cam.camera.zoom": 5, "cam.transform.rotation": 25 }, easing: "easeInCubic" },
      { time: 3,   changes: { "cam.camera.look": "e", "cam.camera.zoom": 2.5, "cam.transform.rotation": 0 }, easing: "easeOutCubic" },
      { time: 4.5, changes: { "cam.camera.look": "a", "cam.camera.zoom": 3, "cam.transform.rotation": -8 }, easing: "easeInOutCubic" },
      { time: 5.5, changes: { "cam.camera.look": "c", "cam.camera.zoom": 3, "cam.transform.rotation": 8 }, easing: "easeInOutCubic" },
      { time: 6.5, changes: { "cam.camera.look": "i", "cam.camera.zoom": 3, "cam.transform.rotation": -8 }, easing: "easeInOutCubic" },
      { time: 7.5, changes: { "cam.camera.look": "g", "cam.camera.zoom": 3, "cam.transform.rotation": 8 }, easing: "easeInOutCubic" },
      { time: 8.5, changes: { "cam.camera.look": "e", "cam.camera.zoom": 2.5, "cam.transform.rotation": 0 }, easing: "easeOutCubic" },
      { time: 14,  changes: { "cam.camera.look": "all", "cam.camera.zoom": 1, "cam.transform.rotation": 0, "cam.camera.ratio": 1.78 }, easing: "easeInOutCubic" }
    ]
  }
}`,
  },
];

export function getV2SampleCategories(): string[] {
  return [...new Set(v2Samples.map(s => s.category))];
}

export function getV2SamplesByCategory(category: string): V2Sample[] {
  return v2Samples.filter(s => s.category === category);
}
