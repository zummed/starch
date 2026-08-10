# Layout System Design

## Status

Draft — discussion document.

## Overview

This document describes a redesigned layout system for Starch. The core idea:
**layout strategies are constraint generators, and a single constraint solver
is the positioning engine.** Users never write raw constraints — each strategy
(flex, grid, circular, dag, etc.) exposes its own DSL and translates it into
constraints internally. The solver runs at timeline-build time, not per frame.

## Goals

1. Support multiple layout strategies: flex, grid, circular, dag, tree, and
   future additions.
2. Each strategy has its own validated schema — no shared bag of unrelated
   properties.
3. Preserve animatable slot membership (`layout.slot`) across all strategies.
4. Allow objects to animate smoothly between containers using different
   strategies (flex to grid, grid to dag, etc.).
5. Enable cross-container spatial relationships (alignment, relative
   positioning) without special-casing.
6. Solve positions at timeline-build time; playback is pure interpolation.

---

## Architecture

```
 DSL text
   │
   ▼
 Parser ──► Node tree with layout properties
   │
   ▼
 Strategy layer
   Each layout container's strategy reads its config and children,
   generates constraints:
   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
   │   flex    │  │   grid   │  │ circular │  │   dag    │  ...
   └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘
        │             │             │             │
        ▼             ▼             ▼             ▼
   Constraint set (equalities + inequalities)
   ┌──────────────────────────────────────────────────────┐
   │              Constraint solver (Cassowary)           │
   └──────────────────────┬───────────────────────────────┘
                          │
                          ▼
                   ChildPlacement[]
                   (same interface as today)
                          │
                          ▼
                   Animation tracks / render
```

### Solver runs at build time

**Implemented.** The solver does not run per animation frame — `buildTimeline`
(`src/animation/timeline.ts`) solves layout once, up front, and every
downstream frame is pure interpolation:

1. `buildTimeline` deep-clones the input tree into `baseNodes`, text-measures
   it, and runs the static layout solve (`computeLayoutPlacements` +
   `applyLayoutPlacements`) once. The input tree itself is never mutated —
   the parser/editor tree (round-trip emitters read it) keeps only authored
   values, and `TimelineResult.baseNodes` carries the solved copy.
2. Layout track expansion (below) runs a full whole-scene solve at every
   time a layout-relevant track changes, on top of `baseNodes`, and bakes
   the results into dense system-owned x/y/resize/container-size tracks.
   Camera expansion (`camera.look` → rect/transform tracks) also evaluates
   against `baseNodes`, so a camera following a layout-positioned node sees
   its actual solved position.
3. `StarchDiagram._render` and `useV2Diagram`'s render path are now
   `applyTrackValues(baseNodes, values)` → (re-measure animated text) →
   emit. No `runLayout` call anywhere in the render path — it stays
   exported as public API and as the one-shot function the build-time solve
   itself calls.

This means solver performance is not on the critical path: it runs once per
layout-relevant keyframe at build time, not every frame during playback.

**Honest limitation:** reflow driven by a geometry track (a resizing flex
child, say) is sampled at each keyframe time and interpolated between them,
same as slot movement always was. This is exact under linear easing, since
solved positions are affine in child sizes — a genuinely correct
interpolation, not an approximation. Under a non-linear easing curve applied
to the *driving* geometry track, the reflowed sibling's motion is only
approximated by the emitted keyframes' own easing, because the solve is
sampled at keyframe times, not evaluated continuously.

### Camera

`camera.look` resolves against `baseNodes` (the solved tree), and does so in
**world space**: `getWorldPosition`, `computeSceneWorldBounds`, and
`computeSubtreeWorldBounds` (`src/renderer/geometry.ts`) accumulate ancestor
transforms and recurse into descendants, so targeting or fitting a nested
node accounts for its parents' positions and its own children's geometry —
not just its local transform and own rect. The same helpers back
`StarchDiagram`'s auto-fit viewbox.

A camera with its own authored tracks samples at the union of its own
keyframe times and every other track's keyframe times whenever its look
targets node ids (rather than plain coordinates) — otherwise it would only
re-evaluate at its own keyframe times and drift off a target that moves at
other times (e.g. dense slot-expansion tracks). Samples inserted this way
have no authored easing to look up, so they interpolate linearly; a followed
camera is piecewise-linear between global keyframe times, not the camera's
own easing curve.

### Constraint solver

**Cassowary** (linear arithmetic constraints with priorities).

Handles:
- Equalities: `A.right = B.left + gap`
- Inequalities: `A.bottom + sep <= B.top`
- Priorities: required > strong > weak (for preferences vs hard rules)

Does not handle:
- Non-linear (trig, curves) — strategies pre-compute these and inject as
  equalities
- Disjunctive (OR) — strategies resolve discrete choices before generating
  constraints

Each node exposes solver variables:
- `left`, `right`, `top`, `bottom`, `centerX`, `centerY`, `width`, `height`
- Derived: `right = left + width`, `centerX = left + width / 2`, etc.

The solver output maps back to `ChildPlacement` via:
```
placement.x = solved(centerX)
placement.y = solved(centerY)
placement.w = solved(width)   // if resized
placement.h = solved(height)  // if resized
```

#### Current implementation status

The engine in `src/layout/solver.ts` today solves **linear equality systems
only** (Gaussian elimination with partial pivoting), and reports diagnostics —
`{ status: 'solved' | 'conflict', freeVariables, conflicts }` — for
over-determined (conflicting) and under-determined systems. A variable left
free by the system keeps its pre-solve value; that value is its suggested
value, the same role a Cassowary optional constraint would play.

Inequalities and strength priorities (`strong`/`weak`) described above were
removed: the prior implementation of both was unsound (oscillation on
feasible anchored chains, priority inversion, required equalities silently
overwritten by later phases) and no strategy emitted them. They will come
back with the first real consumer that needs relative/anchored positioning
(e.g. `dag`), most likely as a proper Cassowary or simplex implementation
rather than the ad hoc iterative pass this replaced.

---

## Schema Design

### Principle: separate container config from child hints

`LayoutSchema` used to mix container-level properties (`type`, `direction`,
`gap`, `justify`) with child-level hints (`grow`, `order`, `alignSelf`,
`slot`) in one hand-authored flat object. That worked for flex-only but
breaks down with multiple strategies that have incompatible properties —
nothing stopped `radius` from being authored on a flex container, or
`gridCol` from being authored under a circular one, and neither would do
anything.

**Split:**
- **Container properties** live on `layout` and are strategy-specific.
- **Child hints** are strategy-specific kwargs on the child's `layout` line.
- **`slot` and `skip`** are universal — valid regardless of strategy.
- **Misapplied properties warn** instead of silently doing nothing.

### Implemented structure

Each strategy gets a `{ container, childHints }` pair of Zod object schemas
(`src/types/properties.ts`), collected in one record:

```ts
export const LAYOUT_STRATEGY_SCHEMAS = {
  flex:     { container: FlexContainerSchema,     childHints: FlexChildHintsSchema },
  absolute: { container: AbsoluteContainerSchema, childHints: AbsoluteChildHintsSchema },
  grid:     { container: GridContainerSchema,     childHints: GridChildHintsSchema },
  circular: { container: CircularContainerSchema, childHints: CircularChildHintsSchema },
} as const;
```

This record is the one definition everything else derives from:
- `LAYOUT_STRATEGY_NAMES` is `Object.keys(LAYOUT_STRATEGY_SCHEMAS)` — the
  `type` enum, `layout/index.ts`'s strategy registration, and completions
  all derive from it rather than a separately hand-maintained list.
- `LayoutUniversalSchema` (`slot`, `skip`) applies regardless of strategy.
- `LayoutSchema` — the schema actually wrapped in `dsl(...)` and used to
  parse/store a node's `layout` bag — is built by merging `type` +
  `LayoutUniversalSchema`'s shape + every strategy's container and
  childHints shapes. Fields shared by more than one strategy with identical
  semantics (`gap`, `padding`, `align`, `alignSelf`) are defined once as a
  const and referenced by every schema that uses them; a merge helper walks
  all the shapes at module load and throws if two of them define the same
  key with *different* schema objects, so an accidental collision fails
  fast instead of silently shadowing. `LayoutSchema` stays a flat optional
  object (not a discriminated union) — any node can carry any strategy's
  properties at the type level; validation (below) is what makes
  misapplication visible.
- Per-strategy resolvers (`resolveFlexContainer`, `resolveGridContainer`,
  `resolveCircularContainer`, also in `properties.ts`) turn an optional
  `Layout` into a fully-defaulted container config in one call, so each
  strategy (`src/layout/flex.ts`, `src/layout/strategies/{grid,circular}.ts`)
  reads its container properties once instead of scattering `layout.x ??
  fallback` throughout the constraint-generation code. Defaults are the
  single source of truth for what an unauthored property resolves to.
- `validateLayoutUsage` (`src/layout/validate.ts`) walks the parsed tree and
  warns on every authored `layout.*` key that has no effect: a key is
  allowed if it's universal, a container key of the node's own
  `layout.type`, a child hint of the node's structural parent's strategy,
  or — when the node authors `layout.slot` — a child hint of the slot
  target container's strategy. Allowed-key sets are derived from
  `LAYOUT_STRATEGY_SCHEMAS` shapes, not hand lists. `parseScene` runs it
  over the final node tree and returns the warnings on `ParsedScene.warnings`,
  surfaced the same way as timeline warnings (`console.warn`).

### Container schemas by strategy

#### Flex

```
layout flex column gap=8 padding=10 justify=center align=stretch
```

| Property  | Type                                            | Default  |
|-----------|-------------------------------------------------|----------|
| direction | `row` \| `column`                               | `column` |
| gap       | number                                          | 0        |
| padding   | number                                          | 0        |
| justify   | `start` \| `center` \| `end` \| `spaceBetween` \| `spaceAround` | `start` |
| align     | `start` \| `center` \| `end` \| `stretch`       | `start`  |

Child hints: `grow`, `order`, `alignSelf` (plus universal `slot`, `skip`).

Constraint generation (row example):
```
child[0].left = container.left + padding
child[i].left = child[i-1].right + gap        (for i > 0)
child[i].centerY = container.centerY           (align=center)
child[i].width >= intrinsicWidth               (weak)
child[i].width = intrinsicWidth + growShare     (if grow > 0)
```

#### Grid

```
layout grid columns=3 rows=2 gap=8 padding=10 align=start
```

| Property | Type            | Default |
|----------|-----------------|---------|
| columns  | number          | 1       |
| rows     | number \| auto  | auto    |
| gap      | number          | 0       |
| colGap   | number          | gap     |
| rowGap   | number          | gap     |
| padding  | number          | 0       |
| align    | `start` \| `center` \| `end` \| `stretch` | `stretch` |

Child hints: `gridCol`, `gridRow`, `colSpan`, `rowSpan`, `alignSelf` (plus
universal `slot`, `skip`).

Auto-placement: children fill cells left-to-right, top-to-bottom unless
explicitly placed with `gridCol`/`gridRow`.

Constraint generation:
```
// Column boundaries
col[0].left = container.left + padding
col[i].left = col[i-1].right + colGap

// Row boundaries
row[0].top = container.top + padding
row[j].top = row[j-1].bottom + rowGap

// Cell placement
child.left = col[c].left
child.right = col[c + colSpan - 1].right
child.top = row[r].top
child.bottom = row[r + rowSpan - 1].bottom

// Uniform column widths (strong, not required — allows flex)
col[i].width = col[0].width                    (strong)
```

#### Circular

```
layout circular radius=120 startAngle=0 sweep=360
```

| Property   | Type   | Default |
|------------|--------|---------|
| radius     | number | 100     |
| startAngle | number | 0       |
| sweep      | number | 360     |

Child hints: `order` (ring position, same sort as flex; plus universal
`slot`/`skip`).

The strategy pre-computes angular positions using trigonometry, then injects
as equalities:
```
divisor = (sweep == 360) ? n : (n - 1)
angle[i] = startAngle + (sweep / divisor) * i
child[i].centerX = container.centerX + radius * cos(angle[i])
child[i].centerY = container.centerY + radius * sin(angle[i])
```
Full circles divide by `n` (the seam at `startAngle == startAngle+360` would
otherwise double up a child); partial sweeps divide by `n-1` so the arc is
endpoint-inclusive — the last child lands exactly on `startAngle+sweep`.

#### Absolute

An explicit no-op strategy: empty container schema, empty child-hints
schema. A node with `layout absolute` opts out of layout flow without
implying any positioning behavior.

#### DAG (directed acyclic graph) — future work, not yet implemented

```
layout dag direction=TB rankSep=60 nodeSep=30
```

| Property  | Type                        | Default |
|-----------|-----------------------------|---------|
| direction | `TB` \| `BT` \| `LR` \| `RL` | `TB`    |
| rankSep   | number                      | 60      |
| nodeSep   | number                      | 30      |

Child hints: `slot`

This strategy does more pre-processing than the others:

1. **Build graph** from connection paths (arrows/lines between children).
2. **Rank assignment** — topological layering (longest path or similar).
3. **Crossing minimisation** — reorder nodes within ranks to reduce edge
   crossings (barycentric heuristic or median).
4. **Generate constraints:**

```
// Rank spacing (TB example)
rank[j].top = rank[j-1].bottom + rankSep

// Within-rank ordering
node[i].left + nodeSep <= node[i+1].left       (inequality)

// Nodes belong to their rank
node.top = rank[r].top
node.bottom = rank[r].bottom                   (uniform rank height, strong)
```

The combinatorial decisions (steps 1-3) happen in the strategy. The solver
handles the spatial arithmetic (step 4).

#### Tree — future work, not yet implemented

```
layout tree direction=TB levelSep=50 siblingSep=20
```

| Property   | Type                        | Default |
|------------|-----------------------------|---------|
| direction  | `TB` \| `BT` \| `LR` \| `RL` | `TB`    |
| levelSep   | number                      | 50      |
| siblingSep | number                      | 20      |

Child hints: `slot`

Uses Reingold-Tilford or similar for initial x-offsets, then expresses the
result as constraints. Simpler than DAG — no crossing minimisation needed
since tree structure dictates ordering.

---

## Slot Animation

### Current mechanism

`slot` lets a node participate in a container's layout without being a direct
child. Animating `mover.layout.slot` from `"left"` to `"right"` triggers:

1. Clone tree with `slot=left`, run layout, get position → keyframe at t=0
2. Clone tree with `slot=right`, run layout, get position → keyframe at t=2
3. Interpolate transform.x/y between those positions during playback

### With the constraint solver

The mechanism is identical, but now "run layout" means "generate constraints
for the target container's strategy + solve." The solver doesn't care which
strategy generated the constraints.

**Cross-strategy slot animation works automatically:**
```
left: rect 200x200
  layout flex column gap=8

right: rect 200x200
  layout grid columns=2 gap=8

mover: rect 50x30
  layout slot=left

animate 4s
  2 mover.layout.slot: right
```

At t=0: flex generates constraints including mover, solver places it.
At t=2: grid generates constraints including mover, solver places it.
Animation interpolates between the two solved positions.

### Container auto-sizing

When a slot member moves out, the source container shrinks; when it arrives,
the target grows. The current system handles this by recording container
`rect.w`/`rect.h` from each solve pass and emitting size keyframes. This
continues to work unchanged — each solve pass auto-sizes containers as part
of constraint resolution.

### Beyond slot: any layout-relevant track

The same whole-scene-solve machinery (`expandLayoutTracks` in
`src/animation/timeline.ts`, formerly `expandSlotTracks`) now triggers on
more than `layout.slot`. A track is layout-relevant, and gets folded into
the whole-scene solve, when its target node participates in some
container's layout (the container itself, or one of its layout children —
not skip-excluded) and the track path is one of: `layout.slot`, any other
`layout.*` property, `rect.w`, `rect.h`, `ellipse.rx`, `ellipse.ry`, or
`text.content` — the geometry/content properties a layout solve reads as a
child's intrinsic size. `layout.slot` is the one exception to the
participation gate: it's how a free node joins a container's layout in the
first place, so requiring prior participation would make that join
unreachable.

This is what makes "animate a flex child's width" reflow its siblings, or
"animate a grid child's text content" resize its cell and push neighbors,
without the DSL author doing anything beyond authoring the track — the
system finds it's layout-relevant and bakes the reflow into dense keyframes
the same way slot movement always worked.

### Authored position tracks on a layout-positioned node

Layout owns the position of any node it actually places. Before build-time
solving, this was implicit — render-time layout ran every frame and simply
clobbered whatever an authored `transform.x`/`transform.y` track produced.
With layout out of the render path, `buildTimeline` makes the policy
explicit: after layout track expansion, any remaining authored track
targeting `transform.x` or `transform.y` on a node the base solve actually
placed (and that isn't already covered by a system-emitted layout track) is
dropped, with a warning — `Track "<path>" has no effect — "<id>" is
positioned by the "<type>" layout of "<container>"`. A node under `layout
absolute` is exempt, since that strategy deliberately places nothing.

---

## Cross-Container Relationships

With all layout containers feeding constraints into a shared solver, cross-
container relationships become natural:

### Relative positioning (post-layout)

A node outside any layout container can reference solved positions:
```
label: text "Note"
  below mainDiagram.nodeA gap=10
```

`below` expands to:
```
label.top = nodeA.bottom + 10
label.centerX = nodeA.centerX
```

These are just more constraints in the same solve pass. The dependency
ordering (solve nodeA's container first) is handled by the solver — it
resolves all constraints simultaneously.

### Alignment across containers

```
containerA: rect 300x200
  layout flex column
  headerA: rect 280x30

containerB: rect 300x200
  layout flex column
  headerB: rect 280x30

constraints
  headerB.top = headerA.top
```

If raw constraint syntax is desired for power users, it could be exposed. But
the more likely path is shorthand DSL:
```
headerB: rect 280x30
  alignY headerA
```

---

## Schema Implementation

### LayoutSchema becomes a discriminated union

```typescript
const FlexLayoutSchema = dsl(z.object({
  type: z.literal('flex'),
  direction: z.enum(['row', 'column']).default('column'),
  gap: z.number().min(0).default(0),
  padding: z.number().min(0).default(0),
  justify: z.enum(['start', 'center', 'end', 'spaceBetween', 'spaceAround']).default('start'),
  align: z.enum(['start', 'center', 'end', 'stretch']).default('start'),
  wrap: z.boolean().default(false),
}), { ... });

const GridLayoutSchema = dsl(z.object({
  type: z.literal('grid'),
  columns: z.number().int().min(1).default(1),
  rows: z.number().int().min(1).optional(),
  gap: z.number().min(0).default(0),
  colGap: z.number().min(0).optional(),
  rowGap: z.number().min(0).optional(),
  padding: z.number().min(0).default(0),
}), { ... });

const CircularLayoutSchema = dsl(z.object({
  type: z.literal('circular'),
  radius: z.number().min(0).default(100),
  startAngle: z.number().default(0),
  sweep: z.number().default(360),
}), { ... });

const DagLayoutSchema = dsl(z.object({
  type: z.literal('dag'),
  direction: z.enum(['TB', 'BT', 'LR', 'RL']).default('TB'),
  rankSep: z.number().min(0).default(60),
  nodeSep: z.number().min(0).default(30),
}), { ... });

const LayoutSchema = z.discriminatedUnion('type', [
  FlexLayoutSchema,
  GridLayoutSchema,
  CircularLayoutSchema,
  DagLayoutSchema,
]);
```

### Child hints remain on the child's layout line

```typescript
// Universal (all strategies)
slot: z.string().optional()

// Flex-specific
grow: z.number().min(0).optional()
order: z.number().optional()
alignSelf: z.enum(['start', 'center', 'end', 'stretch']).optional()

// Grid-specific
gridCol: z.number().int().min(1).optional()
gridRow: z.number().int().min(1).optional()
colSpan: z.number().int().min(1).optional()
rowSpan: z.number().int().min(1).optional()
```

Validation: the parser can check that a child's hints match the parent
container's strategy. `grow` on a child inside a grid container is a
warning/error.

---

## Strategy Interface

```typescript
interface Constraint {
  lhs: Expression;         // linear combination of variables
  op: '=' | '<=' | '>=';
  rhs: Expression;
  strength: 'required' | 'strong' | 'weak';
}

interface Variable {
  nodeId: string;
  prop: 'left' | 'right' | 'top' | 'bottom' | 'centerX' | 'centerY'
        | 'width' | 'height';
}

interface LayoutStrategy {
  /**
   * Generate constraints for this container and its children.
   * The solver resolves all constraints across all containers in one pass.
   */
  generateConstraints(
    container: Node,
    children: Node[],
  ): Constraint[];
}
```

The registry collects constraints from all containers, feeds them to the
solver, and maps the solution back to `ChildPlacement[]`. Individual
strategies never call the solver directly.

```typescript
function computeLayoutPlacements(roots: Node[]): ChildPlacement[] {
  const allConstraints: Constraint[] = [];

  // Walk tree, collect constraints from each layout container
  walkContainers(roots, (container, children) => {
    const strategy = getStrategy(container.layout.type);
    allConstraints.push(...strategy.generateConstraints(container, children));
  });

  // Solve all constraints in one pass
  const solution = solver.solve(allConstraints);

  // Map solution back to placements
  return mapSolutionToPlacements(solution);
}
```

---

## DSL Examples

### Flex (unchanged from current)

```
objects
  panel: rect 400x300
    layout flex column gap=10 padding=15
    header: rect 370x40 fill steelblue
    body: rect 370x0 fill slategray
      layout grow=2
    footer: rect 370x30 fill steelblue
```

### Grid

```
objects
  dashboard: rect 600x400
    layout grid columns=3 gap=10 padding=15
    metric1: rect 0x80 fill steelblue
    metric2: rect 0x80 fill coral
    metric3: rect 0x80 fill seagreen
    chart: rect 0x200 fill slategray
      layout gridCol=1 colSpan=2
    sidebar: rect 0x200 fill dimgray
      layout gridCol=3
```

### Circular

```
objects
  ring: ellipse 150x150
    layout circular radius=120
    node1: rect 60x30 fill steelblue
    node2: rect 60x30 fill coral
    node3: rect 60x30 fill seagreen
    node4: rect 60x30 fill gold
    node5: rect 60x30 fill mediumpurple
```

### DAG

```
objects
  flow: rect 600x400
    layout dag direction=TB rankSep=60 nodeSep=40
    start: rect 80x40 fill steelblue
    validate: rect 80x40 fill coral
    process: rect 80x40 fill seagreen
    reject: rect 80x40 fill tomato
    done: rect 80x40 fill gold

  start -> validate
  validate -> process "yes"
  validate -> reject "no"
  process -> done
```

### Slot animation across strategies

```
objects
  inbox: rect 200x200
    layout flex column gap=8 padding=10
    task1: rect 160x30 fill steelblue
      layout slot=inbox
    task2: rect 160x30 fill coral
      layout slot=inbox

  board: rect 300x200
    layout grid columns=2 gap=8 padding=10

animate 4s loop easing=easeInOut
  2 task1.layout.slot: board
  4 task1.layout.slot: inbox
```

---

## Migration Path

### Phase 1: Constraint solver foundation

- Integrate a Cassowary solver (e.g. `kiwi.js` or similar).
- Refactor `flexStrategy` to generate constraints instead of computing
  positions directly. Output should be identical — this is a pure refactor.
- Registry collects constraints and solves in one pass.
- All existing tests pass unchanged.

### Phase 2: Schema split

- Replace flat `LayoutSchema` with discriminated union.
- Update DSL parser to handle strategy-specific properties.
- Update DSL emitter for round-trip fidelity.
- Child hint validation against parent strategy.

### Phase 3: New strategies

- Grid layout
- Circular layout
- DAG layout (requires connection-aware constraint generation) — its schema
  props (`dagDirection`, `rankSep`, `nodeSep`) land in `LayoutSchema` together
  with this strategy, not before: a schema prop with no registered strategy
  behind it is an advertised no-op.
- Tree layout

### Phase 4: Cross-container features

- Relative positioning DSL (`below`, `rightOf`, `alignX`, `alignY`)
- These generate constraints in the same solve pass.

---

## Open Questions

1. **Solver library choice.** `kiwi.js` is the most mature JS Cassowary
   implementation. Alternatively, a minimal solver could be written from
   scratch — Cassowary's simplex variant is well-documented. Tradeoff:
   dependency vs implementation effort.
   Answer: Kiwi does not seem to be maintained anymore.  We might have to do our own.  I'd want it to be thouroughly tested

2. **Error reporting.** When constraints conflict, how should this surface to
   the user? Cassowary can identify which required constraint was
   unsatisfiable, but mapping that back to "your grid has too many children
   for 2 columns" needs work.
   Answer: Hopefully this won't happen.  We'll just need to be able to display errors (perhaps when debug is on)

3. **DAG edge inference.** Should `layout dag` automatically infer edges from
   `path` nodes with `route` pointing between children? Or require explicit
   edge declarations? The former is more magical but matches existing DSL
   patterns.
   Answer: For now I think explicit

4. **Relative positioning syntax.** `below nodeId gap=10` as a block property?
   As layout kwargs? As a separate property? Needs DSL design exploration.
   Answer: we need consistency but ease of use.

5. **Performance boundary.** At what diagram complexity does the solver become
   a bottleneck for timeline-build? Likely hundreds of nodes, but worth
   profiling with the chosen library.
   Answer: Let's see how it goes first
