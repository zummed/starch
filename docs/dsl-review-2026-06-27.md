# Starch DSL — Deep Dive, Consistency Review, and a Direction for Higher‑Level Diagrams

> Author: design review, 2026‑06‑27
> Scope: the surface DSL (`src/dsl`, `src/types`, `src/templates`), not the renderer or editor internals.

## TL;DR opinions

1. **The architecture is excellent; the surface has drift.** The schema‑driven walker (one annotated Zod tree drives parsing, emit, completion, and popups) is the right backbone and should not be touched. The inconsistencies are all at the *notation* layer sitting on top of it.
2. **The single biggest consistency problem is that "a pair of numbers" has three different spellings** — `140x80` (size), `200,150` (position), `(300,200)` (point/waypoint/look). Fixing this one thing removes most of the felt inconsistency.
3. **The second problem is "many ways to say the same thing"** — colour (5 forms), time (5 forms), and arrows (3 forms). Expressiveness is good, but the canonical form should be obvious and the editor should normalise toward it.
4. **Don't chase total uniformity.** Terseness *is* the product ("write text, get animated diagrams"). The goal is *predictability*, not maximal regularity. Keep `at x,y` and `WxH`; just make the pair‑notations learnable and the aliases consistent.
5. **"Mermaid but animated" is the right north star, and the codebase is already 60% of the way there.** Shape sets + template expansion (`use [core, state]`) already turn one keyword into a node sub‑tree. The missing 40% is **auto‑layout from connectivity** and **thin diagram dialects that desugar to the node tree**. Do *not* fork in a separate Mermaid‑compatible parser — desugar into the existing model so the animation system, camera, chapters, and renderer come for free. That reuse is the whole moat.

---

## 1. How the DSL actually works today

Everything funnels through `walkDocument` (`src/dsl/schemaWalker.ts`): tokenize → walk `DocumentSchema` guided by `DslHints` attached to each Zod schema via `dsl()` (`src/dsl/dslMeta.ts`). The same hints drive the emitter, so parse→emit round‑trips. There is no hand‑written grammar; the grammar *is* the annotated schema.

A node line is assembled from up to five hint‑driven slots, in order:

```
box: rect 140x80 radius=8 fill steelblue stroke darkblue width=2 at 200,150
└id┘ └geo┘└─dim─┘└kwarg─┘ └─compound─┘ └────compound─────────┘ └transform┘
```

The vocabulary of attachment conventions:

| Convention | Example | Where it's used |
|---|---|---|
| **keyword + positional** | `rect 140x80`, `text "Hi"`, `hsl 210 70 45` | geometry, colour models, compounds |
| **`key=value` kwarg** | `radius=8`, `size=14`, `width=2`, `gap=10` | scalar tweaks |
| **bare flag** | `bold`, `mono`, `loop`, `closed`, `active` | booleans |
| **`@name` sigil** | `@primary` | style reference |
| **`->` operator** | `a -> b`, `a -> (250,100) -> b` | connections (path `route` variant) |
| **`at x,y`** | `at 200,150` | transform (keyword‑omittable) |
| **indentation** | child nodes *and* block props | containment + multi‑line props |

This is a genuinely nice design. The five‑slot node line reads well, and the flag/kwarg/positional split mostly tracks an intuition (flags = booleans, kwargs = scalar tweaks, positionals = the "main" args). The trouble is the boundaries between these conventions are not always where a user would guess.

---

## 2. Consistency review — what's inconsistent and how much it matters

### 2.1 ⚠️ High impact: number‑pairs have three spellings

The same semantic concept — an `(x, y)`‑ish pair of numbers — is written three ways depending on context:

```
rect 140x80          # size      → "x" infix, no comma, no parens
at 200,150           # position  → comma, no parens
a -> (250,100) -> b  # waypoint  → parens + comma
cam: camera look=(300,200)   # look target → parens + comma
path (0,0) (250,0)   # vertices  → parens + comma (list)
```

`140x80` is even a *dedicated token type* (`dimensions`) emitted by the tokenizer. So a learner must internalise three notations for "two numbers." This is the inconsistency users will feel first and most often.

**Opinion:** keep `WxH` (it's distinctive and unambiguously "a size", and it's a beloved bit of terseness), but **unify positions and points**. Right now `at 200,150` and `look=(300,200)` differ only in parentheses for no semantic reason. Pick one — I'd accept *both* bare and parenthesised pairs everywhere a point is expected, and have the emitter normalise to one canonical form (I'd pick parens for points/waypoints/look, because they often appear in lists where parens aid grouping, and bare `x,y` only after `at`). Net: a user learns "sizes use `x`, everything else uses `(x,y)`," down from three rules to two.

### 2.2 ⚠️ Medium impact: colour has five surface forms

```
fill red
fill #3366ff
fill hsl 210 70 45
fill rgb 60 200 80
fill red a=0.7        # +alpha kwarg, also hsl/hex/rgb variants
```

All converge to stored HSL. This is fine for expressiveness, but note `hsl 210 70 45` and `rgb 60 200 80` introduce a *fourth* "spaced numbers" convention (space‑separated triples) distinct from `x,y`, `(x,y)`, and `WxH`. And alpha is a trailing kwarg on top of a positional triple — a mixing of conventions inside one value.

**Opinion:** acceptable, but the editor should treat named/hex as the canonical surface and offer the others via completion, not present five co‑equal idioms in docs. Consider folding alpha into the hex form (`#rrggbbaa`) so `fill #3366ffb3` works and the "positional triple + kwarg" hybrid is no longer the *only* way to get alpha on a named colour.

### 2.3 ⚠️ Medium impact: time has five spellings

```
animate 3s            # header: number+suffix, tokenized as an identifier "3s"
  1.5  box.opacity: 1 # keyframe: bare number
  +2.0 box.opacity: 1 # relative offset (plus sigil)
  delay=0.5 ...        # kwarg
chapter "End" at 5     # "at" keyword
```

The header `3s` is parsed as an *identifier* (the tokenizer turns `number` followed by an alpha char into an identifier), then the `s` is stripped by a `suffix: 's'` hint. Keyframes want a bare number. So the same quantity — seconds — is `3s` in one place and `1.5` two lines below.

**Opinion:** allow the `s` suffix *everywhere* a time appears (`1.5s` keyframes, `+2s`, `at 5s`) and make it optional everywhere. One rule ("times may carry an `s`") instead of "the header needs `s`, the body forbids it."

### 2.4 ⚠️ Low–medium: three ways to draw an arrow

- `a -> b` — a `path` node, `route` variant (no label in core).
- `conn: template arrow from=a to=b label="..."` — the `arrow` core template.
- shape‑set arrows / `line: a -> b bend=0 gap=4`.

The lovely `->` form is the most mermaid‑like and should be the headline syntax, but it can't carry a label, so the moment you want "request"/"response" labels you drop to `template arrow`. That's a cliff.

**Opinion:** give `->` a label slot directly: `a -> b "request"` or `a -> b: request`. This is the single highest‑leverage syntax addition for diagram‑like content, and it's a precondition for the higher‑level work in §4.

### 2.5 Lower‑impact notes

- **`ellipse 50x50` is a diameter** stored as `rx=25` via a `transform: 'double'` hint. Reads as a bounding box (consistent with `rect`), so this is fine — but worth a doc sentence, since "50" not meaning radius surprises people.
- **Indented blocks are overloaded**: under a node, an indented line is a *child* if it has `id:` and a *block property* otherwise (`fill red`, `layout flex row`, `dash dashed`). Clever and it reads well, but it's a subtle disambiguation rule (`hintExecutors.ts` has to look ahead for a colon). Keep, but document explicitly.
- **`layout flex row`** uses positional `type` then `direction`, where `flex` is almost always the type. Minor redundancy; could default `type` to `flex` and allow `layout row gap=10`.
- **British/American spelling** is accepted for `colour`/`color` (and the state template reads both `props.colour` and `props.color`). Friendly, but it's surface surface area; keep it but make sure completion offers exactly one.
- **`..` traversal** (`card..size` → `card.title.text.size`, see `resolveShortcut.ts`) is a power‑user shortcut into template internals. It's handy but it's also the symptom discussed in §3.

**Overall consistency grade: B.** The conventions are principled and the schema‑driven core keeps parse/emit honest. What drags it down is (a) the three number‑pair spellings and (b) the proliferation of equivalent forms for colour/time/arrows. None require architectural change — they're notation normalisation.

---

## 3. Could it be simplified?

Yes, but **the goal should be predictability, not minimal grammar.** Concretely, in priority order:

1. **Unify number‑pairs (§2.1).** Biggest perceived‑consistency win per unit of effort. Accept `(x,y)` and `x,y` interchangeably for points; keep `WxH` for sizes only.
2. **Make `s` optional on all times (§2.3).** Removes a special case in the tokenizer's mental model.
3. **Add a label slot to `->` (§2.4)** and demote `template arrow` to an advanced form. Collapses three arrow idioms toward one.
4. **Pick canonical colour surface (§2.2)** in docs and completion; fold alpha into hex.
5. **Default `layout` type to `flex`.**

What I would **not** do:
- Don't force everything into `key=value`. The positional terseness is the product.
- Don't remove `WxH`, `@style`, or `->`. These are the memorable, good parts.
- Don't unify "block prop vs child" — the overload pays for itself in readability.

A useful framing: the DSL has **two regularity tiers** — a terse "headline" form (positional, sigils, `->`) and a verbose "explicit" form (all kwargs). The schema already supports falling back to kwargs (`fallbackToKwarg`). Lean into that explicitly: document the headline form as *the* language, and treat the kwarg form as the always‑available escape hatch the editor can expand/collapse to. That reframes most "inconsistencies" as "two registers," which is fine.

---

## 4. Higher‑level concepts: "Mermaid, but animated"

This is the most valuable direction, and the codebase is unusually well‑positioned for it.

### 4.1 What's already there

- **Shape sets + template expansion** (`templates/registry.ts`, `use [core, state]`). A single keyword (`state.node "Idle"`) expands to a sub‑tree of primitives (`.bg` rect, `.name` text, `.divider` path, `.action0…`). This is exactly Mermaid's "one token → a rendered widget" move.
- **The `state` set** (`templates/sets/state/*`) is a working proof: `node`, `initial`, `final`, `choice`, `region` — a domain vocabulary for state diagrams that compiles to plain nodes.
- **The differentiator already exists:** keyframes, 17 easings, camera (`look`/`zoom`/`follow`/fit), and chapters. Mermaid is static; starch animates. A "state diagram that draws its transitions edge‑by‑edge while a camera walks the happy path, paced by chapters" is a thing Mermaid fundamentally cannot do.

### 4.2 What's missing (the 40%)

1. **Auto‑layout from connectivity.** This is *the* gap. Mermaid's value is that `A --> B --> C` lays itself out. Starch today requires explicit `at x,y` for every node (the `state` sample hand‑places everything); only flex containers auto‑position, and flex is a box model, not a graph model. There is no hierarchical/DAG layout, no sequence‑diagram lane model, no tree layout. **Without auto‑layout, a "flowchart" dialect is just manual placement with nicer node shapes — not Mermaid.**
2. **Diagram dialect front‑ends.** Mermaid‑grade ergonomics means domain syntax: `flowchart`, `sequence`, `state` blocks where edges are first‑class and nodes are implicit (declared by being referenced).
3. **A stable animatable interface for templates.** Today you animate `s1.bg.fill.h` — reaching into a template's internal child IDs. If a template's internals change, animations break (the `..` shortcut in §2.5 is a band‑aid). Higher‑level shapes need named, stable "ports/parts" (e.g. `s1.fill`, `edge1.draw`) that survive internal refactors.

### 4.3 Recommended design — desugar, don't fork

**Strong opinion: add diagram dialects as thin front‑ends that compile to the existing node + animation model, plus one new auto‑layout strategy. Do not add a parallel Mermaid parser.**

The shape: a new top‑level section keyword (parses cleanly in the existing `matchSection` machinery) that owns a graph and a layout directive, and emits exactly the node tree the renderer already eats.

```
flowchart direction=down layout=dagre
  start([Start]) -> validate{Valid?}
  validate -> save[Save]            "yes"
  validate -> error[Show error]     "no"
  save -> done([Done])
  error -> validate                 "retry"

animate 6s
  chapters
    chapter "Happy path" at 0
    chapter "Error path" at 3
  reveal start, validate, save, done   # fade+draw edges in declaration order
  camera follow save
```

Why this fits starch specifically:

- **It reuses everything below the dialect.** The dialect desugars to `objects` (nodes via the `state`/`flow` shape sets) + `path` route edges + an auto‑layout pass that fills in `transform.x/y`. Once it's a node tree, **animation, camera, chapters, styles, and the SVG renderer all already work.** That reuse is the entire argument for staying in‑model.
- **Edges become animatable for free.** Each `->` is a `path` node, and `path` already has `drawProgress` (0→1 draw‑on animation) and `bend`/`gap`. So "draw the edges as the story progresses" is a keyframe on `edge.path.drawProgress` — no new animation primitives.
- **Chapters + camera turn a static graph into a walkthrough.** This is the headline demo and the thing no other text‑diagram tool does.

Concrete work breakdown:

1. **Layout strategy `graph` (alias `dagre`/`tree`) in `layout/registry.ts`**, alongside `flex`/`absolute`. Input: nodes + edge list; output: `transform.x/y` per node. Start with layered DAG (Sugiyama/dagre‑style) for flowchart/state; add a lane model for sequence. This is the one genuinely new engine and the gating item — do it first, behind plain `objects` (`layout graph` on a container), *before* any dialect sugar.
2. **A `flow` shape set** (`node`, `decision`, `terminal`, `io`…) mirroring the `state` set, so dialects have shapes to emit.
3. **`->` label slot (§2.4)** — required for edge labels; do this regardless.
4. **Dialect desugaring** (`flowchart`/`sequence`/`state` sections) → `{ objects, layout: graph }`. Implement `state` first since the shapes exist; it instantly upgrades the existing `state` sample from hand‑placed to auto‑laid‑out.
5. **Stable template ports** — give each shape set template a documented animatable surface (`x.fill`, `x.label`, `x.highlight`) so animations don't bind to private child IDs. This protects the higher‑level layer from churn and is the thing most likely to rot if deferred.

### 4.4 Risks / honest caveats

- **Editor surface multiplies.** Completion, click‑to‑edit popups, and round‑trip emit must cover each dialect. The schema‑driven design helps, but graph dialects are *less* uniform than the node grammar (edges, implicit node declaration). Budget real editor work per dialect; consider shipping dialects as parse‑only first, with the structural editor catching up.
- **Auto‑layout vs. animation interaction.** Once positions are computed, animating a node's `transform` fights the layout pass. Need a clear rule: layout sets *base* positions; animation deltas compose on top (or layout is a one‑shot that "bakes" `at` values the user can then override/animate). Decide this before building, or it becomes a debugging swamp.
- **Round‑trip fidelity.** A desugaring dialect that emits a big node tree must still re‑emit as the *compact dialect*, or editing breaks the abstraction. Either keep the dialect source as the canonical text and treat the node tree as derived (don't emit it back), or invest in lifting the tree back to dialect form. I'd keep dialect text canonical and mark the expansion as non‑round‑tripped, mirroring how templates already expand one‑way.

---

## 5. Recommended sequencing

**Phase 0 — notation normalisation (cheap, high felt value):**
- `->` label slot (§2.4); optional `s` on all times (§2.3); accept bare/parenthesised points interchangeably (§2.1); default `layout` type to `flex`.

**Phase 1 — auto‑layout (the unlock):**
- `graph` layout strategy in the layout registry, usable as `layout graph` on a plain container. Validate on the existing hand‑placed `state` sample by deleting its `at` coordinates.

**Phase 2 — first dialect:**
- `state` dialect desugaring to the `state` set + `graph` layout. Smallest leap (shapes exist), immediate payoff.
- Stable animatable ports for the `state` set.

**Phase 3 — generalise:**
- `flow` shape set + `flowchart` dialect; then `sequence` (needs the lane layout). Editor completion/popups follow per dialect.

The throughline: **every higher‑level feature compiles down to the node + keyframe model that already renders and animates.** That constraint is what keeps "Mermaid but animated" from becoming a second product bolted onto the first.

---

## Appendix — quick reference to the inconsistencies cited

| # | Issue | File(s) |
|---|---|---|
| 2.1 | `WxH` vs `x,y` vs `(x,y)` for number pairs | `dsl/tokenizer.ts` (`dimensions`), `types/properties.ts` (`TransformSchema` joined), `types/node.ts` (`PointRefSchema`, `CameraLookSchema`) |
| 2.2 | 5 colour forms | `types/properties.ts` (`ColorSchema` union) |
| 2.3 | 5 time forms | `types/animation.ts` (`AnimConfigSchema` suffix `s`, `KeyframeBlockSchema` bare, `plus`, `delay`, `ChapterSchema` `at`) |
| 2.4 | 3 arrow forms | `types/node.ts` (`PathGeomSchema` route variant), core `arrow` template, shape sets |
| 2.5 | block‑prop vs child overload; `..` traversal | `dsl/hintExecutors.ts`, `dsl/resolveShortcut.ts` |
