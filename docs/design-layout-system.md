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

The solver does **not** run per animation frame. The process mirrors how slot
expansion already works:

1. At timeline-build time, for each keyframe that changes a layout-affecting
   value (slot, layout type, strategy params), clone the tree with that state.
2. Run strategies → generate constraints → solve → extract positions.
3. Store resulting x/y as numeric keyframes on transform tracks.
4. At playback, interpolate between solved positions. Pure lerp.

This means solver performance is not on the critical path. It runs once per
layout-affecting keyframe, not 60 times per second.

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

---

## Schema Design

### Principle: separate container config from child hints

The current `LayoutSchema` mixes container-level properties (`type`,
`direction`, `gap`, `justify`) with child-level hints (`grow`, `order`,
`alignSelf`, `slot`). This works for flex-only but breaks down with multiple
strategies that have incompatible properties.

**Split:**
- **Container properties** live on `layout` and are strategy-specific.
- **Child hints** are strategy-specific kwargs on the child's `layout` line.
- **`slot`** is universal — works with any strategy.

### Container schemas by strategy

#### Flex

```
layout flex column gap=8 padding=10 justify=center align=stretch wrap
```

| Property  | Type                                            | Default  |
|-----------|-------------------------------------------------|----------|
| direction | `row` \| `column`                               | `column` |
| gap       | number                                          | 0        |
| padding   | number                                          | 0        |
| justify   | `start` \| `center` \| `end` \| `spaceBetween` \| `spaceAround` | `start` |
| align     | `start` \| `center` \| `end` \| `stretch`       | `start`  |
| wrap      | boolean                                         | false    |

Child hints: `grow`, `order`, `alignSelf`, `slot`

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
layout grid columns=3 rows=2 gap=8 padding=10
```

| Property | Type            | Default |
|----------|-----------------|---------|
| columns  | number          | 1       |
| rows     | number \| auto  | auto    |
| gap      | number          | 0       |
| colGap   | number          | gap     |
| rowGap   | number          | gap     |
| padding  | number          | 0       |

Child hints: `gridCol`, `gridRow`, `colSpan`, `rowSpan`, `slot`

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

Child hints: `order`, `slot`

The strategy pre-computes angular positions using trigonometry, then injects
as equalities:
```
angle[i] = startAngle + (sweep / n) * i
child[i].centerX = container.centerX + radius * cos(angle[i])
child[i].centerY = container.centerY + radius * sin(angle[i])
```

#### DAG (directed acyclic graph)

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

#### Tree

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
- DAG layout (requires connection-aware constraint generation)
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

2. **Error reporting.** When constraints conflict, how should this surface to
   the user? Cassowary can identify which required constraint was
   unsatisfiable, but mapping that back to "your grid has too many children
   for 2 columns" needs work.

3. **DAG edge inference.** Should `layout dag` automatically infer edges from
   `path` nodes with `route` pointing between children? Or require explicit
   edge declarations? The former is more magical but matches existing DSL
   patterns.

4. **Relative positioning syntax.** `below nodeId gap=10` as a block property?
   As layout kwargs? As a separate property? Needs DSL design exploration.

5. **Performance boundary.** At what diagram complexity does the solver become
   a bottleneck for timeline-build? Likely hundreds of nodes, but worth
   profiling with the chosen library.
