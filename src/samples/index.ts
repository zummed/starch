export interface Sample {
  id: string;
  title: string;
  category: string;
  description: string;
  dsl: string;
}

export const CATEGORIES = [
  { id: 'shapes', title: 'Shapes' },
  { id: 'images', title: 'Images' },
  { id: 'connections', title: 'Connections' },
  { id: 'layout', title: 'Layout' },
  { id: 'effects', title: 'Effects' },
  { id: 'text', title: 'Text' },
  { id: 'camera', title: 'Camera' },
  { id: 'styles', title: 'Styles' },
  { id: 'animation', title: 'Animation' },
];

export const SAMPLES: Sample[] = [
  // ═════════════════════════════════════════════════════════════
  // SHAPES
  // ═════════════════════════════════════════════════════════════

  {
    id: 'boxes',
    title: 'Boxes',
    category: 'shapes',
    description: 'Animate size, radius, colour, and text properties.',
    dsl: `{
  objects: [
    { box: "a", at: [150, 150], colour: "#22d3ee", text: "Resize", radius: 8 },
    { box: "b", at: [400, 150], colour: "#a78bfa", text: "Morph", radius: 8 },
    { box: "c", at: [650, 150], colour: "#34d399", text: "Colour" },
    { box: "d", at: [400, 350], w: 200, colour: "#fbbf24", text: "All at once" },
  ],
  animate: {
    duration: 4, loop: false, easing: "easeInOut",
    keyframes: [
      // a: resize from default to wide
      { time: 2.0, changes: { a: { w: 220, h: 70 } } },
      // b: morph radius from box to pill
      { time: 2.0, changes: { b: { radius: 23 } } },
      // c: animate fill colour
      { time: 2.0, changes: { c: { fill: "#1a2e22", stroke: "#f472b6" } } },
      // d: everything at once
      { time: 2.0, changes: { d: { w: 300, h: 80, radius: 20, fill: "#2a2410", stroke: "#ef4444" } } },
    ],
  },
}`,
  },

  {
    id: 'circles',
    title: 'Circles',
    category: 'shapes',
    description: 'Animate radius, fill, and stroke.',
    dsl: `{
  objects: [
    { circle: "c1", at: [200, 200], r: 30, colour: "#22d3ee" },
    { circle: "c2", at: [400, 200], r: 40, colour: "#a78bfa" },
    { circle: "c3", at: [600, 200], r: 25, colour: "#f472b6" },
  ],
  animate: {
    duration: 3, loop: false, easing: "easeInOut",
    keyframes: [
      { time: 1.5, changes: {
        c1: { r: 60 },
        c2: { fill: "#34d399", stroke: "#34d399" },
        c3: { r: 50, fill: "#fbbf24", stroke: "#fbbf24" },
      } },
    ],
  },
}`,
  },

  {
    id: 'labels',
    title: 'Labels',
    category: 'shapes',
    description: 'Text at different sizes, colours, and alignments.',
    dsl: `{
  objects: [
    { label: "h1", at: [400, 80], text: "Heading", size: 24, color: "#e2e5ea", bold: true },
    { label: "sub", at: [400, 115], text: "Subtitle with lighter colour", size: 14, color: "#6b7280" },
    { label: "left", at: [100, 200], text: "align: start", size: 12, color: "#22d3ee", align: "start" },
    { label: "mid", at: [400, 200], text: "align: middle", size: 12, color: "#a78bfa" },
    { label: "right", at: [700, 200], text: "align: end", size: 12, color: "#34d399", align: "end" },
    { label: "fade", at: [400, 320], text: "I fade in and grow", size: 18, color: "#fbbf24", opacity: 0 },
  ],
  animate: {
    duration: 3, loop: false, easing: "easeInOut",
    keyframes: [
      { time: 1.5, changes: { fade: { opacity: 1, size: 28 } } },
    ],
  },
}`,
  },

  {
    id: 'tables',
    title: 'Tables',
    category: 'shapes',
    description: 'Data table with animated opacity.',
    dsl: `{
  objects: [
    { label: "title", at: [400, 40], text: "Server Metrics", size: 16, color: "#e2e5ea", bold: true },
    { table: "metrics", at: [400, 200],
      cols: ["Metric", "Value", "Status"],
      rows: [
        ["CPU", "42%", "OK"],
        ["Memory", "78%", "Warn"],
        ["Disk", "91%", "Critical"],
        ["Network", "12ms", "OK"],
      ],
      opacity: 0,
    },
  ],
  animate: {
    duration: 2, loop: false, easing: "easeInOut",
    keyframes: [
      { time: 1.0, changes: { metrics: { opacity: 1 } } },
    ],
  },
}`,
  },

  // ═════════════════════════════════════════════════════════════
  // IMAGES
  // ═════════════════════════════════════════════════════════════

  {
    id: 'images-on-shapes',
    title: 'Images on Shapes',
    category: 'images',
    description: 'Display images inside boxes, circles, and labels using an image registry.',
    dsl: `{
  images: {
    star: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpolygon points='12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9' fill='%23fbbf24'/%3E%3C/svg%3E",
    heart: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 21C12 21 3 13.5 3 8.5C3 5.4 5.4 3 8.5 3c1.7 0 3.4 1 4.5 2.5C14.1 4 15.8 3 17.5 3 20.6 3 23 5.4 23 8.5 23 13.5 12 21 12 21z' fill='%23f472b6'/%3E%3C/svg%3E",
    bolt: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpolygon points='13,2 3,14 12,14 11,22 21,10 12,10' fill='%2322d3ee'/%3E%3C/svg%3E",
  },
  objects: [
    { label: "title", at: [400, 40], text: "Images on Shapes", size: 16, color: "#e2e5ea", bold: true },
    { box: "b1", at: [200, 160], size: [120, 80], colour: "#2a2d35", image: "star", radius: 12 },
    { label: "bl", at: [200, 220], text: "Box + image", size: 11, color: "#6b7280" },
    { circle: "c1", at: [400, 160], r: 45, colour: "#2a2d35", image: "heart" },
    { label: "cl", at: [400, 220], text: "Circle + image", size: 11, color: "#6b7280" },
    { label: "l1", at: [600, 160], text: "Bolt label", size: 16, color: "#e2e5ea", image: "bolt" },
    { label: "ll", at: [600, 220], text: "Label + image", size: 11, color: "#6b7280" },
    { label: "reg", at: [400, 290], text: "All three reference the top-level images registry by key", size: 11, color: "#4a4f59" },
  ],
  animate: {
    duration: 3, loop: false, easing: "easeInOut",
    keyframes: [
      { time: 1.5, changes: { b1: { pulse: 0.1 }, c1: { pulse: 0.1 } } },
    ],
  },
}`,
  },

  {
    id: 'image-fit',
    title: 'Image Fit Modes',
    category: 'images',
    description: 'Compare contain, cover, and fill modes with imagePadding.',
    dsl: `{
  images: {
    star: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpolygon points='12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9' fill='%23fbbf24'/%3E%3C/svg%3E",
  },
  objects: [
    { label: "title", at: [400, 40], text: "imageFit Modes", size: 16, color: "#e2e5ea", bold: true },
    { box: "contain", at: [150, 170], size: [160, 100], colour: "#2a2d35", image: "star", imageFit: "contain", radius: 8 },
    { label: "lc", at: [150, 240], text: "contain (default)", size: 11, color: "#6b7280" },
    { box: "cover", at: [400, 170], size: [160, 100], colour: "#2a2d35", image: "star", imageFit: "cover", radius: 8 },
    { label: "lv", at: [400, 240], text: "cover", size: 11, color: "#6b7280" },
    { box: "fill", at: [650, 170], size: [160, 100], colour: "#2a2d35", image: "star", imageFit: "fill", radius: 8 },
    { label: "lf", at: [650, 240], text: "fill", size: 11, color: "#6b7280" },
    { box: "padded", at: [275, 340], size: [160, 100], colour: "#2a2d35", image: "star", imagePadding: 20, radius: 8 },
    { label: "lp", at: [275, 410], text: "imagePadding: 20", size: 11, color: "#6b7280" },
    { box: "nopad", at: [525, 340], size: [160, 100], colour: "#2a2d35", image: "star", imagePadding: 0, radius: 8 },
    { label: "ln", at: [525, 410], text: "imagePadding: 0", size: 11, color: "#6b7280" },
  ],
  animate: {
    duration: 4, loop: false, easing: "easeInOut",
    keyframes: [
      { time: 2.0, changes: {
        contain: { w: 100 },
        cover: { w: 100 },
        fill: { w: 100 },
      } },
    ],
  },
}`,
  },

  {
    id: 'image-sources',
    title: 'Image Sources',
    category: 'images',
    description: 'Three ways to specify an image: registry key, URL, or inline data URI.',
    dsl: `{
  images: {
    star: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpolygon points='12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9' fill='%23fbbf24'/%3E%3C/svg%3E",
  },
  objects: [
    { label: "title", at: [400, 40], text: "Image Sources", size: 16, color: "#e2e5ea", bold: true },
    // Method 1: registry key
    { box: "reg", at: [150, 170], size: [160, 100], colour: "#2a2d35", image: "star", radius: 8 },
    { label: "rl1", at: [150, 240], text: "Registry key", size: 12, color: "#22d3ee" },
    { label: "rl2", at: [150, 260], text: "image: \\"star\\"", size: 10, color: "#6b7280" },
    // Method 2: direct URL (e.g. /icons/logo.svg or https://...)
    { box: "url", at: [400, 170], size: [160, 100], colour: "#2a2d35", image: "https://upload.wikimedia.org/wikipedia/commons/4/47/React.svg", radius: 8 },
    { label: "ul1", at: [400, 240], text: "Direct URL", size: 12, color: "#34d399" },
    { label: "ul2", at: [400, 260], text: "image: \\"https://...\\"", size: 10, color: "#6b7280" },
    // Method 3: inline data URI
    { box: "uri", at: [650, 170], size: [160, 100], colour: "#2a2d35", radius: 8,
      image: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpolygon points='13,2 3,14 12,14 11,22 21,10 12,10' fill='%2322d3ee'/%3E%3C/svg%3E" },
    { label: "dl1", at: [650, 240], text: "Inline data URI", size: 12, color: "#a78bfa" },
    { label: "dl2", at: [650, 260], text: "image: \\"data:image/svg+xml,...\\"", size: 10, color: "#6b7280" },
    { label: "hint", at: [400, 330], text: "The registry avoids repeating long URIs — define once, reference by key", size: 11, color: "#4a4f59" },
  ],
  animate: {
    duration: 3, loop: false, easing: "easeInOut",
    keyframes: [
      { time: 1.5, changes: { reg: { pulse: 0.1 }, url: { pulse: 0.1 }, uri: { pulse: 0.1 } } },
    ],
  },
}`,
  },

  // ═════════════════════════════════════════════════════════════
  // CONNECTIONS
  // ═════════════════════════════════════════════════════════════

  {
    id: 'arrows',
    title: 'Arrows',
    category: 'connections',
    description: 'Lines drawing between objects with labels and progress.',
    dsl: `{
  objects: [
    { box: "client", at: [150, 200], colour: "#22d3ee", text: "Client" },
    { box: "server", at: [400, 200], colour: "#34d399", text: "Server" },
    { box: "db", at: [650, 200], colour: "#a78bfa", text: "Database" },
    { line: "l1", from: "client", to: "server", colour: "#fbbf24", label: "request", progress: 0 },
    { line: "l2", from: "server", to: "db", colour: "#f472b6", label: "query", progress: 0 },
  ],
  animate: {
    duration: 4, loop: false, easing: "easeInOut",
    keyframes: [
      { time: 1.0, changes: { l1: { progress: 1 }, client: { pulse: 0.08 }, server: { pulse: 0.08 } } },
      { time: 2.5, changes: { l2: { progress: 1 }, server: { pulse: 0.08 }, db: { pulse: 0.08 } } },
    ],
  },
}`,
  },

  {
    id: 'curved-arrows',
    title: 'Curved Arrows',
    category: 'connections',
    description: 'Animate bend values to curve arrows in real time.',
    dsl: `{
  objects: [
    { box: "a", at: [200, 200], colour: "#22d3ee", text: "A" },
    { box: "b", at: [600, 200], colour: "#34d399", text: "B" },
    { line: "straight", from: "a", to: "b", colour: "#6b7280", label: "bend: 0", bend: 0 },
    { line: "up", from: "a", to: "b", colour: "#a78bfa", label: "bend: -40", bend: 0 },
    { line: "down", from: "a", to: "b", colour: "#fbbf24", label: "bend: 40", bend: 0 },
  ],
  animate: {
    duration: 3, loop: false, easing: "easeInOut",
    keyframes: [
      { time: 1.5, changes: {
        up: { bend: -60 },
        down: { bend: 60 },
      } },
    ],
  },
}`,
  },

  {
    id: 'anchors',
    title: 'Anchors',
    category: 'connections',
    description: 'Arrows connecting at different anchor points on objects.',
    dsl: `{
  objects: [
    { box: "center", at: [400, 220], size: [160, 80], colour: "#22d3ee", text: "Center Box" },
    { box: "top", at: [400, 60], colour: "#34d399", text: "top" },
    { box: "bottom", at: [400, 380], colour: "#34d399", text: "bottom" },
    { box: "left", at: [150, 220], colour: "#a78bfa", text: "left" },
    { box: "right", at: [650, 220], colour: "#a78bfa", text: "right" },
    { line: "lt", from: "top", to: "center", colour: "#34d399", toAnchor: "top" },
    { line: "lb", from: "bottom", to: "center", colour: "#34d399", toAnchor: "bottom" },
    { line: "ll", from: "left", to: "center", colour: "#a78bfa", toAnchor: "left" },
    { line: "lr", from: "right", to: "center", colour: "#a78bfa", toAnchor: "right" },
  ],
  animate: {
    duration: 4, loop: false, easing: "easeInOut",
    keyframes: [
      { time: 2.0, changes: {
        top: { y: 80 },
        bottom: { y: 360 },
        left: { x: 180 },
        right: { x: 620 },
      } },
    ],
  },
}`,
  },

  {
    id: 'paths',
    title: 'Paths',
    category: 'connections',
    description: 'An object follows a closed smooth path.',
    dsl: `{
  objects: [
    { line: "track", closed: true, visible: false, arrow: false, dashed: true, colour: "#2a2d35",
      route: [[600,220], [400,340], [200,220], [400,100]], closed: true },
    { box: "runner", follow: "track", size: [80, 36], colour: "#60a5fa", text: "Follow", radius: 6 },
    { circle: "dot", follow: "track", r: 12, colour: "#f472b6" },
  ],
  animate: {
    duration: 6, loop: true, easing: "linear",
    // Per-object shorthand format
    keyframes: {
      runner: [[0, "pathProgress", 0], [6, "pathProgress", 1]],
      dot: [[0, "pathProgress", 0.5], [6, "pathProgress", 1.5]],
    },
  },
}`,
  },

  {
    id: 'routed-lines',
    title: 'Routed Lines',
    category: 'connections',
    description: 'Lines routed through waypoints — smooth vs straight with rounded corners.',
    dsl: `{
  objects: [
    { box: "a", at: [100, 100], colour: "#22d3ee", text: "Start" },
    { box: "b", at: [700, 400], colour: "#34d399", text: "End" },
    { point: "p1", at: [100, 400] },
    { point: "p2", at: [700, 100] },

    // Smooth route (Catmull-Rom spline)
    { line: "smooth", from: "a", route: ["p1"], to: "b",
      colour: "#a78bfa", label: "smooth", progress: 0 },

    // Straight route with rounded corners
    { line: "straight", from: "a", route: ["p2"], to: "b",
      colour: "#fbbf24", label: "radius: 20", smooth: false, radius: 20, progress: 0 },
  ],
  animate: {
    duration: 3, loop: false, easing: "easeInOut",
    keyframes: [
      { time: 1.5, changes: { smooth: { progress: 1 }, straight: { progress: 1 } } },
    ],
  },
}`,
  },

  {
    id: 'coordinate-endpoints',
    title: 'Mixed Endpoints',
    category: 'connections',
    description: 'Lines using object IDs, coordinates, and offsets as endpoints.',
    dsl: `{
  objects: [
    { box: "server", at: [400, 200], colour: "#22d3ee", text: "Server" },
    { point: "origin", at: [100, 200] },

    // From coordinates to object
    { line: "l1", from: [100, 100], to: "server", colour: "#fbbf24", label: "from [x,y]", progress: 0 },

    // From point with offset to object
    { line: "l2", from: ["origin", 0, 50], to: "server", colour: "#a78bfa", label: "from point+offset", progress: 0 },

    // From object to coordinates
    { line: "l3", from: "server", to: [700, 350], colour: "#34d399", label: "to [x,y]", progress: 0 },
  ],
  animate: {
    duration: 4, loop: false, easing: "easeInOut",
    keyframes: [
      { time: 1.0, changes: { l1: { progress: 1 } } },
      { plus: 1.0, changes: { l2: { progress: 1 } } },
      { plus: 1.0, changes: { l3: { progress: 1 } } },
    ],
  },
}`,
  },

  // ═════════════════════════════════════════════════════════════
  // LAYOUT
  // ═════════════════════════════════════════════════════════════

  {
    id: 'row-layout',
    title: 'Row Layout',
    category: 'layout',
    description: 'Animate gap, padding, and child order in a row container.',
    dsl: `{
  objects: [
    { label: "title", at: [400, 40], text: "Row Container", size: 16, color: "#e2e5ea", bold: true },
    { box: "row", at: [400, 200], direction: "row", colour: "#2a2d35", radius: 12 },
    { box: "a", colour: "#22d3ee", text: "A", order: 1, group: "row" },
    { box: "b", colour: "#fbbf24", text: "B", order: 2, group: "row" },
    { box: "c", colour: "#34d399", text: "C", order: 3, group: "row" },
  ],
  animate: {
    duration: 5, loop: false, easing: "easeInOut",
    keyframes: [
      // Increase gap and padding
      { time: 1.5, changes: { row: { gap: 30, padding: 20 } } },
      // Swap order: C moves to front
      { time: 3.5, changes: { c: { order: 0 }, a: { order: 2 } } },
    ],
  },
}`,
  },

  {
    id: 'column-layout',
    title: 'Column Layout',
    category: 'layout',
    description: 'Vertical stacking with animated gap and grow.',
    dsl: `{
  objects: [
    { label: "title", at: [400, 30], text: "Column Container", size: 16, color: "#e2e5ea", bold: true },
    { box: "col", at: [400, 250], direction: "column", gap: 10, colour: "#2a2d35", radius: 12 },
    { box: "header", size: [200, 36], colour: "#a78bfa", text: "Header", group: "col" },
    { box: "body", size: [200, 50], colour: "#60a5fa", text: "Body", group: "col" },
    { box: "footer", size: [200, 36], colour: "#34d399", text: "Footer", group: "col" },
  ],
  animate: {
    duration: 4, loop: false, easing: "easeInOut",
    keyframes: [
      { time: 2.0, changes: {
        col: { gap: 24 },
        body: { h: 100 },
      } },
    ],
  },
}`,
  },

  {
    id: 'alignment',
    title: 'Alignment',
    category: 'layout',
    description: 'Animate justify between start, center, and end.',
    dsl: `{
  objects: [
    { label: "title", at: [400, 30], text: "Justify Animation", size: 16, color: "#e2e5ea", bold: true },
    { box: "row", at: [400, 180], w: 500, direction: "row", colour: "#2a2d35", radius: 12, justify: "start" },
    { box: "x", size: [80, 40], colour: "#22d3ee", text: "X", group: "row" },
    { box: "y", size: [80, 40], colour: "#fbbf24", text: "Y", group: "row" },
    { box: "z", size: [80, 40], colour: "#34d399", text: "Z", group: "row" },
    { label: "state", at: [400, 280], text: "justify: start", size: 14, color: "#6b7280" },
  ],
  animate: {
    duration: 6, loop: false, easing: "easeInOut",
    keyframes: [
      { time: 2.0, changes: { row: { justify: "center" }, state: { text: "justify: center" } } },
      { time: 4.0, changes: { row: { justify: "end" }, state: { text: "justify: end" } } },
    ],
  },
}`,
  },

  {
    id: 'group-animation',
    title: 'Group Animation',
    category: 'layout',
    description: 'Move an item between containers with smooth position blend.',
    dsl: `{
  objects: [
    { label: "title", at: [400, 30], text: "Group Transition", size: 16, color: "#e2e5ea", bold: true },
    { box: "left", at: [200, 200], direction: "column", padding: 14, colour: "#2a2d35", radius: 12 },
    { box: "right", at: [600, 200], direction: "column", padding: 14, colour: "#2a2d35", radius: 12 },
    { box: "a", colour: "#22d3ee", text: "Static A", group: "left" },
    { box: "mover", colour: "#fbbf24", text: "I move!", group: "left" },
    { box: "b", colour: "#34d399", text: "Static B", group: "right" },
  ],
  animate: {
    duration: 4, loop: false, easing: "easeInOut",
    keyframes: [
      { time: 2.0, changes: { mover: { group: "right" } } },
    ],
  },
}`,
  },

  {
    id: 'coordinates',
    title: 'Coordinate Methods',
    category: 'layout',
    description: 'All the ways to position objects: at [x,y], at "id", at ["id", dx, dy], and raw x/y.',
    dsl: `{
  objects: [
    { label: "title", at: [400, 30], text: "Coordinate Methods", size: 16, color: "#e2e5ea", bold: true },

    // 1. Absolute coordinates with at: [x, y]
    { box: "origin", at: [120, 140], colour: "#22d3ee", text: "at: [120, 140]" },
    { label: "m1", at: [120, 180], text: "Absolute [x, y]", size: 11, color: "#6b7280" },

    // 2. Raw x/y properties
    { box: "raw", x: 370, y: 140, colour: "#34d399", text: "x: 370, y: 140" },
    { label: "m2", at: [370, 180], text: "Raw x / y", size: 11, color: "#6b7280" },

    // 3. Position at another object: at: "id"
    { box: "anchor", at: [600, 140], colour: "#a78bfa", text: "Anchor" },
    { circle: "snap", at: "anchor", r: 40, colour: "#fbbf24", opacity: 0.4 },
    { label: "m3", at: [600, 200], text: "at: \\"anchor\\"", size: 11, color: "#6b7280" },

    // 4. Object + offset: at: ["id", dx, dy]
    { point: "hub", at: [200, 330] },
    { label: "hubL", at: [200, 330], text: "+", size: 14, color: "#4a4f59" },
    { box: "offA", at: ["hub", -80, -40], colour: "#f472b6", text: "[-80,-40]", w: 100 },
    { box: "offB", at: ["hub", 80, -40], colour: "#60a5fa", text: "[+80,-40]", w: 100 },
    { box: "offC", at: ["hub", 0, 60], colour: "#fb923c", text: "[0,+60]", w: 100 },
    { label: "m4", at: [200, 420], text: "at: [\\"hub\\", dx, dy]", size: 11, color: "#6b7280" },

    // 5. Lines also use PointRef: from/to accept same formats
    { box: "src", at: [470, 290], colour: "#22d3ee", text: "Source" },
    { box: "dst", at: [700, 290], colour: "#34d399", text: "Dest" },
    { line: "l1", from: "src", to: "dst", colour: "#fbbf24", label: "from \\"id\\"", progress: 0 },
    { line: "l2", from: [470, 360], to: [700, 360], colour: "#a78bfa", label: "from [x,y]", progress: 0 },
    { line: "l3", from: ["src", 0, 80], to: ["dst", 0, 80], colour: "#f472b6", label: "[\\"id\\",dx,dy]", progress: 0 },
    { label: "m5", at: [585, 460], text: "Lines accept the same PointRef formats", size: 11, color: "#6b7280" },
  ],
}`,
  },

  {
    id: 'at-ref-animation',
    title: 'Relative Position Tracking',
    category: 'layout',
    description: 'Objects positioned with at: "id" follow their target during animation, preserving offsets through nested chains.',
    dsl: `{
  objects: [
    { label: "title", at: [400, 30], text: "Relative Position Tracking", size: 16, color: "#e2e5ea", bold: true },
    { label: "hint", at: [400, 460], text: "Hub moves the constellation — satellite C also orbits independently", size: 11, color: "#4a4f59" },

    // Hub: the root that everything is relative to
    { box: "hub", at: [200, 250], colour: "#a78bfa", text: "Hub", w: 80, h: 50, radius: 24 },

    // Satellites positioned relative to hub
    { box: "satA", at: ["hub", -120, -80], colour: "#22d3ee", text: "A", w: 70 },
    { box: "satB", at: ["hub", 120, -80], colour: "#34d399", text: "B", w: 70 },
    { box: "satC", at: ["hub", 0, 100], colour: "#f472b6", text: "C", w: 70 },

    // Nested: labels relative to satellites (chained refs)
    { label: "lblA", at: ["satA", 0, 35], text: "child of A", size: 10, color: "#6b7280" },
    { label: "lblB", at: ["satB", 0, 35], text: "child of B", size: 10, color: "#6b7280" },
    { label: "lblC", at: ["satC", 0, 35], text: "child of C", size: 10, color: "#6b7280" },

    // Lines connecting hub to satellites
    { line: "lA", from: "hub", to: "satA", colour: "#22d3ee", dashed: true, arrow: false },
    { line: "lB", from: "hub", to: "satB", colour: "#34d399", dashed: true, arrow: false },
    { line: "lC", from: "hub", to: "satC", colour: "#f472b6", dashed: true, arrow: false },
  ],
  animate: {
    duration: 6, loop: true, easing: "easeInOut",
    keyframes: {
      hub: [
        [0, "x", 200],
        [0, "y", 250],
        [1.5, "x", 550],
        [1.5, "y", 180],
        [3.0, "x", 550],
        [3.0, "y", 320],
        [4.5, "x", 200],
        [4.5, "y", 250],
      ],
      // C's offset orbits independently while still tracking hub
      satC: [
        [0, "x", 0],     [0, "y", 100],
        [1.5, "x", 100], [1.5, "y", 0],
        [3.0, "x", 0],   [3.0, "y", -100],
        [4.5, "x", -100],[4.5, "y", 0],
        [6.0, "x", 0],   [6.0, "y", 100],
      ],
    },
  },
}`,
  },

  // ═════════════════════════════════════════════════════════════
  // EFFECTS
  // ═════════════════════════════════════════════════════════════

  {
    id: 'pulse-effect',
    title: 'Pulse',
    category: 'effects',
    description: 'Temporary scale bumps triggered at keyframe times.',
    dsl: `{
  objects: [
    { box: "small", at: [200, 200], colour: "#22d3ee", text: "Small pulse" },
    { box: "big", at: [500, 200], colour: "#a78bfa", text: "Big pulse" },
    { label: "hint", at: [350, 320], text: "pulse: additive scale that decays over 0.4s", size: 11, color: "#4a4f59" },
  ],
  animate: {
    duration: 4, loop: false,
    keyframes: [
      { time: 0.5, changes: { small: { pulse: 0.08 } } },
      { time: 1.0, changes: { big: { pulse: 0.2 } } },
      { time: 2.0, changes: { small: { pulse: 0.08 }, big: { pulse: 0.2 } } },
      { time: 3.0, changes: { small: { pulse: 0.15 }, big: { pulse: 0.3 } } },
    ],
  },
}`,
  },

  {
    id: 'flash-glow',
    title: 'Flash & Glow',
    category: 'effects',
    description: 'Flash dims briefly, glow increases stroke width.',
    dsl: `{
  objects: [
    { box: "flashBox", at: [250, 180], colour: "#60a5fa", text: "Flash (dims)" },
    { box: "glowBox", at: [550, 180], colour: "#f472b6", text: "Glow", strokeWidth: 2 },
    { label: "fDesc", at: [250, 240], text: "flash: 0.6 — dims to 40% briefly", size: 11, color: "#4a4f59" },
    { label: "gDesc", at: [550, 240], text: "glow: 4 — strokeWidth +4 briefly", size: 11, color: "#4a4f59" },
  ],
  animate: {
    duration: 5, loop: false,
    keyframes: [
      { time: 0.8, changes: { flashBox: { flash: 0.6 } } },
      { time: 1.6, changes: { glowBox: { glow: 4 } } },
      { time: 2.8, changes: { flashBox: { flash: 0.6 }, glowBox: { glow: 6 } } },
      { time: 3.8, changes: { flashBox: { flash: 0.8 }, glowBox: { glow: 8 } } },
    ],
  },
}`,
  },

  {
    id: 'shake-effect',
    title: 'Shake',
    category: 'effects',
    description: 'Error-state shake with configurable intensity.',
    dsl: `{
  objects: [
    { box: "input", at: [400, 140], w: 240, colour: "#ef4444", text: "Invalid email", radius: 8 },
    { box: "mild", at: [200, 280], colour: "#fbbf24", text: "Mild (3px)" },
    { box: "strong", at: [600, 280], colour: "#ef4444", text: "Strong (10px)" },
  ],
  animate: {
    duration: 4, loop: false,
    keyframes: [
      { time: 0.5, changes: { input: { shake: 6, flash: 0.4 } } },
      { time: 1.5, changes: { mild: { shake: 3 } } },
      { time: 2.0, changes: { strong: { shake: 10, flash: 0.3 } } },
      { time: 3.0, changes: { input: { shake: 8, flash: 0.5 } } },
    ],
  },
}`,
  },

  {
    id: 'combined-effects',
    title: 'Combined Effects',
    category: 'effects',
    description: 'Multiple effects in a single keyframe block.',
    dsl: `{
  objects: [
    { box: "server", at: [200, 200], colour: "#34d399", text: "Server" },
    { box: "error", at: [600, 200], colour: "#ef4444", text: "Error" },
    { line: "conn", from: "server", to: "error", colour: "#fbbf24", label: "timeout", progress: 0 },
  ],
  animate: {
    duration: 4, loop: false, easing: "easeInOut",
    keyframes: [
      { time: 1.0, changes: {
        conn: { progress: 1 },
        server: { pulse: 0.1 },
      } },
      { time: 2.0, changes: {
        error: { pulse: 0.15, shake: 6, glow: 4, flash: 0.3 },
      } },
    ],
  },
}`,
  },

  // ═════════════════════════════════════════════════════════════
  // TEXT
  // ═════════════════════════════════════════════════════════════

  {
    id: 'textblock',
    title: 'Text Block',
    category: 'text',
    description: 'Multi-line text with per-line fade-in animation.',
    dsl: `{
  objects: [
    { textblock: "intro", at: [400, 200], lines: [
        "Welcome to Starch",
        "Animated diagrams for documentation",
        "Built with SVG and TypeScript",
      ], size: 16, color: "#e2e5ea", lineHeight: 1.8, align: "middle",
    },
  ],
  animate: {
    duration: 4, loop: false, easing: "easeInOut",
    keyframes: [
      { time: 0, changes: {
        "intro.line0": { opacity: 0 },
        "intro.line1": { opacity: 0 },
        "intro.line2": { opacity: 0 },
      } },
      { time: 1.0, changes: { "intro.line0": { opacity: 1 } } },
      { time: 2.0, changes: { "intro.line1": { opacity: 1 } } },
      { time: 3.0, changes: { "intro.line2": { opacity: 1 } } },
    ],
  },
}`,
  },

  {
    id: 'codeblock',
    title: 'Code Block',
    category: 'text',
    description: 'Syntax-highlighted code with line animation.',
    dsl: `{
  objects: [
    { code: "snippet", at: [400, 200], syntax: "javascript", lines: [
        "function greet(name) {",
        "  return 'Hello, ' + name;",
        "}",
        "",
        "greet('World');",
      ], color: "#b0b5be",
    },
  ],
  animate: {
    duration: 6, loop: false, easing: "easeInOut",
    keyframes: [
      // Highlight the return line
      { time: 1.5, changes: { "snippet.line1": { color: "#22d3ee" } } },
      // Fade out line 4 before swapping text
      { time: 2.5, changes: {
        "snippet.line1": { color: "#b0b5be" },
        "snippet.line4": { opacity: 0 },
      } },
      // Swap text and fade back in
      { time: 3.0, changes: {
        "snippet.line4": { text: "greet('Starch');", opacity: 1, easing: "cut" },
      } },
      // Dim non-essential lines
      { time: 4.5, changes: {
        "snippet.line0": { opacity: 0.3 },
        "snippet.line2": { opacity: 0.3 },
        "snippet.line3": { opacity: 0.3 },
        "snippet.line4": { color: "#34d399", bold: true },
      } },
    ],
  },
}`,
  },

  // ═════════════════════════════════════════════════════════════
  // CAMERA
  // ═════════════════════════════════════════════════════════════

  {
    id: 'viewport',
    title: 'Viewport',
    category: 'camera',
    description: 'Set aspect ratio with viewport — toggle "Ratio" in header to preview.',
    dsl: `{
  viewport: "16:9",
  objects: [
    { camera: "cam", target: [400, 225] },
    { label: "title", at: [400, 60], text: "16:9 Viewport", size: 18, color: "#e2e5ea", bold: true },
    { box: "a", at: [150, 225], colour: "#22d3ee", text: "Left" },
    { box: "b", at: [400, 225], colour: "#a78bfa", text: "Center" },
    { box: "c", at: [650, 225], colour: "#34d399", text: "Right" },
    { line: "l1", from: "a", to: "b", colour: "#fbbf24", progress: 0 },
    { line: "l2", from: "b", to: "c", colour: "#fbbf24", progress: 0 },
  ],
  animate: {
    duration: 4, loop: false, easing: "easeInOut",
    keyframes: [
      { time: 1.0, changes: { l1: { progress: 1 }, a: { pulse: 0.1 }, b: { pulse: 0.1 } } },
      { time: 2.5, changes: { l2: { progress: 1 }, b: { pulse: 0.1 }, c: { pulse: 0.1 } } },
    ],
  },
}`,
  },

  {
    id: 'camera-zoom',
    title: 'Zoom & Pan',
    category: 'camera',
    description: 'Camera zooms into a box then pans to another.',
    dsl: `{
  objects: [
    { camera: "cam", target: [400, 200], zoom: 1 },
    { box: "a", at: [200, 200], colour: "#22d3ee", text: "Server" },
    { box: "b", at: [600, 200], colour: "#34d399", text: "Database" },
    { line: "conn", from: "a", to: "b", colour: "#fbbf24", label: "query", progress: 0 },
  ],
  animate: {
    duration: 6, loop: false, easing: "easeInOut",
    keyframes: [
      { time: 1.5, changes: { cam: { target: "a", zoom: 2 }, conn: { progress: 0 } } },
      { time: 3.0, changes: { cam: { zoom: 1.5 }, conn: { progress: 1 } } },
      { time: 4.5, changes: { cam: { target: "b", zoom: 2 }, b: { pulse: 0.1 } } },
      { time: 6.0, changes: { cam: { target: [400, 200], zoom: 1 } } },
    ],
  },
}`,
  },

  {
    id: 'camera-follow',
    title: 'Follow Object',
    category: 'camera',
    description: 'Camera follows a box as it moves between containers.',
    dsl: `{
  objects: [
    { camera: "cam", target: "mover", zoom: 1.8 },
    { box: "left", at: [200, 200], direction: "column", padding: 14, colour: "#2a2d35", radius: 12 },
    { box: "right", at: [600, 200], direction: "column", padding: 14, colour: "#2a2d35", radius: 12 },
    { box: "stay", colour: "#60a5fa", text: "Static", group: "left" },
    { box: "mover", colour: "#fbbf24", text: "Moving!", group: "left" },
    { box: "dest", colour: "#34d399", text: "Waiting", group: "right" },
  ],
  animate: {
    duration: 5, loop: false, easing: "easeInOut",
    keyframes: [
      { time: 2.5, changes: { mover: { group: "right" } } },
      { time: 4.0, changes: { cam: { zoom: 1 } } },
    ],
  },
}`,
  },

  {
    id: 'camera-fit',
    title: 'Fit to Objects',
    category: 'camera',
    description: 'Camera fits to different groups spread across a large canvas.',
    dsl: `{
  objects: [
    { camera: "cam", fit: "all" },

    // Top-left cluster
    { box: "a1", at: [-200, -100], colour: "#22d3ee", text: "Auth" },
    { box: "a2", at: [-200, -180], colour: "#22d3ee", text: "Login" },
    { line: "la", from: "a2", to: "a1", colour: "#22d3ee" },

    // Top-right cluster
    { box: "b1", at: [1000, -100], colour: "#34d399", text: "API" },
    { box: "b2", at: [1000, -180], colour: "#34d399", text: "Gateway" },
    { line: "lb", from: "b2", to: "b1", colour: "#34d399" },

    // Bottom cluster
    { box: "c1", at: [400, 600], colour: "#a78bfa", text: "Database" },
    { box: "c2", at: [400, 680], colour: "#a78bfa", text: "Cache" },
    { line: "lc", from: "c1", to: "c2", colour: "#a78bfa" },

    // Connections between clusters
    { line: "x1", from: "a1", to: "b1", colour: "#fbbf24", label: "requests", dashed: true },
    { line: "x2", from: "b1", to: "c1", colour: "#fbbf24", label: "queries", dashed: true },
  ],
  animate: {
    duration: 10, loop: false, easing: "easeInOut",
    keyframes: [
      // Smooth zoom into auth cluster
      { time: 2.0, changes: { cam: { fit: ["a1", "a2"] } } },
      // Cut to API cluster
      { time: 4.0, changes: { cam: { fit: ["b1", "b2"], easing: "cut" } } },
      // Cut to database cluster
      { time: 6.0, changes: { cam: { fit: ["c1", "c2"], easing: "cut" } } },
      // Smooth zoom out to see everything
      { time: 8.0, changes: { cam: { fit: "all" } } },
    ],
  },
}`,
  },

  {
    id: 'camera-path',
    title: 'Follow Path',
    category: 'camera',
    description: 'Camera follows an object moving along a path.',
    dsl: `{
  objects: [
    { camera: "cam", target: "runner", zoom: 2.5 },
    { line: "track", closed: true, visible: false, arrow: false, colour: "#2a2d35",
      route: [[600,200], [400,350], [200,200], [400,100]], closed: true },
    { box: "runner", follow: "track", size: [80, 36], colour: "#f472b6", text: "Go!", radius: 6 },
    { box: "a", at: [200, 200], colour: "#22d3ee", text: "A" },
    { box: "b", at: [600, 200], colour: "#34d399", text: "B" },
    { box: "c", at: [400, 350], colour: "#a78bfa", text: "C" },
  ],
  animate: {
    duration: 6, loop: true, easing: "linear",
    keyframes: {
      runner: [[0, "pathProgress", 0], [6, "pathProgress", 1]],
    },
  },
}`,
  },

  // ═════════════════════════════════════════════════════════════
  // STYLES
  // ═════════════════════════════════════════════════════════════

  {
    id: 'styles',
    title: 'Reusable Styles',
    category: 'styles',
    description: 'Define named styles and compose them across objects.',
    dsl: `{
  styles: {
    card: { colour: "#22d3ee", radius: 12 },
    muted: { colour: "#6b7280", opacity: 0.6 },
    wide: { style: "card", w: 220 },
    alert: { style: "card", colour: "#ef4444" },
  },
  objects: [
    { label: "title", at: [400, 40], text: "Reusable Styles", size: 16, color: "#e2e5ea", bold: true },

    { box: "a", at: [150, 150], style: "card", text: "Card" },
    { box: "b", at: [400, 150], style: "wide", text: "Wide Card" },
    { box: "c", at: [650, 150], style: "alert", text: "Alert" },
    { box: "d", at: [150, 280], style: "muted", text: "Muted" },
    { box: "e", at: [400, 280], style: "card", colour: "#34d399", text: "Override" },
    { box: "f", at: [650, 280], style: "muted", text: "Also Muted" },
  ],
  animate: {
    duration: 4, loop: false, easing: "easeInOut",
    keyframes: [
      { time: 2.0, changes: {
        a: { pulse: 0.1 },
        b: { pulse: 0.1 },
        c: { shake: 4 },
        d: { opacity: 1 },
        f: { opacity: 1 },
      } },
    ],
  },
}`,
  },

  // ═════════════════════════════════════════════════════════════
  // ANIMATION
  // ═════════════════════════════════════════════════════════════

  {
    id: 'easings',
    title: 'Easings',
    category: 'animation',
    description: 'All easing functions compared side by side.',
    dsl: `{
  objects: [
    { label: "t1", at: [100, 80], text: "linear", size: 11, color: "#4a4f59" },
    { label: "t2", at: [100, 120], text: "easeInOut", size: 11, color: "#4a4f59" },
    { label: "t3", at: [100, 160], text: "easeOutCubic", size: 11, color: "#4a4f59" },
    { label: "t4", at: [100, 200], text: "easeOutBack", size: 11, color: "#4a4f59" },
    { label: "t5", at: [100, 240], text: "bounce", size: 11, color: "#4a4f59" },
    { label: "t6", at: [100, 280], text: "elastic", size: 11, color: "#4a4f59" },
    { label: "t7", at: [100, 320], text: "spring", size: 11, color: "#4a4f59" },
    { label: "t8", at: [100, 360], text: "snap", size: 11, color: "#4a4f59" },

    { box: "b1", at: [200, 80], size: [60, 26], colour: "#60a5fa", radius: 4 },
    { box: "b2", at: [200, 120], size: [60, 26], colour: "#22d3ee", radius: 4 },
    { box: "b3", at: [200, 160], size: [60, 26], colour: "#34d399", radius: 4 },
    { box: "b4", at: [200, 200], size: [60, 26], colour: "#a78bfa", radius: 4 },
    { box: "b5", at: [200, 240], size: [60, 26], colour: "#f472b6", radius: 4 },
    { box: "b6", at: [200, 280], size: [60, 26], colour: "#fbbf24", radius: 4 },
    { box: "b7", at: [200, 320], size: [60, 26], colour: "#fb923c", radius: 4 },
    { box: "b8", at: [200, 360], size: [60, 26], colour: "#ef4444", radius: 4 },
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
  },

  {
    id: 'keyframe-blocks',
    title: 'Keyframe Blocks',
    category: 'animation',
    description: 'Step-by-step data flow using the keyframe-block format.',
    dsl: `{
  objects: [
    { box: "ingest", at: [100, 200], colour: "#60a5fa", text: "Ingest" },
    { box: "process", at: [350, 200], colour: "#a78bfa", text: "Process" },
    { box: "store", at: [600, 200], colour: "#34d399", text: "Store" },
    { line: "l1", from: "ingest", to: "process", colour: "#60a5fa", label: "raw", progress: 0 },
    { line: "l2", from: "process", to: "store", colour: "#34d399", label: "clean", progress: 0 },
  ],
  animate: {
    duration: 5, loop: false, easing: "easeInOut",
    // Each block is a moment — all changes at that time grouped together
    keyframes: [
      { time: 1.0, changes: {
        l1: { progress: 1 },
        ingest: { pulse: 0.1 },
        process: { pulse: 0.1 },
      } },
      { time: 3.0, changes: {
        l2: { progress: 1 },
        process: { pulse: 0.1 },
        store: { pulse: 0.1 },
      } },
    ],
  },
}`,
  },

  {
    id: 'chapters',
    title: 'Chapters',
    category: 'animation',
    description: 'Named time markers that pause playback.',
    dsl: `{
  objects: [
    { box: "client", at: [150, 200], colour: "#60a5fa", text: "Client" },
    { box: "server", at: [400, 200], colour: "#34d399", text: "Server" },
    { box: "db", at: [650, 200], colour: "#a78bfa", text: "Database" },
    { line: "req", from: "client", to: "server", colour: "#fbbf24", label: "SYN", progress: 0 },
    { line: "ack", from: "server", to: "client", colour: "#34d399", label: "SYN-ACK", progress: 0, bend: 30 },
    { line: "query", from: "server", to: "db", colour: "#a78bfa", label: "SELECT", progress: 0 },
  ],
  animate: {
    duration: 9, loop: false, easing: "easeInOut",
    chapters: [
      { time: 0, title: "Connect", description: "Client sends SYN to server" },
      { time: 3, title: "Handshake", description: "Server responds with SYN-ACK" },
      { time: 6, title: "Query", description: "Server queries the database" },
    ],
    keyframes: [
      { time: 1.5, changes: { req: { progress: 1 }, client: { pulse: 0.1 }, server: { pulse: 0.1 } } },
      { time: 4.5, changes: { ack: { progress: 1 }, server: { pulse: 0.1 }, client: { pulse: 0.1 } } },
      { time: 7.5, changes: { query: { progress: 1 }, server: { pulse: 0.1 }, db: { pulse: 0.1 } } },
    ],
  },
}`,
  },

  {
    id: 'auto-key',
    title: 'Auto-Key',
    category: 'animation',
    description: 'autoKey holds values between blocks — no surprise interpolation.',
    dsl: `{
  objects: [
    { label: "title", at: [400, 40], text: "autoKey: true (default)", size: 14, color: "#e2e5ea", bold: true },
    { box: "a", at: [200, 150], colour: "#22d3ee", text: "Moves at t=1" },
    { box: "b", at: [200, 300], colour: "#fbbf24", text: "Moves at t=3" },
    { label: "hint", at: [400, 400], text: "Both transitions take 1s (between adjacent blocks), not from t=0", size: 11, color: "#4a4f59" },
  ],
  animate: {
    duration: 4, loop: false, easing: "easeInOut",
    keyframes: [
      { time: 1.0, changes: { a: { x: 600 } } },
      { time: 2.0, changes: {} },
      { time: 3.0, changes: { b: { x: 600 } } },
    ],
  },
}`,
  },

  {
    id: 'per-block-autokey',
    title: 'Per-Block autoKey',
    category: 'animation',
    description: 'autoKey: false on a block lets you insert effects mid-transition without disrupting timing.',
    dsl: `{
  objects: [
    { label: "title", at: [400, 40], text: "Per-Block autoKey: false", size: 14, color: "#e2e5ea", bold: true },
    { box: "a", at: [150, 150], colour: "#22d3ee", text: "A", w: 80, h: 80 },
    { box: "b", at: [650, 150], colour: "#fbbf24", text: "B", w: 80, h: 80 },
    { label: "hint", at: [400, 400], text: "A and B swap smoothly over 4s — shake and colour change at the midpoint don't interrupt", size: 11, color: "#4a4f59" },
  ],
  animate: {
    duration: 6, loop: false, easing: "easeInOut",
    keyframes: [
      // Mid-swap: shake + colour pop — autoKey: false so the swap isn't disrupted
      { time: 3, autoKey: false, changes: {
        a: { shake: 6, fill: "#a78bfa" },
        b: { shake: 6, fill: "#34d399" },
      }},
      // End of swap
      { time: 5, changes: { a: { x: 650 }, b: { x: 150 } } },
    ],
  },
}`,
  },

  {
    id: 'relative-times',
    title: 'Timing: plus & delay',
    category: 'animation',
    description: 'Use "plus" for relative times and "delay" for pauses.',
    dsl: `{
  objects: [
    { label: "title", at: [400, 40], text: "plus & delay", size: 16, color: "#e2e5ea", bold: true },
    { box: "a", at: [150, 150], colour: "#22d3ee", text: "A" },
    { box: "b", at: [150, 250], colour: "#34d399", text: "B" },
    { box: "c", at: [150, 350], colour: "#a78bfa", text: "C" },
    { label: "hint", at: [400, 430], text: "plus: relative time, delay: wait before this keyframe starts", size: 11, color: "#4a4f59" },
  ],
  animate: {
    duration: 7, loop: false, easing: "easeInOut",
    keyframes: [
      // A moves at t=1
      { time: 1.0, changes: { a: { x: 650, pulse: 0.1 } } },
      // B waits 1s then moves (hold at t=2, B moves at t=3)
      { plus: 1.0, delay: 1.0, changes: { b: { x: 650, pulse: 0.1 } } },
      // C waits 1s then moves (hold at t=4, C moves at t=5)
      { plus: 1.0, delay: 1.0, changes: { c: { x: 650, pulse: 0.1 } } },
    ],
  },
}`,
  },
];
