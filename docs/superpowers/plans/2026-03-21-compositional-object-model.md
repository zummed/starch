# Compositional Object Model Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite Starch's object model so everything is a nested node tree with individually animatable leaf properties, replacing the current flat shape-type system.

**Architecture:** Clean-room rewrite in `src/v2/` alongside the existing system. New node types, tree walker, animation engine, layout system, renderer, templates, and parser. The old system remains functional until the new system can reproduce all existing diagrams, at which point it is replaced.

**Tech Stack:** TypeScript 5.7, Zod (validation), React 19 (renderer), Vitest (tests), JSON5 (DSL parsing)

**Spec:** `docs/superpowers/specs/2026-03-20-compositional-object-model-design.md`

---

## File Structure

All new code lives under `src/v2/` to avoid conflicts with the existing system:

```
src/v2/
├── types/
│   ├── node.ts              — Node interface, geometry types (RectGeom, EllipseGeom, etc.)
│   ├── properties.ts        — Property sub-objects (HslColor, Stroke, Transform, Dash, Layout, etc.)
│   ├── color.ts             — Color parsing & normalization (hex/named/rgb/hsl → HSL)
│   ├── anchor.ts            — Anchor types (NamedAnchor, FloatAnchor)
│   └── animation.ts         — KeyframeBlock, AnimConfig, TrackKeyframe types
│
├── tree/
│   ├── walker.ts            — Depth-first tree walk, generates track paths
│   ├── resolve.ts           — Inheritance resolution, style merging, _ownKeys tracking
│   └── validate.ts          — Tree validation (single geometry, no cycles, no ID collisions)
│
├── animation/
│   ├── timeline.ts          — Build tracks from keyframe blocks (autoKey, shorthand expansion)
│   ├── evaluator.ts         — Evaluate track values at time T
│   ├── interpolate.ts       — Numeric lerp, HSL interpolation (shortest-arc hue), string step
│   ├── easing.ts            — Easing functions (reuse existing src/engine/easing.ts)
│   └── effects.ts           — Ephemeral additive track entries (pulse, shake, flash, glow)
│
├── layout/
│   ├── registry.ts          — LayoutStrategy type, strategy registry
│   ├── flex.ts              — Flex layout strategy
│   └── absolute.ts          — Absolute layout strategy (passthrough)
│
├── renderer/
│   ├── renderTree.ts        — Single recursive render function
│   ├── geometry.ts           — Geometry → SVG attribute mapping (rect→<rect>, etc.)
│   ├── hslToCSS.ts           — HSL object → CSS hsl() string
│   ├── connections.ts        — Path endpoint resolution, dynamic tracking, bezier
│   └── camera.ts             — ViewBox interpolation pipeline
│
├── templates/
│   ├── registry.ts           — Template registry, $ substitution engine
│   ├── builtins/
│   │   ├── box.ts            — Box template (rect + text + fill + stroke)
│   │   ├── circle.ts         — Circle template (ellipse + text + fill + stroke)
│   │   ├── label.ts          — Label template (text + fill)
│   │   ├── table.ts          — Table template (rect grid + text cells)
│   │   ├── line.ts           — Line template (path + arrowheads + label + dash)
│   │   ├── textblock.ts      — Textblock template (multiple text children)
│   │   └── codeblock.ts      — Codeblock template (textblock + syntax)
│   └── index.ts              — Export all builtins
│
├── parser/
│   ├── parser.ts             — JSON5 → node tree (color resolution, template expansion, style merge, validation, track generation)
│   └── compat.ts             — Old DSL format → new node tree translation
│
└── __tests__/
    ├── types/
    │   ├── node.test.ts
    │   └── color.test.ts
    ├── tree/
    │   ├── walker.test.ts
    │   ├── resolve.test.ts
    │   └── validate.test.ts
    ├── animation/
    │   ├── timeline.test.ts
    │   ├── evaluator.test.ts
    │   ├── interpolate.test.ts
    │   └── effects.test.ts
    ├── layout/
    │   ├── flex.test.ts
    │   └── registry.test.ts
    ├── renderer/
    │   ├── renderTree.test.ts
    │   ├── geometry.test.ts
    │   ├── connections.test.ts
    │   └── camera.test.ts
    ├── templates/
    │   ├── registry.test.ts
    │   └── builtins.test.ts
    └── parser/
        ├── parser.test.ts
        └── compat.test.ts
```

---

## Chunk 1: Phase 1 — Core Model & Tree Walker

### Task 1: Property Sub-Object & Anchor Types

**Files:**
- Create: `src/v2/types/properties.ts`
- Create: `src/v2/types/anchor.ts`
- Test: (pure types — validated by Task 2's node tests)

> **Note:** These must be created before `node.ts` since it imports from `properties.ts`.

- [ ] **Step 1: Write property types**

```typescript
// src/v2/types/properties.ts
export interface HslColor {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

export interface Stroke {
  h: number;
  s: number;
  l: number;
  width: number;
}

export interface Transform {
  x?: number;
  y?: number;
  rotation?: number;
  scale?: number;
  anchor?: string | [number, number];
  pathFollow?: string;
  pathProgress?: number;
}

export interface Dash {
  pattern: string; // "solid", "dashed", "dotted", or SVG dasharray
  length: number;
  gap: number;
}

export interface Layout {
  type: string;
  direction?: string;
  gap?: number;
  justify?: string;
  align?: string;
  wrap?: boolean;
  padding?: number;
}

export type LayoutHint = Record<string, number | string | boolean>;

export interface Size {
  w: number;
  h: number;
}
```

```typescript
// src/v2/types/anchor.ts
export const NAMED_ANCHORS = [
  'center', 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW',
  'top', 'bottom', 'left', 'right',
  'topleft', 'topright', 'bottomleft', 'bottomright',
] as const;

export type NamedAnchor = typeof NAMED_ANCHORS[number];
export type FloatAnchor = [number, number];
export type AnchorPoint = NamedAnchor | FloatAnchor;

export function isNamedAnchor(value: unknown): value is NamedAnchor {
  return typeof value === 'string' && NAMED_ANCHORS.includes(value as NamedAnchor);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/v2/types/properties.ts src/v2/types/anchor.ts
git commit -m "feat(v2): add property sub-object types and anchor definitions"
```

---

### Task 2: Node & Geometry Types

**Files:**
- Create: `src/v2/types/node.ts`
- Test: `src/v2/__tests__/types/node.test.ts`

- [ ] **Step 1: Write failing tests for node type construction**

```typescript
// src/v2/__tests__/types/node.test.ts
import { describe, it, expect } from 'vitest';
import { createNode, type Node } from '../../types/node';

describe('Node', () => {
  it('creates a minimal node with just an id', () => {
    const node = createNode({ id: 'n1' });
    expect(node.id).toBe('n1');
    expect(node.children).toEqual([]);
    expect(node.visible).toBe(true);
  });

  it('creates a node with rect geometry', () => {
    const node = createNode({
      id: 'r1',
      rect: { w: 100, h: 60, radius: 4 },
    });
    expect(node.rect).toEqual({ w: 100, h: 60, radius: 4 });
    expect(node.ellipse).toBeUndefined();
  });

  it('creates a node with children', () => {
    const node = createNode({
      id: 'parent',
      children: [
        createNode({ id: 'child1' }),
        createNode({ id: 'child2' }),
      ],
    });
    expect(node.children).toHaveLength(2);
    expect(node.children[0].id).toBe('child1');
  });

  it('creates a node with all geometry types', () => {
    expect(createNode({ id: 'a', rect: { w: 10, h: 10 } }).rect).toBeDefined();
    expect(createNode({ id: 'b', ellipse: { rx: 5, ry: 5 } }).ellipse).toBeDefined();
    expect(createNode({ id: 'c', text: { content: 'hi', size: 14 } }).text).toBeDefined();
    expect(createNode({ id: 'd', path: { points: [[0,0],[1,1]], closed: false } }).path).toBeDefined();
    expect(createNode({ id: 'e', image: { src: 'test.png', w: 50, h: 50 } }).image).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/v2/__tests__/types/node.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement node types**

```typescript
// src/v2/types/node.ts
import type { HslColor, Stroke, Transform, Dash, Layout, LayoutHint, Size } from './properties';

export interface RectGeom {
  w: number;
  h: number;
  radius?: number;
}

export interface EllipseGeom {
  rx: number;
  ry: number;
}

export interface TextGeom {
  content: string;
  size: number;
  lineHeight?: number;
  align?: 'start' | 'middle' | 'end';
  bold?: boolean;
  mono?: boolean;
}

export type PointRef = string | [number, number] | [string, number, number];

export interface PathGeom {
  points?: [number, number][];
  from?: PointRef;
  to?: PointRef;
  fromAnchor?: string | [number, number];
  toAnchor?: string | [number, number];
  closed?: boolean;
  smooth?: boolean;
  bend?: number;
  route?: [number, number][];
  radius?: number;
  drawProgress?: number;
}

export interface ImageGeom {
  src: string;
  fit?: 'contain' | 'cover' | 'fill';
  padding?: number;
  w: number;
  h: number;
}

export interface Node {
  id: string;
  children: Node[];
  visible: boolean;

  // Geometry (at most one)
  rect?: RectGeom;
  ellipse?: EllipseGeom;
  text?: TextGeom;
  path?: PathGeom;
  image?: ImageGeom;

  // Visual properties (inheritable)
  fill?: HslColor;
  stroke?: Stroke;
  opacity?: number;

  // Transform (composable)
  transform?: Transform;

  // Non-inheritable
  depth?: number;
  dash?: Dash;
  size?: Size;
  layout?: Layout;
  layoutHint?: LayoutHint;

  // Styling
  style?: string;

  // Camera (special node)
  camera?: {
    target?: PointRef;
    zoom?: number;
    fit?: string[];
  };

  // Internal tracking
  _ownKeys?: Set<string>;
  _styleKeys?: Set<string>;
}

export interface NodeInput {
  id: string;
  children?: Node[];
  visible?: boolean;
  rect?: RectGeom;
  ellipse?: EllipseGeom;
  text?: TextGeom;
  path?: PathGeom;
  image?: ImageGeom;
  fill?: HslColor;
  stroke?: Stroke;
  opacity?: number;
  transform?: Transform;
  depth?: number;
  dash?: Dash;
  size?: Size;
  layout?: Layout;
  layoutHint?: LayoutHint;
  style?: string;
  camera?: { target?: PointRef; zoom?: number; fit?: string[] };
}

export function createNode(input: NodeInput): Node {
  return {
    ...input,
    children: input.children ?? [],
    visible: input.visible ?? true,
    _ownKeys: new Set(Object.keys(input).filter(k => k !== 'id' && k !== 'children')),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/v2/__tests__/types/node.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/v2/types/node.ts src/v2/__tests__/types/node.test.ts
git commit -m "feat(v2): add Node type and geometry interfaces"
```

---

### Task 3: Color Parsing & Normalization

**Files:**
- Create: `src/v2/types/color.ts`
- Test: `src/v2/__tests__/types/color.test.ts`

- [ ] **Step 1: Write failing tests for color parsing**

```typescript
// src/v2/__tests__/types/color.test.ts
import { describe, it, expect } from 'vitest';
import { parseColor, lerpHsl } from '../../types/color';

describe('parseColor', () => {
  it('passes through HSL objects unchanged', () => {
    const hsl = { h: 210, s: 80, l: 50 };
    expect(parseColor(hsl)).toEqual(hsl);
  });

  it('converts RGB object to HSL', () => {
    const result = parseColor({ r: 255, g: 0, b: 0 });
    expect(result.h).toBeCloseTo(0, 0);
    expect(result.s).toBeCloseTo(100, 0);
    expect(result.l).toBeCloseTo(50, 0);
  });

  it('converts hex string to HSL', () => {
    const result = parseColor('#ff0000');
    expect(result.h).toBeCloseTo(0, 0);
    expect(result.s).toBeCloseTo(100, 0);
    expect(result.l).toBeCloseTo(50, 0);
  });

  it('converts 3-digit hex to HSL', () => {
    const result = parseColor('#f00');
    expect(result.h).toBeCloseTo(0, 0);
    expect(result.s).toBeCloseTo(100, 0);
    expect(result.l).toBeCloseTo(50, 0);
  });

  it('converts named color to HSL', () => {
    const result = parseColor('red');
    expect(result.h).toBeCloseTo(0, 0);
    expect(result.s).toBeCloseTo(100, 0);
    expect(result.l).toBeCloseTo(50, 0);
  });

  it('converts dodgerblue to HSL', () => {
    const result = parseColor('dodgerblue');
    expect(result.h).toBeCloseTo(210, 0);
    expect(result.s).toBeCloseTo(100, 0);
    expect(result.l).toBeCloseTo(57, 0);
  });

  it('throws on unrecognized color', () => {
    expect(() => parseColor('notacolor')).toThrow();
  });
});

describe('lerpHsl', () => {
  it('interpolates at t=0 returns start', () => {
    const a = { h: 0, s: 100, l: 50 };
    const b = { h: 120, s: 50, l: 80 };
    expect(lerpHsl(a, b, 0)).toEqual(a);
  });

  it('interpolates at t=1 returns end', () => {
    const a = { h: 0, s: 100, l: 50 };
    const b = { h: 120, s: 50, l: 80 };
    expect(lerpHsl(a, b, 1)).toEqual(b);
  });

  it('interpolates at t=0.5 midpoint', () => {
    const a = { h: 0, s: 100, l: 50 };
    const b = { h: 120, s: 50, l: 80 };
    const mid = lerpHsl(a, b, 0.5);
    expect(mid.h).toBeCloseTo(60, 0);
    expect(mid.s).toBeCloseTo(75, 0);
    expect(mid.l).toBeCloseTo(65, 0);
  });

  it('takes shortest arc for hue (wrapping through 0)', () => {
    const a = { h: 350, s: 100, l: 50 };
    const b = { h: 10, s: 100, l: 50 };
    const mid = lerpHsl(a, b, 0.5);
    expect(mid.h).toBeCloseTo(0, 0); // short arc through 0, not 180
  });

  it('takes shortest arc for hue (other direction)', () => {
    const a = { h: 10, s: 100, l: 50 };
    const b = { h: 350, s: 100, l: 50 };
    const mid = lerpHsl(a, b, 0.5);
    expect(mid.h).toBeCloseTo(0, 0); // short arc through 0
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/v2/__tests__/types/color.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement color parsing**

```typescript
// src/v2/types/color.ts
import type { HslColor } from './properties';
import { resolveColour } from '../../core/colours';

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

function isHsl(value: unknown): value is HslColor {
  return typeof value === 'object' && value !== null && 'h' in value && 's' in value && 'l' in value;
}

function isRgb(value: unknown): value is RgbColor {
  return typeof value === 'object' && value !== null && 'r' in value && 'g' in value && 'b' in value;
}

function rgbToHsl(r: number, g: number, b: number): HslColor {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hexToRgb(hex: string): [number, number, number] {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function parseColor(input: unknown): HslColor {
  if (isHsl(input)) return input;
  if (isRgb(input)) return rgbToHsl(input.r, input.g, input.b);
  if (typeof input === 'string') {
    const resolved = resolveColour(input);
    if (!resolved.startsWith('#')) {
      throw new Error(`Unrecognized color: ${input}`);
    }
    const [r, g, b] = hexToRgb(resolved);
    return rgbToHsl(r, g, b);
  }
  throw new Error(`Invalid color input: ${JSON.stringify(input)}`);
}

export function lerpHsl(a: HslColor, b: HslColor, t: number): HslColor {
  if (t <= 0) return { ...a };
  if (t >= 1) return { ...b };

  // Shortest arc for hue
  let dh = b.h - a.h;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  let h = a.h + dh * t;
  if (h < 0) h += 360;
  if (h >= 360) h -= 360;

  return {
    h: Math.round(h),
    s: Math.round(a.s + (b.s - a.s) * t),
    l: Math.round(a.l + (b.l - a.l) * t),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/v2/__tests__/types/color.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/v2/types/color.ts src/v2/__tests__/types/color.test.ts
git commit -m "feat(v2): add color parsing (hex/named/rgb/hsl) and HSL interpolation with shortest-arc hue"
```

---

### Task 4: Tree Walker — Track Path Generation

**Files:**
- Create: `src/v2/tree/walker.ts`
- Test: `src/v2/__tests__/tree/walker.test.ts`

- [ ] **Step 1: Write failing tests for track path generation**

```typescript
// src/v2/__tests__/tree/walker.test.ts
import { describe, it, expect } from 'vitest';
import { generateTrackPaths } from '../../tree/walker';
import { createNode } from '../../types/node';

describe('generateTrackPaths', () => {
  it('generates paths for a flat node with transform', () => {
    const node = createNode({
      id: 'box1',
      transform: { x: 100, y: 50 },
    });
    const paths = generateTrackPaths([node]);
    expect(paths).toContain('box1.transform.x');
    expect(paths).toContain('box1.transform.y');
  });

  it('generates paths for fill sub-object', () => {
    const node = createNode({
      id: 'box1',
      fill: { h: 210, s: 80, l: 50 },
    });
    const paths = generateTrackPaths([node]);
    expect(paths).toContain('box1.fill.h');
    expect(paths).toContain('box1.fill.s');
    expect(paths).toContain('box1.fill.l');
  });

  it('generates paths for geometry fields', () => {
    const node = createNode({
      id: 'r1',
      rect: { w: 100, h: 60, radius: 4 },
    });
    const paths = generateTrackPaths([node]);
    expect(paths).toContain('r1.rect.w');
    expect(paths).toContain('r1.rect.h');
    expect(paths).toContain('r1.rect.radius');
  });

  it('generates paths for nested children using tree walk', () => {
    const tree = [createNode({
      id: 'parent',
      children: [
        createNode({
          id: 'bg',
          fill: { h: 0, s: 100, l: 50 },
          rect: { w: 100, h: 60 },
        }),
      ],
    })];
    const paths = generateTrackPaths(tree);
    // Tree-walk path: parent → child "bg" → fill → h
    expect(paths).toContain('parent.bg.fill.h');
    expect(paths).toContain('parent.bg.rect.w');
  });

  it('generates paths for deeply nested children', () => {
    const tree = [createNode({
      id: 'root',
      children: [
        createNode({
          id: 'mid',
          children: [
            createNode({
              id: 'leaf',
              opacity: 1,
            }),
          ],
        }),
      ],
    })];
    const paths = generateTrackPaths(tree);
    expect(paths).toContain('root.mid.leaf.opacity');
  });

  it('generates paths for stroke sub-object', () => {
    const node = createNode({
      id: 's1',
      stroke: { h: 0, s: 0, l: 60, width: 2 },
    });
    const paths = generateTrackPaths([node]);
    expect(paths).toContain('s1.stroke.h');
    expect(paths).toContain('s1.stroke.width');
  });

  it('generates paths for layoutHint freeform keys', () => {
    const node = createNode({
      id: 'item',
      layoutHint: { grow: 1, order: 2 },
    });
    const paths = generateTrackPaths([node]);
    expect(paths).toContain('item.layoutHint.grow');
    expect(paths).toContain('item.layoutHint.order');
  });

  it('generates paths for dash sub-object', () => {
    const node = createNode({
      id: 'p1',
      dash: { pattern: 'dashed', length: 8, gap: 4 },
    });
    const paths = generateTrackPaths([node]);
    expect(paths).toContain('p1.dash.length');
    expect(paths).toContain('p1.dash.gap');
    expect(paths).toContain('p1.dash.pattern');
  });

  it('generates paths for size sub-object', () => {
    const node = createNode({
      id: 'c1',
      size: { w: 200, h: 100 },
    });
    const paths = generateTrackPaths([node]);
    expect(paths).toContain('c1.size.w');
    expect(paths).toContain('c1.size.h');
  });

  it('generates paths for visible and depth', () => {
    const node = createNode({
      id: 'n1',
      visible: true,
      depth: 5,
    });
    const paths = generateTrackPaths([node]);
    expect(paths).toContain('n1.visible');
    expect(paths).toContain('n1.depth');
  });

  it('generates paths for text geometry', () => {
    const node = createNode({
      id: 't1',
      text: { content: 'hello', size: 14 },
    });
    const paths = generateTrackPaths([node]);
    expect(paths).toContain('t1.text.content');
    expect(paths).toContain('t1.text.size');
  });

  it('handles multiple top-level nodes', () => {
    const nodes = [
      createNode({ id: 'a', opacity: 1 }),
      createNode({ id: 'b', opacity: 0.5 }),
    ];
    const paths = generateTrackPaths(nodes);
    expect(paths).toContain('a.opacity');
    expect(paths).toContain('b.opacity');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/v2/__tests__/tree/walker.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement tree walker**

```typescript
// src/v2/tree/walker.ts
import type { Node } from '../types/node';

/** Property keys that are sub-objects with enumerable leaf fields */
const SUB_OBJECT_KEYS = ['fill', 'stroke', 'transform', 'dash', 'size', 'layout', 'layoutHint'] as const;

/** Property keys that are geometry sub-objects */
const GEOMETRY_KEYS = ['rect', 'ellipse', 'text', 'path', 'image'] as const;

/** Scalar property keys directly on the node */
const SCALAR_KEYS = ['opacity', 'depth', 'visible'] as const;

function collectLeafPaths(obj: Record<string, unknown>, prefix: string, paths: string[]): void {
  for (const [key, value] of Object.entries(obj)) {
    const path = `${prefix}.${key}`;
    if (value !== undefined && value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Nested object — recurse (but not deeper than one level for known sub-objects)
      collectLeafPaths(value as Record<string, unknown>, path, paths);
    } else if (value !== undefined) {
      paths.push(path);
    }
  }
}

function walkNode(node: Node, parentPath: string | null, paths: string[]): void {
  const nodePath = parentPath ? `${parentPath}.${node.id}` : node.id;
  const ownKeys = node._ownKeys ?? new Set<string>();

  // Scalar properties — only if explicitly declared
  for (const key of SCALAR_KEYS) {
    if (ownKeys.has(key) && node[key] !== undefined) {
      paths.push(`${nodePath}.${key}`);
    }
  }

  // Sub-object properties — only if explicitly declared
  for (const key of SUB_OBJECT_KEYS) {
    if (!ownKeys.has(key)) continue;
    const value = node[key];
    if (value !== undefined && value !== null && typeof value === 'object') {
      collectLeafPaths(value as Record<string, unknown>, `${nodePath}.${key}`, paths);
    }
  }

  // Geometry fields — always emit (these define the node's rendering)
  for (const key of GEOMETRY_KEYS) {
    const value = node[key];
    if (value !== undefined && value !== null && typeof value === 'object') {
      collectLeafPaths(value as Record<string, unknown>, `${nodePath}.${key}`, paths);
    }
  }

  // Recurse into children
  for (const child of node.children) {
    walkNode(child, nodePath, paths);
  }
}

export function generateTrackPaths(roots: Node[]): string[] {
  const paths: string[] = [];
  for (const root of roots) {
    walkNode(root, null, paths);
  }
  return paths;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/v2/__tests__/tree/walker.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/v2/tree/walker.ts src/v2/__tests__/tree/walker.test.ts
git commit -m "feat(v2): add tree walker for track path generation"
```

---

### Task 5: Tree Validation

**Files:**
- Create: `src/v2/tree/validate.ts`
- Test: `src/v2/__tests__/tree/validate.test.ts`

- [ ] **Step 1: Write failing tests for validation**

```typescript
// src/v2/__tests__/tree/validate.test.ts
import { describe, it, expect } from 'vitest';
import { validateTree } from '../../tree/validate';
import { createNode } from '../../types/node';

describe('validateTree', () => {
  it('accepts a valid tree', () => {
    const tree = [createNode({
      id: 'a',
      rect: { w: 100, h: 60 },
      children: [createNode({ id: 'b', text: { content: 'hi', size: 14 } })],
    })];
    expect(() => validateTree(tree)).not.toThrow();
  });

  it('rejects duplicate IDs', () => {
    const tree = [
      createNode({ id: 'a' }),
      createNode({ id: 'a' }),
    ];
    expect(() => validateTree(tree)).toThrow(/duplicate.*id/i);
  });

  it('rejects duplicate IDs across nesting levels', () => {
    const tree = [createNode({
      id: 'a',
      children: [createNode({ id: 'a' })],
    })];
    expect(() => validateTree(tree)).toThrow(/duplicate.*id/i);
  });

  it('rejects node with multiple geometry fields', () => {
    const tree = [createNode({
      id: 'bad',
      rect: { w: 10, h: 10 },
      ellipse: { rx: 5, ry: 5 },
    } as any)];
    expect(() => validateTree(tree)).toThrow(/geometry/i);
  });

  it('rejects style/node ID collision', () => {
    const styles = { primary: { fill: { h: 0, s: 100, l: 50 } } };
    const tree = [createNode({ id: 'primary' })];
    expect(() => validateTree(tree, styles)).toThrow(/collision/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/v2/__tests__/tree/validate.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement validation**

```typescript
// src/v2/tree/validate.ts
import type { Node } from '../types/node';

const GEOMETRY_KEYS = ['rect', 'ellipse', 'text', 'path', 'image'] as const;

function collectIds(nodes: Node[], ids: Set<string>): void {
  for (const node of nodes) {
    if (ids.has(node.id)) {
      throw new Error(`Duplicate ID: "${node.id}"`);
    }
    ids.add(node.id);

    // Check at most one geometry field
    const geomCount = GEOMETRY_KEYS.filter(k => node[k] !== undefined).length;
    if (geomCount > 1) {
      throw new Error(`Node "${node.id}" has multiple geometry fields (max 1 allowed)`);
    }

    collectIds(node.children, ids);
  }
}

export function validateTree(
  roots: Node[],
  styles?: Record<string, unknown>,
): void {
  const ids = new Set<string>();
  collectIds(roots, ids);

  // Check style/node ID collisions
  if (styles) {
    for (const styleName of Object.keys(styles)) {
      if (ids.has(styleName)) {
        throw new Error(`Style/node ID collision: "${styleName}" is both a style name and a node ID`);
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/v2/__tests__/tree/validate.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/v2/tree/validate.ts src/v2/__tests__/tree/validate.test.ts
git commit -m "feat(v2): add tree validation (duplicate IDs, multi-geometry, style collisions)"
```

---

### Task 6: Inheritance & Style Resolution

**Files:**
- Create: `src/v2/tree/resolve.ts`
- Test: `src/v2/__tests__/tree/resolve.test.ts`

- [ ] **Step 1: Write failing tests for style merging and inheritance**

```typescript
// src/v2/__tests__/tree/resolve.test.ts
import { describe, it, expect } from 'vitest';
import { resolveStyles, topoSortStyles } from '../../tree/resolve';
import { createNode } from '../../types/node';
import type { HslColor } from '../../types/properties';

describe('topoSortStyles', () => {
  it('sorts independent styles in any order', () => {
    const styles = {
      a: { fill: { h: 0, s: 100, l: 50 } },
      b: { opacity: 0.5 },
    };
    const sorted = topoSortStyles(styles);
    expect(sorted).toHaveLength(2);
  });

  it('sorts dependent styles with base first', () => {
    const styles = {
      derived: { style: 'base', opacity: 0.5 },
      base: { fill: { h: 0, s: 100, l: 50 } },
    };
    const sorted = topoSortStyles(styles);
    const baseIdx = sorted.indexOf('base');
    const derivedIdx = sorted.indexOf('derived');
    expect(baseIdx).toBeLessThan(derivedIdx);
  });

  it('throws on circular style references', () => {
    const styles = {
      a: { style: 'b' },
      b: { style: 'a' },
    };
    expect(() => topoSortStyles(styles)).toThrow(/circular/i);
  });
});

describe('resolveStyles', () => {
  it('merges style properties as defaults onto node', () => {
    const styles = {
      primary: { fill: { h: 210, s: 70, l: 45 } as HslColor },
    };
    const node = createNode({ id: 'n1', style: 'primary' });
    const resolved = resolveStyles([node], styles);
    expect(resolved[0].fill).toEqual({ h: 210, s: 70, l: 45 });
  });

  it('node own properties override style defaults', () => {
    const styles = {
      primary: { fill: { h: 210, s: 70, l: 45 } as HslColor, opacity: 0.5 },
    };
    const node = createNode({ id: 'n1', style: 'primary', fill: { h: 0, s: 100, l: 50 } });
    const resolved = resolveStyles([node], styles);
    expect(resolved[0].fill).toEqual({ h: 0, s: 100, l: 50 }); // own value wins
    expect(resolved[0].opacity).toBe(0.5); // style fills in
  });

  it('resolves composed styles', () => {
    const styles = {
      base: { fill: { h: 210, s: 70, l: 45 } as HslColor },
      derived: { style: 'base', opacity: 0.4 },
    };
    const node = createNode({ id: 'n1', style: 'derived' });
    const resolved = resolveStyles([node], styles);
    expect(resolved[0].fill).toEqual({ h: 210, s: 70, l: 45 }); // from base
    expect(resolved[0].opacity).toBe(0.4); // from derived
  });

  it('resolves styles on nested children', () => {
    const styles = {
      red: { fill: { h: 0, s: 100, l: 50 } as HslColor },
    };
    const tree = [createNode({
      id: 'parent',
      children: [createNode({ id: 'child', style: 'red' })],
    })];
    const resolved = resolveStyles(tree, styles);
    expect(resolved[0].children[0].fill).toEqual({ h: 0, s: 100, l: 50 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/v2/__tests__/tree/resolve.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement style resolution**

```typescript
// src/v2/tree/resolve.ts
import type { Node } from '../types/node';

type StyleDef = Record<string, unknown> & { style?: string };

export function topoSortStyles(styles: Record<string, StyleDef>): string[] {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const order: string[] = [];

  function visit(name: string): void {
    if (visited.has(name)) return;
    if (visiting.has(name)) throw new Error(`Circular style reference involving "${name}"`);
    visiting.add(name);
    const def = styles[name];
    if (def?.style && styles[def.style]) {
      visit(def.style);
    }
    visiting.delete(name);
    visited.add(name);
    order.push(name);
  }

  for (const name of Object.keys(styles)) {
    visit(name);
  }
  return order;
}

function resolveStyleDef(
  name: string,
  styles: Record<string, StyleDef>,
  resolved: Map<string, Record<string, unknown>>,
): Record<string, unknown> {
  if (resolved.has(name)) return resolved.get(name)!;
  const def = { ...styles[name] };
  if (def.style) {
    const base = resolveStyleDef(def.style, styles, resolved);
    const merged = { ...base, ...def };
    delete merged.style;
    resolved.set(name, merged);
    return merged;
  }
  delete def.style;
  resolved.set(name, def);
  return def;
}

const MERGEABLE_KEYS = ['fill', 'stroke', 'opacity', 'transform', 'dash', 'depth', 'visible', 'size'] as const;

function mergeStyleOntoNode(node: Node, styleDef: Record<string, unknown>): Node {
  const result = { ...node };
  const ownKeys = node._ownKeys ?? new Set();
  const styleKeys = new Set<string>();
  for (const key of MERGEABLE_KEYS) {
    if (!ownKeys.has(key) && key in styleDef) {
      (result as any)[key] = styleDef[key];
      styleKeys.add(key);
    }
  }
  // Track which keys came from styles (for inheritance resolution in renderer)
  (result as any)._styleKeys = styleKeys;
  return result;
}

function resolveNode(
  node: Node,
  styles: Record<string, StyleDef>,
  resolvedDefs: Map<string, Record<string, unknown>>,
): Node {
  let result = node;
  if (node.style && styles[node.style]) {
    const def = resolveStyleDef(node.style, styles, resolvedDefs);
    result = mergeStyleOntoNode(node, def);
  }
  if (node.children.length > 0) {
    result = {
      ...result,
      children: node.children.map(child => resolveNode(child, styles, resolvedDefs)),
    };
  }
  return result;
}

export function resolveStyles(
  roots: Node[],
  styles: Record<string, StyleDef>,
): Node[] {
  // Topological sort validates no cycles
  topoSortStyles(styles);
  const resolvedDefs = new Map<string, Record<string, unknown>>();
  return roots.map(root => resolveNode(root, styles, resolvedDefs));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/v2/__tests__/tree/resolve.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/v2/tree/resolve.ts src/v2/__tests__/tree/resolve.test.ts
git commit -m "feat(v2): add style resolution with topological sort and _ownKeys precedence"
```

---

### Task 7: Animation Types

**Files:**
- Create: `src/v2/types/animation.ts`
- Test: (pure types, validated by Phase 2 usage)

- [ ] **Step 1: Write animation types**

```typescript
// src/v2/types/animation.ts
export type EasingName =
  | 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
  | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic'
  | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart'
  | 'easeInBack' | 'easeOutBack'
  | 'bounce' | 'elastic' | 'spring'
  | 'snap' | 'step' | 'cut';

export interface PropertyChange {
  value: unknown;
  easing?: EasingName;
}

export interface KeyframeBlock {
  time: number;
  plus?: number;
  delay?: number;
  easing?: EasingName;
  autoKey?: boolean;
  changes: Record<string, unknown | PropertyChange>;
}

export interface Chapter {
  name: string;
  time: number;
}

export interface AnimConfig {
  duration: number;
  loop?: boolean;
  autoKey?: boolean;
  easing?: EasingName;
  keyframes: KeyframeBlock[];
  chapters?: Chapter[];
}

export interface TrackKeyframe {
  time: number;
  value: unknown;
  easing: EasingName;
}

export type Tracks = Map<string, TrackKeyframe[]>;
```

- [ ] **Step 2: Run all v2 tests to verify nothing broke**

Run: `npx vitest run src/v2/`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/v2/types/animation.ts
git commit -m "feat(v2): add animation type definitions (keyframes, tracks, easing)"
```

---

**End of Chunk 1.** Phase 1 delivers: Node types, property sub-objects, color parsing with HSL normalization and shortest-arc interpolation, tree walker for track path generation, tree validation, style resolution with topological sort, and animation types. All with tests.

---

## Chunk 2: Phase 2 — Animation Engine

### Task 8: Interpolation Functions

**Files:**
- Create: `src/v2/animation/interpolate.ts`
- Test: `src/v2/__tests__/animation/interpolate.test.ts`

- [ ] **Step 1: Write failing tests for interpolation**

```typescript
// src/v2/__tests__/animation/interpolate.test.ts
import { describe, it, expect } from 'vitest';
import { interpolateValue } from '../../animation/interpolate';

describe('interpolateValue', () => {
  it('linearly interpolates numbers', () => {
    expect(interpolateValue(0, 100, 0.5)).toBe(50);
    expect(interpolateValue(0, 100, 0)).toBe(0);
    expect(interpolateValue(0, 100, 1)).toBe(100);
  });

  it('interpolates negative numbers', () => {
    expect(interpolateValue(-50, 50, 0.5)).toBe(0);
  });

  it('step-interpolates strings (snaps at t >= 1)', () => {
    expect(interpolateValue('hello', 'world', 0)).toBe('hello');
    expect(interpolateValue('hello', 'world', 0.5)).toBe('hello');
    expect(interpolateValue('hello', 'world', 0.99)).toBe('hello');
    expect(interpolateValue('hello', 'world', 1)).toBe('world');
  });

  it('step-interpolates booleans', () => {
    expect(interpolateValue(true, false, 0)).toBe(true);
    expect(interpolateValue(true, false, 0.99)).toBe(true);
    expect(interpolateValue(true, false, 1)).toBe(false);
  });

  it('interpolates HSL color objects', () => {
    const a = { h: 0, s: 100, l: 50 };
    const b = { h: 120, s: 50, l: 80 };
    const mid = interpolateValue(a, b, 0.5) as { h: number; s: number; l: number };
    expect(mid.h).toBeCloseTo(60, 0);
    expect(mid.s).toBeCloseTo(75, 0);
    expect(mid.l).toBeCloseTo(65, 0);
  });

  it('uses shortest-arc for HSL hue via color interpolation', () => {
    const a = { h: 350, s: 100, l: 50 };
    const b = { h: 10, s: 100, l: 50 };
    const mid = interpolateValue(a, b, 0.5) as { h: number; s: number; l: number };
    expect(mid.h).toBeCloseTo(0, 0);
  });

  it('returns start value for unknown types', () => {
    expect(interpolateValue([1, 2], [3, 4], 0.5)).toEqual([1, 2]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/v2/__tests__/animation/interpolate.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement interpolation**

```typescript
// src/v2/animation/interpolate.ts
import { lerpHsl } from '../types/color';
import type { HslColor } from '../types/properties';

function isHslObject(value: unknown): value is HslColor {
  return typeof value === 'object' && value !== null && 'h' in value && 's' in value && 'l' in value;
}

export function interpolateValue(a: unknown, b: unknown, t: number): unknown {
  // Numeric lerp
  if (typeof a === 'number' && typeof b === 'number') {
    return a + (b - a) * t;
  }

  // HSL color objects
  if (isHslObject(a) && isHslObject(b)) {
    return lerpHsl(a, b, t);
  }

  // Strings, booleans, arrays, etc. — step interpolation
  return t >= 1 ? b : a;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/v2/__tests__/animation/interpolate.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/v2/animation/interpolate.ts src/v2/__tests__/animation/interpolate.test.ts
git commit -m "feat(v2): add value interpolation (numeric lerp, HSL shortest-arc, string step)"
```

---

### Task 9: Timeline Builder

**Files:**
- Create: `src/v2/animation/timeline.ts`
- Test: `src/v2/__tests__/animation/timeline.test.ts`

- [ ] **Step 1: Write failing tests for timeline building**

```typescript
// src/v2/__tests__/animation/timeline.test.ts
import { describe, it, expect } from 'vitest';
import { buildTimeline } from '../../animation/timeline';
import type { AnimConfig, Tracks } from '../../types/animation';

function makeConfig(overrides: Partial<AnimConfig> = {}): AnimConfig {
  return {
    duration: 4,
    keyframes: [],
    ...overrides,
  };
}

describe('buildTimeline', () => {
  it('creates tracks from keyframe block changes', () => {
    const config = makeConfig({
      keyframes: [
        { time: 0, changes: { 'box.transform.x': 0 } },
        { time: 2, changes: { 'box.transform.x': 100 } },
      ],
    });
    const tracks = buildTimeline(config);
    expect(tracks.has('box.transform.x')).toBe(true);
    const kfs = tracks.get('box.transform.x')!;
    expect(kfs).toHaveLength(2);
    expect(kfs[0]).toEqual({ time: 0, value: 0, easing: 'linear' });
    expect(kfs[1]).toEqual({ time: 2, value: 100, easing: 'linear' });
  });

  it('applies block-level easing', () => {
    const config = makeConfig({
      keyframes: [
        { time: 0, changes: { 'a.opacity': 1 } },
        { time: 2, easing: 'easeOut', changes: { 'a.opacity': 0 } },
      ],
    });
    const tracks = buildTimeline(config);
    const kfs = tracks.get('a.opacity')!;
    expect(kfs[1].easing).toBe('easeOut');
  });

  it('applies per-property easing override', () => {
    const config = makeConfig({
      keyframes: [
        { time: 0, changes: { 'a.opacity': 1 } },
        {
          time: 2,
          easing: 'easeOut',
          changes: { 'a.opacity': { value: 0, easing: 'bounce' } },
        },
      ],
    });
    const tracks = buildTimeline(config);
    const kfs = tracks.get('a.opacity')!;
    expect(kfs[1].easing).toBe('bounce');
  });

  it('applies global default easing', () => {
    const config = makeConfig({
      easing: 'easeInOut',
      keyframes: [
        { time: 0, changes: { 'x.fill.h': 0 } },
        { time: 2, changes: { 'x.fill.h': 180 } },
      ],
    });
    const tracks = buildTimeline(config);
    const kfs = tracks.get('x.fill.h')!;
    expect(kfs[1].easing).toBe('easeInOut');
  });

  it('resolves relative time with plus', () => {
    const config = makeConfig({
      keyframes: [
        { time: 0, changes: { 'a.opacity': 1 } },
        { time: 0, plus: 1.5, changes: { 'a.opacity': 0.5 } },
      ],
    });
    const tracks = buildTimeline(config);
    const kfs = tracks.get('a.opacity')!;
    expect(kfs[1].time).toBe(1.5);
  });

  it('inserts hold keyframes when autoKey is true', () => {
    const config = makeConfig({
      autoKey: true,
      keyframes: [
        { time: 0, changes: { 'a.opacity': 1, 'b.opacity': 1 } },
        { time: 2, changes: { 'a.opacity': 0 } },
        // b.opacity not mentioned in second block — autoKey should hold it at 1
      ],
    });
    const tracks = buildTimeline(config);
    const bKfs = tracks.get('b.opacity')!;
    // Should have a hold keyframe inserted at time 2
    expect(bKfs.some(kf => kf.time === 2 && kf.value === 1)).toBe(true);
  });

  it('expands shorthand sub-object targets', () => {
    const config = makeConfig({
      keyframes: [
        { time: 0, changes: { 'box.fill': { h: 0, s: 100, l: 50 } } },
        { time: 2, changes: { 'box.fill': { h: 120, s: 80, l: 60 } } },
      ],
    });
    const tracks = buildTimeline(config);
    expect(tracks.has('box.fill.h')).toBe(true);
    expect(tracks.has('box.fill.s')).toBe(true);
    expect(tracks.has('box.fill.l')).toBe(true);
    expect(tracks.get('box.fill.h')![0].value).toBe(0);
    expect(tracks.get('box.fill.h')![1].value).toBe(120);
  });

  it('handles delay by inserting hold keyframe', () => {
    const config = makeConfig({
      keyframes: [
        { time: 0, changes: { 'a.opacity': 1 } },
        { time: 0, plus: 2, delay: 0.5, changes: { 'a.opacity': 0 } },
      ],
    });
    const tracks = buildTimeline(config);
    const kfs = tracks.get('a.opacity')!;
    // delay inserts a hold at time 2, then the change at time 2.5
    expect(kfs.some(kf => kf.time === 2 && kf.value === 1)).toBe(true);
    expect(kfs.some(kf => kf.time === 2.5 && kf.value === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/v2/__tests__/animation/timeline.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement timeline builder**

```typescript
// src/v2/animation/timeline.ts
import type { AnimConfig, KeyframeBlock, TrackKeyframe, Tracks, EasingName, PropertyChange } from '../types/animation';

function isPropertyChange(value: unknown): value is PropertyChange {
  return typeof value === 'object' && value !== null && 'value' in value;
}

function isSubObjectShorthand(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !isPropertyChange(value) && !Array.isArray(value);
}

function expandChanges(
  changes: Record<string, unknown>,
  blockEasing: EasingName,
): Array<{ path: string; value: unknown; easing: EasingName }> {
  const result: Array<{ path: string; value: unknown; easing: EasingName }> = [];

  for (const [path, raw] of Object.entries(changes)) {
    if (isPropertyChange(raw)) {
      result.push({ path, value: raw.value, easing: raw.easing ?? blockEasing });
    } else if (isSubObjectShorthand(raw)) {
      // Expand { h: 0, s: 100, l: 50 } into individual leaf entries
      const obj = raw as Record<string, unknown>;
      for (const [key, val] of Object.entries(obj)) {
        if (isPropertyChange(val)) {
          result.push({ path: `${path}.${key}`, value: val.value, easing: val.easing ?? blockEasing });
        } else {
          result.push({ path: `${path}.${key}`, value: val, easing: blockEasing });
        }
      }
    } else {
      result.push({ path, value: raw, easing: blockEasing });
    }
  }
  return result;
}

export function buildTimeline(config: AnimConfig): Tracks {
  const tracks: Tracks = new Map();
  const globalEasing: EasingName = config.easing ?? 'linear';
  const autoKey = config.autoKey ?? true;

  // Resolve absolute times for all blocks
  const resolvedBlocks: Array<{ time: number; block: KeyframeBlock }> = [];
  let prevTime = 0;
  for (const block of config.keyframes) {
    let time = block.time;
    if (block.plus !== undefined) {
      time = prevTime + block.plus;
    }
    resolvedBlocks.push({ time, block });
    prevTime = time + (block.delay ?? 0);
  }

  // Track all paths seen per block for autoKey
  const allPathsPerBlock: Array<Set<string>> = [];

  // Process each block
  for (const { time: baseTime, block } of resolvedBlocks) {
    const blockEasing = block.easing ?? globalEasing;
    const entries = expandChanges(block.changes, blockEasing);
    const pathsInBlock = new Set<string>();

    for (const { path, value, easing } of entries) {
      pathsInBlock.add(path);

      if (!tracks.has(path)) {
        tracks.set(path, []);
      }
      const track = tracks.get(path)!;

      // Handle delay: insert hold keyframe at baseTime, actual change at baseTime + delay
      if (block.delay && block.delay > 0) {
        // Hold at current value
        const lastValue = track.length > 0 ? track[track.length - 1].value : value;
        track.push({ time: baseTime, value: lastValue, easing });
        track.push({ time: baseTime + block.delay, value, easing });
      } else {
        track.push({ time: baseTime, value, easing });
      }
    }

    allPathsPerBlock.push(pathsInBlock);
  }

  // AutoKey: insert hold keyframes for tracks not mentioned in a block
  if (autoKey) {
    for (const [trackPath, keyframes] of tracks) {
      for (let i = 0; i < resolvedBlocks.length; i++) {
        const { time: blockTime } = resolvedBlocks[i];
        const blockAutoKey = resolvedBlocks[i].block.autoKey ?? autoKey;
        if (!blockAutoKey) continue;

        const pathsInBlock = allPathsPerBlock[i];
        if (!pathsInBlock.has(trackPath)) {
          // This track isn't mentioned in this block — insert hold
          const prevKf = keyframes.filter(kf => kf.time < blockTime).pop();
          if (prevKf && !keyframes.some(kf => kf.time === blockTime)) {
            keyframes.push({
              time: blockTime,
              value: prevKf.value,
              easing: prevKf.easing,
            });
          }
        }
      }
      // Sort keyframes by time
      keyframes.sort((a, b) => a.time - b.time);
    }
  }

  return tracks;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/v2/__tests__/animation/timeline.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/v2/animation/timeline.ts src/v2/__tests__/animation/timeline.test.ts
git commit -m "feat(v2): add timeline builder with autoKey, shorthand expansion, easing cascade"
```

---

### Task 10: Track Evaluator

**Files:**
- Create: `src/v2/animation/evaluator.ts`
- Test: `src/v2/__tests__/animation/evaluator.test.ts`

- [ ] **Step 1: Write failing tests for track evaluation at time T**

```typescript
// src/v2/__tests__/animation/evaluator.test.ts
import { describe, it, expect } from 'vitest';
import { evaluateTrack, evaluateAllTracks } from '../../animation/evaluator';
import type { TrackKeyframe, Tracks } from '../../types/animation';

describe('evaluateTrack', () => {
  const kfs: TrackKeyframe[] = [
    { time: 0, value: 0, easing: 'linear' },
    { time: 2, value: 100, easing: 'linear' },
  ];

  it('returns start value before first keyframe', () => {
    expect(evaluateTrack(kfs, -1)).toBe(0);
  });

  it('returns start value at first keyframe', () => {
    expect(evaluateTrack(kfs, 0)).toBe(0);
  });

  it('returns end value at last keyframe', () => {
    expect(evaluateTrack(kfs, 2)).toBe(100);
  });

  it('returns end value after last keyframe', () => {
    expect(evaluateTrack(kfs, 5)).toBe(100);
  });

  it('interpolates linearly at midpoint', () => {
    expect(evaluateTrack(kfs, 1)).toBe(50);
  });

  it('interpolates at quarter point', () => {
    expect(evaluateTrack(kfs, 0.5)).toBe(25);
  });

  it('handles single keyframe', () => {
    const single: TrackKeyframe[] = [{ time: 1, value: 42, easing: 'linear' }];
    expect(evaluateTrack(single, 0)).toBe(42);
    expect(evaluateTrack(single, 5)).toBe(42);
  });

  it('handles step easing (snap at end)', () => {
    const stepKfs: TrackKeyframe[] = [
      { time: 0, value: 0, easing: 'linear' },
      { time: 2, value: 100, easing: 'step' },
    ];
    expect(evaluateTrack(stepKfs, 0)).toBe(0);
    expect(evaluateTrack(stepKfs, 1)).toBe(0); // step holds at start
    expect(evaluateTrack(stepKfs, 1.99)).toBe(0);
    expect(evaluateTrack(stepKfs, 2)).toBe(100);
  });

  it('handles cut easing (snap at start)', () => {
    const cutKfs: TrackKeyframe[] = [
      { time: 0, value: 0, easing: 'linear' },
      { time: 2, value: 100, easing: 'cut' },
    ];
    expect(evaluateTrack(cutKfs, 0)).toBe(0);
    expect(evaluateTrack(cutKfs, 0.01)).toBe(100); // cut jumps immediately
    expect(evaluateTrack(cutKfs, 2)).toBe(100);
  });
});

describe('evaluateAllTracks', () => {
  it('evaluates all tracks at a given time', () => {
    const tracks: Tracks = new Map([
      ['a.x', [
        { time: 0, value: 0, easing: 'linear' },
        { time: 2, value: 100, easing: 'linear' },
      ]],
      ['a.y', [
        { time: 0, value: 50, easing: 'linear' },
        { time: 2, value: 150, easing: 'linear' },
      ]],
    ]);
    const result = evaluateAllTracks(tracks, 1);
    expect(result.get('a.x')).toBe(50);
    expect(result.get('a.y')).toBe(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/v2/__tests__/animation/evaluator.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement evaluator**

```typescript
// src/v2/animation/evaluator.ts
import type { TrackKeyframe, Tracks, EasingName } from '../types/animation';
import { interpolateValue } from './interpolate';
import { applyEasing } from '../../engine/easing';

export function evaluateTrack(keyframes: TrackKeyframe[], time: number): unknown {
  if (keyframes.length === 0) return undefined;
  if (keyframes.length === 1) return keyframes[0].value;

  // Before first keyframe
  if (time <= keyframes[0].time) return keyframes[0].value;

  // After last keyframe
  if (time >= keyframes[keyframes.length - 1].time) {
    return keyframes[keyframes.length - 1].value;
  }

  // Find the segment
  for (let i = 1; i < keyframes.length; i++) {
    if (time <= keyframes[i].time) {
      const prev = keyframes[i - 1];
      const curr = keyframes[i];
      const duration = curr.time - prev.time;
      if (duration === 0) return curr.value;

      const rawT = (time - prev.time) / duration;
      const easedT = applyEasing(rawT, curr.easing);
      return interpolateValue(prev.value, curr.value, easedT);
    }
  }

  return keyframes[keyframes.length - 1].value;
}

export function evaluateAllTracks(
  tracks: Tracks,
  time: number,
): Map<string, unknown> {
  const result = new Map<string, unknown>();
  for (const [path, keyframes] of tracks) {
    result.set(path, evaluateTrack(keyframes, time));
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/v2/__tests__/animation/evaluator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/v2/animation/evaluator.ts src/v2/__tests__/animation/evaluator.test.ts
git commit -m "feat(v2): add track evaluator with easing and value interpolation"
```

---

### Task 11: Effects — Ephemeral Additive Tracks

**Files:**
- Create: `src/v2/animation/effects.ts`
- Test: `src/v2/__tests__/animation/effects.test.ts`

- [ ] **Step 1: Write failing tests for effects**

```typescript
// src/v2/__tests__/animation/effects.test.ts
import { describe, it, expect } from 'vitest';
import { evaluateEffects, type EffectEntry } from '../../animation/effects';

describe('evaluateEffects', () => {
  it('returns 0 when no effects are active', () => {
    expect(evaluateEffects([], 5)).toBe(0);
  });

  it('returns amplitude at trigger time for pulse', () => {
    const effects: EffectEntry[] = [
      { type: 'pulse', triggerTime: 1, amplitude: 0.12, duration: 0.3 },
    ];
    const value = evaluateEffects(effects, 1);
    expect(value).toBeCloseTo(0.12, 2);
  });

  it('decays pulse to 0 after duration', () => {
    const effects: EffectEntry[] = [
      { type: 'pulse', triggerTime: 1, amplitude: 0.12, duration: 0.3 },
    ];
    expect(evaluateEffects(effects, 1.3)).toBeCloseTo(0, 2);
    expect(evaluateEffects(effects, 2)).toBe(0);
  });

  it('decays pulse smoothly at midpoint', () => {
    const effects: EffectEntry[] = [
      { type: 'pulse', triggerTime: 0, amplitude: 1, duration: 1 },
    ];
    const mid = evaluateEffects(effects, 0.5);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it('returns 0 before trigger time', () => {
    const effects: EffectEntry[] = [
      { type: 'pulse', triggerTime: 2, amplitude: 0.12, duration: 0.3 },
    ];
    expect(evaluateEffects(effects, 1)).toBe(0);
  });

  it('sums multiple active effects', () => {
    const effects: EffectEntry[] = [
      { type: 'pulse', triggerTime: 0, amplitude: 0.1, duration: 1 },
      { type: 'pulse', triggerTime: 0, amplitude: 0.2, duration: 1 },
    ];
    const value = evaluateEffects(effects, 0);
    expect(value).toBeCloseTo(0.3, 2);
  });

  it('handles shake with oscillation', () => {
    const effects: EffectEntry[] = [
      { type: 'shake', triggerTime: 0, amplitude: 5, duration: 0.3 },
    ];
    // Shake oscillates — value should be non-zero near trigger
    const value = evaluateEffects(effects, 0.05);
    expect(Math.abs(value)).toBeLessThanOrEqual(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/v2/__tests__/animation/effects.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement effects**

```typescript
// src/v2/animation/effects.ts

export type EffectType = 'pulse' | 'shake' | 'flash' | 'glow';

export interface EffectEntry {
  type: EffectType;
  triggerTime: number;
  amplitude: number;
  duration: number;
}

function decay(elapsed: number, duration: number): number {
  if (elapsed < 0 || elapsed > duration) return 0;
  // Exponential decay envelope
  const t = elapsed / duration;
  return Math.max(0, 1 - t * t);
}

function evaluateSingleEffect(effect: EffectEntry, time: number): number {
  const elapsed = time - effect.triggerTime;
  if (elapsed < 0 || elapsed > effect.duration) return 0;

  const envelope = decay(elapsed, effect.duration);

  switch (effect.type) {
    case 'pulse':
    case 'flash':
    case 'glow':
      return effect.amplitude * envelope;
    case 'shake': {
      // High-frequency oscillation with decay
      const freq = 30; // Hz
      const oscillation = Math.sin(elapsed * freq * Math.PI * 2);
      return effect.amplitude * oscillation * envelope;
    }
    default:
      return 0;
  }
}

export function evaluateEffects(effects: EffectEntry[], time: number): number {
  let total = 0;
  for (const effect of effects) {
    total += evaluateSingleEffect(effect, time);
  }
  return total;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/v2/__tests__/animation/effects.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/v2/animation/effects.ts src/v2/__tests__/animation/effects.test.ts
git commit -m "feat(v2): add ephemeral effects system (pulse, shake, flash, glow)"
```

---

### Task 12: Integration — Apply Track Values to Node Tree

**Files:**
- Create: `src/v2/animation/applyTracks.ts`
- Test: `src/v2/__tests__/animation/applyTracks.test.ts`

- [ ] **Step 1: Write failing tests for applying evaluated tracks back to node tree**

```typescript
// src/v2/__tests__/animation/applyTracks.test.ts
import { describe, it, expect } from 'vitest';
import { applyTrackValues } from '../../animation/applyTracks';
import { createNode } from '../../types/node';

describe('applyTrackValues', () => {
  it('applies scalar value to nested property', () => {
    const node = createNode({
      id: 'box',
      transform: { x: 0, y: 0 },
    });
    const values = new Map([
      ['box.transform.x', 150],
    ]);
    const result = applyTrackValues([node], values);
    expect(result[0].transform!.x).toBe(150);
  });

  it('applies fill sub-object values', () => {
    const node = createNode({
      id: 'box',
      fill: { h: 0, s: 0, l: 0 },
    });
    const values = new Map<string, unknown>([
      ['box.fill.h', 210],
      ['box.fill.s', 80],
      ['box.fill.l', 50],
    ]);
    const result = applyTrackValues([node], values);
    expect(result[0].fill).toEqual({ h: 210, s: 80, l: 50 });
  });

  it('applies values to nested children', () => {
    const tree = [createNode({
      id: 'parent',
      children: [
        createNode({ id: 'child', opacity: 1 }),
      ],
    })];
    const values = new Map<string, unknown>([
      ['parent.child.opacity', 0.5],
    ]);
    const result = applyTrackValues(tree, values);
    expect(result[0].children[0].opacity).toBe(0.5);
  });

  it('applies geometry field values', () => {
    const node = createNode({
      id: 'r1',
      rect: { w: 100, h: 60, radius: 4 },
    });
    const values = new Map<string, unknown>([
      ['r1.rect.w', 200],
      ['r1.rect.radius', 8],
    ]);
    const result = applyTrackValues([node], values);
    expect(result[0].rect!.w).toBe(200);
    expect(result[0].rect!.radius).toBe(8);
    expect(result[0].rect!.h).toBe(60); // unchanged
  });

  it('does not mutate original nodes', () => {
    const node = createNode({ id: 'n', opacity: 1 });
    const values = new Map<string, unknown>([['n.opacity', 0.5]]);
    applyTrackValues([node], values);
    expect(node.opacity).toBe(1); // original unchanged
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/v2/__tests__/animation/applyTracks.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement track application**

```typescript
// src/v2/animation/applyTracks.ts
import type { Node } from '../types/node';

/**
 * Parse a track path into segments: [rootId, ...childIds, propKey, ...leafPath]
 * e.g. "parent.child.fill.h" → walk to parent→child, then set fill.h
 */
function setNestedValue(obj: Record<string, unknown>, keys: string[], value: unknown): Record<string, unknown> {
  if (keys.length === 0) return obj;
  if (keys.length === 1) {
    return { ...obj, [keys[0]]: value };
  }
  const [head, ...rest] = keys;
  const child = (obj[head] ?? {}) as Record<string, unknown>;
  return { ...obj, [head]: setNestedValue(child, rest, value) };
}

function findNode(roots: Node[], id: string): { node: Node; parentPath: string[] } | null {
  function search(nodes: Node[], path: string[]): { node: Node; parentPath: string[] } | null {
    for (const node of nodes) {
      if (node.id === id) return { node, parentPath: path };
      const found = search(node.children, [...path, node.id]);
      if (found) return found;
    }
    return null;
  }
  return search(roots, []);
}

function cloneNode(node: Node): Node {
  return {
    ...node,
    children: node.children.map(cloneNode),
  };
}

export function applyTrackValues(
  roots: Node[],
  values: Map<string, unknown>,
): Node[] {
  // Clone the tree to avoid mutation
  const cloned = roots.map(cloneNode);

  // Build a lookup: nodeId → node reference in the cloned tree
  const nodeMap = new Map<string, Node>();
  function index(nodes: Node[]): void {
    for (const node of nodes) {
      nodeMap.set(node.id, node);
      index(node.children);
    }
  }
  index(cloned);

  // Group track values by tree path
  // Track path format: "rootId.childId.propKey.leafKey" or "rootId.propKey.leafKey"
  // We need to resolve using tree walk, not ID matching
  for (const [trackPath, value] of values) {
    const segments = trackPath.split('.');

    // Walk the tree: first segment is root ID, subsequent segments are either
    // child IDs or property paths. We greedily match child IDs.
    let current: Node | undefined;
    let propStart = 0;

    for (let i = 0; i < segments.length; i++) {
      const candidateId = segments.slice(0, i + 1).join('.');
      if (i === 0) {
        // First segment must be a root node ID
        current = cloned.find(n => n.id === segments[0]);
        propStart = 1;
        continue;
      }
      // Check if next segment matches a child ID
      if (current) {
        const child = current.children.find(c => c.id === segments[i]);
        if (child) {
          current = child;
          propStart = i + 1;
        } else {
          break; // Rest is property path
        }
      }
    }

    if (!current) continue;

    // Remaining segments are the property path
    const propPath = segments.slice(propStart);
    if (propPath.length === 0) continue;

    // Set the value on the node
    if (propPath.length === 1) {
      (current as any)[propPath[0]] = value;
    } else {
      const [propKey, ...leafPath] = propPath;
      const existing = (current as any)[propKey];
      if (existing && typeof existing === 'object') {
        (current as any)[propKey] = setNestedValue(
          existing as Record<string, unknown>,
          leafPath,
          value,
        );
      }
    }
  }

  return cloned;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/v2/__tests__/animation/applyTracks.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/v2/animation/applyTracks.ts src/v2/__tests__/animation/applyTracks.test.ts
git commit -m "feat(v2): add track value application to node tree (immutable)"
```

---

**End of Chunk 2.** Phase 2 delivers: value interpolation (numeric/HSL/string), timeline builder with autoKey and shorthand expansion, track evaluator with easing cascade, ephemeral effects system, and track-to-node-tree application. All with tests.
