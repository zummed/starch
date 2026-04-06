# DSL & JSON Editor Requirements

Captured from user testing sessions. Items marked with status.

## DSL Syntax

- [x] Compact human-readable syntax as alternative to JSON5
- [x] `id: geometry WxH props at x,y` line format
- [x] Arrow syntax for connections: `a -> b`, `a -> (250,100) -> b`
- [x] Indentation-based children
- [x] Flat references: `card.badge.fill: 120 70 45`
- [x] Style blocks: `style primary` with indented properties
- [x] Animation blocks: flat, scoped, and inline forms
- [x] `..` double-dot shortcut for animation track paths
- [x] Named colors: `fill white`, `fill red`
- [x] Hex colors: `fill #3B82F6`
- [x] `@styleName` for style references
- [x] Boolean bare keywords: `bold`, `smooth`, `closed`
- [x] `key=value` for named properties
- [x] Comments: `// line comment`
- [x] JSON escape hatch: `layout={ type: "flex" }`
- [x] Unified route model: `route: ["a", "b"]` replacing `from`/`to`
- [x] DSL as default editor mode

## Editor — Mode Toggle

- [x] "Mode" button in toolbar (alongside Load/Save)
- [x] Format indicator (JSON5/DSL) shown near close button
- [x] JSON5 is canonical storage; DSL is a generated view
- [x] Toggling preserves the diagram (lossless data round-trip)
- [x] Toggling reconfigures CodeMirror (language, linter, completions)

## Editor — Syntax Highlighting (DSL mode)

- [x] Keywords (rect, fill, at, stroke) in bold blue
- [x] Dimensions (140x80) in bold orange
- [x] Numbers in orange
- [x] Strings in green
- [x] Node IDs (box:) in bold white
- [x] Style references (@primary) in italic purple
- [x] Arrows (->) in cyan bold
- [x] Named/hex colors in pink
- [x] Booleans in purple
- [x] Comments in gray italic
- [x] Document keywords (animate, style, name) in blue (no bold)
- [x] Property names (radius=) in teal
- [ ] Hover underline/pointer only on clickable tokens (not possible with CM6 HighlightStyle auto-classes; would need ViewPlugin)

## Editor — Click-to-Popup (DSL mode)

- [x] Clicking dimensions (140x80) opens number slider for w or h
- [x] Clicking individual HSL numbers (fill 210 70 45) opens number slider for h, s, or l
- [x] Clicking `key=value` values (radius=8) opens appropriate popup (number slider, enum, etc.)
- [x] Clicking `fill` keyword opens compound color picker (HSL)
- [x] Clicking `stroke` keyword opens compound popup (color picker + width slider)
- [x] Clicking `rect`/`ellipse`/`image` keyword opens compound popup (all geometry sub-properties)
- [x] Clicking `at` keyword opens compound transform popup (x, y, rotation, scale)
- [x] Clicking `text`/`camera` keyword opens compound popup for their properties
- [ ] Clicking `at X,Y` individual numbers (200, 150) opens individual coordinate slider
- [x] Node IDs, document keywords, arrows, comments are NOT clickable (no false affordance)

## Editor — Popup Value Editing (DSL mode)

- [x] Popup initializes with correct current value from DSL text
- [x] Changing a value updates the DSL text surgically (not full regeneration, except for compound targets)
- [x] Compound targets (rect, at, stroke keyword) use parse-modify-generate for write-back
- [x] Color compound (fill keyword) uses span replacement for HSL numbers
- [x] Rapid slider dragging works without corruption (sync ref for target, not React state)
- [x] Popup changes don't trigger useEffect re-render that overwrites editor (popupEditingRef suppression)
- [x] Closing popup doesn't block next click (popupOpenRef set synchronously)
- [ ] Verify all popup types work: number, color, enum, boolean, pointref

## Editor — Autocomplete (DSL mode)

- [x] Geometry types suggested after `id:`
- [x] Property keywords suggested after geometry
- [x] Named colors suggested after `fill`/`stroke`
- [x] Easing names after `easing=`
- [x] Style names after `@`
- [x] Node IDs after `->`
- [x] Track paths in animate blocks
- [x] Autocomplete doesn't jump cursor to start of file (uses context.matchBefore)
- [ ] Autocomplete in animation blocks for `..` shortcut suggestions

## Editor — Linting (DSL mode)

- [x] Parse errors shown inline with line/column
- [x] Schema validation errors
- [ ] Ambiguous `..` path warnings

## Editor — Hover Descriptions

- [x] Hover tooltip showing full JSON path, description, type info
- [x] Works in both JSON5 and DSL modes

## Editor — Inline/Expand Toggle

- [x] Gutter icon per node in DSL mode
- [x] Click to toggle between inline and block form
- [x] Preference stored per-node in tab metadata

## Editor — JSON5 Mode

- [x] All existing popup functionality preserved (color picker, number slider, enum, boolean, pointref)
- [x] JSON5 syntax highlighting via CodeMirror json() extension
- [x] Schema-driven autocomplete
- [x] Linting via parseScene

## Known Bugs / Incomplete

- [ ] Compound popup for `at` doesn't update individual `at X,Y` coordinates correctly on drag (uses parse-generate which may reformat)
- [ ] `at X,Y` individual number clicks need testing — cursor path resolver may not handle all `at` forms
- [ ] Named color round-trip: `fill 0 100 50` regenerates as `fill red` — subsequent popup interactions may behave differently
- [ ] Template syntax not yet supported in DSL parser/generator
- [ ] `images` block not tested in popups
- [ ] Hover affordance (underline/pointer on clickable tokens only) not implemented — needs CM6 ViewPlugin approach
- [ ] Some samples truncated in DSL view when line is very long (editor horizontal scroll)
- [ ] The `path` keyword has no compound popup (explicit point paths have complex editing needs)
