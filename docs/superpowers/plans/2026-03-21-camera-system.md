# Camera System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full camera controls to v2 — target, zoom, fit, ratio, rotation, active switching — with smooth animated transitions via rect-based track expansion.

**Architecture:** Camera settings on nodes resolve into rect + transform tracks at timeline build time (second pass after slot expansion). At render time, the active camera's already-animated rect/transform becomes the viewbox. Rotation is handled by counter-rotating the SVG content group.

**Tech Stack:** TypeScript, Zod, React, SVG, Vitest

**Spec:** `docs/superpowers/specs/2026-03-21-camera-system-design.md`

---

## Chunk 1: Schema + Camera Resolution

### Task 1: Extend CameraSchema and interfaces

**Files:**
- Modify: `src/v2/types/node.ts:61-65` (CameraSchema)
- Modify: `src/v2/types/node.ts:138` (NodeInput.camera)
- Modify: `src/v2/types/node.ts:164` (Node.camera)
- Test: `src/v2/__tests__/types/camera-schema.test.ts`

- [ ] **Step 1: Write schema validation tests**

```typescript
import { describe, it, expect } from 'vitest';
import { CameraSchema } from '../../types/node';

describe('CameraSchema', () => {
  it('accepts target as [x, y]', () => {
    expect(CameraSchema.parse({ target: [100, 200] })).toEqual({ target: [100, 200] });
  });

  it('accepts target as node ID string', () => {
    expect(CameraSchema.parse({ target: 'box1' })).toEqual({ target: 'box1' });
  });

  it('accepts target as ["nodeId", dx, dy]', () => {
    expect(CameraSchema.parse({ target: ['box1', 10, -5] })).toEqual({ target: ['box1', 10, -5] });
  });

  it('accepts zoom', () => {
    expect(CameraSchema.parse({ zoom: 2 })).toEqual({ zoom: 2 });
  });

  it('rejects negative zoom', () => {
    expect(() => CameraSchema.parse({ zoom: -1 })).toThrow();
  });

  it('accepts fit as array of IDs', () => {
    expect(CameraSchema.parse({ fit: ['a', 'b'] })).toEqual({ fit: ['a', 'b'] });
  });

  it('accepts fit as "all"', () => {
    expect(CameraSchema.parse({ fit: 'all' })).toEqual({ fit: 'all' });
  });

  it('accepts ratio', () => {
    expect(CameraSchema.parse({ ratio: 16 / 9 })).toEqual({ ratio: 16 / 9 });
  });

  it('accepts active boolean', () => {
    expect(CameraSchema.parse({ active: false })).toEqual({ active: false });
  });

  it('accepts all properties together', () => {
    const cam = { target: 'box1', zoom: 2, fit: ['a'], ratio: 2.35, active: true };
    expect(CameraSchema.parse(cam)).toEqual(cam);
  });

  it('accepts empty object', () => {
    expect(CameraSchema.parse({})).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/v2/__tests__/types/camera-schema.test.ts`
Expected: FAIL — `fit: 'all'` rejected, `ratio` and `active` not recognized

- [ ] **Step 3: Update CameraSchema in node.ts**

In `src/v2/types/node.ts`, replace lines 61-65:

```typescript
export const CameraSchema = z.object({
  target: PointRefSchema.describe('Camera target').optional(),
  zoom: z.number().min(0).describe('Zoom level').optional(),
  fit: z.union([z.array(z.string()), z.literal('all')]).describe('Fit to object IDs or "all"').optional(),
  ratio: z.number().min(0).describe('Aspect ratio (width/height)').optional(),
  active: z.boolean().describe('Whether this camera is active').optional(),
});
```

- [ ] **Step 4: Update NodeInput and Node interfaces**

In `src/v2/types/node.ts`, update the hand-coded `camera` type in both `NodeInput` (line 138) and `Node` (line 164):

```typescript
camera?: { target?: PointRef; zoom?: number; fit?: string[] | 'all'; ratio?: number; active?: boolean };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/v2/__tests__/types/camera-schema.test.ts`
Expected: All PASS

- [ ] **Step 6: Run full test suite to check for regressions**

Run: `npx vitest run`
Expected: All existing tests still pass

- [ ] **Step 7: Commit**

```bash
git add src/v2/types/node.ts src/v2/__tests__/types/camera-schema.test.ts
git commit -m "feat(camera): extend CameraSchema with ratio, active, fit:'all'"
```

---

### Task 2: Camera resolution utility

A pure function that takes camera settings + node tree → computed rect + transform. This is the core computation used by track expansion.

**Files:**
- Create: `src/v2/animation/cameraExpansion.ts`
- Test: `src/v2/__tests__/animation/cameraExpansion.test.ts`

- [ ] **Step 1: Write tests for camera resolution**

```typescript
import { describe, it, expect } from 'vitest';
import { resolveCameraView } from '../../animation/cameraExpansion';
import { createNode } from '../../types/node';

const DEFAULT_VB = { x: 0, y: 0, w: 800, h: 600 };

describe('resolveCameraView', () => {
  it('returns default viewbox when camera has no settings', () => {
    const cam = createNode({ id: 'cam', camera: {} });
    const result = resolveCameraView(cam, [], DEFAULT_VB);
    expect(result).toEqual({ x: 400, y: 300, w: 800, h: 600 });
  });

  it('targets a coordinate', () => {
    const cam = createNode({ id: 'cam', camera: { target: [100, 200] } });
    const result = resolveCameraView(cam, [], DEFAULT_VB);
    expect(result.x).toBe(100);
    expect(result.y).toBe(200);
  });

  it('targets a node by ID', () => {
    const box = createNode({ id: 'box', transform: { x: 300, y: 150 } });
    const cam = createNode({ id: 'cam', camera: { target: 'box' } });
    const result = resolveCameraView(cam, [box], DEFAULT_VB);
    expect(result.x).toBe(300);
    expect(result.y).toBe(150);
  });

  it('targets a node with offset', () => {
    const box = createNode({ id: 'box', transform: { x: 300, y: 150 } });
    const cam = createNode({ id: 'cam', camera: { target: ['box', 50, -20] } });
    const result = resolveCameraView(cam, [box], DEFAULT_VB);
    expect(result.x).toBe(350);
    expect(result.y).toBe(130);
  });

  it('applies zoom', () => {
    const cam = createNode({ id: 'cam', camera: { zoom: 2 } });
    const result = resolveCameraView(cam, [], DEFAULT_VB);
    expect(result.w).toBe(400);
    expect(result.h).toBe(300);
  });

  it('fits to specific nodes', () => {
    const a = createNode({ id: 'a', transform: { x: 0, y: 0 }, rect: { w: 50, h: 50 } });
    const b = createNode({ id: 'b', transform: { x: 200, y: 200 }, rect: { w: 50, h: 50 } });
    const cam = createNode({ id: 'cam', camera: { fit: ['a', 'b'] } });
    const result = resolveCameraView(cam, [a, b], DEFAULT_VB);
    // Center should be midpoint of bounding box
    expect(result.x).toBe(100);
    expect(result.y).toBe(100);
    // Width/height should encompass both nodes + margin
    expect(result.w).toBeGreaterThan(200);
    expect(result.h).toBeGreaterThan(200);
  });

  it('fits all nodes with fit: "all"', () => {
    const a = createNode({ id: 'a', transform: { x: 0, y: 0 }, rect: { w: 50, h: 50 } });
    const b = createNode({ id: 'b', transform: { x: 200, y: 200 }, rect: { w: 50, h: 50 } });
    const cam = createNode({ id: 'cam', camera: { fit: 'all' } });
    const result = resolveCameraView(cam, [a, b, cam], DEFAULT_VB);
    // Should encompass a and b but not cam
    expect(result.w).toBeGreaterThan(200);
  });

  it('applies ratio by expanding the smaller dimension', () => {
    // Square fit area, widescreen ratio
    const a = createNode({ id: 'a', transform: { x: 0, y: 0 }, rect: { w: 100, h: 100 } });
    const cam = createNode({ id: 'cam', camera: { fit: ['a'], ratio: 2 } });
    const result = resolveCameraView(cam, [a], DEFAULT_VB);
    expect(result.w / result.h).toBeCloseTo(2, 1);
    // Height should stay, width should expand
    expect(result.w).toBeGreaterThan(result.h);
  });

  it('combines zoom and fit', () => {
    const a = createNode({ id: 'a', transform: { x: 100, y: 100 }, rect: { w: 100, h: 100 } });
    const cam = createNode({ id: 'cam', camera: { fit: ['a'], zoom: 2 } });
    const result = resolveCameraView(cam, [a], DEFAULT_VB);
    const noZoom = resolveCameraView(
      createNode({ id: 'cam2', camera: { fit: ['a'] } }),
      [a],
      DEFAULT_VB,
    );
    expect(result.w).toBeCloseTo(noZoom.w / 2, 1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/v2/__tests__/animation/cameraExpansion.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement resolveCameraView**

Create `src/v2/animation/cameraExpansion.ts`:

```typescript
import type { Node } from '../types/node';
import type { ViewBox } from '../renderer/camera';

export interface CameraViewResult {
  x: number;  // center x
  y: number;  // center y
  w: number;  // view width
  h: number;  // view height
}

function findNodeById(roots: Node[], id: string): Node | undefined {
  for (const root of roots) {
    if (root.id === id) return root;
    const found = findNodeById(root.children, id);
    if (found) return found;
  }
  return undefined;
}

function getNodeBounds(node: Node): { x: number; y: number; w: number; h: number } {
  const px = node.transform?.x ?? 0;
  const py = node.transform?.y ?? 0;
  let w = 0, h = 0;
  if (node.rect) { w = node.rect.w; h = node.rect.h; }
  else if (node.ellipse) { w = node.ellipse.rx * 2; h = node.ellipse.ry * 2; }
  else if (node.size) { w = node.size.w; h = node.size.h; }
  return { x: px - w / 2, y: py - h / 2, w, h };
}

/**
 * Resolve camera settings into a view rect (center + dimensions).
 * Used by track expansion to compute concrete rect/transform values at keyframe times.
 */
export function resolveCameraView(
  cameraNode: Node,
  allNodes: Node[],
  defaultViewBox: ViewBox,
): CameraViewResult {
  const cam = cameraNode.camera;
  if (!cam) {
    return {
      x: defaultViewBox.x + defaultViewBox.w / 2,
      y: defaultViewBox.y + defaultViewBox.h / 2,
      w: defaultViewBox.w,
      h: defaultViewBox.h,
    };
  }

  const zoom = cam.zoom ?? 1;
  let cx = defaultViewBox.x + defaultViewBox.w / 2;
  let cy = defaultViewBox.y + defaultViewBox.h / 2;
  let vw = defaultViewBox.w;
  let vh = defaultViewBox.h;

  // Fit: compute bounding box of specified nodes
  const fitIds = cam.fit;
  if (fitIds) {
    const ids = fitIds === 'all'
      ? allNodes.filter(n => !n.camera).map(n => n.id)
      : fitIds;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of ids) {
      const node = findNodeById(allNodes, id);
      if (!node) continue;
      const b = getNodeBounds(node);
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    }

    if (minX !== Infinity) {
      const margin = 20;
      cx = (minX + maxX) / 2;
      cy = (minY + maxY) / 2;
      vw = (maxX - minX) + margin * 2;
      vh = (maxY - minY) + margin * 2;
    }
  } else if (cam.target) {
    // Target: resolve PointRef to center coordinates
    const target = cam.target;
    if (typeof target === 'string') {
      const node = findNodeById(allNodes, target);
      if (node) {
        cx = node.transform?.x ?? 0;
        cy = node.transform?.y ?? 0;
      }
    } else if (Array.isArray(target)) {
      if (typeof target[0] === 'number') {
        cx = target[0] as number;
        cy = target[1] as number;
      } else if (typeof target[0] === 'string') {
        const node = findNodeById(allNodes, target[0]);
        if (node) {
          cx = (node.transform?.x ?? 0) + (target[1] as number);
          cy = (node.transform?.y ?? 0) + (target[2] as number);
        }
      }
    }
  }

  // Apply zoom
  vw /= zoom;
  vh /= zoom;

  // Apply ratio: expand smaller dimension, never clip
  if (cam.ratio && cam.ratio > 0) {
    const currentRatio = vw / vh;
    if (currentRatio < cam.ratio) {
      // Too narrow — expand width
      vw = vh * cam.ratio;
    } else if (currentRatio > cam.ratio) {
      // Too tall — expand height
      vh = vw / cam.ratio;
    }
  }

  return { x: cx, y: cy, w: vw, h: vh };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/v2/__tests__/animation/cameraExpansion.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/v2/animation/cameraExpansion.ts src/v2/__tests__/animation/cameraExpansion.test.ts
git commit -m "feat(camera): add resolveCameraView for computing view rect from camera settings"
```

---

## Chunk 2: Track Expansion + ViewBox

### Task 3: Camera track expansion in buildTimeline

**Files:**
- Modify: `src/v2/animation/timeline.ts:99-232` (buildTimeline)
- Test: `src/v2/__tests__/animation/camera-timeline.test.ts`

- [ ] **Step 1: Write tests for camera track expansion**

```typescript
import { describe, it, expect } from 'vitest';
import { buildTimeline } from '../../animation/timeline';
import { createNode } from '../../types/node';
import type { AnimConfig } from '../../types/animation';

describe('camera track expansion', () => {
  it('expands camera target into rect/transform tracks', () => {
    const cam = createNode({ id: 'cam', camera: { target: [200, 150], zoom: 1 } });
    const config: AnimConfig = {
      duration: 3,
      keyframes: [
        { time: 0, changes: { 'cam.camera.target': [200, 150] } },
        { time: 2, changes: { 'cam.camera.target': [400, 300] } },
      ],
    };
    const { tracks } = buildTimeline(config, [cam]);
    expect(tracks.has('cam.transform.x')).toBe(true);
    expect(tracks.has('cam.transform.y')).toBe(true);
    expect(tracks.has('cam.rect.w')).toBe(true);
    expect(tracks.has('cam.rect.h')).toBe(true);
  });

  it('expands camera fit into rect/transform tracks', () => {
    const a = createNode({ id: 'a', transform: { x: 0, y: 0 }, rect: { w: 50, h: 50 } });
    const b = createNode({ id: 'b', transform: { x: 200, y: 200 }, rect: { w: 50, h: 50 } });
    const cam = createNode({ id: 'cam', camera: { fit: ['a', 'b'] } });
    const config: AnimConfig = {
      duration: 3,
      keyframes: [
        { time: 0, changes: { 'cam.camera.fit': ['a'] } },
        { time: 2, changes: { 'cam.camera.fit': ['a', 'b'] } },
      ],
    };
    const { tracks } = buildTimeline(config, [a, b, cam]);
    // Should have rect tracks with different widths at t=0 vs t=2
    const wTrack = tracks.get('cam.rect.w')!;
    expect(wTrack.length).toBe(2);
    expect(wTrack[1].value).toBeGreaterThan(wTrack[0].value as number);
  });

  it('expands camera zoom into rect dimensions', () => {
    const cam = createNode({ id: 'cam', camera: { zoom: 1 } });
    const config: AnimConfig = {
      duration: 3,
      keyframes: [
        { time: 0, changes: { 'cam.camera.zoom': 1 } },
        { time: 2, changes: { 'cam.camera.zoom': 2 } },
      ],
    };
    const { tracks } = buildTimeline(config, [cam]);
    const wTrack = tracks.get('cam.rect.w')!;
    // At zoom 2, width should be half of zoom 1
    expect(wTrack[1].value).toBeCloseTo((wTrack[0].value as number) / 2, 1);
  });

  it('preserves existing non-camera tracks', () => {
    const box = createNode({ id: 'box', transform: { x: 0, y: 0 }, rect: { w: 50, h: 50 } });
    const cam = createNode({ id: 'cam', camera: { target: [100, 100] } });
    const config: AnimConfig = {
      duration: 3,
      keyframes: [
        { time: 0, changes: { 'box.transform.x': 0, 'cam.camera.target': [100, 100] } },
        { time: 2, changes: { 'box.transform.x': 200, 'cam.camera.target': [300, 100] } },
      ],
    };
    const { tracks } = buildTimeline(config, [box, cam]);
    expect(tracks.has('box.transform.x')).toBe(true);
    const boxTrack = tracks.get('box.transform.x')!;
    expect(boxTrack[0].value).toBe(0);
    expect(boxTrack[1].value).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/v2/__tests__/animation/camera-timeline.test.ts`
Expected: FAIL — camera tracks not expanded (no rect/transform tracks for cam)

- [ ] **Step 3: Implement camera expansion in buildTimeline**

In `src/v2/animation/timeline.ts`, add the following after the slot expansion block (after line 229, before the `return` statement):

1. Import at the top of the file:
```typescript
import { evaluateAllTracks } from './evaluator';
import { applyTrackValues } from './applyTracks';
import { resolveCameraView } from './cameraExpansion';
```

2. Add camera expansion pass before the `return` statement:
```typescript
  // ── Camera track expansion (second pass) ──────────────────────────
  // Camera settings resolve into rect + transform tracks. This runs after
  // all other tracks are built so we can evaluate node positions at each
  // keyframe time.
  if (nodes) {
    const cameraNodes = nodes.filter(n => n.camera);
    if (cameraNodes.length > 0) {
      const defaultVB = { x: 0, y: 0, w: 800, h: 600 };

      for (const camNode of cameraNodes) {
        // Check if any camera property is animated
        const camPrefix = `${camNode.id}.camera.`;
        const hasCamTracks = [...tracks.keys()].some(k => k.startsWith(camPrefix));
        if (!hasCamTracks && !camNode.camera) continue;

        // Collect keyframe times only from this camera's own tracks
        // (not all tracks — using all tracks would insert spurious keyframes
        // that fragment smooth camera transitions and distort easing curves)
        const camTrackEntries = [...tracks.entries()].filter(([k]) => k.startsWith(camPrefix));
        const allTimes = new Set<number>();
        for (const [, kfs] of camTrackEntries) {
          for (const kf of kfs) allTimes.add(kf.time);
        }
        const sortedTimes = [...allTimes].sort((a, b) => a - b);

        const xPath = `${camNode.id}.transform.x`;
        const yPath = `${camNode.id}.transform.y`;
        const wPath = `${camNode.id}.rect.w`;
        const hPath = `${camNode.id}.rect.h`;

        const xKfs: TrackKeyframe[] = [];
        const yKfs: TrackKeyframe[] = [];
        const wKfs: TrackKeyframe[] = [];
        const hKfs: TrackKeyframe[] = [];

        for (const time of sortedTimes) {
          // Evaluate all tracks at this time to get animated node positions
          const values = evaluateAllTracks(tracks, time);
          const animated = applyTrackValues(nodes, values);

          // Find the camera node in the animated tree and resolve its view
          const animatedCam = animated.find(n => n.id === camNode.id);
          if (!animatedCam) continue;

          const view = resolveCameraView(animatedCam, animated, defaultVB);

          // Find the easing at this time from camera tracks
          let easing: EasingName = globalEasing;
          for (const [, kfs] of camTrackEntries) {
            const kf = kfs.find(k => Math.abs(k.time - time) < 0.001);
            if (kf) { easing = kf.easing; break; }
          }

          xKfs.push({ time, value: view.x, easing });
          yKfs.push({ time, value: view.y, easing });
          wKfs.push({ time, value: view.w, easing });
          hKfs.push({ time, value: view.h, easing });
        }

        // Write camera-derived tracks. These overwrite any manually authored
        // cam.transform.x/y or cam.rect.w/h tracks — camera nodes' rect and
        // position are fully managed by the camera system.
        if (xKfs.length > 0 && (hasCamTracks || camNode.camera)) {
          tracks.set(xPath, xKfs);
          tracks.set(yPath, yKfs);
          tracks.set(wPath, wKfs);
          tracks.set(hPath, hKfs);
        }
      }
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/v2/__tests__/animation/camera-timeline.test.ts`
Expected: All PASS

- [ ] **Step 5: Run full test suite for regressions**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/v2/animation/timeline.ts src/v2/__tests__/animation/camera-timeline.test.ts
git commit -m "feat(camera): add camera track expansion as second pass in buildTimeline"
```

---

### Task 4: Simplified computeViewBox + findActiveCamera

**Files:**
- Modify: `src/v2/renderer/camera.ts`
- Modify: `src/v2/__tests__/renderer/camera.test.ts`

- [ ] **Step 1: Write new camera.ts tests**

Replace the entire test file `src/v2/__tests__/renderer/camera.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeViewBox, findActiveCamera, type ViewBox } from '../../renderer/camera';
import { createNode } from '../../types/node';

const defaultVB: ViewBox = { x: 0, y: 0, w: 800, h: 600 };

describe('findActiveCamera', () => {
  it('returns undefined when no camera nodes', () => {
    const box = createNode({ id: 'box', rect: { w: 50, h: 50 } });
    expect(findActiveCamera([box])).toBeUndefined();
  });

  it('finds a camera node', () => {
    const cam = createNode({ id: 'cam', camera: { zoom: 1 } });
    const box = createNode({ id: 'box', rect: { w: 50, h: 50 } });
    expect(findActiveCamera([box, cam])?.id).toBe('cam');
  });

  it('returns first active camera when multiple exist', () => {
    const cam1 = createNode({ id: 'cam1', camera: { zoom: 1, active: true } });
    const cam2 = createNode({ id: 'cam2', camera: { zoom: 2, active: true } });
    expect(findActiveCamera([cam1, cam2])?.id).toBe('cam1');
  });

  it('skips inactive cameras', () => {
    const cam1 = createNode({ id: 'cam1', camera: { zoom: 1, active: false } });
    const cam2 = createNode({ id: 'cam2', camera: { zoom: 2 } });
    expect(findActiveCamera([cam1, cam2])?.id).toBe('cam2');
  });
});

describe('computeViewBox', () => {
  it('returns default when no camera', () => {
    expect(computeViewBox(undefined, defaultVB)).toEqual(defaultVB);
  });

  it('reads rect and transform from camera node', () => {
    const cam = createNode({
      id: 'cam',
      camera: { zoom: 1 },
      rect: { w: 400, h: 300 },
      transform: { x: 200, y: 150 },
    });
    const vb = computeViewBox(cam, defaultVB);
    expect(vb.x).toBe(0);    // 200 - 400/2
    expect(vb.y).toBe(0);    // 150 - 300/2
    expect(vb.w).toBe(400);
    expect(vb.h).toBe(300);
  });

  it('returns default when camera has no rect', () => {
    const cam = createNode({ id: 'cam', camera: { zoom: 1 } });
    expect(computeViewBox(cam, defaultVB)).toEqual(defaultVB);
  });

  it('includes rotation from transform', () => {
    const cam = createNode({
      id: 'cam',
      camera: { zoom: 1 },
      rect: { w: 800, h: 600 },
      transform: { x: 400, y: 300, rotation: 45 },
    });
    const vb = computeViewBox(cam, defaultVB);
    expect(vb.rotation).toBe(45);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/v2/__tests__/renderer/camera.test.ts`
Expected: FAIL — `findActiveCamera` not exported, `computeViewBox` signature mismatch

- [ ] **Step 3: Rewrite camera.ts**

Replace `src/v2/renderer/camera.ts`:

```typescript
import type { Node } from '../types/node';

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
}

/**
 * Find the first active camera node in the root-level node list.
 * Camera nodes must be at root level (not nested).
 * A camera is active if `camera.active` is not explicitly `false`.
 */
export function findActiveCamera(roots: Node[]): Node | undefined {
  return roots.find(n => n.camera && n.camera.active !== false);
}

/**
 * Read the active camera's rect + transform as the viewbox.
 * After track expansion, camera settings have been resolved into
 * concrete rect (w, h) and transform (x, y, rotation) values.
 */
export function computeViewBox(
  cameraNode: Node | undefined,
  defaultViewBox: ViewBox,
): ViewBox {
  if (!cameraNode?.camera) return defaultViewBox;
  if (!cameraNode.rect || cameraNode.rect.w === 0 || cameraNode.rect.h === 0) return defaultViewBox;

  const tx = cameraNode.transform?.x ?? 0;
  const ty = cameraNode.transform?.y ?? 0;
  const w = cameraNode.rect.w;
  const h = cameraNode.rect.h;
  const rotation = cameraNode.transform?.rotation ?? 0;

  return {
    x: tx - w / 2,
    y: ty - h / 2,
    w,
    h,
    rotation: rotation !== 0 ? rotation : undefined,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/v2/__tests__/renderer/camera.test.ts`
Expected: All PASS

- [ ] **Step 5: Run full test suite for regressions**

Run: `npx vitest run`
Expected: All tests pass (check for any import breakages from the signature change)

- [ ] **Step 6: Commit**

```bash
git add src/v2/renderer/camera.ts src/v2/__tests__/renderer/camera.test.ts
git commit -m "feat(camera): simplify computeViewBox to read rect/transform, add findActiveCamera"
```

---

## Chunk 3: Renderer Rotation + Render Loop

### Task 5: Renderer rotation support

**Files:**
- Modify: `src/v2/renderer/backend.ts:43` (setViewBox signature)
- Modify: `src/v2/renderer/svgBackend.ts:120-128` (setViewBox implementation)
- Modify: `src/v2/renderer/emitter.ts:207-230` (emitFrame)

- [ ] **Step 1: Update RenderBackend interface**

In `src/v2/renderer/backend.ts`, change line 43:

```typescript
  setViewBox(x: number, y: number, w: number, h: number, rotation?: number): void;
```

- [ ] **Step 2: Update SvgRenderBackend.setViewBox**

In `src/v2/renderer/svgBackend.ts`, replace lines 120-128:

```typescript
  setViewBox(x: number, y: number, w: number, h: number, rotation?: number): void {
    if (!this._svg || !this._bg || !this._content) return;
    this._svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
    this._svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this._bg.setAttribute('x', String(x));
    this._bg.setAttribute('y', String(y));
    this._bg.setAttribute('width', String(w));
    this._bg.setAttribute('height', String(h));
    if (rotation) {
      const cx = x + w / 2;
      const cy = y + h / 2;
      this._content.setAttribute('transform', `rotate(${-rotation}, ${cx}, ${cy})`);
    } else {
      this._content.removeAttribute('transform');
    }
  }
```

Also update `clearViewBox` to remove any stale rotation transform from `_content`:

```typescript
  clearViewBox(): void {
    if (!this._svg || !this._bg) return;
    this._svg.removeAttribute('viewBox');
    this._svg.removeAttribute('preserveAspectRatio');
    this._bg.setAttribute('x', '0');
    this._bg.setAttribute('y', '0');
    this._bg.setAttribute('width', '100%');
    this._bg.setAttribute('height', '100%');
    this._content?.removeAttribute('transform');
  }
```

- [ ] **Step 3: Update emitFrame to pass rotation**

In `src/v2/renderer/emitter.ts`, replace the viewBox handling in `emitFrame` (lines 215-219):

```typescript
  if (viewBox) {
    backend.setViewBox(viewBox.x, viewBox.y, viewBox.w, viewBox.h, viewBox.rotation);
  } else {
    backend.clearViewBox();
  }
```

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/v2/renderer/backend.ts src/v2/renderer/svgBackend.ts src/v2/renderer/emitter.ts
git commit -m "feat(camera): add rotation support to RenderBackend and SVG implementation"
```

---

### Task 6: Wire up V2Diagram render loop

**Files:**
- Modify: `src/v2/app/components/V2Diagram.tsx:88-102`

- [ ] **Step 1: Update the render function**

In `src/v2/app/components/V2Diagram.tsx`, replace lines 92-100 in the `render` callback:

```typescript
    let viewBox: ViewBox | undefined;
    if (viewportOverrideRef.current) {
      viewBox = viewportOverrideRef.current;
    } else {
      const cameraNode = findActiveCamera(animated);
      if (cameraNode) {
        viewBox = computeViewBox(cameraNode, { x: 0, y: 0, w, h });
      }
    }
```

- [ ] **Step 2: Update imports**

In `src/v2/app/components/V2Diagram.tsx`, update line 11:

```typescript
import { computeViewBox, findActiveCamera, type ViewBox } from '../../renderer/camera';
```

- [ ] **Step 3: Run full test suite + manual verification**

Run: `npx vitest run`
Expected: All tests pass

Verify manually: `npm run dev:v2` — existing samples still render correctly, camera samples (once added) work.

- [ ] **Step 4: Commit**

```bash
git add src/v2/app/components/V2Diagram.tsx
git commit -m "feat(camera): wire findActiveCamera into V2Diagram render loop"
```

---

## Chunk 4: Samples + Editor

### Task 7: Camera samples

**Files:**
- Modify: `src/v2/samples/index.ts`

- [ ] **Step 1: Add camera samples**

Add the following samples to the `v2Samples` array in `src/v2/samples/index.ts`, before the closing `];`. Each sample uses the `'Camera'` category.

**Sample 1: Camera Target**
```typescript
{
  name: 'camera-target',
  category: 'Camera',
  description: 'Camera targeting coordinates, node IDs, and node+offset',
  dsl: `{
  objects: [
    { id: "cam", camera: { target: [300, 200], zoom: 1.5 } },
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
      { time: 0, changes: { "cam.camera.target": [300, 200] } },
      { time: 1.5, changes: { "cam.camera.target": "a" } },
      { time: 3, changes: { "cam.camera.target": "b" } },
      { time: 4.5, changes: { "cam.camera.target": ["b", 0, -100] } },
      { time: 6, changes: { "cam.camera.target": [300, 200] } }
    ]
  }
}`,
},
```

**Sample 2: Camera Zoom**
```typescript
{
  name: 'camera-zoom',
  category: 'Camera',
  description: 'Zoom in and out with easing',
  dsl: `{
  objects: [
    { id: "cam", camera: { target: [300, 200], zoom: 1 } },
    { id: "outer", rect: { w: 400, h: 300, radius: 12 }, stroke: { h: 210, s: 50, l: 40, width: 2 }, transform: { x: 300, y: 200 } },
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
```

**Sample 3: Camera Fit**
```typescript
{
  name: 'camera-fit',
  category: 'Camera',
  description: 'Fit specific nodes or all nodes in view',
  dsl: `{
  objects: [
    { id: "cam", camera: { fit: "all" } },
    { id: "a", rect: { w: 60, h: 60, radius: 6 }, fill: { h: 0, s: 65, l: 50 }, transform: { x: 50, y: 100 } },
    { id: "b", rect: { w: 60, h: 60, radius: 6 }, fill: { h: 120, s: 65, l: 45 }, transform: { x: 300, y: 50 } },
    { id: "c", rect: { w: 60, h: 60, radius: 6 }, fill: { h: 240, s: 65, l: 50 }, transform: { x: 550, y: 300 } }
  ],
  animate: {
    duration: 8,
    loop: true,
    easing: "easeInOut",
    keyframes: [
      { time: 0, changes: { "cam.camera.fit": "all" } },
      { time: 2, changes: { "cam.camera.fit": ["a"] } },
      { time: 4, changes: { "cam.camera.fit": ["a", "b"] } },
      { time: 6, changes: { "cam.camera.fit": ["c"] } },
      { time: 8, changes: { "cam.camera.fit": "all" } }
    ]
  }
}`,
},
```

**Sample 4: Camera Follow**
```typescript
{
  name: 'camera-follow',
  category: 'Camera',
  description: 'Camera tracks a moving object',
  dsl: `{
  objects: [
    { id: "cam", camera: { target: "mover", zoom: 2 } },
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
```

**Sample 5: Camera Ratio**
```typescript
{
  name: 'camera-ratio',
  category: 'Camera',
  description: 'Animated aspect ratio — letterbox transition',
  dsl: `{
  objects: [
    { id: "cam", camera: { target: [300, 200], zoom: 1.2, ratio: 1.78 } },
    { id: "scene", rect: { w: 500, h: 350, radius: 10 }, stroke: { h: 270, s: 40, l: 35, width: 1 }, transform: { x: 300, y: 200 } },
    { id: "actor", rect: { w: 40, h: 60, radius: 4 }, fill: { h: 30, s: 70, l: 50 }, transform: { x: 300, y: 220 } }
  ],
  animate: {
    duration: 6,
    loop: true,
    easing: "easeInOutCubic",
    keyframes: [
      { time: 0, changes: { "cam.camera.ratio": 1.78 } },
      { time: 3, changes: { "cam.camera.ratio": 2.35 } },
      { time: 6, changes: { "cam.camera.ratio": 1.78 } }
    ]
  }
}`,
},
```

**Sample 6: Camera Rotation**
```typescript
{
  name: 'camera-rotation',
  category: 'Camera',
  description: 'Rotating camera view with easing',
  dsl: `{
  objects: [
    { id: "cam", camera: { target: [300, 200], zoom: 1.5 }, transform: { rotation: 0 } },
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
```

**Sample 7: Camera Switch**
```typescript
{
  name: 'camera-switch',
  category: 'Camera',
  description: 'Switching between multiple cameras (cut transitions)',
  dsl: `{
  objects: [
    { id: "cam1", camera: { target: "a", zoom: 2, active: true } },
    { id: "cam2", camera: { target: "b", zoom: 2, active: false } },
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
```

**Sample 8: Camera Combined**
```typescript
{
  name: 'camera-combined',
  category: 'Camera',
  description: 'Cinematic sequence — target, zoom, fit, ratio, and rotation combined',
  dsl: `{
  objects: [
    { id: "cam", camera: { fit: "all", zoom: 1, ratio: 1.78 }, transform: { rotation: 0 } },
    { id: "hero", rect: { w: 60, h: 60, radius: 30 }, fill: { h: 40, s: 80, l: 55 }, transform: { x: 100, y: 200 } },
    { id: "villain", rect: { w: 60, h: 60, radius: 8 }, fill: { h: 0, s: 80, l: 40 }, transform: { x: 500, y: 200 } },
    { id: "stage", rect: { w: 600, h: 300, radius: 12 }, stroke: { h: 0, s: 0, l: 20, width: 1 }, transform: { x: 300, y: 200 } }
  ],
  animate: {
    duration: 12,
    loop: true,
    easing: "easeInOutCubic",
    keyframes: [
      { time: 0, changes: { "cam.camera.fit": "all", "cam.camera.ratio": 1.78 } },
      { time: 2, changes: { "cam.camera.fit": ["hero"], "cam.camera.zoom": 2 } },
      { time: 4, changes: { "cam.camera.target": "villain", "cam.camera.zoom": 2.5 } },
      { time: 5, changes: { "cam.transform.rotation": 5 } },
      { time: 6, changes: { "cam.transform.rotation": -5 } },
      { time: 7, changes: { "cam.transform.rotation": 0, "cam.camera.ratio": 2.35 } },
      { time: 9, changes: { "cam.camera.fit": "all", "cam.camera.zoom": 1, "cam.camera.ratio": 1.78 } },
      { time: 12, changes: { "cam.camera.fit": "all" } }
    ]
  }
}`,
},
```

- [ ] **Step 2: Run the dev server and verify samples appear**

Run: `npm run dev:v2`
Expected: "Camera" category appears in sample browser with all 8 samples. Each sample should render and animate correctly.

- [ ] **Step 3: Commit**

```bash
git add src/v2/samples/index.ts
git commit -m "feat(camera): add 8 camera samples demonstrating all features"
```

---

### Task 8: Editor ratio preview toggle

**Files:**
- Modify: `src/v2/app/App.tsx`

Note: The `previewRatio` state already exists in App.tsx (line 55). It just needs to be wired up to show the CSS overlay.

- [ ] **Step 1: Add ratio preview button to toolbar**

In `src/v2/app/App.tsx`, add a "Ratio" button to the toolbar button array (after the "Lock View" button, around line 311):

```typescript
{ label: 'Ratio', active: previewRatio, onClick: () => setPreviewRatio(!previewRatio) },
```

- [ ] **Step 2: Add letterbox/pillarbox CSS overlay**

In `src/v2/app/App.tsx`, add a ratio overlay inside the `canvasContent` div (after the `diagram.containerRef` div, around line 199). The overlay reads the camera's ratio from the diagram and renders bars:

```typescript
{previewRatio && (
  (() => {
    // Compute letterbox/pillarbox bars based on camera ratio vs container
    const containerRatio = 16 / 9; // approximate preview area ratio
    // For now, show a subtle border indicating ratio mode is active
    return (
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        border: '2px solid rgba(167, 139, 250, 0.4)',
        boxShadow: 'inset 0 0 20px rgba(167, 139, 250, 0.1)',
      }} />
    );
  })()
)}
```

This is a minimal first implementation — the overlay indicates ratio preview mode is active. Full dynamic letterbox bars (reading the camera's actual animated ratio) would require piping the current viewbox ratio out of the render loop, which can be enhanced in a follow-up.

- [ ] **Step 3: Run dev server and verify**

Run: `npm run dev:v2`
Expected: "Ratio" button appears in toolbar. Clicking it toggles the overlay on the preview.

- [ ] **Step 4: Commit**

```bash
git add src/v2/app/App.tsx
git commit -m "feat(camera): add ratio preview toggle to editor toolbar"
```

---

## Summary

| Task | Description | Files | Depends on |
|------|-------------|-------|------------|
| 1 | Extend CameraSchema | node.ts | — |
| 2 | Camera resolution utility | cameraExpansion.ts | Task 1 |
| 3 | Camera track expansion | timeline.ts | Task 2 |
| 4 | Simplified computeViewBox | camera.ts | Task 1 |
| 5 | Renderer rotation | backend.ts, svgBackend.ts, emitter.ts | Task 4 |
| 6 | V2Diagram render loop | V2Diagram.tsx | Tasks 4, 5 |
| 7 | Camera samples | samples/index.ts | Tasks 1-6 |
| 8 | Editor ratio preview | App.tsx | — |

Tasks 1-6 are sequential. Task 8 is independent and can be done in parallel with any other task.
