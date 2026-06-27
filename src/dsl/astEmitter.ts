import { hslToName, rgbToName, isColor } from '../types/color';
import type { FormatHints } from './formatHints';
import type { AstNode } from './astTypes';
import { createAstNode } from './astTypes';
import type { z } from 'zod';
import type { PositionalHint } from './dslMeta';
import { getConstructHints } from './schemaIntrospect';
import {
  RectGeomSchema, EllipseGeomSchema, TextGeomSchema, ImageGeomSchema, CameraSchema, PathGeomSchema,
} from '../types/node';
import { StrokeSchema, TransformSchema, DashSchema, LayoutSchema } from '../types/properties';

// ─── Types ────────────────────────────────────────────────────────

interface EmitResult {
  text: string;
  ast: AstNode;
}

interface EmitterOptions {
  formatHints: FormatHints;
  nodeFormats?: Record<string, 'inline' | 'block'>;
}

// ─── Own Key Checks ──────────────────────────────────────────────

function hasOwn(node: any, key: string): boolean {
  const own: Set<string> | undefined = node._ownKeys;
  if (own) return own.has(key);
  return true;
}

function countProps(node: any): number {
  let count = 0;
  for (const key of Object.keys(node)) {
    if (key === 'id' || key === 'children' || key.startsWith('_')) continue;
    if (hasOwn(node, key)) count++;
  }
  return count;
}

// ─── Connection / Path Checks ────────────────────────────────────

function isConnection(node: any): boolean {
  return node.path && node.path.route && Array.isArray(node.path.route);
}

function isExplicitPath(node: any): boolean {
  return node.path && node.path.points && Array.isArray(node.path.points) && !node.path.route;
}

// ─── Layout Helpers ──────────────────────────────────────────────

const LAYOUT_HINT_KEYS = ['grow', 'order', 'alignSelf', 'slot'] as const;

function isBlockLayout(layout: any): boolean {
  return !!(layout.type || layout.direction || layout.gap !== undefined ||
    layout.justify || layout.align || layout.wrap !== undefined ||
    layout.padding !== undefined);
}

function hasBlockOnlyProps(node: any): boolean {
  return !!((node.dash && hasOwn(node, 'dash')) || (node.layout && hasOwn(node, 'layout') && isBlockLayout(node.layout)));
}

// ─── Text Buffer with AST Node Construction ─────────────────────

class AstTextBuilder {
  private parts: string[] = [];
  private offset = 0;
  private nodeStack: AstNode[] = [];

  constructor(private root: AstNode) {
    this.nodeStack = [root];
  }

  /** Current character offset. */
  get pos(): number {
    return this.offset;
  }

  /** Write structural text (no AST node). */
  write(text: string): this {
    this.parts.push(text);
    this.offset += text.length;
    return this;
  }

  /** Write text and create a leaf AST node. */
  writeNode(
    text: string,
    role: AstNode['dslRole'],
    schemaPath: string,
    modelPath: string,
    value?: unknown,
    parent?: AstNode,
  ): AstNode {
    const from = this.offset;
    this.parts.push(text);
    this.offset += text.length;
    const node = createAstNode({
      dslRole: role,
      from,
      to: this.offset,
      schemaPath,
      modelPath,
      value,
    });
    const target = parent ?? this.currentParent();
    if (target) {
      node.parent = target;
      target.children.push(node);
    }
    return node;
  }

  /** Open a compound AST node (children added until closeCompound). */
  openCompound(schemaPath: string, modelPath: string): AstNode {
    const node = createAstNode({
      dslRole: 'compound',
      from: this.offset,
      to: this.offset, // updated on close
      schemaPath,
      modelPath,
    });
    const parent = this.currentParent();
    if (parent) {
      node.parent = parent;
      parent.children.push(node);
    }
    this.nodeStack.push(node);
    return node;
  }

  /** Close the current compound and update its `to` position. */
  closeCompound(): void {
    const node = this.nodeStack.pop();
    if (node) {
      node.to = this.offset;
    }
  }

  /** Get the accumulated text. */
  getText(): string {
    return this.parts.join('');
  }

  private currentParent(): AstNode | undefined {
    return this.nodeStack[this.nodeStack.length - 1];
  }
}

// ─── Schema-Driven Construct Emission ───────────────────────────
// The inverse of executeSchema/executePositional in hintExecutors. A single
// engine emits `keyword positional… kwargs… flags…` for any value object,
// deriving the entire surface syntax from the schema's DslHints. This keeps
// emit in lock-step with parse: both read the same object definitions.

/** Whether a value string is safe to emit unquoted as a DSL token. */
function isSimpleToken(s: string): boolean {
  return /^-?[A-Za-z_][A-Za-z0-9_-]*$/.test(s) || /^-?\d+(\.\d+)?$/.test(s);
}

/** Quote and escape a string for DSL (inverse of the tokenizer's readString). */
function quoteString(s: string): string {
  return '"' + s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t') + '"';
}

/** Format an arbitrary scalar/array value as DSL text (quoting when needed). */
function formatScalar(v: unknown): string {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `(${v.map(x => (typeof x === 'string' && !isSimpleToken(x) ? quoteString(x) : String(x))).join(',')})`;
  if (typeof v === 'string') return isSimpleToken(v) ? v : quoteString(v);
  return String(v);
}

/** Whether a positional hint would produce any output for this value. */
function positionalHasOutput(p: PositionalHint, value: any): boolean {
  const fmt = p.format;
  if (fmt === 'tuples' || fmt === 'arrow' || fmt === 'bracketList') {
    const v = value?.[p.keys[0]];
    return Array.isArray(v) && v.length > 0;
  }
  if (fmt === 'joined' || fmt === 'spaced') return p.keys.some(k => value?.[k] !== undefined);
  return value?.[p.keys[0]] !== undefined; // dimension/quoted/color/default/suffix
}

/** Pick the matching variant hints by inspecting the value (mirrors selectVariantHints). */
function selectVariantForValue(hints: any, value: any): any {
  if (!hints?.variants?.length) return hints;
  for (const variant of hints.variants) {
    const when = variant.when;
    if (when && value?.[when] !== undefined) return variant.hints;
  }
  // Fall back to the first no-keyword variant, else the first.
  for (const variant of hints.variants) {
    if (!variant.hints.keyword) return variant.hints;
  }
  return hints.variants[0].hints;
}

function emitPositional(
  b: AstTextBuilder,
  p: PositionalHint,
  value: any,
  schemaPath: string,
  modelPath: string,
  sep: () => void,
): void {
  const fmt = p.format;
  const sp = (k: string) => `${schemaPath}.${k}`;
  const mp = (k: string) => `${modelPath}.${k}`;

  if (fmt === 'dimension') {
    const [k1, k2] = p.keys;
    if (value?.[k1] === undefined) return;
    const mult = p.transform === 'double' ? 2 : 1;
    sep();
    b.write('(');
    b.writeNode(String(value[k1] * mult), 'value', sp(k1), mp(k1), value[k1]);
    if (k2 !== undefined && value[k2] !== undefined) {
      b.write(',');
      b.writeNode(String(value[k2] * mult), 'value', sp(k2), mp(k2), value[k2]);
    }
    b.write(')');
    return;
  }

  if (fmt === 'color') {
    const k = p.keys[0];
    if (value?.[k] === undefined) return;
    sep();
    emitColor(b, value[k], sp(k), mp(k));
    return;
  }

  if (fmt === 'quoted') {
    const k = p.keys[0];
    if (value?.[k] === undefined) return;
    sep();
    b.writeNode(quoteString(String(value[k])), 'value', sp(k), mp(k), value[k]);
    return;
  }

  if (fmt === 'joined') {
    const present = p.keys.filter(k => value?.[k] !== undefined);
    if (present.length === 0) return;
    if (present.length === p.keys.length) {
      const t = p.separator ?? ',';
      sep();
      b.write('(');
      for (let i = 0; i < p.keys.length; i++) {
        if (i > 0) b.write(t);
        const k = p.keys[i];
        b.writeNode(String(value[k]), 'value', sp(k), mp(k), value[k]);
      }
      b.write(')');
    } else if (p.fallbackToKwarg) {
      for (const k of present) {
        sep();
        b.write(`${k}=`);
        b.writeNode(String(value[k]), 'value', sp(k), mp(k), value[k]);
      }
    }
    return;
  }

  if (fmt === 'spaced') {
    if (!p.keys.some(k => value?.[k] !== undefined)) return;
    sep();
    let first = true;
    for (const k of p.keys) {
      if (value?.[k] === undefined) continue;
      if (!first) b.write(' ');
      first = false;
      b.writeNode(String(value[k]), 'value', sp(k), mp(k), value[k]);
    }
    return;
  }

  if (fmt === 'tuples') {
    const pts = value?.[p.keys[0]];
    if (!Array.isArray(pts) || pts.length === 0) return;
    sep();
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) b.write(' ');
      const pt = pts[i];
      b.write('(');
      b.writeNode(String(pt[0]), 'value', `${sp(p.keys[0])}.${i}.0`, `${mp(p.keys[0])}.${i}.0`, pt[0]);
      b.write(',');
      b.writeNode(String(pt[1]), 'value', `${sp(p.keys[0])}.${i}.1`, `${mp(p.keys[0])}.${i}.1`, pt[1]);
      b.write(')');
    }
    return;
  }

  if (fmt === 'arrow') {
    const route = value?.[p.keys[0]];
    if (!Array.isArray(route) || route.length === 0) return;
    sep();
    for (let i = 0; i < route.length; i++) {
      if (i > 0) b.write(' -> ');
      emitPointRef(b, route[i], `${sp(p.keys[0])}.${i}`, `${mp(p.keys[0])}.${i}`);
    }
    return;
  }

  if (fmt === 'bracketList') {
    const items = value?.[p.keys[0]];
    if (!Array.isArray(items)) return;
    sep();
    b.write('[');
    for (let i = 0; i < items.length; i++) {
      if (i > 0) b.write(',');
      b.writeNode(String(items[i]), 'value', sp(p.keys[0]), mp(p.keys[0]), items[i]);
    }
    b.write(']');
    return;
  }

  // Default: single scalar value, optionally with a unit suffix (e.g. 3s).
  const k = p.keys[0];
  if (value?.[k] === undefined) return;
  sep();
  const text = p.suffix ? `${value[k]}${p.suffix}` : String(value[k]);
  b.writeNode(text, 'value', sp(k), mp(k), value[k]);
}

/**
 * Emit a construct (geometry/property/etc.) from its schema's DslHints.
 * `schemaPath` is the local schema path (e.g. 'rect', 'stroke', 'transform');
 * `modelPath` is the full model path (e.g. 'objects.box.rect').
 */
function emitConstruct(
  b: AstTextBuilder,
  schema: z.ZodType,
  value: any,
  schemaPath: string,
  modelPath: string,
): void {
  const base = getConstructHints(schema);
  if (!base) return;
  const hints = base.variants ? selectVariantForValue(base, value) : base;
  if (!hints) return;

  let wrote = false;
  const sep = () => { if (wrote) b.write(' '); wrote = true; };

  const positionals: PositionalHint[] = hints.positional ?? [];
  const keywordVisible = !hints.keyword
    ? false
    : positionals.length === 0
      ? true
      : positionals.some((p: PositionalHint) => positionalHasOutput(p, value))
        ? true
        : !(hints.keywordOmittable ?? base.keywordOmittable);

  if (hints.keyword && keywordVisible) {
    sep();
    b.writeNode(hints.keyword, 'keyword', schemaPath, modelPath, hints.keyword);
  }

  for (const p of positionals) {
    emitPositional(b, p, value, schemaPath, modelPath, sep);
  }

  for (const key of (hints.kwargs ?? [])) {
    if (value?.[key] === undefined) continue;
    sep();
    b.writeNode(key, 'kwarg-key', `${schemaPath}.${key}`, `${modelPath}.${key}`, key);
    b.write('=');
    b.writeNode(formatScalar(value[key]), 'kwarg-value', `${schemaPath}.${key}`, `${modelPath}.${key}`, value[key]);
  }

  for (const key of (hints.flags ?? [])) {
    if (!value?.[key]) continue;
    sep();
    b.writeNode(key, 'flag', `${schemaPath}.${key}`, `${modelPath}.${key}`, true);
  }
}

// ─── Section Builder ─────────────────────────────────────────────
// Builds one section's text + AST fragment, with offsets starting at 0.
// The final assembly adjusts offsets.

interface SectionResult {
  text: string;
  sectionNode: AstNode;
}

// ─── Main Emitter ────────────────────────────────────────────────

export function buildAstFromModel(
  scene: any,
  formatHints: FormatHints,
  nodeFormats?: Record<string, 'inline' | 'block'>,
): EmitResult {
  const options: EmitterOptions = { formatHints, nodeFormats };
  const sections: SectionResult[] = [];

  // Document metadata
  const meta = renderMetadata(scene);
  if (meta) sections.push(meta);

  // Images
  if (scene.images && Object.keys(scene.images).length > 0) {
    sections.push(renderImages(scene.images));
  }

  // Styles
  if (scene.styles && Object.keys(scene.styles).length > 0) {
    for (const [name, style] of Object.entries(scene.styles)) {
      sections.push(renderStyle(name, style));
    }
  }

  // Objects
  if (scene.objects && scene.objects.length > 0) {
    sections.push(renderObjects(scene.objects, options));
  }

  // Animation
  if (scene.animate) {
    sections.push(renderAnimate(scene.animate));
  }

  // Assemble into document
  return assembleSections(sections);
}

// ─── Section Assembly ────────────────────────────────────────────

function assembleSections(sections: SectionResult[]): EmitResult {
  const docNode = createAstNode({
    dslRole: 'document',
    from: 0,
    to: 0,
    schemaPath: '',
    modelPath: '',
  });

  if (sections.length === 0) {
    docNode.to = 1;
    return { text: '\n', ast: docNode };
  }

  let text = '';
  for (let i = 0; i < sections.length; i++) {
    if (i > 0) text += '\n\n';
    const offset = text.length;
    const section = sections[i];
    text += section.text;

    // Adjust all AST node offsets
    adjustOffsets(section.sectionNode, offset);
    section.sectionNode.parent = docNode;
    docNode.children.push(section.sectionNode);
  }

  text += '\n';
  docNode.to = text.length;

  return { text, ast: docNode };
}

function adjustOffsets(node: AstNode, offset: number): void {
  if (offset === 0) return;
  node.from += offset;
  node.to += offset;
  for (const child of node.children) {
    adjustOffsets(child, offset);
  }
}

// ─── Metadata ────────────────────────────────────────────────────

function renderMetadata(scene: any): SectionResult | null {
  const metaLines: string[] = [];
  if (scene.name) metaLines.push(`name "${scene.name}"`);
  if (scene.description) metaLines.push(`description "${scene.description}"`);
  if (scene.background) metaLines.push(`background "${scene.background}"`);
  if (scene.viewport) metaLines.push(`viewport (${scene.viewport.width},${scene.viewport.height})`);
  if (Array.isArray(scene.use) && scene.use.length > 0) metaLines.push(`use [${scene.use.join(', ')}]`);
  if (metaLines.length === 0) return null;

  const text = metaLines.join('\n');
  const sectionNode = createAstNode({
    dslRole: 'section',
    from: 0,
    to: text.length,
    schemaPath: 'metadata',
    modelPath: 'metadata',
  });

  return { text, sectionNode };
}

// ─── Images ──────────────────────────────────────────────────────

function renderImages(images: Record<string, string>): SectionResult {
  const sectionNode = createAstNode({
    dslRole: 'section',
    from: 0,
    to: 0,
    schemaPath: 'images',
    modelPath: 'images',
  });
  const b = new AstTextBuilder(sectionNode);

  b.write('images');
  for (const [k, v] of Object.entries(images)) {
    b.write(`\n  ${k}: `);
    b.writeNode(`"${v}"`, 'value', `images.${k}`, `images.${k}`, v);
  }

  const text = b.getText();
  sectionNode.to = text.length;
  return { text, sectionNode };
}

// ─── Styles ──────────────────────────────────────────────────────

function renderStyle(name: string, style: any): SectionResult {
  const sectionNode = createAstNode({
    dslRole: 'section',
    from: 0,
    to: 0,
    schemaPath: 'style',
    modelPath: `styles.${name}`,
  });
  const b = new AstTextBuilder(sectionNode);
  const modelPrefix = `styles.${name}`;

  b.write(`style ${name}`);

  if (style.fill) {
    b.write('\n  ');
    b.openCompound('fill', `${modelPrefix}.fill`);
    b.writeNode('fill', 'keyword', 'fill', `${modelPrefix}.fill`, 'fill');
    b.write(' ');
    emitColor(b, style.fill, 'fill', `${modelPrefix}.fill`);
    b.closeCompound();
  }
  if (style.stroke) {
    b.write('\n  ');
    b.openCompound('stroke', `${modelPrefix}.stroke`);
    emitConstruct(b, StrokeSchema, style.stroke, 'stroke', `${modelPrefix}.stroke`);
    b.closeCompound();
  }
  if (style.dash) {
    b.write('\n  ');
    b.openCompound('dash', `${modelPrefix}.dash`);
    emitConstruct(b, DashSchema, style.dash, 'dash', `${modelPrefix}.dash`);
    b.closeCompound();
  }

  // Other style properties
  const skip = new Set(['fill', 'stroke', 'dash', 'layout']);
  for (const [k, v] of Object.entries(style)) {
    if (skip.has(k)) continue;
    b.write('\n  ');
    b.writeNode(k, 'kwarg-key', k, `${modelPrefix}.${k}`, k);
    b.write('=');
    b.writeNode(formatValueText(v), 'kwarg-value', k, `${modelPrefix}.${k}`, v);
  }

  if (style.layout) {
    b.write('\n  ');
    b.openCompound('layout', `${modelPrefix}.layout`);
    emitConstruct(b, LayoutSchema, style.layout, 'layout', `${modelPrefix}.layout`);
    b.closeCompound();
  }

  const text = b.getText();
  sectionNode.to = text.length;
  return { text, sectionNode };
}

// ─── Objects ─────────────────────────────────────────────────────

function renderObjects(objects: any[], options: EmitterOptions): SectionResult {
  const sectionNode = createAstNode({
    dslRole: 'section',
    from: 0,
    to: 0,
    schemaPath: 'objects',
    modelPath: 'objects',
  });
  const b = new AstTextBuilder(sectionNode);

  for (let i = 0; i < objects.length; i++) {
    if (i > 0) b.write('\n');
    renderNode(b, objects[i], 0, `objects.${objects[i].id}`, options);
  }

  const text = b.getText();
  sectionNode.to = text.length;
  return { text, sectionNode };
}

// ─── Node Rendering ──────────────────────────────────────────────

function shouldRenderBlock(node: any, options: EmitterOptions): boolean {
  const id = node.id;
  if (options.nodeFormats?.[id] === 'inline') return false;
  if (options.nodeFormats?.[id] === 'block') return true;
  if (options.formatHints?.nodes[id]?.display === 'inline') return false;
  if (options.formatHints?.nodes[id]?.display === 'block') return true;
  return countProps(node) > 6;
}

function renderNode(b: AstTextBuilder, node: any, depth: number, modelPrefix: string, options: EmitterOptions): void {
  const indent = '  '.repeat(depth);

  // Connection node
  if (isConnection(node)) {
    renderConnection(b, node, depth, modelPrefix, options);
    return;
  }

  // Explicit path node
  if (isExplicitPath(node)) {
    renderExplicitPath(b, node, depth, modelPrefix, options);
    return;
  }

  const block = shouldRenderBlock(node, options);
  const needsBlockBody = hasBlockOnlyProps(node);

  if (block) {
    renderBlockNode(b, node, depth, modelPrefix, options);
  } else {
    renderInlineNode(b, node, depth, modelPrefix);
    // Block-only props (dash, layout) always need indented lines
    if (needsBlockBody) {
      emitBlockOnlyProps(b, node, depth + 1, modelPrefix);
    }
  }

  // Children
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      b.write('\n');
      renderNode(b, child, depth + 1, `${modelPrefix}.${child.id}`, options);
    }
  }
}

// ─── Inline Node ─────────────────────────────────────────────────

function renderInlineNode(b: AstTextBuilder, node: any, depth: number, modelPrefix: string): void {
  const indent = '  '.repeat(depth);
  const compound = b.openCompound('', modelPrefix);

  if (indent) b.write(indent);
  b.writeNode(node.id, 'value', '', modelPrefix, node.id);

  const head = hasHead(node);
  const opts: PropOpts = { fill: true, stroke: true, layout: true, transform: true };
  const props = hasNodeProps(node, opts);

  if (head && props) {
    b.write(': ');
    emitHead(b, node, modelPrefix);
    b.write(' ');
    emitNodeProps(b, node, modelPrefix, opts);
  } else if (head) {
    b.write(': ');
    emitHead(b, node, modelPrefix);
  } else if (props) {
    b.write(': ');
    emitNodeProps(b, node, modelPrefix, opts);
  } else {
    b.write(':');
  }

  b.closeCompound();
}

// ─── Block Node ──────────────────────────────────────────────────

function renderBlockNode(b: AstTextBuilder, node: any, depth: number, modelPrefix: string, options: EmitterOptions): void {
  const indent = '  '.repeat(depth);
  const childIndent = '  '.repeat(depth + 1);
  const head = hasHead(node);
  const compound = b.openCompound('', modelPrefix);

  if (indent) b.write(indent);
  b.writeNode(node.id, 'value', '', modelPrefix, node.id);

  // Inline-only suffix in block mode: fill/stroke move onto their own lines.
  const suffixOpts: PropOpts = { fill: false, stroke: false, layout: true, transform: true };
  const inlineSuffix = hasNodeProps(node, suffixOpts);

  if (head) {
    b.write(': ');
    emitHead(b, node, modelPrefix);
    if (inlineSuffix) {
      b.write(' ');
      emitNodeProps(b, node, modelPrefix, suffixOpts);
    }
  } else if (inlineSuffix) {
    b.write(':');
    b.write(' ');
    emitNodeProps(b, node, modelPrefix, suffixOpts);
  } else {
    b.write(':');
  }

  // Block properties: fill, stroke on their own indented lines.
  if (node.fill && hasOwn(node, 'fill')) {
    b.write(`\n${childIndent}`);
    b.openCompound('fill', `${modelPrefix}.fill`);
    b.writeNode('fill', 'keyword', 'fill', `${modelPrefix}.fill`, 'fill');
    b.write(' ');
    emitColor(b, node.fill, 'fill', `${modelPrefix}.fill`);
    b.closeCompound();
  }
  if (node.stroke && hasOwn(node, 'stroke')) {
    b.write(`\n${childIndent}`);
    b.openCompound('stroke', `${modelPrefix}.stroke`);
    emitConstruct(b, StrokeSchema, node.stroke, 'stroke', `${modelPrefix}.stroke`);
    b.closeCompound();
  }

  // Block-only props (dash, layout)
  emitBlockOnlyProps(b, node, depth + 1, modelPrefix);

  b.closeCompound();
}

// ─── Connection ──────────────────────────────────────────────────

/**
 * Emit a connection's path flags and kwargs (smooth/closed/bend/radius/…),
 * driven by the PathGeomSchema route-variant hints. The `route` positional is
 * emitted separately by the caller; everything else flows from the schema.
 */
function emitPathModifiers(b: AstTextBuilder, path: any, modelPrefix: string): void {
  const hints = getConstructHints(PathGeomSchema);
  const route = hints?.variants?.find((v: any) => v.when === 'route')?.hints;
  if (!route) return;

  for (const flag of (route.flags ?? [])) {
    if (path[flag]) {
      b.write(' ');
      b.writeNode(flag, 'flag', `path.${flag}`, `${modelPrefix}.path.${flag}`, true);
    }
  }
  for (const key of (route.kwargs ?? [])) {
    if (path[key] === undefined) continue;
    b.write(' ');
    b.writeNode(key, 'kwarg-key', `path.${key}`, `${modelPrefix}.path.${key}`, key);
    b.write('=');
    b.writeNode(formatScalar(path[key]), 'kwarg-value', `path.${key}`, `${modelPrefix}.path.${key}`, path[key]);
  }
}

function renderConnection(b: AstTextBuilder, node: any, depth: number, modelPrefix: string, options: EmitterOptions): void {
  const indent = '  '.repeat(depth);
  const compound = b.openCompound('', modelPrefix);

  if (indent) b.write(indent);
  b.writeNode(node.id, 'value', '', modelPrefix, node.id);
  b.write(': ');

  const route = node.path.route;
  for (let i = 0; i < route.length; i++) {
    if (i > 0) b.write(' -> ');
    emitPointRef(b, route[i], `path.route.${i}`, `${modelPrefix}.path.route.${i}`);
  }

  // Path modifiers (flags + kwargs) are driven by the route variant's hints,
  // so adding a connection modifier to the schema surfaces it here for free.
  emitPathModifiers(b, node.path, modelPrefix);

  // Inline props (no path, no transform for connections)
  const connOpts: PropOpts = { fill: true, stroke: true, layout: false, transform: false };
  if (hasNodeProps(node, connOpts)) {
    b.write(' ');
    emitNodeProps(b, node, modelPrefix, connOpts);
  }

  // Block-only props (dash, layout) even on connections
  emitBlockOnlyProps(b, node, depth + 1, modelPrefix);

  b.closeCompound();
}

// ─── Explicit Path ───────────────────────────────────────────────

function renderExplicitPath(b: AstTextBuilder, node: any, depth: number, modelPrefix: string, options: EmitterOptions): void {
  const indent = '  '.repeat(depth);
  const compound = b.openCompound('', modelPrefix);

  if (indent) b.write(indent);
  b.writeNode(node.id, 'value', '', modelPrefix, node.id);
  b.write(': ');
  b.writeNode('path', 'keyword', 'path', `${modelPrefix}.path`, 'path');
  b.write(' ');

  const points = node.path.points;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) b.write(' ');
    const p = points[i];
    b.write('(');
    b.writeNode(String(p[0]), 'value', `path.points.${i}.0`, `${modelPrefix}.path.points.${i}.0`, p[0]);
    b.write(',');
    b.writeNode(String(p[1]), 'value', `path.points.${i}.1`, `${modelPrefix}.path.points.${i}.1`, p[1]);
    b.write(')');
  }

  if (node.path.closed) b.write(' closed');
  if (node.path.smooth) b.write(' smooth');

  // Inline props (no path for explicit paths)
  const pathOpts: PropOpts = { fill: true, stroke: true, layout: false, transform: true };
  if (hasNodeProps(node, pathOpts)) {
    b.write(' ');
    emitNodeProps(b, node, modelPrefix, pathOpts);
  }

  // Block-only props
  emitBlockOnlyProps(b, node, depth + 1, modelPrefix);

  b.closeCompound();
}

// ─── Geometry Emission ───────────────────────────────────────────

function emitGeometry(b: AstTextBuilder, node: any, modelPrefix: string): void {
  const emit = (schema: any, val: any, key: string) => {
    b.openCompound(key, `${modelPrefix}.${key}`);
    emitConstruct(b, schema, val, key, `${modelPrefix}.${key}`);
    b.closeCompound();
  };
  if (node.rect) emit(RectGeomSchema, node.rect, 'rect');
  else if (node.ellipse) emit(EllipseGeomSchema, node.ellipse, 'ellipse');
  else if (node.text) emit(TextGeomSchema, node.text, 'text');
  else if (node.image) emit(ImageGeomSchema, node.image, 'image');
  else if (node.camera !== undefined) emit(CameraSchema, node.camera ?? {}, 'camera');
}

// ─── Template Emission ───────────────────────────────────────────

function emitTemplate(b: AstTextBuilder, node: any, modelPrefix: string): void {
  b.openCompound('template', `${modelPrefix}.template`);
  b.writeNode('template', 'keyword', 'template', `${modelPrefix}.template`, 'template');
  b.write(' ');
  b.writeNode(String(node.template), 'value', 'template', `${modelPrefix}.template`, node.template);
  if (node.props) {
    for (const [k, v] of Object.entries(node.props)) {
      b.write(' ');
      b.writeNode(k, 'kwarg-key', `props.${k}`, `${modelPrefix}.props.${k}`, k);
      b.write('=');
      b.writeNode(formatScalar(v), 'kwarg-value', `props.${k}`, `${modelPrefix}.props.${k}`, v);
    }
  }
  b.closeCompound();
}

/** Emit the node "head" — geometry or template. Returns true if anything was written. */
function emitHead(b: AstTextBuilder, node: any, modelPrefix: string): void {
  if (hasGeometry(node)) emitGeometry(b, node, modelPrefix);
  else if (node.template) emitTemplate(b, node, modelPrefix);
}

function hasGeometry(node: any): boolean {
  return !!(node.rect || node.ellipse || node.text || node.image || node.camera !== undefined);
}

function hasHead(node: any): boolean {
  return hasGeometry(node) || !!node.template;
}

// ─── Color Emission ──────────────────────────────────────────────

function emitColor(b: AstTextBuilder, color: any, schemaPath: string, modelPath: string, parent?: AstNode): void {
  // String: named or hex — single span
  if (typeof color === 'string') {
    b.writeNode(color, 'value', schemaPath, modelPath, color, parent);
    return;
  }
  // Named + alpha
  if ('name' in color && 'a' in color && !('h' in color) && !('r' in color)) {
    b.writeNode(color.name, 'value', `${schemaPath}.name`, `${modelPath}.name`, color.name, parent);
    b.write(' a=');
    b.writeNode(String(color.a), 'kwarg-value', `${schemaPath}.a`, `${modelPath}.a`, color.a, parent);
    return;
  }
  // Hex + alpha
  if ('hex' in color && 'a' in color) {
    b.writeNode(color.hex, 'value', `${schemaPath}.hex`, `${modelPath}.hex`, color.hex, parent);
    b.write(' a=');
    b.writeNode(String(color.a), 'kwarg-value', `${schemaPath}.a`, `${modelPath}.a`, color.a, parent);
    return;
  }
  // RGB
  if ('r' in color) {
    const name = rgbToName(color);
    if (name) {
      if (color.a !== undefined) {
        b.writeNode(name, 'value', schemaPath, modelPath, color, parent);
        b.write(' a=');
        b.writeNode(String(color.a), 'kwarg-value', `${schemaPath}.a`, `${modelPath}.a`, color.a, parent);
      } else {
        b.writeNode(name, 'value', schemaPath, modelPath, color, parent);
      }
      return;
    }
    b.write('rgb ');
    b.writeNode(String(color.r), 'value', `${schemaPath}.r`, `${modelPath}.r`, color.r, parent);
    b.write(' ');
    b.writeNode(String(color.g), 'value', `${schemaPath}.g`, `${modelPath}.g`, color.g, parent);
    b.write(' ');
    b.writeNode(String(color.b), 'value', `${schemaPath}.b`, `${modelPath}.b`, color.b, parent);
    if (color.a !== undefined) {
      b.write(' a=');
      b.writeNode(String(color.a), 'kwarg-value', `${schemaPath}.a`, `${modelPath}.a`, color.a, parent);
    }
    return;
  }
  // HSL
  if ('h' in color) {
    const name = hslToName({ h: color.h, s: color.s, l: color.l });
    if (name) {
      if (color.a !== undefined) {
        b.writeNode(name, 'value', schemaPath, modelPath, color, parent);
        b.write(' a=');
        b.writeNode(String(color.a), 'kwarg-value', `${schemaPath}.a`, `${modelPath}.a`, color.a, parent);
      } else {
        b.writeNode(name, 'value', schemaPath, modelPath, color, parent);
      }
      return;
    }
    b.write('hsl ');
    b.writeNode(String(color.h), 'value', `${schemaPath}.h`, `${modelPath}.h`, color.h, parent);
    b.write(' ');
    b.writeNode(String(color.s), 'value', `${schemaPath}.s`, `${modelPath}.s`, color.s, parent);
    b.write(' ');
    b.writeNode(String(color.l), 'value', `${schemaPath}.l`, `${modelPath}.l`, color.l, parent);
    if (color.a !== undefined) {
      b.write(' a=');
      b.writeNode(String(color.a), 'kwarg-value', `${schemaPath}.a`, `${modelPath}.a`, color.a, parent);
    }
    return;
  }
  // Fallback
  b.writeNode(String(color), 'value', schemaPath, modelPath, color, parent);
}

// ─── Value Formatting ────────────────────────────────────────────

function formatValueText(value: any): string {
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'string') {
    if (/\s/.test(value)) return `"${value}"`;
    return value;
  }
  if (Array.isArray(value)) {
    return `(${value.join(',')})`;
  }
  return String(value);
}

// ─── Point Ref Emission ──────────────────────────────────────────

function emitPointRef(b: AstTextBuilder, ref: any, schemaPath: string, modelPath: string): void {
  if (typeof ref === 'string') {
    b.writeNode(ref, 'value', schemaPath, modelPath, ref);
    return;
  }
  if (Array.isArray(ref)) {
    if (ref.length === 2 && typeof ref[0] === 'number') {
      b.write('(');
      b.writeNode(String(ref[0]), 'value', `${schemaPath}.0`, `${modelPath}.0`, ref[0]);
      b.write(',');
      b.writeNode(String(ref[1]), 'value', `${schemaPath}.1`, `${modelPath}.1`, ref[1]);
      b.write(')');
      return;
    }
    if (ref.length === 3 && typeof ref[0] === 'string') {
      b.write('(');
      b.writeNode(`"${ref[0]}"`, 'value', `${schemaPath}.0`, `${modelPath}.0`, ref[0]);
      b.write(',');
      b.writeNode(String(ref[1]), 'value', `${schemaPath}.1`, `${modelPath}.1`, ref[1]);
      b.write(',');
      b.writeNode(String(ref[2]), 'value', `${schemaPath}.2`, `${modelPath}.2`, ref[2]);
      b.write(')');
      return;
    }
    b.writeNode(`(${ref.join(',')})`, 'value', schemaPath, modelPath, ref);
    return;
  }
  b.writeNode(String(ref), 'value', schemaPath, modelPath, ref);
}

function hasTransformContent(transform: any): boolean {
  return transform.x !== undefined || transform.y !== undefined ||
    transform.rotation !== undefined || transform.scale !== undefined ||
    transform.anchor !== undefined || transform.pathFollow !== undefined ||
    transform.pathProgress !== undefined;
}

// ─── Unified Node Property Emission ──────────────────────────────
// One schema-driven emitter for every node property, replacing the four
// near-identical inline emitters. `opts` selects which properties apply to
// the current context (block mode pushes fill/stroke onto their own lines;
// connections drop layout/transform; explicit paths drop layout).

interface PropOpts {
  fill?: boolean;
  stroke?: boolean;
  layout?: boolean;
  transform?: boolean;
}

function emitNodeProps(b: AstTextBuilder, node: any, mp: string, opts: PropOpts): void {
  let first = true;
  const space = () => { if (!first) b.write(' '); first = false; };

  if (node.style && hasOwn(node, 'style')) {
    space();
    b.write('@');
    b.writeNode(node.style, 'sigil', 'style', `${mp}.style`, node.style);
  }
  if (opts.fill && node.fill && hasOwn(node, 'fill')) {
    space();
    b.openCompound('fill', `${mp}.fill`);
    b.writeNode('fill', 'keyword', 'fill', `${mp}.fill`, 'fill');
    b.write(' ');
    emitColor(b, node.fill, 'fill', `${mp}.fill`);
    b.closeCompound();
  }
  if (opts.stroke && node.stroke && hasOwn(node, 'stroke')) {
    space();
    b.openCompound('stroke', `${mp}.stroke`);
    emitConstruct(b, StrokeSchema, node.stroke, 'stroke', `${mp}.stroke`);
    b.closeCompound();
  }
  if (hasOwn(node, 'opacity') && node.opacity !== undefined) {
    space();
    b.writeNode('opacity', 'kwarg-key', 'opacity', `${mp}.opacity`, 'opacity');
    b.write('=');
    b.writeNode(String(node.opacity), 'kwarg-value', 'opacity', `${mp}.opacity`, node.opacity);
  }
  if (hasOwn(node, 'visible') && node.visible === false) {
    space();
    b.writeNode('visible', 'kwarg-key', 'visible', `${mp}.visible`, 'visible');
    b.write('=');
    b.writeNode('false', 'kwarg-value', 'visible', `${mp}.visible`, false);
  }
  if (hasOwn(node, 'depth') && node.depth !== undefined) {
    space();
    b.writeNode('depth', 'kwarg-key', 'depth', `${mp}.depth`, 'depth');
    b.write('=');
    b.writeNode(String(node.depth), 'kwarg-value', 'depth', `${mp}.depth`, node.depth);
  }
  if (opts.layout && node.layout && hasOwn(node, 'layout') && !isBlockLayout(node.layout)) {
    space();
    b.openCompound('layout', `${mp}.layout`);
    emitConstruct(b, LayoutSchema, node.layout, 'layout', `${mp}.layout`);
    b.closeCompound();
  }
  if (opts.transform && node.transform && hasOwn(node, 'transform') && hasTransformContent(node.transform)) {
    space();
    b.openCompound('transform', `${mp}.transform`);
    emitConstruct(b, TransformSchema, node.transform, 'transform', `${mp}.transform`);
    b.closeCompound();
  }
}

/** Whether emitNodeProps would emit anything for the given options. */
function hasNodeProps(node: any, opts: PropOpts): boolean {
  if (node.style && hasOwn(node, 'style')) return true;
  if (opts.fill && node.fill && hasOwn(node, 'fill')) return true;
  if (opts.stroke && node.stroke && hasOwn(node, 'stroke')) return true;
  if (hasOwn(node, 'opacity') && node.opacity !== undefined) return true;
  if (hasOwn(node, 'visible') && node.visible === false) return true;
  if (hasOwn(node, 'depth') && node.depth !== undefined) return true;
  if (opts.layout && node.layout && hasOwn(node, 'layout') && !isBlockLayout(node.layout)) return true;
  if (opts.transform && node.transform && hasOwn(node, 'transform') && hasTransformContent(node.transform)) return true;
  return false;
}

// ─── Block-Only Props Emission ───────────────────────────────────
// dash and block-layout always live on their own indented lines.

function emitBlockOnlyProps(b: AstTextBuilder, node: any, depth: number, modelPrefix: string): void {
  const indent = '  '.repeat(depth);
  if (node.dash && hasOwn(node, 'dash')) {
    b.write(`\n${indent}`);
    b.openCompound('dash', `${modelPrefix}.dash`);
    emitConstruct(b, DashSchema, node.dash, 'dash', `${modelPrefix}.dash`);
    b.closeCompound();
  }
  if (node.layout && hasOwn(node, 'layout') && isBlockLayout(node.layout)) {
    b.write(`\n${indent}`);
    b.openCompound('layout', `${modelPrefix}.layout`);
    emitConstruct(b, LayoutSchema, node.layout, 'layout', `${modelPrefix}.layout`);
    b.closeCompound();
  }
}

// ─── Animation ───────────────────────────────────────────────────

function renderAnimate(animate: any): SectionResult {
  const sectionNode = createAstNode({
    dslRole: 'section',
    from: 0,
    to: 0,
    schemaPath: 'animate',
    modelPath: 'animate',
  });
  const b = new AstTextBuilder(sectionNode);

  // Header line
  b.write('animate ');
  b.writeNode(`${animate.duration}`, 'value', 'duration', 'animate.duration', animate.duration);
  if (animate.loop) b.write(' loop');
  if (animate.autoKey) b.write(' autoKey');
  if (animate.easing) {
    b.write(' easing=');
    b.writeNode(animate.easing, 'kwarg-value', 'easing', 'animate.easing', animate.easing);
  }

  // Chapters
  if (animate.chapters) {
    for (let i = 0; i < animate.chapters.length; i++) {
      const ch = animate.chapters[i];
      b.write(`\n  chapter `);
      b.writeNode(`"${ch.name}"`, 'value', `chapters.${i}.name`, `animate.chapters.${i}.name`, ch.name);
      b.write(' at ');
      b.writeNode(String(ch.time), 'value', `chapters.${i}.time`, `animate.chapters.${i}.time`, ch.time);
    }
  }

  // Keyframes
  if (animate.keyframes) {
    for (let kfIdx = 0; kfIdx < animate.keyframes.length; kfIdx++) {
      const kf = animate.keyframes[kfIdx];
      const timeStr = kf.plus !== undefined ? `+${kf.plus}` : String(kf.time);
      const changeEntries = Object.entries(kf.changes || {});

      if (changeEntries.length === 0) continue;

      // Block-level easing is emitted right after the time token —
      // `1.5 easing=easeInCubic  path: value`. Emitting it after the change
      // instead would be re-parsed as a change-level easing ({ value, easing }),
      // corrupting the round-trip.
      b.write(`\n  `);
      b.writeNode(timeStr, 'value', `keyframes.${kfIdx}.time`, `animate.keyframes.${kfIdx}.time`, kf.time);
      if (kf.easing) {
        b.write(' easing=');
        b.writeNode(kf.easing, 'kwarg-value', `keyframes.${kfIdx}.easing`, `animate.keyframes.${kfIdx}.easing`, kf.easing);
      }
      if (kf.delay !== undefined) {
        b.write(' delay=');
        b.writeNode(String(kf.delay), 'kwarg-value', `keyframes.${kfIdx}.delay`, `animate.keyframes.${kfIdx}.delay`, kf.delay);
      }
      b.write('  ');
      const [firstPath, firstVal] = changeEntries[0];
      emitKeyframeChange(b, firstPath, firstVal, kfIdx, 0);
      for (let i = 1; i < changeEntries.length; i++) {
        const [path, val] = changeEntries[i];
        b.write('\n    ');
        emitKeyframeChange(b, path, val, kfIdx, i);
      }
    }
  }

  const text = b.getText();
  sectionNode.to = text.length;
  return { text, sectionNode };
}

function emitKeyframeChange(b: AstTextBuilder, path: string, val: any, kfIdx: number, changeIdx: number): void {
  const changePrefix = `animate.keyframes.${kfIdx}.changes.${changeIdx}`;

  // Color value
  if (isColor(val)) {
    b.writeNode(path, 'value', `keyframes.${kfIdx}.changes.${changeIdx}.path`, changePrefix + '.path', path);
    b.write(': ');
    emitColor(b, val, `keyframes.${kfIdx}.changes.${changeIdx}.value`, changePrefix + '.value');
    return;
  }

  // Property change with easing: { value, easing }
  if (typeof val === 'object' && val !== null && !Array.isArray(val) && 'value' in val && 'easing' in val) {
    b.writeNode(path, 'value', `keyframes.${kfIdx}.changes.${changeIdx}.path`, changePrefix + '.path', path);
    b.write(': ');
    if (isColor(val.value)) {
      emitColor(b, val.value, `keyframes.${kfIdx}.changes.${changeIdx}.value`, changePrefix + '.value');
    } else {
      b.writeNode(formatValueText(val.value), 'value', `keyframes.${kfIdx}.changes.${changeIdx}.value`, changePrefix + '.value', val.value);
    }
    b.write(' easing=');
    b.writeNode(val.easing, 'kwarg-value', `keyframes.${kfIdx}.changes.${changeIdx}.easing`, changePrefix + '.easing', val.easing);
    return;
  }

  // Regular value
  b.writeNode(path, 'value', `keyframes.${kfIdx}.changes.${changeIdx}.path`, changePrefix + '.path', path);
  b.write(': ');
  b.writeNode(formatValueText(val), 'value', `keyframes.${kfIdx}.changes.${changeIdx}.value`, changePrefix + '.value', val);
}
