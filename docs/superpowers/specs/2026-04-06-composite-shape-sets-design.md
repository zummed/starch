# Composite Shape Sets

## Problem

Starch has five geometry primitives (rect, ellipse, text, path, image) and a flat set of composite templates (box, arrow, circle, etc.) that combine them. There's no organizational structure for related shapes, no way to add domain-specific shape families, and the template registry mixes primitives-wrappers with genuine composites.

## Goals

- Provide a clean set of general-purpose composite shapes (box with text, cards, pills, groups)
- Support domain-specific shape families (state charts, flowcharts, sequence diagrams)
- Organize shapes into discoverable, namespaced sets
- Enable autocompletion by set prefix (e.g. `state.` lists all state shapes)
- Enable editor popups for shape template props
- Keep existing DSL syntax working unchanged
- Make adding new shape sets trivial

## Design

### ShapeSet Registry

A `ShapeSet` is a named collection of related shapes:

```typescript
interface ShapeDefinition {
  template: TemplateFn;
  props: z.ZodObject<any>;  // Zod schema for props — drives editor popups
}

interface ShapeSet {
  name: string;                          // e.g. "state", "core"
  description: string;                   // e.g. "State chart shapes"
  shapes: Map<string, ShapeDefinition>;  // e.g. "node" → { template, props }
}
```

The registry is extended to support:
- `registerSet(set: ShapeSet)` — registers all shapes with dotted names (e.g. `state.node`)
- `getSet(name: string): ShapeSet | undefined`
- `listSets(): ShapeSet[]`

Individual shapes resolve via dotted names: `resolveTemplate("state.node")`. The dot is just part of the name string — no new lookup mechanism needed.

### DSL Search Path (`use` declaration)

A top-level `use` declaration controls which sets are in scope for unqualified name resolution:

```
use: [core, state]
```

- Default (if omitted): `[core]`
- Unqualified names like `box` resolve by walking the search path: checks `core.box`, finds it
- Fully-qualified names like `state.node` always work regardless of search path
- If two sets in the search path have a collision, the fully-qualified name is required

This means all existing DSLs continue to work — `box`, `arrow`, `circle` resolve through the default `core` search path.

### Template Reorganization

**Builtins removed.** The `builtins/` directory is cleaned out. Geometry primitives (rect, ellipse, text, path, image) are DSL keywords on nodes, not templates. All composite templates move into shape sets.

**Deleted templates:**
- `label` — barely more than `text`, not worth keeping
- `stateNode` — replaced by `state.node`
- `flowchartNode` — replaced by future `flowchart` set
- `sequenceParticipant` — replaced by future `sequence` set

### File Structure

```
src/templates/
  registry.ts            — extended with ShapeSet concept
  sets/
    core/
      index.ts           — registers "core" ShapeSet
      box.ts
      circle.ts
      arrow.ts
      line.ts
      pill.ts
      card.ts
      note.ts
      group.ts
      table.ts
      textblock.ts
      codeblock.ts
    state/
      index.ts           — registers "state" ShapeSet
      node.ts
      initial.ts
      final.ts
      region.ts
      choice.ts
```

Each set's `index.ts` creates the `ShapeSet` and registers it. A top-level `sets/index.ts` imports all sets for self-registration at startup.

### Core Set Shapes

Existing templates migrated as-is (box, circle, arrow, line, table, textblock, codeblock). New shapes:

**core.pill** — Small rounded rect with centered text, compact sizing.
- Props: `text`, `color`, `w?`, `h?`
- Produces: parent → `bg` (rect, large radius) + `label` (text)

**core.card** — Title bar + body area separated by a divider.
- Props: `title`, `body?`, `color`, `w?`, `h?`
- Produces: parent → `bg` (rect) + `header` (text) + `divider` (path) + `body` (text)

**core.note** — Sticky-note with folded corner, soft default color.
- Props: `text`, `color?`, `w?`, `h?`
- Produces: parent → `bg` (rect) + `fold` (path) + `label` (text)

**core.group** — Labeled container for nesting children with flex layout.
- Props: `label`, `color?`, `w?`, `h?`, `direction?`, `gap?`
- Produces: parent (flex layout) → `bg` (rect, dashed stroke, faded fill) + `title` (text) + children slotted into layout

### State Set Shapes

**state.node** — State box with name, optional divider, optional entry/exit actions.
- Props: `name`, `entry?`, `exit?`, `color?`, `w?`, `h?`
- Produces: parent → `bg` (rect, rounded) + `name` (text) + `divider?` (path) + `entry?` (text) + `exit?` (text)

**state.initial** — Filled circle (start pseudostate).
- Props: `color?`, `r?`
- Produces: parent → `dot` (ellipse, filled)

**state.final** — Double circle (end pseudostate).
- Props: `color?`, `r?`
- Produces: parent → `outer` (ellipse, stroke only) + `inner` (ellipse, filled, smaller)

**state.region** — Labeled dashed container for nesting child states (hierarchical state charts). Based on `core.group` with state-chart-appropriate defaults.
- Props: `label`, `color?`, `w?`, `h?`, `direction?`, `gap?`

**state.choice** — Diamond for choice/junction pseudostate.
- Props: `color?`, `size?`
- Produces: parent → `diamond` (path, 4-point polygon)

Transitions use the existing `arrow` template — no `state.transition` needed.

### Color Convention

Shapes that accept a `color` prop use it directly as the stroke color and set the fill to the same color at reduced opacity (e.g. `a: 0.15`). This is just inline logic in each template — no shared utility or abstraction. Explicit `fill`/`stroke` overrides work through the normal property system at the usage site or via styles.

### Editor Popups

Each shape defines a Zod schema for its props. The existing `clickPopupPlugin` is extended to:

1. Detect clicks on template instances in the DSL
2. Look up the shape's props schema from the ShapeSet registry
3. Render a CompoundPopup with the appropriate widget per prop field (ColorPicker for color, NumberSlider for numbers, EnumDropdown for enums)

No new widget types needed — the existing widget set covers all prop types.

### Autocompletion

The completion engine is extended to support:

- After `template "` or shape position: suggest search-path-resolved names, then set prefixes
- After a set prefix (e.g. `state.`): suggest all shapes in that set (auto-triggered)
- After `use:`: suggest available set names

The registry's `listSets()` and `getSet()` methods feed directly into the completion engine.

## Not In Scope

- Other domain sets (flowchart, sequence, network, erd) — follow the same pattern, added later
- "Import to top-level" shorthand (e.g. `use: [state.*]` to make `node` resolve without prefix) — deferred
- Third-party/plugin shape sets — the architecture supports it but no plugin API needed now
