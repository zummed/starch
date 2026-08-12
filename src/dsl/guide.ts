/**
 * A written description of the starch DSL, generated from the same schemas
 * the parser walks.
 *
 * The audience is a language model that has to write starch without having
 * starch installed — an app that stores .starch documents forwards this
 * string to whatever is generating them, and starch itself can hand it
 * straight to a caller. Both get the same text.
 *
 * Almost everything here is derived: the shape inventory comes from the
 * template registry, property names and their one-line descriptions from
 * `.describe()`, the writing form of each shape from its `dsl()` hints, the
 * easing list from `EasingNameSchema`, the colour names from the colour
 * model. Add a prop to a schema and it appears here; rename one and the old
 * name stops being taught. The prose is confined to the invariants that no
 * schema encodes — that ids are globally unique, that indentation nests, how
 * keyframe times read — and is marked as such below.
 */
import { z } from 'zod';
import { getDsl, type DslHints } from './dslMeta';
import { detectSchemaType, getEnumValues, unwrap } from '../types/schemaRegistry';
import { EasingNameSchema } from '../types/animation';
import { getAllColorNames } from '../types/color';
import { LAYOUT_STRATEGY_SCHEMAS, LAYOUT_STRATEGY_NAMES, LayoutUniversalSchema, LayoutSchema } from '../types/properties';
import { NodeSchema } from '../types/node';
import { DocumentSchema } from '../types/schemaRegistry';
import { registerBuiltinTemplates } from '../templates/index';
import { listSets, type ShapeSet } from '../templates/registry';
import { blockEntryField } from './schemaIntrospect';

export interface StarchGuideOptions {
  /**
   * Shape sets to document. Defaults to every registered set. A document
   * only gets the non-core sets it opts into with `use`, so an app that
   * only ever writes core diagrams can forward a smaller guide.
   */
  sets?: string[];
  /** Include the worked examples. Default true. */
  examples?: boolean;
}

// ── Schema → prose helpers ───────────────────────────────────────

function describe(schema: z.ZodType): string {
  return schema.description ?? unwrap(schema).description ?? '';
}

/** A short type name for a prop, with enum arms spelled out. */
function typeLabel(schema: z.ZodType): string {
  const values = getEnumValues(schema);
  if (values) return values.join(' | ');
  switch (detectSchemaType(schema)) {
    case 'number': return 'number';
    case 'string': return 'string';
    case 'boolean': return 'flag';
    case 'array': return 'list';
    case 'color': return 'colour';
    case 'pointref': return 'point or id';
    case 'anchor': return 'anchor';
    default: return 'value';
  }
}

/**
 * The line a writer actually types, reconstructed from the same hints the
 * parser uses to read it — positionals in order, then kwargs, then flags.
 */
function usageLine(head: string, props: z.ZodType): string | undefined {
  // Hints live on the bare schema; a field reached through the node shape is
  // wrapped in .optional()/.default(), which getDsl cannot see through.
  const hints = getDsl(props) ?? getDsl(unwrap(props));
  if (!hints) return undefined;
  const shape = (unwrap(props) as z.ZodObject<any>).shape as Record<string, z.ZodType> | undefined;
  // A kwarg is far more useful as `radius=<number>` than as a bare `radius=`,
  // and the type is already on the field it names.
  const slot = (key: string) => {
    const field = shape?.[key];
    return field ? `${key}=<${typeLabel(field)}>` : `${key}=…`;
  };

  const parts = [head];
  if (hints.keyword) parts.push(hints.keyword);
  for (const positional of hints.positional ?? []) {
    if (positional.keyword) parts.push(positional.keyword);
    switch (positional.format) {
      case 'dimension': parts.push('WxH'); break;
      case 'quoted': parts.push(`"${positional.keys[0]}"`); break;
      case 'arrow': parts.push('<from> -> <to>'); break;
      case 'bracketList': parts.push(`[${positional.keys[0]}]`); break;
      case 'joined': parts.push(positional.keys.join(positional.separator ?? ',')); break;
      default: parts.push(positional.keys.map(k => `<${k}>`).join(' '));
    }
  }
  for (const kwarg of hints.kwargs ?? []) parts.push(slot(kwarg));
  // Booleans parse bare or explicit. The explicit form is quoted because it
  // is the one that can also express false, and because a bare word in a
  // generated usage line reads like a placeholder rather than a literal.
  for (const flag of hints.flags ?? []) parts.push(`${flag}=true`);
  return parts.join(' ');
}

/** Markdown list items — a four-space indent would render as a code block. */
function propLines(props: z.ZodObject<any>): string[] {
  const out: string[] = [];
  for (const [key, schema] of Object.entries(props.shape as Record<string, z.ZodType>)) {
    const description = describe(schema);
    out.push(`- \`${key}\` (${typeLabel(schema)})${description ? ` — ${description}` : ''}`);
  }
  return out;
}

// ── Sections ─────────────────────────────────────────────────────

function shapeSetSection(set: ShapeSet): string {
  const out = [`### \`use ${set.name}\` — ${set.description}`, ''];
  const undocumented: string[] = [];
  for (const [name, definition] of set.shapes) {
    const usage = usageLine(name, definition.props);
    if (usage) {
      out.push('```', usage, '```');
      // Shapes whose content is a list take it from the indented block, so
      // the usage line above cannot show it — it isn't a kwarg.
      const block = blockEntryField(definition.props);
      if (block) {
        out.push(
          `Set \`${block.key}\` from the indented block beneath the line — ` +
          (block.shape === 'row'
            ? 'one row per line, each cell a quoted string:'
            : 'one quoted string per line:'),
          '',
          '```',
          `${name.split('.').pop()}1: ${name}`,
          ...(block.shape === 'row'
            ? ['  "Ada" "36"', '  "Lin" "29"']
            : ['  "First line"', '  "Second line"']),
          '```',
        );
      }
    } else {
      // No dsl() hints, so there is no positional form. Scalar `key=value`
      // still parses — the kwarg loop accepts any key — but the kwarg
      // reader stops at `[`, so a list-valued prop cannot be written at
      // all. Quote only what actually works.
      const shape = definition.props.shape as Record<string, z.ZodType>;
      const scalars = Object.keys(shape).filter(k => detectSchemaType(shape[k]) !== 'array');
      const lists = Object.keys(shape).filter(k => detectSchemaType(shape[k]) === 'array');
      out.push('```', [name, ...scalars.map(k => `${k}=<${typeLabel(shape[k])}>`)].join(' '), '```');
      if (lists.length > 0) {
        undocumented.push(name);
        out.push(
          `\`${name}\` has no way to write ${lists.map(l => `\`${l}\``).join(' or ')} from the DSL, ` +
          `so its content cannot be set here — use a different shape.`,
        );
      }
    }
    out.push(...propLines(definition.props), '');
  }
  if (undocumented.length > 0) {
    out.push(
      `> Content cannot be set from the DSL on: ${undocumented.map(s => `\`${s}\``).join(', ')}. ` +
      `Their list-valued properties have no written form yet, and attempting one is read as a ` +
      `new object id. Prefer a shape from the list above.`,
      '',
    );
  }
  return out.join('\n');
}

/**
 * The lines that open a document, generated from the top-level fields of
 * DocumentSchema so a new directive cannot be added without appearing here.
 */
function directivesSection(): string {
  const shape = (unwrap(DocumentSchema) as z.ZodObject<any>).shape as Record<string, z.ZodType>;
  const directives: string[] = [];
  const sections: string[] = [];
  for (const [name, field] of Object.entries(shape)) {
    const hints = getDsl(field) ?? getDsl(unwrap(field));
    if (!hints) continue;
    if (hints.topLevel) {
      const usage = usageLine('', field)?.trim();
      directives.push(`- \`${usage || name}\` — ${describe(field)}`);
    } else if (hints.sectionKeyword) {
      const entry = hints.instanceDeclaration
        ? ` Each entry is \`${hints.instanceDeclaration.idKey}${hints.instanceDeclaration.colon === 'required' ? ':' : ''} …\`, indented.`
        : ' Entries are indented beneath it.';
      sections.push(`- \`${hints.sectionKeyword}\` — ${describe(field)}.${entry}`);
    }
  }
  return [
    'Directives come first, one per line:',
    '',
    ...directives,
    '',
    'Then the indented sections:',
    '',
    ...sections,
    '',
    'A style is a named bundle of properties, applied to an object with `@name`:',
    '',
    '```starch',
    'style hot',
    '  fill crimson',
    '',
    'objects',
    '  a: rect 120x50 @hot at 100,100',
    '```',
  ].join('\n');
}

function primitivesSection(): string {
  const hints = getDsl(NodeSchema) as DslHints;
  const shape = (unwrap(NodeSchema) as z.ZodObject<any>).shape as Record<string, z.ZodType>;
  const out = ['Every object is `id: type properties...`. The primitives are:', ''];
  for (const name of hints.geometry ?? []) {
    const schema = shape[name];
    if (!schema) continue;
    // These carry their own hints, so quote the line rather than only the
    // description — a reader could not otherwise work out how to write a
    // bare `text` object, which is the one primitive with no template.
    // Most of these already carry the keyword in their own hints, so let it
    // supply the name and only prefix the ones that don't (`path`).
    const usage = usageLine('', schema)?.trim();
    const line = !usage ? name : usage.startsWith(name) ? usage : `${name} ${usage}`;
    out.push(`- \`${line}\` — ${describe(schema)}`);
  }
  out.push('', 'Properties any object can carry, inline on its line:', '');
  for (const name of hints.inlineProps ?? []) {
    const schema = shape[name];
    if (!schema) continue;
    // `layout` merges every strategy's fields into one schema, so its usage
    // line would run to twenty kwargs that no single strategy accepts.
    // It gets its own section below instead.
    if (name === 'layout') {
      out.push(`- \`layout <type>\` — ${describe(schema)}, one of ` +
        `\`${LAYOUT_STRATEGY_NAMES.join('`, `')}\`. See Layout below.`);
      continue;
    }
    // Where the property has its own writing form — `at x,y` for a
    // transform, `dash <pattern>` — quote that rather than the field name,
    // which is not what anyone types.
    const usage = usageLine('', schema)?.trim();
    out.push(`- ${usage ? `\`${usage}\`` : `\`${name}\``} — ${describe(schema)}`);
  }
  out.push(
    '',
    `\`${(hints.blockProps ?? []).join('`, `')}\` can also be written as an indented block.`,
    `A style is applied with the \`${hints.sigil?.prefix ?? '@'}\` sigil — \`@hot\`.`,
  );
  return out.join('\n');
}

/**
 * Each strategy's own properties, kept apart because applying one strategy's
 * property to another is exactly what the layout validator rejects.
 */
function layoutSection(): string {
  const out = [
    'A container positions its children with `layout <type>`. Properties are per-strategy —',
    'applying one strategy\'s property under another is reported as a warning.',
    '',
  ];
  // `type` and `direction` are positional on LayoutSchema, so `direction` is
  // written bare after the strategy name. Spelled as `direction=row` it is
  // read as a new object called "direction" — which is what happens to
  // anyone who reads the property list below without this distinction.
  const positional = new Set(
    (getDsl(LayoutSchema) ?? getDsl(unwrap(LayoutSchema)))?.positional?.flatMap(p => p.keys) ?? [],
  );
  for (const [name, schemas] of Object.entries(LAYOUT_STRATEGY_SCHEMAS)) {
    const containerShape = (schemas.container as z.ZodObject<any>).shape as Record<string, z.ZodType>;
    const bare = Object.keys(containerShape).filter(k => positional.has(k));
    out.push(`**\`layout ${name}${bare.map(k => ` <${k}>`).join('')}\`**`, '');
    const container = propLines(schemas.container as z.ZodObject<any>)
      .map(line => bare.some(k => line.startsWith(`- \`${k}\``))
        ? `${line} — written bare after \`${name}\`, never as \`${bare[0]}=…\``
        : line);
    out.push(...(container.length > 0 ? container : ['- no properties of its own — children keep their own `at x,y`']));
    const childHints = Object.keys((schemas.childHints as z.ZodObject<any>).shape);
    if (childHints.length > 0) {
      out.push(`- on each child: \`${childHints.join('`, `')}\``);
    }
    out.push('');
  }
  out.push('Valid under any strategy:', '');
  out.push(...propLines(LayoutUniversalSchema));
  return out.join('\n');
}

function easingsSection(): string {
  const easings = getEnumValues(EasingNameSchema) ?? [];
  return `Easings: \`${easings.join('`, `')}\`.`;
}

function coloursSection(): string {
  const names = getAllColorNames();
  return [
    'Colours accept CSS named colours, `#rrggbb`, `rgb(...)`, and `hsl(...)`.',
    `Both \`color\` and \`colour\` are accepted everywhere. ${names.length} names are known, including ` +
    `\`${names.slice(0, 8).join('`, `')}\`.`,
  ].join('\n');
}

// ── The prose spine ──────────────────────────────────────────────
//
// Invariants the schemas do not encode. Everything else in the guide is
// generated; when you find yourself wanting to add a shape or a property
// here, add it to the schema instead and it will appear on its own.

const STRUCTURE = `A scene is plain text with meaningful indentation, in up to four parts, in this
order: directives, styles, objects, and one \`animate\` block.

Ids are globally unique across the whole document, including nested children,
because arrows, animations, and the camera all refer to objects by id.
Indenting an object under another makes it a child: children move with their
parent and inherit \`fill\` and \`opacity\`.`;

const ANIMATION = `\`animate <duration> [loop] [easing=...]\` opens the timeline. Each keyframe is a
time — absolute (\`2\`) or relative to the previous one (\`+1\`) — followed by
\`target.property: value\` lines. Values hold between keyframes.

Dot-paths reach inside templates, so a \`card\` named \`c\` exposes \`c.bg\`,
\`c.header\`, \`c.divider\` and \`c.body\`. Do not guess these: \`parseScene(dsl).trackPaths\`
lists every path a document actually offers, and an animation aimed at a path
that does not exist is silently ignored.

Named time markers turn the timeline into a step-through presentation, under an
indented \`chapters\` block:

\`\`\`starch
objects
  a: rect 100x50 fill steelblue at 100,100

animate 10
  chapters
    chapter "Start" at 0
    chapter "Handshake" at 3
    chapter "Complete" at 7
\`\`\``;

const CHECKING = `The parser drops what it cannot match rather than failing, so a document can
render while being wrong. \`parseScene(dsl)\` returns \`warnings\`; a non-empty
\`warnings\` means the diagram that renders is not the one that was written — a
misspelled shape or property shows up there. Treat any warning as a failure and
fix it. Malformed structure (a duplicate id, two geometries on one object)
throws instead.`;

const EXAMPLES = `A diagram with a connection and a label:

\`\`\`starch
name "Request path"

objects
  client: box "Client" color=steelblue at 100,100
  api: box "API" color=mediumseagreen at 320,100
  db: circle "DB" color=mediumpurple at 540,100
  req: arrow from=client to=api label="request"
  query: arrow from=api to=db label="query" labelBg=plate
\`\`\`

The same diagram animated, revealing one step at a time:

\`\`\`starch
objects
  client: box "Client" color=steelblue at 100,100
  api: box "API" color=mediumseagreen at 320,100
  req: arrow from=client to=api label="request" opacity 0

animate 4 loop
  1 req.opacity: 1
  3 req.opacity: { value: 0.2, easing: "easeOut" }
\`\`\`

A container that positions its own children — they carry no \`at\`, because the
layout places them:

\`\`\`starch
objects
  row: rect 620x160 radius=12 fill #1b1f2a at 400,200 layout flex row gap=24 align=center
    c1: card "Ingest" body="Reads the queue" color=steelblue
    c2: card "Score" body="Applies the model" color=mediumseagreen
    c3: card "Store" body="Writes results" color=mediumpurple
\`\`\``;

// ── Entry point ──────────────────────────────────────────────────

/**
 * The starch DSL, written out as markdown for a model that has to author
 * starch documents. No DOM and no parsing — safe to call from a server, a
 * build step, or a tool handler that forwards it to another agent.
 */
export function getStarchGuide(options: StarchGuideOptions = {}): string {
  // Registration is explicit rather than an import side effect, so that
  // bundlers cannot tree-shake the sets away (see the layout-strategy
  // regression that motivated the same treatment there).
  registerBuiltinTemplates();

  const all = listSets();
  const wanted = options.sets
    ? all.filter(set => options.sets!.includes(set.name))
    : all;

  const missing = (options.sets ?? []).filter(name => !all.some(set => set.name === name));
  if (missing.length > 0) {
    throw new Error(
      `Unknown shape set${missing.length > 1 ? 's' : ''} ${missing.map(m => `"${m}"`).join(', ')} — ` +
      `known sets are ${all.map(s => `"${s.name}"`).join(', ')}`,
    );
  }

  const sections = [
    '# Writing starch',
    '',
    'Starch is a text format for animated diagrams. This description is generated from',
    'the running version of starch, so the shapes and properties below are exactly the',
    'ones it accepts.',
    '',
    '## Document structure',
    '',
    STRUCTURE,
    '',
    directivesSection(),
    '',
    '## Objects',
    '',
    primitivesSection(),
    '',
    '## Shapes',
    '',
    'Templates size themselves around their content. Sets other than `core` are opted',
    'into per document with `use [core, state]`.',
    '',
    '`WxH` in a form below is an optional literal size, written like `120x50`; leave it out',
    'and the shape sizes itself. Everything after the shape name is optional.',
    '',
    'A shape\'s own properties can be written anywhere on its line, before or after `at x,y`.',
    'Names the object itself owns always go to the object rather than the shape: `at`, `dash`,',
    '`layout`, `opacity`, `depth`, `visible` and `style` (the written-out form of `@name`)',
    'position and style the object, whatever shape it is.',
    '',
    '`fill` and `stroke` go by how they are written. Bare — `fill steelblue`, `stroke gray',
    'width=2` — they are the object\'s, and children inherit them. With an `=` they are the',
    'shape\'s own, on the shapes that list them below: `box "X" fill=azure` paints that box\'s',
    'background and nothing else.',
    '',
    'A boolean can be written bare or explicitly — `dashed` and `dashed=true` are the same,',
    'and `dashed=false` turns it off.',
    '',
    'An `arrow` draws a head already; `arrow=true` is only worth writing on a `line`.',
    '',
    'A connection names its ends either positionally or as kwargs — `c: arrow a -> b',
    'label="calls"` and `c: arrow from=a to=b label="calls"` are the same thing. Waypoints go',
    'in the positional form: `c: arrow a -> (250,100) -> b radius=15`.',
    '',
    'Dropping the shape name entirely (`c: a -> b bend=1`) draws a bare route — useful for a',
    'plain connector, but it takes only path options, so put `arrow` or `line` in front of it',
    'the moment you want a label or a colour.',
    '',
    ...wanted.map(shapeSetSection),
    '## Layout',
    '',
    layoutSection(),
    '',
    '## Animation',
    '',
    ANIMATION,
    '',
    easingsSection(),
    '',
    '## Colours',
    '',
    coloursSection(),
    '',
    '## Checking what you wrote',
    '',
    CHECKING,
  ];

  if (options.examples !== false) {
    sections.push('', '## Examples', '', EXAMPLES);
  }

  return sections.join('\n') + '\n';
}
