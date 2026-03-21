/**
 * V2 Samples — comprehensive showcase of the compositional object model.
 * Each sample demonstrates specific features of the new system.
 */

export interface V2Sample {
  name: string;
  category: string;
  description: string;
  dsl: string;
}

export const v2Samples: V2Sample[] = [

  // ─── COLOR FORMATS ─────────────────────────────────────────────
  {
    name: 'color-formats',
    category: 'Colors',
    description: 'All supported color input formats: HSL object, RGB object, hex string, named color',
    dsl: `{
  objects: [
    { id: "hsl", rect: { w: 80, h: 80 }, fill: { h: 0, s: 100, l: 50 }, transform: { x: 0, y: 0 } },
    { id: "hslLabel", text: { content: "HSL", size: 11 }, fill: { h: 0, s: 0, l: 90 }, transform: { x: 0, y: 50 } },
    { id: "rgb", rect: { w: 80, h: 80 }, fill: { r: 0, g: 150, b: 255 }, transform: { x: 100, y: 0 } },
    { id: "rgbLabel", text: { content: "RGB", size: 11 }, fill: { h: 0, s: 0, l: 90 }, transform: { x: 100, y: 50 } },
    { id: "hex", rect: { w: 80, h: 80 }, fill: "#ff6600", transform: { x: 200, y: 0 } },
    { id: "hexLabel", text: { content: "Hex", size: 11 }, fill: { h: 0, s: 0, l: 90 }, transform: { x: 200, y: 50 } },
    { id: "named", rect: { w: 80, h: 80 }, fill: "dodgerblue", transform: { x: 300, y: 0 } },
    { id: "namedLabel", text: { content: "Named", size: 11 }, fill: { h: 0, s: 0, l: 90 }, transform: { x: 300, y: 50 } }
  ]
}`,
  },

  {
    name: 'hue-animation',
    category: 'Colors',
    description: 'Animate hue independently while keeping saturation and lightness constant',
    dsl: `{
  objects: [
    { id: "box", rect: { w: 120, h: 120, radius: 12 }, fill: { h: 0, s: 80, l: 50 }, transform: { x: 0, y: 0 } }
  ],
  animate: {
    duration: 4,
    loop: true,
    keyframes: [
      { time: 0, changes: { "box.fill.h": 0 } },
      { time: 2, changes: { "box.fill.h": 180 } },
      { time: 4, changes: { "box.fill.h": 360 } }
    ]
  }
}`,
  },

  {
    name: 'hue-shortest-arc',
    category: 'Colors',
    description: 'HSL hue interpolation takes the shortest arc — 350→10 goes through 0, not 180',
    dsl: `{
  objects: [
    { id: "short", rect: { w: 100, h: 60, radius: 8 }, fill: { h: 350, s: 90, l: 50 }, transform: { x: 0, y: 0 } },
    { id: "shortLabel", text: { content: "350 → 10 (short)", size: 11 }, fill: { h: 0, s: 0, l: 80 }, transform: { x: 0, y: 45 } }
  ],
  animate: {
    duration: 3,
    loop: true,
    keyframes: [
      { time: 0, changes: { "short.fill.h": 350 } },
      { time: 1.5, changes: { "short.fill.h": 10 } },
      { time: 3, changes: { "short.fill.h": 350 } }
    ]
  }
}`,
  },

  // ─── COMPOSITION ───────────────────────────────────────────────
  {
    name: 'composition-basics',
    category: 'Composition',
    description: 'A box is a composition: parent node with rect bg child and text label child',
    dsl: `{
  objects: [
    {
      id: "mybox",
      transform: { x: 100, y: 80 },
      children: [
        { id: "mybox.bg", rect: { w: 140, h: 60, radius: 6 }, fill: { h: 210, s: 70, l: 25 }, stroke: { h: 210, s: 80, l: 50, width: 2 } },
        { id: "mybox.label", text: { content: "Composed Box", size: 14, align: "middle" }, fill: { h: 0, s: 0, l: 90 }, transform: { x: 70, y: 30 } }
      ]
    }
  ]
}`,
  },

  {
    name: 'deep-track-animation',
    category: 'Composition',
    description: 'Animate any leaf in the tree: parent.child.fill.h, parent.child.rect.radius',
    dsl: `{
  objects: [
    {
      id: "card",
      transform: { x: 100, y: 80 },
      children: [
        { id: "card.bg", rect: { w: 120, h: 80, radius: 4 }, fill: { h: 210, s: 70, l: 30 }, stroke: { h: 210, s: 80, l: 50, width: 2 } },
        { id: "card.title", text: { content: "Card", size: 16 }, fill: { h: 0, s: 0, l: 90 }, transform: { x: 60, y: 25 } },
        { id: "card.badge", ellipse: { rx: 10, ry: 10 }, fill: { h: 120, s: 70, l: 45 }, transform: { x: 100, y: 15 } }
      ]
    }
  ],
  animate: {
    duration: 3,
    loop: true,
    keyframes: [
      { time: 0, changes: { "card.card.bg.fill.h": 210, "card.card.bg.rect.radius": 4, "card.card.badge.fill.h": 120 } },
      { time: 1.5, changes: { "card.card.bg.fill.h": 0, "card.card.bg.rect.radius": 20, "card.card.badge.fill.h": 0 } },
      { time: 3, changes: { "card.card.bg.fill.h": 210, "card.card.bg.rect.radius": 4, "card.card.badge.fill.h": 120 } }
    ]
  }
}`,
  },

  // ─── TEMPLATES ─────────────────────────────────────────────────
  {
    name: 'template-box',
    category: 'Templates',
    description: 'Use the built-in box template — shorthand for rect + text composition',
    dsl: `{
  objects: [
    { template: "box", id: "b1", props: { w: 140, h: 60, text: "Template Box", colour: "dodgerblue" } },
    { template: "box", id: "b2", props: { w: 140, h: 60, text: "Another Box", colour: "coral", transform: { x: 160, y: 0 } } }
  ]
}`,
  },

  {
    name: 'template-line',
    category: 'Templates',
    description: 'Line template with route path, arrow, and label — each part animatable independently',
    dsl: `{
  objects: [
    { template: "box", id: "a", props: { w: 100, h: 50, text: "Source", colour: "dodgerblue", transform: { x: 0, y: 0 } } },
    { template: "box", id: "b", props: { w: 100, h: 50, text: "Target", colour: "coral", transform: { x: 250, y: 0 } } },
    { template: "line", id: "conn", props: { from: "a", to: "b", label: "sends data", dashed: false } }
  ]
}`,
  },

  {
    name: 'template-circle-label',
    category: 'Templates',
    description: 'Circle and label templates',
    dsl: `{
  objects: [
    { template: "circle", id: "c1", props: { r: 40, text: "Node", colour: "mediumseagreen", transform: { x: 0, y: 0 } } },
    { template: "label", id: "title", props: { text: "System Overview", size: 20, bold: true, color: "white", transform: { x: 0, y: -80 } } }
  ]
}`,
  },

  {
    name: 'template-textblock',
    category: 'Templates',
    description: 'Textblock template — each line is a child text node, individually animatable',
    dsl: `{
  objects: [
    { template: "textblock", id: "tb", props: { lines: ["Line one", "Line two", "Line three"], size: 14, lineHeight: 22, colour: "white" } }
  ],
  animate: {
    duration: 3,
    keyframes: [
      { time: 0, changes: { "tb.tb.line0.opacity": 0, "tb.tb.line1.opacity": 0, "tb.tb.line2.opacity": 0 } },
      { time: 1, changes: { "tb.tb.line0.opacity": 1 } },
      { time: 2, changes: { "tb.tb.line1.opacity": 1 } },
      { time: 3, changes: { "tb.tb.line2.opacity": 1 } }
    ]
  }
}`,
  },

  {
    name: 'template-table',
    category: 'Templates',
    description: 'Table template with headers and data cells',
    dsl: `{
  objects: [
    { template: "table", id: "t1", props: { cols: ["Name", "Role", "Status"], rows: [["Alice", "Engineer", "Active"], ["Bob", "Designer", "Away"]], colWidth: 100, rowHeight: 30 } }
  ]
}`,
  },

  // ─── STYLES ────────────────────────────────────────────────────
  {
    name: 'styles-basic',
    category: 'Styles',
    description: 'Define named styles and apply them to nodes — own properties override',
    dsl: `{
  styles: {
    primary: { fill: { h: 210, s: 70, l: 45 }, stroke: { h: 210, s: 80, l: 30, width: 2 } },
    danger: { fill: { h: 0, s: 80, l: 45 }, stroke: { h: 0, s: 90, l: 30, width: 2 } }
  },
  objects: [
    { id: "a", rect: { w: 100, h: 60, radius: 6 }, style: "primary", transform: { x: 0, y: 0 } },
    { id: "b", rect: { w: 100, h: 60, radius: 6 }, style: "danger", transform: { x: 120, y: 0 } },
    { id: "c", rect: { w: 100, h: 60, radius: 6 }, style: "primary", fill: { h: 120, s: 70, l: 45 }, transform: { x: 240, y: 0 } }
  ]
}`,
  },

  {
    name: 'styles-animated',
    category: 'Styles',
    description: 'Animate a style property — all nodes using that style change together',
    dsl: `{
  styles: {
    theme: { fill: { h: 210, s: 70, l: 45 } }
  },
  objects: [
    { id: "a", rect: { w: 80, h: 80, radius: 8 }, style: "theme", transform: { x: 0, y: 0 } },
    { id: "b", rect: { w: 80, h: 80, radius: 8 }, style: "theme", transform: { x: 100, y: 0 } },
    { id: "c", rect: { w: 80, h: 80, radius: 8 }, style: "theme", transform: { x: 200, y: 0 } }
  ],
  animate: {
    duration: 4,
    loop: true,
    keyframes: [
      { time: 0, changes: { "theme.fill.h": 210 } },
      { time: 2, changes: { "theme.fill.h": 0 } },
      { time: 4, changes: { "theme.fill.h": 210 } }
    ]
  }
}`,
  },

  {
    name: 'styles-composed',
    category: 'Styles',
    description: 'Compose styles — a style can reference another, inheriting its properties',
    dsl: `{
  styles: {
    base: { fill: { h: 210, s: 70, l: 45 }, stroke: { h: 210, s: 80, l: 30, width: 2 } },
    "base-faded": { style: "base", opacity: 0.4 }
  },
  objects: [
    { id: "solid", rect: { w: 80, h: 80, radius: 8 }, style: "base", transform: { x: 0, y: 0 } },
    { id: "faded", rect: { w: 80, h: 80, radius: 8 }, style: "base-faded", transform: { x: 100, y: 0 } }
  ]
}`,
  },

  // ─── LAYOUT ────────────────────────────────────────────────────
  {
    name: 'layout-flex-row',
    category: 'Layout',
    description: 'Flex row layout with gap — children are positioned automatically',
    dsl: `{
  objects: [
    {
      id: "row",
      rect: { w: 400, h: 80 },
      fill: { h: 0, s: 0, l: 15 },
      stroke: { h: 0, s: 0, l: 30, width: 1 },
      layout: { type: "flex", direction: "row", gap: 10 },
      children: [
        { id: "a", rect: { w: 80, h: 40 }, fill: { h: 210, s: 70, l: 45 } },
        { id: "b", rect: { w: 80, h: 40 }, fill: { h: 120, s: 70, l: 45 } },
        { id: "c", rect: { w: 80, h: 40 }, fill: { h: 0, s: 70, l: 45 } }
      ]
    }
  ]
}`,
  },

  {
    name: 'layout-flex-grow',
    category: 'Layout',
    description: 'Flex grow distributes extra space proportionally',
    dsl: `{
  objects: [
    {
      id: "row",
      rect: { w: 400, h: 60 },
      fill: { h: 0, s: 0, l: 15 },
      layout: { type: "flex", direction: "row", gap: 5 },
      children: [
        { id: "fixed", rect: { w: 60, h: 40 }, fill: { h: 210, s: 70, l: 45 } },
        { id: "grows", rect: { w: 60, h: 40 }, fill: { h: 120, s: 70, l: 45 }, layoutHint: { grow: 1 } },
        { id: "fixed2", rect: { w: 60, h: 40 }, fill: { h: 0, s: 70, l: 45 } }
      ]
    }
  ]
}`,
  },

  {
    name: 'layout-animated-gap',
    category: 'Layout',
    description: 'Animate layout gap — children smoothly reposition',
    dsl: `{
  objects: [
    {
      id: "row",
      rect: { w: 400, h: 60 },
      fill: { h: 0, s: 0, l: 15 },
      layout: { type: "flex", direction: "row", gap: 5 },
      children: [
        { id: "a", rect: { w: 60, h: 40 }, fill: { h: 210, s: 70, l: 45 } },
        { id: "b", rect: { w: 60, h: 40 }, fill: { h: 120, s: 70, l: 45 } },
        { id: "c", rect: { w: 60, h: 40 }, fill: { h: 0, s: 70, l: 45 } }
      ]
    }
  ],
  animate: {
    duration: 3,
    loop: true,
    keyframes: [
      { time: 0, changes: { "row.layout.gap": 5 } },
      { time: 1.5, changes: { "row.layout.gap": 40 } },
      { time: 3, changes: { "row.layout.gap": 5 } }
    ]
  }
}`,
  },

  // ─── CONNECTIONS ───────────────────────────────────────────────
  {
    name: 'connections-basic',
    category: 'Connections',
    description: 'Paths connect nodes by ID — endpoints track dynamically',
    dsl: `{
  objects: [
    { id: "a", rect: { w: 80, h: 50 }, fill: { h: 210, s: 70, l: 45 }, transform: { x: 0, y: 0 } },
    { id: "b", rect: { w: 80, h: 50 }, fill: { h: 120, s: 70, l: 45 }, transform: { x: 250, y: 0 } },
    { id: "conn", children: [
      { id: "conn.route", path: { from: "a", to: "b" }, stroke: { h: 0, s: 0, l: 60, width: 2 } }
    ]}
  ]
}`,
  },

  {
    name: 'connections-bend',
    category: 'Connections',
    description: 'Animate connection bend value',
    dsl: `{
  objects: [
    { id: "a", rect: { w: 60, h: 40 }, fill: { h: 210, s: 70, l: 45 }, transform: { x: 0, y: 0 } },
    { id: "b", rect: { w: 60, h: 40 }, fill: { h: 0, s: 70, l: 45 }, transform: { x: 200, y: 0 } },
    { id: "conn", children: [
      { id: "conn.route", path: { from: "a", to: "b", bend: 0 }, stroke: { h: 0, s: 0, l: 70, width: 2 } }
    ]}
  ],
  animate: {
    duration: 4,
    loop: true,
    keyframes: [
      { time: 0, changes: { "conn.conn.route.path.bend": 0 } },
      { time: 1, changes: { "conn.conn.route.path.bend": 1.5 } },
      { time: 2, changes: { "conn.conn.route.path.bend": 0 } },
      { time: 3, changes: { "conn.conn.route.path.bend": -1.5 } },
      { time: 4, changes: { "conn.conn.route.path.bend": 0 } }
    ]
  }
}`,
  },

  // ─── ANIMATION ─────────────────────────────────────────────────
  {
    name: 'easing-showcase',
    category: 'Animation',
    description: 'Compare easing functions side by side',
    dsl: `{
  objects: [
    { id: "linear", rect: { w: 30, h: 30 }, fill: { h: 0, s: 80, l: 50 }, transform: { x: 0, y: 0 } },
    { id: "easeOut", rect: { w: 30, h: 30 }, fill: { h: 60, s: 80, l: 50 }, transform: { x: 0, y: 40 } },
    { id: "bounce", rect: { w: 30, h: 30 }, fill: { h: 120, s: 80, l: 50 }, transform: { x: 0, y: 80 } },
    { id: "elastic", rect: { w: 30, h: 30 }, fill: { h: 210, s: 80, l: 50 }, transform: { x: 0, y: 120 } }
  ],
  animate: {
    duration: 3,
    loop: true,
    keyframes: [
      { time: 0, changes: { "linear.transform.x": 0, "easeOut.transform.x": 0, "bounce.transform.x": 0, "elastic.transform.x": 0 } },
      { time: 1.5, changes: {
        "linear.transform.x": { value: 300, easing: "linear" },
        "easeOut.transform.x": { value: 300, easing: "easeOut" },
        "bounce.transform.x": { value: 300, easing: "bounce" },
        "elastic.transform.x": { value: 300, easing: "elastic" }
      }},
      { time: 3, changes: { "linear.transform.x": 0, "easeOut.transform.x": 0, "bounce.transform.x": 0, "elastic.transform.x": 0 } }
    ]
  }
}`,
  },

  {
    name: 'shorthand-targeting',
    category: 'Animation',
    description: 'Target a sub-object to set all its children at once: fill → fill.h, fill.s, fill.l',
    dsl: `{
  objects: [
    { id: "box", rect: { w: 100, h: 100, radius: 12 }, fill: { h: 210, s: 80, l: 50 }, transform: { x: 0, y: 0 } }
  ],
  animate: {
    duration: 3,
    loop: true,
    keyframes: [
      { time: 0, changes: { "box.fill": { h: 210, s: 80, l: 50 } } },
      { time: 1.5, changes: { "box.fill": { h: 0, s: 100, l: 50 } } },
      { time: 3, changes: { "box.fill": { h: 210, s: 80, l: 50 } } }
    ]
  }
}`,
  },

  {
    name: 'effects-pulse-shake',
    category: 'Animation',
    description: 'Effects as ephemeral additive track entries — pulse on scale, shake on x',
    dsl: `{
  objects: [
    { id: "box", rect: { w: 80, h: 80, radius: 8 }, fill: { h: 210, s: 70, l: 45 }, transform: { x: 100, y: 80, scale: 1 } }
  ],
  animate: {
    duration: 4,
    loop: true,
    keyframes: [
      { time: 1, changes: { "box.transform.scale": 1 } },
      { time: 3, changes: { "box.transform.scale": 1 } }
    ]
  }
}`,
  },

  // ─── INHERITANCE ───────────────────────────────────────────────
  {
    name: 'fill-inheritance',
    category: 'Inheritance',
    description: 'Visual properties inherit: parent fill applies to children without their own fill',
    dsl: `{
  objects: [
    {
      id: "group",
      fill: { h: 210, s: 70, l: 45 },
      transform: { x: 100, y: 80 },
      children: [
        { id: "inherits", rect: { w: 60, h: 60, radius: 4 }, transform: { x: 0, y: 0 } },
        { id: "overrides", rect: { w: 60, h: 60, radius: 4 }, fill: { h: 0, s: 80, l: 50 }, transform: { x: 80, y: 0 } }
      ]
    }
  ]
}`,
  },

  {
    name: 'opacity-composition',
    category: 'Inheritance',
    description: 'Opacity composes multiplicatively: parent 0.5 × child 0.8 = rendered 0.4',
    dsl: `{
  objects: [
    {
      id: "parent",
      opacity: 0.5,
      transform: { x: 100, y: 80 },
      children: [
        { id: "child", rect: { w: 80, h: 80, radius: 8 }, fill: { h: 210, s: 70, l: 45 }, opacity: 0.8 }
      ]
    }
  ]
}`,
  },

  // ─── GEOMETRY PRIMITIVES ───────────────────────────────────────
  {
    name: 'all-primitives',
    category: 'Primitives',
    description: 'All five geometry primitives: rect, ellipse, text, path, image',
    dsl: `{
  objects: [
    { id: "r", rect: { w: 80, h: 50, radius: 6 }, fill: { h: 210, s: 70, l: 45 }, stroke: { h: 210, s: 80, l: 30, width: 2 }, transform: { x: 0, y: 0 } },
    { id: "e", ellipse: { rx: 40, ry: 25 }, fill: { h: 120, s: 70, l: 45 }, stroke: { h: 120, s: 80, l: 30, width: 2 }, transform: { x: 130, y: 0 } },
    { id: "t", text: { content: "Hello World", size: 16, bold: true }, fill: { h: 0, s: 0, l: 90 }, transform: { x: 260, y: 0 } },
    { id: "p", path: { points: [[0,0],[40,-30],[80,0],[40,30]], closed: true, smooth: false }, fill: { h: 40, s: 80, l: 50 }, stroke: { h: 40, s: 90, l: 30, width: 2 }, transform: { x: 380, y: 0 } },
    { id: "labels", text: { content: "rect    ellipse    text    path", size: 11 }, fill: { h: 0, s: 0, l: 60 }, transform: { x: 180, y: 50 } }
  ]
}`,
  },

  {
    name: 'dash-patterns',
    category: 'Primitives',
    description: 'Dash patterns on paths — animatable length and gap',
    dsl: `{
  objects: [
    { id: "solid", path: { points: [[0,0],[200,0]] }, stroke: { h: 0, s: 0, l: 70, width: 2 }, transform: { x: 0, y: 0 } },
    { id: "dashed", path: { points: [[0,0],[200,0]] }, stroke: { h: 0, s: 0, l: 70, width: 2 }, dash: { pattern: "dashed", length: 10, gap: 5 }, transform: { x: 0, y: 30 } },
    { id: "dotted", path: { points: [[0,0],[200,0]] }, stroke: { h: 0, s: 0, l: 70, width: 2 }, dash: { pattern: "dotted", length: 2, gap: 6 }, transform: { x: 0, y: 60 } }
  ],
  animate: {
    duration: 3,
    loop: true,
    keyframes: [
      { time: 0, changes: { "dashed.dash.gap": 5 } },
      { time: 1.5, changes: { "dashed.dash.gap": 20 } },
      { time: 3, changes: { "dashed.dash.gap": 5 } }
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
