# Flexbox Layout Engine Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace starch's layout engine with CSS flexbox semantics, keyframe-block animation, world-space rendering, and eval-time layout.

**Architecture:** Remove the `group` object type. Any object becomes a flex container by setting `direction`. Layout runs every frame during animation evaluation, computing world-space positions. Animation uses keyframe blocks (grouped by time) instead of per-property keyframes. Position blending smooths layout transitions.

**Tech Stack:** TypeScript, Vitest (new), Zod, React, SVG

**Spec:** `docs/superpowers/specs/2026-03-16-flexbox-layout-engine-design.md`

---

## Chunk 1: Foundation — Test Setup and Types

### Task 1: Add Vitest and Create Test Infrastructure

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/engine/__tests__/layout.test.ts`

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Create Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Add test script to package.json**

Add to `scripts` in `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Create placeholder test to verify setup**

Create `src/engine/__tests__/layout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('layout', () => {
  it('placeholder', () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 5: Run test to verify setup**

Run: `npx vitest run`
Expected: 1 test passes

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts package.json package-lock.json src/engine/__tests__/layout.test.ts
git commit -m "chore: add vitest test framework"
```

---

### Task 2: Update Type Definitions

Remove `GroupProps` and `'group'` from `ObjectType`. Add layout, child, and cascade properties to `BaseProps`. Update `AnimConfig` to use keyframe-block format.

**Files:**
- Modify: `src/core/types/base.ts`
- Delete: `src/core/types/group.ts`
- Modify: `src/core/types/animation.ts`
- Modify: `src/core/types/scene.ts`
- Modify: `src/core/types/index.ts`

- [ ] **Step 1: Write type tests**

Create `src/core/__tests__/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { ObjectType, BaseProps } from '../types';

describe('types', () => {
  it('ObjectType does not include group', () => {
    const types: ObjectType[] = ['box', 'circle', 'label', 'table', 'line', 'path'];
    expect(types).toHaveLength(6);
  });

  it('BaseProps includes layout properties', () => {
    const props: Partial<BaseProps> = {
      direction: 'row',
      gap: 10,
      justify: 'spaceBetween',
      align: 'stretch',
      wrap: true,
      padding: 16,
      rotation: 45,
      group: 'container1',
      order: 1,
      grow: 1,
      shrink: 0,
      alignSelf: 'center',
      cascadeOpacity: false,
      cascadeScale: true,
      cascadeRotation: true,
    };
    expect(props.direction).toBe('row');
    expect(props.group).toBe('container1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/__tests__/types.test.ts`
Expected: FAIL — types don't exist yet

- [ ] **Step 3: Update `src/core/types/base.ts`**

Replace the file contents. Remove `'group'` from `ObjectType`. Add layout container properties, child properties, cascade properties, and `rotation` to `BaseProps`:

```ts
// ─── Object Types ───────────────────────────────────────────────

export type ObjectType = 'box' | 'circle' | 'label' | 'table' | 'line' | 'path';

// Named anchor presets (cardinal + ordinal + legacy names)
export type NamedAnchor =
  | 'center'
  | 'top' | 'bottom' | 'left' | 'right'
  | 'topleft' | 'topright' | 'bottomleft' | 'bottomright'
  | 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

// Float-based anchor: x and y in [0, 1] where (0,0) = top-left, (1,1) = bottom-right
export interface FloatAnchor {
  x: number; // 0–1
  y: number; // 0–1
}

export type AnchorPoint = NamedAnchor | FloatAnchor;

// ─── Layout Types ───────────────────────────────────────────────

export type LayoutDirection = 'row' | 'column';
export type LayoutJustify = 'start' | 'center' | 'end' | 'spaceBetween' | 'spaceAround';
export type LayoutAlign = 'start' | 'center' | 'end' | 'stretch';

// ─── Base Props ─────────────────────────────────────────────────

export interface BaseProps {
  x: number;
  y: number;
  opacity?: number;    // 0–1, default 1
  scale?: number;      // default 1
  anchor?: AnchorPoint; // default 'center'
  colour?: string;     // shortcut → fill (duller) + stroke
  fill?: string;
  stroke?: string;
  text?: string;
  textColor?: string;
  textSize?: number;
  textOffset?: [number, number]; // [dx, dy] pixel offset for text
  depth?: number;        // explicit render order (higher = on top)
  visible?: boolean;     // default true
  follow?: string;       // ID of a line or path to follow
  pathProgress?: number; // 0–1 position along the followed path
  rotation?: number;     // degrees, default 0

  // ─── Flex container properties ──────────────────
  direction?: LayoutDirection;
  gap?: number;
  justify?: LayoutJustify;
  align?: LayoutAlign;
  wrap?: boolean;
  padding?: number;

  // ─── Flex child properties ──────────────────────
  group?: string;        // ID of the container this object belongs to
  order?: number;        // sort order within container (definition order breaks ties)
  grow?: number;         // proportion of extra space to absorb
  shrink?: number;       // proportion of overflow to absorb
  alignSelf?: LayoutAlign; // per-item cross-axis override

  // ─── Cascade control ────────────────────────────
  cascadeOpacity?: boolean;  // default true
  cascadeScale?: boolean;    // default true
  cascadeRotation?: boolean; // default true
}
```

- [ ] **Step 4: Delete `src/core/types/group.ts`**

```bash
rm src/core/types/group.ts
```

- [ ] **Step 5: Update `src/core/types/animation.ts`**

Replace the `Keyframe` and `AnimConfig` types with the keyframe-block format. Keep `TrackKeyframe` and `Tracks` unchanged. Keep `Chapter` and `EasingName` unchanged:

```ts
// ─── Animation Types ────────────────────────────────────────────

export type EasingName =
  | 'linear'
  | 'easeIn' | 'easeOut' | 'easeInOut'
  | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic'
  | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart'
  | 'easeInBack' | 'easeOutBack'
  | 'bounce' | 'elastic' | 'spring'
  | 'snap' | 'step';

export interface Chapter {
  id: string;
  time: number;
  title: string;
  description?: string;
}

// ─── Keyframe Block Format ──────────────────────────────────────

export interface ObjectChanges {
  easing?: EasingName;
  [prop: string]: unknown;
}

export interface KeyframeBlock {
  time: number;
  easing?: EasingName;
  changes: Record<string, ObjectChanges>;
}

export interface AnimConfig {
  duration?: number;
  loop?: boolean;
  easing?: EasingName;
  keyframes: KeyframeBlock[];
  chapters: Chapter[];
}

// ─── Internal Track Format (unchanged) ──────────────────────────

export interface TrackKeyframe {
  time: number;
  value: number | string | boolean;
  easing: EasingName;
}

export type Tracks = Record<string, TrackKeyframe[]>; // key = "objectId.propName"
```

- [ ] **Step 6: Update `src/core/types/scene.ts`**

Remove the `GroupProps` import from `PropsForType`. Remove the `'group'` case. Remove `groupId` from `SceneObject` (membership is now via the `group` prop on `BaseProps`):

```ts
import type { ObjectType } from './base';
import type { BoxProps } from './box';
import type { CircleProps } from './circle';
import type { LabelProps } from './label';
import type { TableProps } from './table';
import type { LineProps } from './line';
import type { PathProps } from './path';

// ─── Scene Object ───────────────────────────────────────────────

export type PropsForType<T extends ObjectType> =
  T extends 'box' ? BoxProps :
  T extends 'circle' ? CircleProps :
  T extends 'label' ? LabelProps :
  T extends 'table' ? TableProps :
  T extends 'line' ? LineProps :
  T extends 'path' ? PathProps :
  never;

export interface SceneObject<T extends ObjectType = ObjectType> {
  type: T;
  id: string;
  props: PropsForType<T>;
  _inputKeys?: Set<string>; // props explicitly set by the user (vs schema defaults)
  _definitionOrder?: number; // insertion order for layout tie-breaking
}
```

- [ ] **Step 7: Update `src/core/types/index.ts`**

Remove the `GroupProps` export and add new layout type exports:

```ts
// Base types & anchors
export type {
  ObjectType, NamedAnchor, FloatAnchor, AnchorPoint, BaseProps,
  LayoutDirection, LayoutJustify, LayoutAlign,
} from './base';

// Component props
export type { BoxProps } from './box';
export type { CircleProps } from './circle';
export type { LabelProps } from './label';
export type { TableProps } from './table';
export type { LineProps } from './line';
export type { PathProps } from './path';

// Scene object
export type { PropsForType, SceneObject } from './scene';

// Animation
export type {
  EasingName, KeyframeBlock, ObjectChanges, Chapter, AnimConfig,
  TrackKeyframe, Tracks,
} from './animation';

// Events
export type { StarchEventType, StarchEvent, StarchEventHandler, DiagramHandle } from './events';
```

- [ ] **Step 8: Run type test to verify it passes**

Run: `npx vitest run src/core/__tests__/types.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/core/types/base.ts src/core/types/animation.ts src/core/types/scene.ts src/core/types/index.ts src/core/__tests__/types.test.ts
git rm src/core/types/group.ts
git commit -m "feat: update type definitions for flexbox layout engine"
```

**Note:** `_definitionOrder` on `SceneObject` is populated by the Scene API (Task 9) and Parser (Task 10). Layout tests in Task 3 set it manually.

**Note:** `duration` and `loop` on `AnimConfig` are now optional. Callers that access them (Diagram.tsx, StarchDiagram.ts) must use `?? defaults` — addressed in Task 11.

---

## Chunk 2: Layout Engine and Timeline Builder

### Task 3: Rewrite Layout Engine

Implement the full flexbox layout algorithm: membership scanning, depth-first processing, main-axis distribution (justify, grow, shrink), cross-axis alignment (align, alignSelf, stretch), wrap, auto-sizing, and world-space conversion.

**Files:**
- Rewrite: `src/engine/layout.ts`
- Modify: `src/engine/__tests__/layout.test.ts`

- [ ] **Step 1: Write layout tests**

Replace `src/engine/__tests__/layout.test.ts` with comprehensive tests:

```ts
import { describe, it, expect } from 'vitest';
import type { SceneObject } from '../../core/types';
import { computeLayout } from '../layout';

function makeObj(
  id: string,
  type: 'box' | 'circle' = 'box',
  props: Record<string, unknown> = {},
  definitionOrder = 0,
): SceneObject {
  return {
    type,
    id,
    props: { x: 0, y: 0, w: 100, h: 50, ...props } as never,
    _definitionOrder: definitionOrder,
  };
}

describe('computeLayout', () => {
  it('returns unmodified props for ungrouped objects', () => {
    const objects: Record<string, SceneObject> = {
      a: makeObj('a', 'box', { x: 10, y: 20 }),
    };
    const props: Record<string, Record<string, unknown>> = {
      a: { x: 10, y: 20, w: 100, h: 50 },
    };
    computeLayout(objects, props);
    expect(props.a.x).toBe(10);
    expect(props.a.y).toBe(20);
  });

  it('lays out children in a row', () => {
    const objects: Record<string, SceneObject> = {
      container: makeObj('container', 'box', {
        x: 200, y: 100, direction: 'row', gap: 10, justify: 'start', align: 'start',
      }),
      a: makeObj('a', 'box', { group: 'container', w: 80, h: 40 }, 0),
      b: makeObj('b', 'box', { group: 'container', w: 80, h: 40 }, 1),
    };
    const props: Record<string, Record<string, unknown>> = {
      container: { ...objects.container.props as Record<string, unknown> },
      a: { ...objects.a.props as Record<string, unknown> },
      b: { ...objects.b.props as Record<string, unknown> },
    };
    computeLayout(objects, props);
    // Children should be positioned in world-space relative to container
    expect(props.a.x).toBeLessThan(props.b.x as number);
  });

  it('lays out children in a column', () => {
    const objects: Record<string, SceneObject> = {
      container: makeObj('container', 'box', {
        x: 100, y: 100, direction: 'column', gap: 10, justify: 'start', align: 'start',
      }),
      a: makeObj('a', 'box', { group: 'container', w: 80, h: 40 }, 0),
      b: makeObj('b', 'box', { group: 'container', w: 80, h: 40 }, 1),
    };
    const props: Record<string, Record<string, unknown>> = {
      container: { ...objects.container.props as Record<string, unknown> },
      a: { ...objects.a.props as Record<string, unknown> },
      b: { ...objects.b.props as Record<string, unknown> },
    };
    computeLayout(objects, props);
    expect(props.a.y).toBeLessThan(props.b.y as number);
    expect(props.a.x).toBe(props.b.x);
  });

  it('respects order property', () => {
    const objects: Record<string, SceneObject> = {
      container: makeObj('container', 'box', {
        x: 100, y: 100, direction: 'row', justify: 'start', align: 'start',
      }),
      a: makeObj('a', 'box', { group: 'container', w: 80, h: 40, order: 2 }, 0),
      b: makeObj('b', 'box', { group: 'container', w: 80, h: 40, order: 1 }, 1),
    };
    const props: Record<string, Record<string, unknown>> = {
      container: { ...objects.container.props as Record<string, unknown> },
      a: { ...objects.a.props as Record<string, unknown> },
      b: { ...objects.b.props as Record<string, unknown> },
    };
    computeLayout(objects, props);
    // b has lower order so should come first (leftward)
    expect(props.b.x).toBeLessThan(props.a.x as number);
  });

  it('distributes grow space proportionally', () => {
    const objects: Record<string, SceneObject> = {
      container: makeObj('container', 'box', {
        x: 0, y: 0, w: 300, h: 50, direction: 'row', justify: 'start', align: 'start',
      }),
      a: makeObj('a', 'box', { group: 'container', w: 50, h: 40, grow: 1 }, 0),
      b: makeObj('b', 'box', { group: 'container', w: 50, h: 40, grow: 2 }, 1),
    };
    const props: Record<string, Record<string, unknown>> = {
      container: { ...objects.container.props as Record<string, unknown> },
      a: { ...objects.a.props as Record<string, unknown> },
      b: { ...objects.b.props as Record<string, unknown> },
    };
    computeLayout(objects, props);
    const aWidth = (props.a._layoutW as number) || (props.a.w as number);
    const bWidth = (props.b._layoutW as number) || (props.b.w as number);
    // Extra space is 200 (300 - 50 - 50). a gets 1/3=66.7, b gets 2/3=133.3
    expect(bWidth).toBeGreaterThan(aWidth);
    expect(aWidth).toBeCloseTo(50 + 200 / 3, 0);
    expect(bWidth).toBeCloseTo(50 + 400 / 3, 0);
  });

  it('auto-sizes container when w/h not set', () => {
    const objects: Record<string, SceneObject> = {
      container: makeObj('container', 'box', {
        x: 100, y: 100, direction: 'row', gap: 10, padding: 20, justify: 'start', align: 'start',
      }),
      a: makeObj('a', 'box', { group: 'container', w: 80, h: 40 }, 0),
      b: makeObj('b', 'box', { group: 'container', w: 60, h: 30 }, 1),
    };
    // Don't set w/h on container props
    const props: Record<string, Record<string, unknown>> = {
      container: { x: 100, y: 100, direction: 'row', gap: 10, padding: 20, justify: 'start', align: 'start' },
      a: { x: 0, y: 0, w: 80, h: 40, group: 'container' },
      b: { x: 0, y: 0, w: 60, h: 30, group: 'container' },
    };
    computeLayout(objects, props);
    // Auto width = padding*2 + children widths + gap = 20*2 + 80 + 60 + 10 = 190
    expect(props.container._layoutW).toBe(190);
    // Auto height = padding*2 + max child height = 20*2 + 40 = 80
    expect(props.container._layoutH).toBe(80);
  });

  it('handles spaceBetween justify', () => {
    const objects: Record<string, SceneObject> = {
      container: makeObj('container', 'box', {
        x: 0, y: 0, w: 300, h: 50, direction: 'row', justify: 'spaceBetween', align: 'start',
      }),
      a: makeObj('a', 'box', { group: 'container', w: 50, h: 40 }, 0),
      b: makeObj('b', 'box', { group: 'container', w: 50, h: 40 }, 1),
      c: makeObj('c', 'box', { group: 'container', w: 50, h: 40 }, 2),
    };
    const props: Record<string, Record<string, unknown>> = {
      container: { ...objects.container.props as Record<string, unknown> },
      a: { ...objects.a.props as Record<string, unknown> },
      b: { ...objects.b.props as Record<string, unknown> },
      c: { ...objects.c.props as Record<string, unknown> },
    };
    computeLayout(objects, props);
    // First child at start, last at end, equal gaps between
    const aX = props.a.x as number;
    const bX = props.b.x as number;
    const cX = props.c.x as number;
    const gap1 = bX - aX;
    const gap2 = cX - bX;
    expect(gap1).toBeCloseTo(gap2, 0);
  });

  it('handles nested containers', () => {
    const objects: Record<string, SceneObject> = {
      outer: makeObj('outer', 'box', {
        x: 100, y: 100, direction: 'column', gap: 10, justify: 'start', align: 'start',
      }),
      inner: makeObj('inner', 'box', {
        group: 'outer', direction: 'row', gap: 5, justify: 'start', align: 'start',
      }, 0),
      a: makeObj('a', 'box', { group: 'inner', w: 40, h: 30 }, 0),
      b: makeObj('b', 'box', { group: 'inner', w: 40, h: 30 }, 1),
      c: makeObj('c', 'box', { group: 'outer', w: 80, h: 40 }, 1),
    };
    const props: Record<string, Record<string, unknown>> = {
      outer: { x: 100, y: 100, direction: 'column', gap: 10, justify: 'start', align: 'start' },
      inner: { x: 0, y: 0, direction: 'row', gap: 5, group: 'outer', justify: 'start', align: 'start' },
      a: { x: 0, y: 0, w: 40, h: 30, group: 'inner' },
      b: { x: 0, y: 0, w: 40, h: 30, group: 'inner' },
      c: { x: 0, y: 0, w: 80, h: 40, group: 'outer' },
    };
    computeLayout(objects, props);
    // Inner items should have world-space positions offset from outer
    // a and b should be side by side within inner
    expect(props.a.x).toBeLessThan(props.b.x as number);
    // c should be below inner container
    expect(props.c.y).toBeGreaterThan(props.a.y as number);
  });

  it('handles cross-axis stretch', () => {
    const objects: Record<string, SceneObject> = {
      container: makeObj('container', 'box', {
        x: 0, y: 0, w: 200, h: 100, direction: 'row', align: 'stretch', justify: 'start',
      }),
      a: makeObj('a', 'box', { group: 'container', w: 50, h: 30 }, 0),
    };
    const props: Record<string, Record<string, unknown>> = {
      container: { ...objects.container.props as Record<string, unknown> },
      a: { ...objects.a.props as Record<string, unknown> },
    };
    computeLayout(objects, props);
    // Child should stretch to container's cross-axis (height = 100)
    expect(props.a._layoutH).toBe(100);
  });

  it('ignores items with group pointing to nonexistent container', () => {
    const objects: Record<string, SceneObject> = {
      a: makeObj('a', 'box', { x: 50, y: 50, group: 'doesNotExist' }),
    };
    const props: Record<string, Record<string, unknown>> = {
      a: { x: 50, y: 50, w: 100, h: 50, group: 'doesNotExist' },
    };
    computeLayout(objects, props);
    // Position should remain unchanged
    expect(props.a.x).toBe(50);
    expect(props.a.y).toBe(50);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/__tests__/layout.test.ts`
Expected: FAIL — `computeLayout` doesn't exist

- [ ] **Step 3: Implement the layout engine**

Rewrite `src/engine/layout.ts`:

```ts
import type { SceneObject } from '../core/types';

/**
 * Get the main-axis and cross-axis size of an object.
 */
function getChildSize(
  props: Record<string, unknown>,
  type: string,
  isRow: boolean,
): { main: number; cross: number } {
  let w: number;
  let h: number;

  switch (type) {
    case 'circle': {
      const r = (props.r as number) || 20;
      w = r * 2;
      h = r * 2;
      break;
    }
    case 'table': {
      const cols = (props.cols as string[]) || [];
      const rows = (props.rows as string[][]) || [];
      const cw = (props.colWidth as number) || 100;
      const rh = (props.rowHeight as number) || 30;
      w = cols.length * cw;
      h = (rows.length + 1) * rh;
      break;
    }
    default: {
      w = (props._layoutW as number) || (props.w as number) || 100;
      h = (props._layoutH as number) || (props.h as number) || 50;
      break;
    }
  }

  return isRow ? { main: w, cross: h } : { main: h, cross: w };
}

interface ChildEntry {
  id: string;
  order: number;
  definitionOrder: number;
}

/**
 * Build membership map: containerId → sorted children.
 * Reads `group` from animated props, falls back to base props.
 */
function buildMembership(
  objects: Record<string, SceneObject>,
  allProps: Record<string, Record<string, unknown>>,
): Map<string, ChildEntry[]> {
  const membership = new Map<string, ChildEntry[]>();

  for (const [id, obj] of Object.entries(objects)) {
    const props = allProps[id] || obj.props;
    const groupId = props.group as string | undefined;
    if (!groupId) continue;

    // Validate: container must exist and have direction set
    const containerProps = allProps[groupId] || (objects[groupId]?.props as Record<string, unknown>);
    if (!containerProps || !containerProps.direction) continue;

    if (!membership.has(groupId)) {
      membership.set(groupId, []);
    }
    membership.get(groupId)!.push({
      id,
      order: (props.order as number) ?? 0,
      definitionOrder: obj._definitionOrder ?? 0,
    });
  }

  // Sort children: by order, then by definition order
  for (const children of membership.values()) {
    children.sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.definitionOrder - b.definitionOrder;
    });
  }

  return membership;
}

/**
 * Topological sort: process inner containers before outer ones.
 */
function sortContainersDepthFirst(
  membership: Map<string, ChildEntry[]>,
  allProps: Record<string, Record<string, unknown>>,
): string[] {
  const visited = new Set<string>();
  const result: string[] = [];

  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    // Visit child containers first
    const children = membership.get(id);
    if (children) {
      for (const child of children) {
        if (membership.has(child.id)) {
          visit(child.id);
        }
      }
    }
    result.push(id);
  }

  for (const containerId of membership.keys()) {
    visit(containerId);
  }

  return result;
}

/**
 * Compute flexbox layout and write world-space positions into allProps.
 * Mutates allProps in place.
 */
export function computeLayout(
  objects: Record<string, SceneObject>,
  allProps: Record<string, Record<string, unknown>>,
): void {
  const membership = buildMembership(objects, allProps);
  if (membership.size === 0) return;

  const order = sortContainersDepthFirst(membership, allProps);

  for (const containerId of order) {
    const children = membership.get(containerId);
    if (!children || children.length === 0) continue;

    const containerProps = allProps[containerId];
    if (!containerProps) continue;

    const direction = containerProps.direction as string;
    const gap = (containerProps.gap as number) || 0;
    const justify = (containerProps.justify as string) || 'start';
    const align = (containerProps.align as string) || 'start';
    const padding = (containerProps.padding as number) || 0;
    const isRow = direction === 'row';

    const containerW = (containerProps._layoutW as number) || (containerProps.w as number) || 0;
    const containerH = (containerProps._layoutH as number) || (containerProps.h as number) || 0;
    const containerMain = isRow ? containerW : containerH;
    const containerCross = isRow ? containerH : containerW;
    const hasExplicitSize = !!((containerProps.w as number) || (containerProps.h as number));
    const shouldWrap = (containerProps.wrap as boolean) ?? false;

    // Resolve child sizes
    const childIds = children.map((c) => c.id);
    const sizes = childIds.map((id) => {
      const p = allProps[id] || {};
      const type = objects[id]?.type || 'box';
      return getChildSize(p, type, isRow);
    });

    // Break into wrap lines if wrap is enabled
    const lines: Array<{ ids: string[]; sizes: Array<{ main: number; cross: number }> }> = [];
    if (shouldWrap && hasExplicitSize) {
      const maxMain = containerMain - padding * 2;
      let currentLine: { ids: string[]; sizes: Array<{ main: number; cross: number }> } = { ids: [], sizes: [] };
      let currentMain = 0;
      for (let i = 0; i < childIds.length; i++) {
        const needed = currentLine.ids.length > 0 ? gap + sizes[i].main : sizes[i].main;
        if (currentMain + needed > maxMain && currentLine.ids.length > 0) {
          lines.push(currentLine);
          currentLine = { ids: [], sizes: [] };
          currentMain = 0;
        }
        currentLine.ids.push(childIds[i]);
        currentLine.sizes.push(sizes[i]);
        currentMain += currentLine.ids.length === 1 ? sizes[i].main : gap + sizes[i].main;
      }
      if (currentLine.ids.length > 0) lines.push(currentLine);
    } else {
      lines.push({ ids: childIds, sizes });
    }

    // Process each line
    let lineCrossOffset = 0;
    let totalCrossExtent = 0;
    const lineResults: Array<{ ids: string[]; mainPositions: number[]; crossPositions: number[]; finalMainSizes: number[]; lineCross: number; lineCrossOffset: number }> = [];

    for (const line of lines) {
      const lineIds = line.ids;
      const lineSizes = line.sizes;

      const totalChildMain = lineSizes.reduce((sum, s) => sum + s.main, 0);
      const totalGaps = gap * (lineSizes.length - 1);
      const contentMain = totalChildMain + totalGaps;
      const availableMain = hasExplicitSize ? (containerMain - padding * 2) : contentMain;
      const extraSpace = availableMain - contentMain;

      // Apply grow/shrink
      const finalMainSizes = lineSizes.map((s) => s.main);
      if (extraSpace > 0) {
        const totalGrow = lineIds.reduce((sum, id) => sum + ((allProps[id]?.grow as number) ?? 0), 0);
        if (totalGrow > 0) {
          lineIds.forEach((id, i) => {
            const g = (allProps[id]?.grow as number) ?? 0;
            if (g > 0) finalMainSizes[i] += (g / totalGrow) * extraSpace;
          });
        }
      } else if (extraSpace < 0) {
        const totalShrink = lineIds.reduce((sum, id, i) => sum + ((allProps[id]?.shrink as number) ?? 0) * lineSizes[i].main, 0);
        if (totalShrink > 0) {
          lineIds.forEach((id, i) => {
            const s = (allProps[id]?.shrink as number) ?? 0;
            if (s > 0) finalMainSizes[i] = Math.max(0, finalMainSizes[i] - (s * lineSizes[i].main / totalShrink) * Math.abs(extraSpace));
          });
        }
      }

      const finalContentMain = finalMainSizes.reduce((s, v) => s + v, 0) + totalGaps;
      const mainPositions: number[] = [];

      if (justify === 'spaceBetween' && lineIds.length > 1) {
        const totalItemMain = finalMainSizes.reduce((s, v) => s + v, 0);
        const spacerSize = (availableMain - totalItemMain) / (lineIds.length - 1);
        let cursor = -availableMain / 2 + finalMainSizes[0] / 2;
        for (let i = 0; i < lineIds.length; i++) {
          mainPositions.push(cursor);
          if (i < lineIds.length - 1) cursor += finalMainSizes[i] / 2 + spacerSize + finalMainSizes[i + 1] / 2;
        }
      } else if (justify === 'spaceAround' && lineIds.length > 0) {
        const totalItemMain = finalMainSizes.reduce((s, v) => s + v, 0);
        const spacerSize = (availableMain - totalItemMain) / lineIds.length;
        let cursor = -availableMain / 2 + spacerSize / 2 + finalMainSizes[0] / 2;
        for (let i = 0; i < lineIds.length; i++) {
          mainPositions.push(cursor);
          if (i < lineIds.length - 1) cursor += finalMainSizes[i] / 2 + spacerSize + finalMainSizes[i + 1] / 2;
        }
      } else {
        let cursor = finalMainSizes[0] / 2;
        for (let i = 0; i < lineIds.length; i++) {
          mainPositions.push(cursor);
          if (i < lineIds.length - 1) cursor += finalMainSizes[i] / 2 + gap + finalMainSizes[i + 1] / 2;
        }
        let offset: number;
        if (justify === 'start' || (justify === 'center' && !hasExplicitSize)) {
          offset = hasExplicitSize ? -availableMain / 2 : -finalContentMain / 2;
        } else if (justify === 'end') {
          offset = hasExplicitSize ? availableMain / 2 - finalContentMain : -finalContentMain / 2;
        } else {
          // center with explicit size
          offset = -finalContentMain / 2;
        }
        for (let i = 0; i < mainPositions.length; i++) mainPositions[i] += offset;
      }

      const lineCross = Math.max(...lineSizes.map((s) => s.cross));
      const maxCross = hasExplicitSize && lines.length === 1 ? (containerCross - padding * 2) : lineCross;

      const crossPositions: number[] = [];
      for (let i = 0; i < lineIds.length; i++) {
        const childAlign = (allProps[lineIds[i]]?.alignSelf as string) || align;
        const childCross = lineSizes[i].cross;
        if (childAlign === 'start') {
          crossPositions.push(-maxCross / 2 + childCross / 2);
        } else if (childAlign === 'end') {
          crossPositions.push(maxCross / 2 - childCross / 2);
        } else if (childAlign === 'stretch') {
          crossPositions.push(0);
          const p = allProps[lineIds[i]];
          if (p) {
            if (isRow) p._layoutH = maxCross;
            else p._layoutW = maxCross;
          }
        } else {
          crossPositions.push(0);
        }
      }

      lineResults.push({ ids: lineIds, mainPositions, crossPositions, finalMainSizes, lineCross: maxCross, lineCrossOffset: lineCrossOffset });
      lineCrossOffset += maxCross + (lineResults.length > 1 ? gap : 0);
      totalCrossExtent = lineCrossOffset;
    }

    // Auto-size
    const totalContentMain = lines.length === 1
      ? (lines[0].sizes.reduce((s, v) => s + v.main, 0) + gap * (lines[0].ids.length - 1))
      : (containerMain - padding * 2);
    const autoMain = totalContentMain + padding * 2;
    const autoCross = totalCrossExtent + padding * 2;

    if (!containerProps.w && !containerProps._layoutW) {
      containerProps._layoutW = isRow ? autoMain : autoCross;
    }
    if (!containerProps.h && !containerProps._layoutH) {
      containerProps._layoutH = isRow ? autoCross : autoMain;
    }

    // Write world-space positions
    const cx = (containerProps.x as number) || 0;
    const cy = (containerProps.y as number) || 0;
    const halfTotalCross = totalCrossExtent / 2;

    for (const lr of lineResults) {
      for (let i = 0; i < lr.ids.length; i++) {
        const childProps = allProps[lr.ids[i]];
        if (!childProps) continue;

        const mainPos = lr.mainPositions[i];
        const crossPos = lr.crossPositions[i] + lr.lineCrossOffset + lr.lineCross / 2 - halfTotalCross;

        if (isRow) {
          childProps.x = cx + mainPos;
          childProps.y = cy + crossPos;
        } else {
          childProps.x = cx + crossPos;
          childProps.y = cy + mainPos;
        }

        if (lr.finalMainSizes[i] !== lines[lineResults.indexOf(lr)].sizes[i].main) {
          if (isRow) childProps._layoutW = lr.finalMainSizes[i];
          else childProps._layoutH = lr.finalMainSizes[i];
        }
      }
    }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/engine/__tests__/layout.test.ts`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/engine/layout.ts src/engine/__tests__/layout.test.ts
git commit -m "feat: rewrite layout engine with flexbox semantics"
```

---

### Task 4: Rewrite Timeline Builder for Keyframe Blocks

Convert keyframe blocks with easing cascade into per-property tracks. (Note: `'spread'` justify value from old code is replaced by `'spaceBetween'`/`'spaceAround'`.)

**Files:**
- Modify: `src/engine/timeline.ts`
- Create: `src/engine/__tests__/timeline.test.ts`

- [ ] **Step 1: Write timeline tests**

Create `src/engine/__tests__/timeline.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { AnimConfig, SceneObject } from '../../core/types';
import { buildTimeline } from '../timeline';

function makeObj(id: string, props: Record<string, unknown> = {}): SceneObject {
  return {
    type: 'box',
    id,
    props: { x: 0, y: 0, w: 100, h: 50, ...props } as never,
    _inputKeys: new Set(Object.keys(props)),
  };
}

describe('buildTimeline', () => {
  it('flattens keyframe blocks into per-property tracks', () => {
    const config: AnimConfig = {
      keyframes: [
        {
          time: 1,
          changes: {
            box1: { x: 200 },
            box2: { opacity: 0.5 },
          },
        },
      ],
      chapters: [],
    };
    const tracks = buildTimeline(config);
    expect(tracks['box1.x']).toBeDefined();
    expect(tracks['box2.opacity']).toBeDefined();
    expect(tracks['box1.x'][0]).toEqual({ time: 1, value: 200, easing: 'linear' });
  });

  it('resolves easing cascade: animation → keyframe → object', () => {
    const config: AnimConfig = {
      easing: 'easeOut',
      keyframes: [
        {
          time: 1,
          easing: 'easeIn',
          changes: {
            box1: { x: 100 },                        // inherits keyframe easing: easeIn
            box2: { x: 200, easing: 'bounce' },      // overrides to bounce
          },
        },
      ],
      chapters: [],
    };
    const tracks = buildTimeline(config);
    expect(tracks['box1.x'][0].easing).toBe('easeIn');
    expect(tracks['box2.x'][0].easing).toBe('bounce');
  });

  it('falls back to animation-level easing', () => {
    const config: AnimConfig = {
      easing: 'easeOut',
      keyframes: [
        {
          time: 1,
          changes: { box1: { x: 100 } },
        },
      ],
      chapters: [],
    };
    const tracks = buildTimeline(config);
    expect(tracks['box1.x'][0].easing).toBe('easeOut');
  });

  it('prepends t=0 keyframe from base value', () => {
    const config: AnimConfig = {
      keyframes: [
        { time: 2, changes: { box1: { x: 300 } } },
      ],
      chapters: [],
    };
    const objects: Record<string, SceneObject> = {
      box1: makeObj('box1', { x: 50 }),
    };
    const tracks = buildTimeline(config, objects);
    expect(tracks['box1.x']).toHaveLength(2);
    expect(tracks['box1.x'][0]).toEqual({ time: 0, value: 50, easing: 'linear' });
    expect(tracks['box1.x'][1].time).toBe(2);
  });

  it('excludes easing key from property tracks', () => {
    const config: AnimConfig = {
      keyframes: [
        { time: 1, changes: { box1: { x: 100, easing: 'bounce' } } },
      ],
      chapters: [],
    };
    const tracks = buildTimeline(config);
    expect(tracks['box1.easing']).toBeUndefined();
    expect(tracks['box1.x']).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/__tests__/timeline.test.ts`
Expected: FAIL — new AnimConfig type doesn't match old buildTimeline signature

- [ ] **Step 3: Rewrite `src/engine/timeline.ts`**

```ts
import type { AnimConfig, Tracks, SceneObject, EasingName } from '../core/types';

export function buildTimeline(
  animConfig: AnimConfig,
  objects?: Record<string, SceneObject>,
): Tracks {
  const tracks: Tracks = {};
  const defaultEasing: EasingName = animConfig.easing || 'linear';

  for (const block of animConfig.keyframes) {
    const blockEasing: EasingName = block.easing || defaultEasing;

    for (const [targetId, changes] of Object.entries(block.changes)) {
      const objectEasing: EasingName = (changes.easing as EasingName) || blockEasing;

      for (const [prop, value] of Object.entries(changes)) {
        if (prop === 'easing') continue; // skip meta-property

        const key = `${targetId}.${prop}`;
        if (!tracks[key]) tracks[key] = [];
        tracks[key].push({
          time: block.time,
          value: value as number | string | boolean,
          easing: objectEasing,
        });
      }
    }
  }

  // Sort tracks by time
  for (const key of Object.keys(tracks)) {
    tracks[key].sort((a, b) => a.time - b.time);
  }

  // Prepend t=0 keyframes from base values
  if (objects) {
    for (const key of Object.keys(tracks)) {
      if (tracks[key][0].time > 0) {
        const dotIdx = key.indexOf('.');
        const target = key.slice(0, dotIdx);
        const prop = key.slice(dotIdx + 1);
        const obj = objects[target];
        if (obj?._inputKeys?.has(prop)) {
          const baseValue = (obj.props as Record<string, unknown>)[prop];
          if (baseValue !== undefined) {
            tracks[key].unshift({ time: 0, value: baseValue as number | string | boolean, easing: 'linear' });
          }
        }
      }
    }
  }

  return tracks;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/engine/__tests__/timeline.test.ts`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/engine/timeline.ts src/engine/__tests__/timeline.test.ts
git commit -m "feat: rewrite timeline builder for keyframe-block format"
```

---

## Chunk 3: Evaluator, Render Order, and Renderer Updates

### Task 5: Update Evaluator with Eval-Time Layout and Position Blending

Add layout pass and position blending to the per-frame evaluation pipeline. The evaluator becomes slightly stateful to track position transitions.

**Files:**
- Modify: `src/engine/evaluator.ts`
- Create: `src/engine/__tests__/evaluator.test.ts`

- [ ] **Step 1: Write evaluator tests**

Create `src/engine/__tests__/evaluator.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { SceneObject, Tracks } from '../../core/types';
import { createEvaluator } from '../evaluator';

function makeObj(id: string, props: Record<string, unknown> = {}): SceneObject {
  return {
    type: 'box',
    id,
    props: { x: 0, y: 0, w: 100, h: 50, ...props } as never,
    _definitionOrder: 0,
  };
}

describe('createEvaluator', () => {
  it('evaluates basic property interpolation', () => {
    const objects: Record<string, SceneObject> = {
      box1: makeObj('box1', { x: 0, y: 0 }),
    };
    const tracks: Tracks = {
      'box1.x': [
        { time: 0, value: 0, easing: 'linear' },
        { time: 1, value: 100, easing: 'linear' },
      ],
    };
    const evaluate = createEvaluator();
    const result = evaluate(objects, tracks, 0.5);
    expect(result.box1.x).toBe(50);
  });

  it('runs layout for grouped items', () => {
    const objects: Record<string, SceneObject> = {
      container: makeObj('container', { x: 100, y: 100, direction: 'row', gap: 10, justify: 'start', align: 'start' }),
      item1: makeObj('item1', { group: 'container', w: 80, h: 40 }),
    };
    const tracks: Tracks = {};
    const evaluate = createEvaluator();
    const result = evaluate(objects, tracks, 0);
    // item1 should have world-space position relative to container
    expect(result.item1.x).toBeDefined();
    expect(typeof result.item1.x).toBe('number');
  });

  it('cascades parent opacity to children by default', () => {
    const objects: Record<string, SceneObject> = {
      container: makeObj('container', { x: 0, y: 0, direction: 'row', opacity: 0.5, justify: 'start', align: 'start' }),
      item1: makeObj('item1', { group: 'container', opacity: 0.8 }),
    };
    const tracks: Tracks = {};
    const evaluate = createEvaluator();
    const result = evaluate(objects, tracks, 0);
    expect(result.item1.opacity).toBeCloseTo(0.4); // 0.5 * 0.8
  });

  it('respects cascadeOpacity: false', () => {
    const objects: Record<string, SceneObject> = {
      container: makeObj('container', { x: 0, y: 0, direction: 'row', opacity: 0.5, cascadeOpacity: false, justify: 'start', align: 'start' }),
      item1: makeObj('item1', { group: 'container', opacity: 0.8 }),
    };
    const tracks: Tracks = {};
    const evaluate = createEvaluator();
    const result = evaluate(objects, tracks, 0);
    expect(result.item1.opacity).toBeCloseTo(0.8); // not cascaded
  });

  it('computes correct world-space positions for grouped items', () => {
    const objects: Record<string, SceneObject> = {
      container: makeObj('container', { x: 200, y: 100, direction: 'row', gap: 0, justify: 'start', align: 'start', w: 200, h: 50 }),
      item1: makeObj('item1', { group: 'container', w: 80, h: 40 }),
    };
    const tracks: Tracks = {};
    const evaluate = createEvaluator();
    const result = evaluate(objects, tracks, 0);
    // item1 should be positioned relative to container at (200, 100)
    expect(typeof result.item1.x).toBe('number');
    expect(Math.abs((result.item1.x as number) - 200)).toBeLessThan(150);
  });

  it('blends position smoothly during group transition', () => {
    const objects: Record<string, SceneObject> = {
      groupA: makeObj('groupA', { x: 0, y: 0, direction: 'row', justify: 'start', align: 'start' }),
      groupB: makeObj('groupB', { x: 400, y: 0, direction: 'row', justify: 'start', align: 'start' }),
      item: makeObj('item', { group: 'groupA', w: 80, h: 40 }),
    };
    const tracks: Tracks = {
      'item.group': [
        { time: 0, value: 'groupA', easing: 'linear' },
        { time: 2, value: 'groupB', easing: 'linear' },
      ],
    };
    const evaluate = createEvaluator();
    const t0 = evaluate(objects, tracks, 0);
    const nearA = t0.item.x as number;

    // At midpoint, item should be between groupA and groupB positions
    const tMid = evaluate(objects, tracks, 1);
    const midX = tMid.item.x as number;
    expect(midX).toBeGreaterThan(nearA);
    expect(midX).toBeLessThan(400);

    // At end, item should be near groupB
    const tEnd = evaluate(objects, tracks, 2);
    const endX = tEnd.item.x as number;
    expect(Math.abs(endX - 400)).toBeLessThan(100);
  });

  it('resets blend state on seek', () => {
    const objects: Record<string, SceneObject> = {
      container: makeObj('container', { x: 100, y: 0, direction: 'row', justify: 'start', align: 'start' }),
      item: makeObj('item', { group: 'container', w: 80, h: 40 }),
    };
    const tracks: Tracks = {};
    const evaluate = createEvaluator();
    evaluate(objects, tracks, 0);
    evaluate(objects, tracks, 0.5);
    evaluate.reset();
    const result = evaluate(objects, tracks, 0);
    // After reset, positions should snap to layout-computed values (no stale blend)
    expect(typeof result.item.x).toBe('number');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/__tests__/evaluator.test.ts`
Expected: FAIL — `createEvaluator` doesn't exist

- [ ] **Step 3: Rewrite `src/engine/evaluator.ts`**

Refactor from a pure function to a factory that returns a stateful evaluator. The evaluator runs: interpolate → layout → blend → cascade transforms.

```ts
import type { SceneObject, Tracks, Chapter } from '../core/types';
import { interpolate } from './interpolate';
import { computeLayout } from './layout';
import {
  quadPoint, autoCurveControl, splineEndpoint,
  catmullRomClosedPoint,
} from './bezier';

interface BlendState {
  fromX: number;
  fromY: number;
  targetX: number;
  targetY: number;
  startTime: number;
  endTime: number;
  easing: string;
}

interface EvaluatorFn {
  (
    objects: Record<string, SceneObject>,
    tracks: Tracks,
    time: number,
  ): Record<string, Record<string, unknown>>;
  reset: () => void;
}

/**
 * Create a stateful evaluator that tracks position blending across frames.
 */
export function createEvaluator(): EvaluatorFn {
  const blendMap = new Map<string, BlendState>();

  const evaluate = (
    objects: Record<string, SceneObject>,
    tracks: Tracks,
    time: number,
  ): Record<string, Record<string, unknown>> => {
    // Step 1: Start with base props
    const result: Record<string, Record<string, unknown>> = {};
    for (const [id, obj] of Object.entries(objects)) {
      result[id] = { ...obj.props as Record<string, unknown> };
    }

    // Step 2: Apply animated values
    for (const [key, keyframes] of Object.entries(tracks)) {
      const dotIdx = key.indexOf('.');
      const target = key.slice(0, dotIdx);
      const prop = key.slice(dotIdx + 1);
      if (result[target]) {
        const val = interpolate(keyframes, time);
        if (val !== undefined) result[target][prop] = val;
      }
    }

    // Step 3: Run layout
    computeLayout(objects, result);

    // Step 3b: Position blending — smooth transitions when layout positions change
    for (const [id] of Object.entries(objects)) {
      const props = result[id];
      if (!props) continue;
      const layoutX = props.x as number;
      const layoutY = props.y as number;

      const existing = blendMap.get(id);
      if (existing) {
        // Check if layout target changed
        if (Math.abs(existing.targetX - layoutX) > 0.01 || Math.abs(existing.targetY - layoutY) > 0.01) {
          // New blend: from current blended position to new layout target
          const progress = existing.endTime > existing.startTime
            ? Math.min(1, (time - existing.startTime) / (existing.endTime - existing.startTime))
            : 1;
          const currentX = existing.fromX + (existing.targetX - existing.fromX) * progress;
          const currentY = existing.fromY + (existing.targetY - existing.fromY) * progress;

          // Find the keyframe window that caused this change
          const groupTrack = tracks[`${id}.group`];
          let blendEnd = time + 0.5; // default 0.5s blend
          let blendEasing = 'linear';
          if (groupTrack) {
            for (let i = 0; i < groupTrack.length; i++) {
              if (groupTrack[i].time >= time - 0.01) {
                blendEnd = groupTrack[i].time;
                blendEasing = groupTrack[i].easing;
                break;
              }
            }
          }
          blendMap.set(id, { fromX: currentX, fromY: currentY, targetX: layoutX, targetY: layoutY, startTime: time, endTime: Math.max(blendEnd, time + 0.01), easing: blendEasing });
        }
        // Apply blend
        const blend = blendMap.get(id)!;
        const dur = blend.endTime - blend.startTime;
        const t = dur > 0 ? Math.min(1, (time - blend.startTime) / dur) : 1;
        props.x = blend.fromX + (blend.targetX - blend.fromX) * t;
        props.y = blend.fromY + (blend.targetY - blend.fromY) * t;
        if (t >= 1) blendMap.delete(id);
      } else {
        // First frame for this item — record position, no blend
        blendMap.set(id, { fromX: layoutX, fromY: layoutY, targetX: layoutX, targetY: layoutY, startTime: time, endTime: time, easing: 'linear' });
      }
    }

    // Step 4: Cascade parent transforms
    applyTransformCascade(objects, result);

    // Step 5: Resolve follow positions
    for (const id of Object.keys(objects)) {
      const props = result[id];
      const follow = props.follow as string | undefined;
      if (!follow || !objects[follow]) continue;
      const t = (props.pathProgress as number) ?? 0;
      const target = objects[follow];
      const tp = result[follow];
      const pos = resolveFollowPosition(target, tp, result, t);
      if (pos) {
        props.x = pos.x;
        props.y = pos.y;
      }
    }

    return result;
  };

  evaluate.reset = () => {
    blendMap.clear();
  };

  return evaluate;
}

/**
 * Apply parent opacity/scale/rotation to children based on cascade settings.
 */
function applyTransformCascade(
  objects: Record<string, SceneObject>,
  allProps: Record<string, Record<string, unknown>>,
): void {
  // Build parent map from group properties
  const parentMap = new Map<string, string>();
  for (const [id] of Object.entries(objects)) {
    const props = allProps[id];
    const groupId = props?.group as string | undefined;
    if (groupId && objects[groupId]) {
      parentMap.set(id, groupId);
    }
  }

  // For each child, apply parent transforms (walk up the chain)
  for (const [id] of Object.entries(objects)) {
    let parentId = parentMap.get(id);
    while (parentId) {
      const parentProps = allProps[parentId];
      if (!parentProps) break;

      const childProps = allProps[id];
      if (!childProps) break;

      // Opacity cascade
      const cascadeOpacity = (parentProps.cascadeOpacity as boolean) ?? true;
      if (cascadeOpacity) {
        const parentOpacity = (parentProps.opacity as number) ?? 1;
        const childOpacity = (childProps.opacity as number) ?? 1;
        childProps.opacity = parentOpacity * childOpacity;
      }

      // Scale cascade
      const cascadeScale = (parentProps.cascadeScale as boolean) ?? true;
      if (cascadeScale) {
        const parentScale = (parentProps.scale as number) ?? 1;
        if (parentScale !== 1) {
          const childScale = (childProps.scale as number) ?? 1;
          childProps.scale = parentScale * childScale;
          // Scale child position relative to parent origin
          const px = (parentProps.x as number) ?? 0;
          const py = (parentProps.y as number) ?? 0;
          const cx = (childProps.x as number) ?? 0;
          const cy = (childProps.y as number) ?? 0;
          childProps.x = px + (cx - px) * parentScale;
          childProps.y = py + (cy - py) * parentScale;
        }
      }

      // Rotation cascade
      const cascadeRotation = (parentProps.cascadeRotation as boolean) ?? true;
      if (cascadeRotation) {
        const parentRotation = (parentProps.rotation as number) ?? 0;
        if (parentRotation !== 0) {
          const childRotation = (childProps.rotation as number) ?? 0;
          childProps.rotation = parentRotation + childRotation;
          // Rotate child position around parent origin
          const px = (parentProps.x as number) ?? 0;
          const py = (parentProps.y as number) ?? 0;
          const cx = (childProps.x as number) ?? 0;
          const cy = (childProps.y as number) ?? 0;
          const rad = (parentRotation * Math.PI) / 180;
          const dx = cx - px;
          const dy = cy - py;
          childProps.x = px + dx * Math.cos(rad) - dy * Math.sin(rad);
          childProps.y = py + dx * Math.sin(rad) + dy * Math.cos(rad);
        }
      }

      parentId = parentMap.get(parentId);
    }
  }
}

// ── Follow position resolution (unchanged from original) ──

function resolveFollowPosition(
  target: SceneObject,
  tp: Record<string, unknown>,
  allProps: Record<string, Record<string, unknown>>,
  t: number,
): { x: number; y: number } | null {
  if (target.type === 'path') {
    const pts = tp.points as Array<{ x: number; y: number }> | undefined;
    if (!pts || pts.length < 2) return null;
    const closed = tp.closed as boolean;
    const smooth = tp.smooth as boolean;

    if (smooth && closed && pts.length >= 3) {
      return catmullRomClosedPoint(pts, t);
    }
    if (closed) {
      const n = pts.length;
      const wt = ((t % 1) + 1) % 1;
      const totalT = wt * n;
      const segIdx = Math.min(Math.floor(totalT), n - 1);
      const localT = totalT - segIdx;
      const p1 = pts[segIdx];
      const p2 = pts[(segIdx + 1) % n];
      return { x: p1.x + (p2.x - p1.x) * localT, y: p1.y + (p2.y - p1.y) * localT };
    }
    const ep = splineEndpoint(pts, Math.max(0, Math.min(1, t)));
    return { x: ep.x, y: ep.y };
  }

  if (target.type === 'line') {
    const bend = tp.bend;
    const isClosed = tp.closed as boolean;

    if (isClosed && Array.isArray(bend)) {
      return catmullRomClosedPoint(bend as Array<{ x: number; y: number }>, t);
    }

    const clamped = Math.max(0, Math.min(1, t));
    let sx: number, sy: number, ex: number, ey: number;
    const from = tp.from as string | undefined;
    const to = tp.to as string | undefined;
    if (from && to && allProps[from] && allProps[to]) {
      sx = allProps[from].x as number ?? 0;
      sy = allProps[from].y as number ?? 0;
      ex = allProps[to].x as number ?? 0;
      ey = allProps[to].y as number ?? 0;
    } else {
      sx = tp.x1 as number ?? 0;
      sy = tp.y1 as number ?? 0;
      ex = tp.x2 as number ?? 0;
      ey = tp.y2 as number ?? 0;
    }

    if (typeof bend === 'number' && bend !== 0) {
      const { cx, cy } = autoCurveControl(sx, sy, ex, ey, bend);
      return quadPoint(sx, sy, cx, cy, ex, ey, clamped);
    }
    if (Array.isArray(bend)) {
      const allPts = [{ x: sx, y: sy }, ...(bend as Array<{ x: number; y: number }>), { x: ex, y: ey }];
      const ep = splineEndpoint(allPts, clamped);
      return { x: ep.x, y: ep.y };
    }
    return { x: sx + (ex - sx) * clamped, y: sy + (ey - sy) * clamped };
  }

  return null;
}

/**
 * Legacy function signature for backwards compatibility during migration.
 */
export function evaluateAnimatedProps(
  objects: Record<string, SceneObject>,
  tracks: Tracks,
  time: number,
): Record<string, Record<string, unknown>> {
  const evaluate = createEvaluator();
  return evaluate(objects, tracks, time);
}

/**
 * Find which chapter is active at the given time.
 */
export function getActiveChapter(
  chapters: Chapter[],
  time: number,
): Chapter | undefined {
  if (!chapters || chapters.length === 0) return undefined;
  const sorted = [...chapters].sort((a, b) => a.time - b.time);
  let active: Chapter | undefined;
  for (const ch of sorted) {
    if (time >= ch.time) {
      active = ch;
    } else {
      break;
    }
  }
  return active;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/engine/__tests__/evaluator.test.ts`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/engine/evaluator.ts src/engine/__tests__/evaluator.test.ts
git commit -m "feat: add eval-time layout and transform cascade to evaluator"
```

---

### Task 6: Update Render Order

Compute nesting depth from `group` property instead of `groupId`. Account for container type priority.

**Files:**
- Modify: `src/engine/renderOrder.ts`
- Create: `src/engine/__tests__/renderOrder.test.ts`

- [ ] **Step 1: Write render order tests**

Create `src/engine/__tests__/renderOrder.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { SceneObject } from '../../core/types';
import { computeRenderOrder } from '../renderOrder';

function makeObj(id: string, type: string, props: Record<string, unknown> = {}): SceneObject {
  return {
    type: type as 'box',
    id,
    props: { x: 0, y: 0, ...props } as never,
  };
}

describe('computeRenderOrder', () => {
  it('renders all top-level objects (no groupId filtering)', () => {
    const objects: Record<string, SceneObject> = {
      a: makeObj('a', 'box'),
      b: makeObj('b', 'box', { group: 'a' }),
    };
    const allProps: Record<string, Record<string, unknown>> = {
      a: { x: 0, y: 0, direction: 'row' },
      b: { x: 0, y: 0, group: 'a' },
    };
    const order = computeRenderOrder(objects, allProps);
    expect(order.map(([id]) => id)).toContain('a');
    expect(order.map(([id]) => id)).toContain('b');
  });

  it('renders containers below their children', () => {
    const objects: Record<string, SceneObject> = {
      container: makeObj('container', 'box', { direction: 'row' }),
      child: makeObj('child', 'box', { group: 'container' }),
    };
    const allProps: Record<string, Record<string, unknown>> = {
      container: { x: 0, y: 0, direction: 'row' },
      child: { x: 0, y: 0, group: 'container' },
    };
    const order = computeRenderOrder(objects, allProps);
    const containerIdx = order.findIndex(([id]) => id === 'container');
    const childIdx = order.findIndex(([id]) => id === 'child');
    expect(containerIdx).toBeLessThan(childIdx);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/__tests__/renderOrder.test.ts`
Expected: FAIL — `computeRenderOrder` has wrong signature

- [ ] **Step 3: Update `src/engine/renderOrder.ts`**

```ts
import type { SceneObject } from '../core/types';

/**
 * Compute nesting depth from group property in animated props.
 */
function computeGroupDepths(
  objects: Record<string, SceneObject>,
  allProps: Record<string, Record<string, unknown>>,
): Record<string, number> {
  const depths: Record<string, number> = {};

  function getDepth(id: string, visited: Set<string>): number {
    if (depths[id] !== undefined) return depths[id];
    if (visited.has(id)) return 0; // cycle protection
    visited.add(id);

    const props = allProps[id];
    const groupId = props?.group as string | undefined;
    if (groupId && objects[groupId]) {
      depths[id] = getDepth(groupId, visited) + 1;
    } else {
      depths[id] = 0;
    }
    return depths[id];
  }

  for (const id of Object.keys(objects)) {
    getDepth(id, new Set());
  }

  return depths;
}

export function computeRenderOrder(
  objects: Record<string, SceneObject>,
  allProps?: Record<string, Record<string, unknown>>,
): Array<[string, SceneObject]> {
  const entries = Object.entries(objects);
  const props = allProps || {};

  const groupDepths = allProps
    ? computeGroupDepths(objects, allProps)
    : {};

  const effectiveDepth = ([id, obj]: [string, SceneObject]): number => {
    const p = (props[id] || obj.props) as Record<string, unknown>;
    if (typeof p.depth === 'number') return p.depth;
    return groupDepths[id] ?? 0;
  };

  const isContainer = (id: string): boolean => {
    const p = (props[id] || objects[id]?.props) as Record<string, unknown>;
    return !!p?.direction;
  };

  const typeOrder = (id: string, o: SceneObject): number => {
    if (o.type === 'path') return 0;
    if (o.type === 'label') return 1;
    if (isContainer(id)) return 2;
    if (o.type === 'line') return 4;
    return 3; // box, circle, table
  };

  return entries.sort((a, b) => {
    const da = effectiveDepth(a);
    const db = effectiveDepth(b);
    if (da !== db) return da - db;
    return typeOrder(a[0], a[1]) - typeOrder(b[0], b[1]);
  });
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/engine/__tests__/renderOrder.test.ts`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/engine/renderOrder.ts src/engine/__tests__/renderOrder.test.ts
git commit -m "feat: update render order to use group membership instead of groupId"
```

---

### Task 7: Update Renderer — Remove GroupRenderer, Flatten Rendering

Remove GroupRenderer. Update `renderObject` to render all items at the top level. Update `createRenderObject` to no longer route to GroupRenderer.

**Files:**
- Delete: `src/renderer/svg/GroupRenderer.tsx`
- Modify: `src/renderer/renderObject.tsx`

- [ ] **Step 1: Delete GroupRenderer**

```bash
rm src/renderer/svg/GroupRenderer.tsx
```

- [ ] **Step 2: Update `src/renderer/renderObject.tsx`**

Remove all references to GroupRenderer. Remove the children-based GroupRenderer routing. All objects render as their own type:

```tsx
import React from 'react';
import type { SceneObject } from '../core/types';
import { BoxRenderer } from './svg/BoxRenderer';
import { CircleRenderer } from './svg/CircleRenderer';
import { LabelRenderer } from './svg/LabelRenderer';
import { TableRenderer } from './svg/TableRenderer';
import { LineRenderer } from './svg/LineRenderer';
import { PathRenderer } from './svg/PathRenderer';

type RenderFn = (id: string, obj: SceneObject) => React.ReactNode;

export function createRenderObject(
  animatedProps: Record<string, Record<string, unknown>>,
  objects: Record<string, SceneObject>,
  debug: boolean,
): RenderFn {
  const renderObject: RenderFn = (id, obj) => {
    const p = (animatedProps[id] || obj.props) as Record<string, unknown>;

    const isVisible = (p.visible as boolean) ?? true;
    if (!isVisible && !debug) return null;

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
            objects={objects}
            allProps={animatedProps}
            debug={debug}
          />
        );
      case 'path':
        return <PathRenderer key={id} props={p} debug={debug} />;
      default:
        return null;
    }
  };
  return renderObject;
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors related to GroupRenderer imports

- [ ] **Step 4: Commit**

```bash
git add src/renderer/renderObject.tsx
git rm src/renderer/svg/GroupRenderer.tsx
git commit -m "feat: remove GroupRenderer, flatten rendering to world-space"
```

---

## Chunk 4: Integration — Scene API, Parser, Schemas, and Consumer Updates

### Task 8: Update Zod Schemas

Remove GroupSchema. Add layout properties to BaseSchema. Update valid types and schema metadata. Rename `spread` to `spaceBetween`/`spaceAround`.

**Files:**
- Modify: `src/core/schemas.ts`

- [ ] **Step 1: Update `src/core/schemas.ts`**

Remove `GroupSchema` import and registration. Add layout properties to `BaseSchema`. Update `VALID_TYPES` and `SCHEMA_METADATA`:

In `BaseSchema`, add after `pathProgress`:

```ts
  rotation: z.number().default(0),
  direction: z.enum(['row', 'column']).optional(),
  gap: z.number().default(0),
  justify: z.enum(['start', 'center', 'end', 'spaceBetween', 'spaceAround']).default('start'),
  align: z.enum(['start', 'center', 'end', 'stretch']).default('start'),
  wrap: z.boolean().default(false),
  padding: z.number().default(0),
  group: z.string().optional(),
  order: z.number().default(0),
  grow: z.number().default(0),
  shrink: z.number().default(0),
  alignSelf: z.enum(['start', 'center', 'end', 'stretch']).optional(),
  cascadeOpacity: z.boolean().default(true),
  cascadeScale: z.boolean().default(true),
  cascadeRotation: z.boolean().default(true),
```

Remove `GroupSchema` entirely. Remove `group: GroupSchema` from `SCHEMAS`.

Update `VALID_TYPES`:
```ts
export const VALID_TYPES = new Set<string>([
  'box', 'circle', 'label', 'table', 'line', 'path',
]);
```

Update `SCHEMA_METADATA` to add layout props to `base`, remove `group` from types and props, and update `justify`/`align` values.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No type errors (or only expected ones from files not yet updated)

- [ ] **Step 3: Commit**

```bash
git add src/core/schemas.ts
git commit -m "feat: update schemas - remove group type, add layout props to base"
```

---

### Task 9: Update Scene API

Remove `scene.group()`. Add `_definitionOrder` tracking. Update `animate()` to use keyframe-block format. Remove `groupId` assignment logic.

**Files:**
- Modify: `src/core/Scene.ts`

- [ ] **Step 1: Update `src/core/Scene.ts`**

Key changes:
- Remove `GroupProps` import
- Remove `group()` method
- Add `_definitionOrder` counter, increment on each object creation
- Remove `groupId` assignment from all creation methods
- Remove `applyGroupLayouts` call from `getObjects()` (layout is now eval-time)
- Update `AnimationBuilder` to use keyframe-block format
- Update `animate()` to return a builder that accepts keyframe blocks

```ts
import type {
  SceneObject,
  AnimConfig,
  BoxProps,
  CircleProps,
  LabelProps,
  TableProps,
  LineProps,
  PathProps,
  EasingName,
  ObjectChanges,
  Chapter,
  StarchEvent,
  StarchEventType,
  StarchEventHandler,
} from './types';
import { parseShape } from './schemas';

class AnimationBuilder {
  private config: AnimConfig;

  constructor(config: AnimConfig) {
    this.config = config;
  }

  keyframe(
    time: number,
    changes: Record<string, ObjectChanges>,
    easing?: EasingName,
  ): this {
    this.config.keyframes.push({
      time,
      easing,
      changes,
    });
    return this;
  }

  chapter(time: number, id: string, title: string, description?: string): this {
    this.config.chapters.push({ id, time, title, description });
    return this;
  }
}

export class Scene {
  private _objects: Record<string, SceneObject> = {};
  private _nextOrder = 0;
  private _animConfig: AnimConfig = {
    duration: 5,
    loop: true,
    keyframes: [],
    chapters: [],
  };
  private _listeners: Map<StarchEventType, Set<StarchEventHandler>> = new Map();

  // ── Object creation ─────────────────────────────

  box(id: string, props: Partial<BoxProps> & { w?: number; h?: number }): this {
    return this._addObject(id, 'box', props);
  }

  circle(id: string, props: Partial<CircleProps> & { r?: number }): this {
    return this._addObject(id, 'circle', props);
  }

  label(id: string, props: Partial<LabelProps> & { text: string }): this {
    return this._addObject(id, 'label', props);
  }

  table(id: string, props: Partial<TableProps> & { cols: string[] }): this {
    return this._addObject(id, 'table', props);
  }

  line(id: string, props: Partial<LineProps>): this {
    return this._addObject(id, 'line', props);
  }

  path(id: string, props: Partial<PathProps> & { points: Array<{ x: number; y: number }> }): this {
    return this._addObject(id, 'path', props);
  }

  private _addObject(id: string, type: string, props: Record<string, unknown>): this {
    const inputKeys = new Set(Object.keys(props));
    const parsed = parseShape(type as 'box', props);
    this._objects[id] = {
      type: type as 'box',
      id,
      props: parsed as never,
      _inputKeys: inputKeys,
      _definitionOrder: this._nextOrder++,
    };
    return this;
  }

  // ── Animation ───────────────────────────────────

  animate(opts: { duration: number; loop?: boolean; easing?: EasingName }): AnimationBuilder {
    this._animConfig.duration = opts.duration;
    this._animConfig.loop = opts.loop ?? true;
    this._animConfig.easing = opts.easing;
    return new AnimationBuilder(this._animConfig);
  }

  // ── Events ──────────────────────────────────────

  on(type: StarchEventType, handler: StarchEventHandler): this {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type)!.add(handler);
    return this;
  }

  off(type: StarchEventType, handler: StarchEventHandler): this {
    this._listeners.get(type)?.delete(handler);
    return this;
  }

  emit(event: StarchEvent): void {
    this._listeners.get(event.type)?.forEach((handler) => handler(event));
  }

  // ── Accessors ───────────────────────────────────

  getObjects(): Record<string, SceneObject> {
    return this._objects;
  }

  getAnimConfig(): AnimConfig {
    return this._animConfig;
  }

  getChapters(): Chapter[] {
    return this._animConfig.chapters;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors in Scene.ts (other files may have errors from pending updates)

- [ ] **Step 3: Commit**

```bash
git add src/core/Scene.ts
git commit -m "feat: update Scene API - remove group(), add keyframe block builder"
```

---

### Task 10: Update Parser

Update DSL parser to handle new keyframe-block format. Remove `children` nesting logic. Support `group` property on objects. Remove `'group'` as a valid type.

**Files:**
- Modify: `src/parser/parser.ts`

- [ ] **Step 1: Update `src/parser/parser.ts`**

Key changes:
- Remove `children` recursive parsing (objects declare `group` instead)
- Update `RawKeyframe` to `RawKeyframeBlock` format
- Update animation parsing to handle keyframe blocks
- Remove `applyGroupLayouts` call (layout is eval-time)
- Track `_definitionOrder` on parsed objects

```ts
import JSON5 from 'json5';
import type {
  SceneObject,
  AnimConfig,
  ObjectType,
  EasingName,
} from '../core/types';
import { parseShape, VALID_TYPES } from '../core/schemas';
import { expandShorthands } from './shorthands';

export interface ParseResult {
  objects: Record<string, SceneObject>;
  animConfig: AnimConfig;
}

interface RawObject {
  type: string;
  id: string;
  [key: string]: unknown;
}

interface RawKeyframeBlock {
  time: number;
  easing?: string;
  changes?: Record<string, Record<string, unknown>>;
  // Also allow flat format for convenience: any other keys are treated as target IDs
  [key: string]: unknown;
}

interface RawChapter {
  time: number;
  id?: string;
  title: string;
  description?: string;
}

interface RawDiagram {
  objects?: RawObject[];
  animate?: {
    duration?: number;
    loop?: boolean;
    easing?: string;
    keyframes?: RawKeyframeBlock[];
    chapters?: RawChapter[];
  };
}

let _definitionCounter = 0;

function parseObject(
  raw: RawObject,
  objects: Record<string, SceneObject>,
): void {
  const { type, id, ...rest } = raw;

  if (!type || !id) {
    throw new Error(`Object missing required "type" or "id" field`);
  }
  if (!VALID_TYPES.has(type)) {
    throw new Error(`Unknown object type: "${type}". Valid types: ${[...VALID_TYPES].join(', ')}`);
  }
  if (objects[id]) {
    throw new Error(`Duplicate object ID: "${id}"`);
  }

  const inputKeys = new Set(Object.keys(rest));
  const parsed = parseShape(type as ObjectType, rest);

  objects[id] = {
    type: type as ObjectType,
    id,
    props: parsed as never,
    _inputKeys: inputKeys,
    _definitionOrder: _definitionCounter++,
  };
}

function parseKeyframeBlock(raw: RawKeyframeBlock): { time: number; easing?: EasingName; changes: Record<string, Record<string, unknown>> } {
  const { time, easing, changes: rawChanges, ...rest } = raw;

  // If `changes` is provided, use it directly
  // Otherwise, remaining keys are target IDs (flat format)
  const changes: Record<string, Record<string, unknown>> = {};

  if (rawChanges && typeof rawChanges === 'object') {
    for (const [targetId, props] of Object.entries(rawChanges)) {
      changes[targetId] = props;
    }
  }

  // Flat format: any key that isn't time/easing/changes is a target ID
  for (const [key, value] of Object.entries(rest)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      changes[key] = value as Record<string, unknown>;
    }
  }

  return {
    time,
    easing: easing as EasingName | undefined,
    changes,
  };
}

export function parseDSL(src: string): ParseResult {
  let raw: RawDiagram;

  try {
    raw = expandShorthands(JSON5.parse(src)) as RawDiagram;
  } catch (e) {
    throw new Error(`JSON5 parse error: ${(e as Error).message}`);
  }

  _definitionCounter = 0;
  const objects: Record<string, SceneObject> = {};

  if (raw.objects && Array.isArray(raw.objects)) {
    for (const rawObj of raw.objects) {
      parseObject(rawObj, objects);
    }
  }

  const animConfig: AnimConfig = {
    duration: raw.animate?.duration ?? 5,
    loop: raw.animate?.loop ?? true,
    easing: (raw.animate?.easing as EasingName) || undefined,
    keyframes: [],
    chapters: [],
  };

  if (raw.animate?.keyframes) {
    for (const kf of raw.animate.keyframes) {
      const parsed = parseKeyframeBlock(kf);
      animConfig.keyframes.push({
        time: parsed.time,
        easing: parsed.easing,
        changes: parsed.changes as Record<string, { easing?: EasingName; [k: string]: unknown }>,
      });
    }
  }

  if (raw.animate?.chapters) {
    for (const ch of raw.animate.chapters) {
      animConfig.chapters.push({
        id: ch.id || ch.title.toLowerCase().replace(/\s+/g, '-'),
        time: ch.time,
        title: ch.title,
        description: ch.description,
      });
    }
  }

  return { objects, animConfig };
}

export function parseJSON(input: RawDiagram): ParseResult {
  const raw = expandShorthands(input) as RawDiagram;
  _definitionCounter = 0;
  const objects: Record<string, SceneObject> = {};

  if (raw.objects && Array.isArray(raw.objects)) {
    for (const rawObj of raw.objects) {
      parseObject(rawObj, objects);
    }
  }

  const animConfig: AnimConfig = {
    duration: raw.animate?.duration ?? 5,
    loop: raw.animate?.loop ?? true,
    easing: (raw.animate?.easing as EasingName) || undefined,
    keyframes: [],
    chapters: [],
  };

  if (raw.animate?.keyframes) {
    for (const kf of raw.animate.keyframes) {
      const parsed = parseKeyframeBlock(kf);
      animConfig.keyframes.push({
        time: parsed.time,
        easing: parsed.easing,
        changes: parsed.changes as Record<string, { easing?: EasingName; [k: string]: unknown }>,
      });
    }
  }

  if (raw.animate?.chapters) {
    for (const ch of raw.animate.chapters) {
      animConfig.chapters.push({
        id: ch.id || ch.title.toLowerCase().replace(/\s+/g, '-'),
        time: ch.time,
        title: ch.title,
        description: ch.description,
      });
    }
  }

  return { objects, animConfig };
}
```

**Important:** Extract the shared animation config parsing logic into a `buildAnimConfigFromRaw` helper to avoid duplication between `parseDSL` and `parseJSON`. Both functions should call this helper instead of duplicating the keyframe/chapter parsing code.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors in parser.ts

- [ ] **Step 3: Commit**

```bash
git add src/parser/parser.ts
git commit -m "feat: update parser for keyframe blocks and group property"
```

---

### Task 11: Update Consumer Components

Update Diagram component, StarchDiagram class, and public exports to use the new evaluator and render order APIs.

**Files:**
- Modify: `src/components/Diagram.tsx`
- Modify: `src/StarchDiagram.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Update `src/components/Diagram.tsx`**

In `useDiagramCore`, make these specific changes:

1. Update imports — replace `evaluateAnimatedProps` with `createEvaluator`:
```ts
import { createEvaluator, getActiveChapter } from '../engine/evaluator';
```

2. Add evaluator ref (after fallback ref):
```ts
const evaluatorRef = useRef(createEvaluator());
```

3. Replace the `animatedProps` memo:
```ts
const animatedProps = useMemo(
  () => evaluatorRef.current(objects, tracks, time),
  [objects, tracks, time],
);
```

4. Replace the `renderOrder` memo to pass animatedProps:
```ts
const renderOrder = useMemo(
  () => computeRenderOrder(objects, animatedProps),
  [objects, animatedProps],
);
```

5. In the `seek` callback, add evaluator reset:
```ts
const seek = useCallback(
  (t: number) => {
    evaluatorRef.current.reset();
    setTimeState(t);
    lastChapterRef.current = getActiveChapter(chapters, t);
  },
  [chapters],
);
```

6. Update `duration` usage to handle optional: `const duration = animConfig.duration ?? 5;`

7. Update `loop` usage: `if (animConfig.loop ?? true) {`

- [ ] **Step 2: Update `src/StarchDiagram.ts`**

1. Update imports — add `createEvaluator`, remove `evaluateAnimatedProps`:
```ts
import { createEvaluator, getActiveChapter } from './engine/evaluator';
```

2. Remove `Keyframe` import, add `KeyframeBlock` if needed for type annotations.

3. Add evaluator field:
```ts
private _evaluator = createEvaluator();
```

4. Update `_render()`:
```ts
private _render(): void {
  const animatedProps = this._evaluator(this._objects, this._tracks, this._time);
  this._dispatcher.update(this._renderOrder, animatedProps, this._objects);
}
```

5. Update `seek()` to reset evaluator:
```ts
seek(time: number): void {
  this._time = Math.max(0, Math.min(time, this._animConfig.duration ?? 5));
  this._evaluator.reset();
  this._lastChapter = getActiveChapter(this._animConfig.chapters, this._time);
  this._render();
}
```

6. Update `_rebuild()` to pass animatedProps to render order:
```ts
private _rebuild(): void {
  this._tracks = buildTimeline(this._animConfig, this._objects);
  this._evaluator.reset();
  const animatedProps = this._evaluator(this._objects, this._tracks, this._time);
  this._renderOrder = computeRenderOrder(this._objects, animatedProps);
}
```

7. Update all `this._animConfig.duration` usages to `this._animConfig.duration ?? 5` and `this._animConfig.loop` to `this._animConfig.loop ?? true`.

- [ ] **Step 3: Update `src/index.ts`**

Replace the type exports and engine exports:

```ts
// Core
export { Scene } from './core/Scene';
export type {
  ObjectType,
  NamedAnchor,
  FloatAnchor,
  AnchorPoint,
  BaseProps,
  LayoutDirection,
  LayoutJustify,
  LayoutAlign,
  BoxProps,
  CircleProps,
  LabelProps,
  TableProps,
  LineProps,
  PathProps,
  SceneObject,
  EasingName,
  KeyframeBlock,
  ObjectChanges,
  Chapter,
  AnimConfig,
  TrackKeyframe,
  Tracks,
  StarchEventType,
  StarchEvent,
  StarchEventHandler,
  DiagramHandle,
} from './core/types';

// Engine
export { createEvaluator, evaluateAnimatedProps, getActiveChapter } from './engine/evaluator';
export { computeLayout } from './engine/layout';
export { buildTimeline } from './engine/timeline';
export { computeRenderOrder } from './engine/renderOrder';
export { EASINGS, applyEasing } from './engine/easing';
export { resolveAnchor, scaleAroundAnchor, scaledCenter, anchorWorldPosition } from './engine/anchor';
export { interpolate, lerpColor } from './engine/interpolate';

// Schemas & Colours
export { parseShape, VALID_TYPES, LabelSchema } from './core/schemas';
export { resolveColour, deriveFill, resolveColourShortcut } from './core/colours';

// Parser
export { parseDSL, parseJSON } from './parser/parser';
export { expandShorthands } from './parser/shorthands';

// Edge geometry
export { getObjectBounds, edgePoint, edgePointAtAnchor } from './renderer/EdgeGeometry';
```

- [ ] **Step 4: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/components/Diagram.tsx src/StarchDiagram.ts src/index.ts
git commit -m "feat: update consumers for new layout engine and evaluator"
```

---

### Task 12: Update DOM Renderer (Framework-Agnostic Path)

The `StarchDiagram` class uses a DOM-based renderer (`src/renderer/svg/dom/`). Update it to remove GroupRenderer references.

**Files:**
- Modify: `src/renderer/svg/dom/renderObject.ts`

- [ ] **Step 1: Check current DOM renderer for group references**

Read `src/renderer/svg/dom/renderObject.ts` and identify all references to `GroupRenderer`, `'group'` type, `groupId`, or `children`-based routing.

- [ ] **Step 2: Remove group-related code from DOM renderer**

Remove the `'group'` case and any children-based group rendering logic. All objects should render as their own type at the top level.

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/renderer/svg/dom/
git commit -m "feat: update DOM renderer to remove group type handling"
```

---

### Task 13: Final Integration Test and Cleanup

Verify everything works end-to-end with a complete test scenario.

**Files:**
- Create: `src/__tests__/integration.test.ts`

- [ ] **Step 1: Write integration test**

Create `src/__tests__/integration.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Scene } from '../core/Scene';
import { buildTimeline } from '../engine/timeline';
import { createEvaluator } from '../engine/evaluator';
import { computeRenderOrder } from '../engine/renderOrder';

describe('integration: flexbox layout with animation', () => {
  it('complete scenario: objects in containers with keyframe animation', () => {
    const scene = new Scene();

    scene.box('sidebar', {
      x: 100, y: 200, fill: '#eee', radius: 8,
      direction: 'column' as 'column', gap: 10, padding: 16,
    });
    scene.box('item1', { w: 80, h: 40, group: 'sidebar' });
    scene.box('item2', { w: 80, h: 40, group: 'sidebar' });

    scene.box('main', {
      x: 400, y: 200, fill: '#ddd',
      direction: 'row' as 'row', gap: 10, padding: 16,
    });

    scene.animate({ duration: 5 })
      .keyframe(2, {
        item1: { group: 'main' },
      });

    const objects = scene.getObjects();
    const animConfig = scene.getAnimConfig();
    const tracks = buildTimeline(animConfig, objects);
    const evaluate = createEvaluator();

    // At t=0: item1 and item2 are in sidebar
    const t0 = evaluate(objects, tracks, 0);
    expect(t0.item1.group).toBe('sidebar');
    expect(t0.item2.group).toBe('sidebar');
    // Both should be near sidebar position
    const sidebarX = t0.sidebar.x as number;
    expect(Math.abs((t0.item1.x as number) - sidebarX)).toBeLessThan(200);

    // At t=2+: item1 should be in main
    const t3 = evaluate(objects, tracks, 3);
    expect(t3.item1.group).toBe('main');
    const mainX = t3.main.x as number;
    expect(Math.abs((t3.item1.x as number) - mainX)).toBeLessThan(200);

    // Render order should include all objects
    const order = computeRenderOrder(objects, t0);
    expect(order).toHaveLength(4);
  });

  it('grow distributes space correctly', () => {
    const scene = new Scene();

    scene.box('row', {
      x: 0, y: 0, w: 300, h: 50,
      direction: 'row' as 'row',
    });
    scene.box('a', { w: 50, h: 40, group: 'row', grow: 1 });
    scene.box('b', { w: 50, h: 40, group: 'row', grow: 1 });

    const objects = scene.getObjects();
    const tracks = buildTimeline(scene.getAnimConfig(), objects);
    const evaluate = createEvaluator();
    const result = evaluate(objects, tracks, 0);

    // Each should grow by 100 (200 extra / 2 items)
    const aW = (result.a._layoutW as number) || (result.a.w as number);
    const bW = (result.b._layoutW as number) || (result.b.w as number);
    expect(aW).toBeCloseTo(150, 0);
    expect(bW).toBeCloseTo(150, 0);
  });

  it('nested containers work correctly', () => {
    const scene = new Scene();

    scene.box('outer', {
      x: 200, y: 200, direction: 'column' as 'column', gap: 20,
    });
    scene.box('inner', {
      direction: 'row' as 'row', gap: 5, group: 'outer',
    });
    scene.box('a', { w: 40, h: 30, group: 'inner' });
    scene.box('b', { w: 40, h: 30, group: 'inner' });
    scene.box('c', { w: 80, h: 40, group: 'outer' });

    const objects = scene.getObjects();
    const tracks = buildTimeline(scene.getAnimConfig(), objects);
    const evaluate = createEvaluator();
    const result = evaluate(objects, tracks, 0);

    // a and b should be side by side
    expect(result.a.x).not.toBe(result.b.x);
    expect(result.a.y).toBe(result.b.y);
    // c should be below inner
    expect(result.c.y).toBeGreaterThan(result.a.y as number);
  });

  it('opacity cascades from parent to child', () => {
    const scene = new Scene();

    scene.box('container', {
      x: 0, y: 0, direction: 'row' as 'row', opacity: 0.5,
    });
    scene.box('child', { group: 'container', opacity: 0.6 });

    const objects = scene.getObjects();
    const tracks = buildTimeline(scene.getAnimConfig(), objects);
    const evaluate = createEvaluator();
    const result = evaluate(objects, tracks, 0);

    expect(result.child.opacity).toBeCloseTo(0.3); // 0.5 * 0.6
  });
});
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Run full build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/integration.test.ts
git commit -m "test: add integration tests for flexbox layout engine"
```

- [ ] **Step 5: Final cleanup — remove any remaining group references**

Search the codebase for any remaining references to `groupId`, `GroupProps`, `GroupRenderer`, `scene.group`, `type: 'group'`, or `applyGroupLayouts` (except the compatibility alias in layout.ts). Fix any found.

Run: `grep -r "groupId\|GroupProps\|GroupRenderer\|scene\.group(\|type: 'group'\|applyGroupLayouts" src/ --include='*.ts' --include='*.tsx'`

Note: The `group` property on BaseProps (child-to-container membership) is intentional — do NOT remove those references.

- [ ] **Step 6: Commit cleanup if needed**

```bash
git add -A
git commit -m "chore: remove remaining group type references"
```
