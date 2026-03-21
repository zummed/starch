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
      stroke: { h: 210, s: 80, l: 30, width: 2 },
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
      stroke: { h: 120, s: 70, l: 30, width: 2 },
      transform: { x: 200, y: 150 }
    },
    {
      id: "oval",
      ellipse: { rx: 70, ry: 35 },
      fill: { h: 30, s: 80, l: 50 },
      stroke: { h: 30, s: 90, l: 35, width: 2 },
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
      stroke: { h: 280, s: 70, l: 30, width: 2 },
      transform: { x: 150, y: 150 }
    },
    {
      id: "zigzag",
      path: { points: [[0, 0], [30, -30], [60, 0], [90, -30], [120, 0]], closed: false },
      stroke: { h: 40, s: 90, l: 50, width: 2 },
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
    { id: "solid", path: { points: [[0, 0], [250, 0]] }, stroke: { h: 0, s: 0, l: 70, width: 2 }, transform: { x: 100, y: 100 } },
    { id: "dashed", path: { points: [[0, 0], [250, 0]] }, stroke: { h: 0, s: 0, l: 70, width: 2 }, dash: { pattern: "dashed", length: 10, gap: 5 }, transform: { x: 100, y: 140 } },
    { id: "dotted", path: { points: [[0, 0], [250, 0]] }, stroke: { h: 0, s: 0, l: 70, width: 2 }, dash: { pattern: "dotted", length: 2, gap: 6 }, transform: { x: 100, y: 180 } },
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
        { id: "bg", rect: { w: 160, h: 70, radius: 8 }, fill: { h: 210, s: 50, l: 20 }, stroke: { h: 210, s: 70, l: 50, width: 2 } },
        { id: "label", text: { content: "Composed Box", size: 14, align: "middle" }, fill: { h: 0, s: 0, l: 90 }, transform: { x: 80, y: 35 } }
      ]
    }
  ]
}`,
  },
  {
    name: 'line-composition',
    category: 'Composition',
    description: 'A "line" is a path with an arrowhead and a label — all children of a parent node',
    dsl: `{
  objects: [
    { id: "a", rect: { w: 100, h: 50, radius: 6 }, fill: { h: 210, s: 50, l: 20 }, stroke: { h: 210, s: 70, l: 50, width: 2 }, transform: { x: 100, y: 150 } },
    { id: "b", rect: { w: 100, h: 50, radius: 6 }, fill: { h: 0, s: 50, l: 20 }, stroke: { h: 0, s: 70, l: 50, width: 2 }, transform: { x: 400, y: 150 } },
    {
      id: "conn",
      children: [
        { id: "route", path: { from: "a", to: "b" }, stroke: { h: 0, s: 0, l: 60, width: 2 } },
        { id: "label", text: { content: "sends data", size: 11 }, fill: { h: 0, s: 0, l: 70 }, transform: { x: 250, y: 140 } }
      ]
    }
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
      transform: { x: 200, y: 120 },
      children: [
        { id: "bg", rect: { w: 140, h: 100, radius: 6 }, fill: { h: 210, s: 50, l: 18 }, stroke: { h: 210, s: 70, l: 45, width: 2 } },
        { id: "title", text: { content: "Card Title", size: 14, bold: true }, fill: { h: 0, s: 0, l: 90 }, transform: { x: 70, y: 25 } },
        { id: "badge", ellipse: { rx: 8, ry: 8 }, fill: { h: 120, s: 70, l: 45 }, transform: { x: 120, y: 18 } },
        { id: "body", text: { content: "Some description", size: 11 }, fill: { h: 0, s: 0, l: 60 }, transform: { x: 70, y: 55 } }
      ]
    }
  ],
  animate: {
    duration: 3,
    loop: true,
    keyframes: [
      { time: 0, changes: { "card.bg.fill.h": 210, "card.badge.fill.h": 120 } },
      { time: 1.5, changes: { "card.bg.fill.h": 0, "card.badge.fill.h": 0 } },
      { time: 3, changes: { "card.bg.fill.h": 210, "card.badge.fill.h": 120 } }
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
    name: 'hue-animation',
    category: 'Colors',
    description: 'Animate hue independently — saturation and lightness stay constant',
    dsl: `{
  objects: [
    { id: "box", rect: { w: 120, h: 120, radius: 12 }, fill: { h: 0, s: 80, l: 50 }, transform: { x: 200, y: 130 } }
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
      { time: 0, changes: { "box.fill.h": 350 } },
      { time: 1.5, changes: { "box.fill.h": 10 } },
      { time: 3, changes: { "box.fill.h": 350 } }
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
    primary: { fill: { h: 210, s: 70, l: 45 }, stroke: { h: 210, s: 80, l: 30, width: 2 } },
    danger: { fill: { h: 0, s: 80, l: 45 }, stroke: { h: 0, s: 90, l: 30, width: 2 } }
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
      { time: 0, changes: { "theme.fill.h": 210 } },
      { time: 2, changes: { "theme.fill.h": 0 } },
      { time: 4, changes: { "theme.fill.h": 210 } }
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
    name: 'connection',
    category: 'Connections',
    description: 'Path with from/to connects two nodes by ID',
    dsl: `{
  objects: [
    { id: "a", rect: { w: 80, h: 50, radius: 6 }, fill: { h: 210, s: 60, l: 35 }, stroke: { h: 210, s: 70, l: 50, width: 2 }, transform: { x: 100, y: 150 } },
    { id: "b", rect: { w: 80, h: 50, radius: 6 }, fill: { h: 120, s: 60, l: 35 }, stroke: { h: 120, s: 70, l: 50, width: 2 }, transform: { x: 380, y: 150 } },
    { id: "line", path: { from: "a", to: "b" }, stroke: { h: 0, s: 0, l: 60, width: 2 } }
  ]
}`,
  },
  {
    name: 'connection-bend',
    category: 'Connections',
    description: 'Animate the bend of a connection — positive and negative curves',
    dsl: `{
  objects: [
    { id: "a", rect: { w: 60, h: 40, radius: 6 }, fill: { h: 210, s: 60, l: 35 }, stroke: { h: 210, s: 70, l: 50, width: 2 }, transform: { x: 120, y: 150 } },
    { id: "b", rect: { w: 60, h: 40, radius: 6 }, fill: { h: 0, s: 60, l: 35 }, stroke: { h: 0, s: 70, l: 50, width: 2 }, transform: { x: 380, y: 150 } },
    { id: "line", path: { from: "a", to: "b", bend: 0 }, stroke: { h: 0, s: 0, l: 60, width: 2 } }
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
    name: 'opacity-composition',
    category: 'Inheritance',
    description: 'Opacity composes multiplicatively — parent 0.5 × child 0.8 = 0.4',
    dsl: `{
  objects: [
    {
      id: "parent",
      opacity: 0.5,
      transform: { x: 200, y: 130 },
      children: [
        {
          id: "child",
          rect: { w: 100, h: 100, radius: 8 },
          fill: { h: 210, s: 70, l: 50 },
          opacity: 0.8
        }
      ]
    },
    { id: "reference", rect: { w: 100, h: 100, radius: 8 }, fill: { h: 210, s: 70, l: 50 }, transform: { x: 350, y: 130 } },
    { id: "l1", text: { content: "0.5 × 0.8 = 0.4", size: 10 }, fill: { h: 0, s: 0, l: 50 }, transform: { x: 200, y: 250 } },
    { id: "l2", text: { content: "full opacity", size: 10 }, fill: { h: 0, s: 0, l: 50 }, transform: { x: 350, y: 250 } }
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
      stroke: { h: 0, s: 0, l: 25, width: 1 },
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
        { id: "grows", rect: { w: 60, h: 40, radius: 4 }, fill: { h: 120, s: 70, l: 45 }, layoutHint: { grow: 1 } },
        { id: "fixed2", rect: { w: 60, h: 40, radius: 4 }, fill: { h: 0, s: 70, l: 45 } }
      ]
    }
  ]
}`,
  },
];

export function getV2SampleCategories(): string[] {
  return [...new Set(v2Samples.map(s => s.category))];
}

export function getV2SamplesByCategory(category: string): V2Sample[] {
  return v2Samples.filter(s => s.category === category);
}
