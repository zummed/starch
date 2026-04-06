import { hslToName, rgbToName, isColor } from '../types/color';
import type { FormatHints } from './formatHints';
import type { AstNode } from './astTypes';
import { createAstNode } from './astTypes';

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
  if (scene.viewport) metaLines.push(`viewport ${scene.viewport.width}x${scene.viewport.height}`);
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
    b.writeNode('stroke', 'keyword', 'stroke', `${modelPrefix}.stroke`, 'stroke');
    b.write(' ');
    emitStroke(b, style.stroke, modelPrefix);
    b.closeCompound();
  }
  if (style.dash) {
    b.write('\n  ');
    b.openCompound('dash', `${modelPrefix}.dash`);
    emitDashBlock(b, style.dash, modelPrefix);
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
    emitLayout(b, style.layout, modelPrefix);
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

  const hasGeom = !!(node.rect || node.ellipse || node.text || node.image || node.camera !== undefined);

  // Check if we have inline props (need to test without actually emitting)
  const propsStr = buildInlinePropsText(node);

  if (hasGeom && propsStr) {
    b.write(': ');
    emitGeometry(b, node, modelPrefix);
    b.write(' ');
    emitInlineProps(b, node, modelPrefix);
  } else if (hasGeom) {
    b.write(': ');
    emitGeometry(b, node, modelPrefix);
  } else if (propsStr) {
    b.write(': ');
    emitInlineProps(b, node, modelPrefix);
  } else {
    b.write(':');
  }

  b.closeCompound();
}

// ─── Block Node ──────────────────────────────────────────────────

function renderBlockNode(b: AstTextBuilder, node: any, depth: number, modelPrefix: string, options: EmitterOptions): void {
  const indent = '  '.repeat(depth);
  const childIndent = '  '.repeat(depth + 1);
  const hasGeom = !!(node.rect || node.ellipse || node.text || node.image || node.camera !== undefined);
  const compound = b.openCompound('', modelPrefix);

  if (indent) b.write(indent);
  b.writeNode(node.id, 'value', '', modelPrefix, node.id);

  // Build inline-only parts text (no fill/stroke in block mode)
  const inlineSuffix = buildBlockInlineOnlyPropsText(node);

  if (hasGeom) {
    b.write(': ');
    emitGeometry(b, node, modelPrefix);
    if (inlineSuffix) {
      b.write(' ');
      emitBlockInlineOnlyProps(b, node, modelPrefix);
    }
  } else if (inlineSuffix) {
    b.write(':');
    b.write(' ');
    emitBlockInlineOnlyProps(b, node, modelPrefix);
  } else {
    b.write(':');
  }

  // Block properties: fill, stroke
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
    b.writeNode('stroke', 'keyword', 'stroke', `${modelPrefix}.stroke`, 'stroke');
    b.write(' ');
    emitStroke(b, node.stroke, modelPrefix);
    b.closeCompound();
  }

  // Block-only props (dash, layout)
  emitBlockOnlyProps(b, node, depth + 1, modelPrefix);

  b.closeCompound();
}

// ─── Connection ──────────────────────────────────────────────────

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

  // Path modifiers
  const pathProps = node.path;
  if (pathProps.smooth) b.write(' smooth');
  if (pathProps.closed) b.write(' closed');
  if (pathProps.bend !== undefined) {
    b.write(' ');
    b.writeNode('bend', 'kwarg-key', 'path.bend', `${modelPrefix}.path.bend`, 'bend');
    b.write('=');
    b.writeNode(String(pathProps.bend), 'kwarg-value', 'path.bend', `${modelPrefix}.path.bend`, pathProps.bend);
  }
  if (pathProps.radius !== undefined) {
    b.write(' ');
    b.writeNode('radius', 'kwarg-key', 'path.radius', `${modelPrefix}.path.radius`, 'radius');
    b.write('=');
    b.writeNode(String(pathProps.radius), 'kwarg-value', 'path.radius', `${modelPrefix}.path.radius`, pathProps.radius);
  }
  if (pathProps.gap !== undefined) {
    b.write(' ');
    b.writeNode('gap', 'kwarg-key', 'path.gap', `${modelPrefix}.path.gap`, 'gap');
    b.write('=');
    b.writeNode(String(pathProps.gap), 'kwarg-value', 'path.gap', `${modelPrefix}.path.gap`, pathProps.gap);
  }
  if (pathProps.fromGap !== undefined) {
    b.write(' ');
    b.writeNode('fromGap', 'kwarg-key', 'path.fromGap', `${modelPrefix}.path.fromGap`, 'fromGap');
    b.write('=');
    b.writeNode(String(pathProps.fromGap), 'kwarg-value', 'path.fromGap', `${modelPrefix}.path.fromGap`, pathProps.fromGap);
  }
  if (pathProps.toGap !== undefined) {
    b.write(' ');
    b.writeNode('toGap', 'kwarg-key', 'path.toGap', `${modelPrefix}.path.toGap`, 'toGap');
    b.write('=');
    b.writeNode(String(pathProps.toGap), 'kwarg-value', 'path.toGap', `${modelPrefix}.path.toGap`, pathProps.toGap);
  }
  if (pathProps.drawProgress !== undefined) {
    b.write(' ');
    b.writeNode('drawProgress', 'kwarg-key', 'path.drawProgress', `${modelPrefix}.path.drawProgress`, 'drawProgress');
    b.write('=');
    b.writeNode(String(pathProps.drawProgress), 'kwarg-value', 'path.drawProgress', `${modelPrefix}.path.drawProgress`, pathProps.drawProgress);
  }

  // Inline props (no path, no transform for connections)
  const inlineProps = buildInlinePropsWithoutPathAndTransformText(node);
  if (inlineProps) {
    b.write(' ');
    emitInlinePropsWithoutPathAndTransform(b, node, modelPrefix);
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
  const inlineProps = buildInlinePropsWithoutPathText(node);
  if (inlineProps) {
    b.write(' ');
    emitInlinePropsWithoutPath(b, node, modelPrefix);
  }

  // Block-only props
  emitBlockOnlyProps(b, node, depth + 1, modelPrefix);

  b.closeCompound();
}

// ─── Geometry Emission ───────────────────────────────────────────

function emitGeometry(b: AstTextBuilder, node: any, modelPrefix: string): void {
  if (node.rect) {
    const geomCompound = b.openCompound('rect', `${modelPrefix}.rect`);
    b.writeNode('rect', 'keyword', 'rect', `${modelPrefix}.rect`, 'rect');
    b.write(' ');
    b.writeNode(String(node.rect.w), 'value', 'rect.w', `${modelPrefix}.rect.w`, node.rect.w);
    b.write('x');
    b.writeNode(String(node.rect.h), 'value', 'rect.h', `${modelPrefix}.rect.h`, node.rect.h);
    if (node.rect.radius !== undefined) {
      b.write(' ');
      b.writeNode('radius', 'kwarg-key', 'rect.radius', `${modelPrefix}.rect.radius`, 'radius');
      b.write('=');
      b.writeNode(String(node.rect.radius), 'kwarg-value', 'rect.radius', `${modelPrefix}.rect.radius`, node.rect.radius);
    }
    b.closeCompound();
  } else if (node.ellipse) {
    const geomCompound = b.openCompound('ellipse', `${modelPrefix}.ellipse`);
    b.writeNode('ellipse', 'keyword', 'ellipse', `${modelPrefix}.ellipse`, 'ellipse');
    b.write(' ');
    b.writeNode(String(node.ellipse.rx * 2), 'value', 'ellipse.rx', `${modelPrefix}.ellipse.rx`, node.ellipse.rx);
    b.write('x');
    b.writeNode(String(node.ellipse.ry * 2), 'value', 'ellipse.ry', `${modelPrefix}.ellipse.ry`, node.ellipse.ry);
    b.closeCompound();
  } else if (node.text) {
    const geomCompound = b.openCompound('text', `${modelPrefix}.text`);
    b.writeNode('text', 'keyword', 'text', `${modelPrefix}.text`, 'text');
    b.write(' ');
    b.writeNode(`"${node.text.content}"`, 'value', 'text.content', `${modelPrefix}.text.content`, node.text.content);
    if (node.text.size !== undefined) {
      b.write(' ');
      b.writeNode('size', 'kwarg-key', 'text.size', `${modelPrefix}.text.size`, 'size');
      b.write('=');
      b.writeNode(String(node.text.size), 'kwarg-value', 'text.size', `${modelPrefix}.text.size`, node.text.size);
    }
    if (node.text.lineHeight !== undefined) {
      b.write(' ');
      b.writeNode('lineHeight', 'kwarg-key', 'text.lineHeight', `${modelPrefix}.text.lineHeight`, 'lineHeight');
      b.write('=');
      b.writeNode(String(node.text.lineHeight), 'kwarg-value', 'text.lineHeight', `${modelPrefix}.text.lineHeight`, node.text.lineHeight);
    }
    if (node.text.align !== undefined) {
      b.write(' ');
      b.writeNode('align', 'kwarg-key', 'text.align', `${modelPrefix}.text.align`, 'align');
      b.write('=');
      b.writeNode(String(node.text.align), 'kwarg-value', 'text.align', `${modelPrefix}.text.align`, node.text.align);
    }
    if (node.text.bold) b.write(' bold');
    if (node.text.mono) b.write(' mono');
    b.closeCompound();
  } else if (node.image) {
    const geomCompound = b.openCompound('image', `${modelPrefix}.image`);
    b.writeNode('image', 'keyword', 'image', `${modelPrefix}.image`, 'image');
    b.write(' ');
    b.writeNode(`"${node.image.src}"`, 'value', 'image.src', `${modelPrefix}.image.src`, node.image.src);
    b.write(' ');
    b.writeNode(String(node.image.w), 'value', 'image.w', `${modelPrefix}.image.w`, node.image.w);
    b.write('x');
    b.writeNode(String(node.image.h), 'value', 'image.h', `${modelPrefix}.image.h`, node.image.h);
    if (node.image.fit !== undefined) {
      b.write(' ');
      b.writeNode('fit', 'kwarg-key', 'image.fit', `${modelPrefix}.image.fit`, 'fit');
      b.write('=');
      b.writeNode(String(node.image.fit), 'kwarg-value', 'image.fit', `${modelPrefix}.image.fit`, node.image.fit);
    }
    b.closeCompound();
  } else if (node.camera !== undefined) {
    const geomCompound = b.openCompound('camera', `${modelPrefix}.camera`);
    b.writeNode('camera', 'keyword', 'camera', `${modelPrefix}.camera`, 'camera');
    const cam = node.camera;
    if (cam.look !== undefined) {
      b.write(' ');
      b.writeNode('look', 'kwarg-key', 'camera.look', `${modelPrefix}.camera.look`, 'look');
      b.write('=');
      b.writeNode(formatValueText(cam.look), 'kwarg-value', 'camera.look', `${modelPrefix}.camera.look`, cam.look);
    }
    if (cam.zoom !== undefined) {
      b.write(' ');
      b.writeNode('zoom', 'kwarg-key', 'camera.zoom', `${modelPrefix}.camera.zoom`, 'zoom');
      b.write('=');
      b.writeNode(String(cam.zoom), 'kwarg-value', 'camera.zoom', `${modelPrefix}.camera.zoom`, cam.zoom);
    }
    if (cam.ratio !== undefined) {
      b.write(' ');
      b.writeNode('ratio', 'kwarg-key', 'camera.ratio', `${modelPrefix}.camera.ratio`, 'ratio');
      b.write('=');
      b.writeNode(String(cam.ratio), 'kwarg-value', 'camera.ratio', `${modelPrefix}.camera.ratio`, cam.ratio);
    }
    if (cam.active === true) b.write(' active');
    b.closeCompound();
  }
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

// ─── Color Text (no AST nodes) ──────────────────────────────────

function formatColorText(color: any): string {
  if (typeof color === 'string') return color;
  if ('name' in color && 'a' in color && !('h' in color) && !('r' in color)) {
    return `${color.name} a=${color.a}`;
  }
  if ('hex' in color && 'a' in color) {
    return `${color.hex} a=${color.a}`;
  }
  if ('r' in color) {
    const name = rgbToName(color);
    if (name) {
      if (color.a !== undefined) return `${name} a=${color.a}`;
      return name;
    }
    let s = `rgb ${color.r} ${color.g} ${color.b}`;
    if (color.a !== undefined) s += ` a=${color.a}`;
    return s;
  }
  if ('h' in color) {
    const name = hslToName({ h: color.h, s: color.s, l: color.l });
    if (name) {
      if (color.a !== undefined) return `${name} a=${color.a}`;
      return name;
    }
    let s = `hsl ${color.h} ${color.s} ${color.l}`;
    if (color.a !== undefined) s += ` a=${color.a}`;
    return s;
  }
  return String(color);
}

// ─── Stroke Emission ─────────────────────────────────────────────

function emitStroke(b: AstTextBuilder, stroke: any, modelPrefix: string): void {
  emitColor(b, stroke.color, 'stroke.color', `${modelPrefix}.stroke.color`);
  if (stroke.width !== undefined) {
    b.write(' ');
    b.writeNode('width', 'kwarg-key', 'stroke.width', `${modelPrefix}.stroke.width`, 'width');
    b.write('=');
    b.writeNode(String(stroke.width), 'kwarg-value', 'stroke.width', `${modelPrefix}.stroke.width`, stroke.width);
  }
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

// ─── Transform Emission ──────────────────────────────────────────

function emitTransform(b: AstTextBuilder, transform: any, modelPrefix: string): void {
  const hasX = transform.x !== undefined;
  const hasY = transform.y !== undefined;

  if (hasX && hasY) {
    b.writeNode('at', 'keyword', 'transform', `${modelPrefix}.transform`, 'at');
    b.write(' ');
    b.writeNode(String(transform.x), 'value', 'transform.x', `${modelPrefix}.transform.x`, transform.x);
    b.write(',');
    b.writeNode(String(transform.y), 'value', 'transform.y', `${modelPrefix}.transform.y`, transform.y);
  } else if (hasX) {
    b.writeNode('at', 'keyword', 'transform', `${modelPrefix}.transform`, 'at');
    b.write(' x=');
    b.writeNode(String(transform.x), 'value', 'transform.x', `${modelPrefix}.transform.x`, transform.x);
  } else if (hasY) {
    b.writeNode('at', 'keyword', 'transform', `${modelPrefix}.transform`, 'at');
    b.write(' y=');
    b.writeNode(String(transform.y), 'value', 'transform.y', `${modelPrefix}.transform.y`, transform.y);
  }

  const hasPosition = hasX || hasY;

  // Extras
  const extras: Array<{ key: string; schemaKey: string }> = [];
  if (transform.rotation !== undefined) extras.push({ key: 'rotation', schemaKey: 'transform.rotation' });
  if (transform.scale !== undefined) extras.push({ key: 'scale', schemaKey: 'transform.scale' });
  if (transform.anchor !== undefined) extras.push({ key: 'anchor', schemaKey: 'transform.anchor' });
  if (transform.pathFollow !== undefined) extras.push({ key: 'pathFollow', schemaKey: 'transform.pathFollow' });
  if (transform.pathProgress !== undefined) extras.push({ key: 'pathProgress', schemaKey: 'transform.pathProgress' });

  for (let i = 0; i < extras.length; i++) {
    const { key, schemaKey } = extras[i];
    if (hasPosition || i > 0) b.write(' ');
    b.writeNode(key, 'kwarg-key', schemaKey, `${modelPrefix}.${schemaKey}`, key);
    b.write('=');
    b.writeNode(formatValueText(transform[key]), 'kwarg-value', schemaKey, `${modelPrefix}.${schemaKey}`, transform[key]);
  }
}

function hasTransformContent(transform: any): boolean {
  return transform.x !== undefined || transform.y !== undefined ||
    transform.rotation !== undefined || transform.scale !== undefined ||
    transform.anchor !== undefined || transform.pathFollow !== undefined ||
    transform.pathProgress !== undefined;
}

function formatTransformText(transform: any): string {
  const hasX = transform.x !== undefined;
  const hasY = transform.y !== undefined;

  let s = 'at ';

  if (hasX && hasY) {
    s += `${transform.x},${transform.y}`;
  } else if (hasX) {
    s += `x=${transform.x}`;
  } else if (hasY) {
    s += `y=${transform.y}`;
  } else {
    s = '';
  }

  const extras: string[] = [];
  if (transform.rotation !== undefined) extras.push(`rotation=${transform.rotation}`);
  if (transform.scale !== undefined) extras.push(`scale=${transform.scale}`);
  if (transform.anchor !== undefined) extras.push(`anchor=${formatValueText(transform.anchor)}`);
  if (transform.pathFollow !== undefined) extras.push(`pathFollow=${transform.pathFollow}`);
  if (transform.pathProgress !== undefined) extras.push(`pathProgress=${transform.pathProgress}`);

  if (s && extras.length > 0) return s + ' ' + extras.join(' ');
  if (s) return s;
  if (extras.length > 0) return extras.join(' ');
  return '';
}

// ─── Dash Emission ───────────────────────────────────────────────

function emitDashBlock(b: AstTextBuilder, dash: any, modelPrefix: string): void {
  b.writeNode('dash', 'keyword', 'dash', `${modelPrefix}.dash`, 'dash');
  b.write(' ');
  b.writeNode(dash.pattern, 'value', 'dash.pattern', `${modelPrefix}.dash.pattern`, dash.pattern);
  if (dash.length !== undefined) {
    b.write(' ');
    b.writeNode('length', 'kwarg-key', 'dash.length', `${modelPrefix}.dash.length`, 'length');
    b.write('=');
    b.writeNode(String(dash.length), 'kwarg-value', 'dash.length', `${modelPrefix}.dash.length`, dash.length);
  }
  if (dash.gap !== undefined) {
    b.write(' ');
    b.writeNode('gap', 'kwarg-key', 'dash.gap', `${modelPrefix}.dash.gap`, 'gap');
    b.write('=');
    b.writeNode(String(dash.gap), 'kwarg-value', 'dash.gap', `${modelPrefix}.dash.gap`, dash.gap);
  }
}

// ─── Layout Emission ─────────────────────────────────────────────

function emitLayout(b: AstTextBuilder, layout: any, modelPrefix: string): void {
  b.writeNode('layout', 'keyword', 'layout', `${modelPrefix}.layout`, 'layout');
  if (layout.type) {
    b.write(' ');
    b.writeNode(layout.type, 'value', 'layout.type', `${modelPrefix}.layout.type`, layout.type);
  }
  if (layout.direction) {
    b.write(' ');
    b.writeNode(layout.direction, 'value', 'layout.direction', `${modelPrefix}.layout.direction`, layout.direction);
  }
  const skip = new Set(['type', 'direction']);
  for (const [k, v] of Object.entries(layout)) {
    if (skip.has(k)) continue;
    b.write(' ');
    b.writeNode(k, 'kwarg-key', `layout.${k}`, `${modelPrefix}.layout.${k}`, k);
    b.write('=');
    b.writeNode(formatValueText(v), 'kwarg-value', `layout.${k}`, `${modelPrefix}.layout.${k}`, v);
  }
}

function emitLayoutHintInline(b: AstTextBuilder, layout: any, modelPrefix: string): boolean {
  const parts: Array<{ key: string; value: any }> = [];
  for (const key of LAYOUT_HINT_KEYS) {
    if (layout[key] !== undefined) parts.push({ key, value: layout[key] });
  }
  if (parts.length === 0) return false;

  b.writeNode('layout', 'keyword', 'layout', `${modelPrefix}.layout`, 'layout');
  for (const { key, value } of parts) {
    b.write(' ');
    b.writeNode(key, 'kwarg-key', `layout.${key}`, `${modelPrefix}.layout.${key}`, key);
    b.write('=');
    b.writeNode(String(value), 'kwarg-value', `layout.${key}`, `${modelPrefix}.layout.${key}`, value);
  }
  return true;
}

// ─── Inline Properties Emission ──────────────────────────────────

function emitInlineProps(b: AstTextBuilder, node: any, modelPrefix: string): void {
  let first = true;
  const space = () => { if (!first) b.write(' '); first = false; };

  if (node.style && hasOwn(node, 'style')) {
    space();
    b.write('@');
    b.writeNode(node.style, 'sigil', 'style', `${modelPrefix}.style`, node.style);
  }
  if (node.fill && hasOwn(node, 'fill')) {
    space();
    b.openCompound('fill', `${modelPrefix}.fill`);
    b.writeNode('fill', 'keyword', 'fill', `${modelPrefix}.fill`, 'fill');
    b.write(' ');
    emitColor(b, node.fill, 'fill', `${modelPrefix}.fill`);
    b.closeCompound();
  }
  if (node.stroke && hasOwn(node, 'stroke')) {
    space();
    b.openCompound('stroke', `${modelPrefix}.stroke`);
    b.writeNode('stroke', 'keyword', 'stroke', `${modelPrefix}.stroke`, 'stroke');
    b.write(' ');
    emitStroke(b, node.stroke, modelPrefix);
    b.closeCompound();
  }
  if (hasOwn(node, 'opacity') && node.opacity !== undefined) {
    space();
    b.writeNode('opacity', 'kwarg-key', 'opacity', `${modelPrefix}.opacity`, 'opacity');
    b.write('=');
    b.writeNode(String(node.opacity), 'kwarg-value', 'opacity', `${modelPrefix}.opacity`, node.opacity);
  }
  if (hasOwn(node, 'visible') && node.visible === false) {
    space();
    b.writeNode('visible', 'kwarg-key', 'visible', `${modelPrefix}.visible`, 'visible');
    b.write('=');
    b.writeNode('false', 'kwarg-value', 'visible', `${modelPrefix}.visible`, false);
  }
  if (hasOwn(node, 'depth') && node.depth !== undefined) {
    space();
    b.writeNode('depth', 'kwarg-key', 'depth', `${modelPrefix}.depth`, 'depth');
    b.write('=');
    b.writeNode(String(node.depth), 'kwarg-value', 'depth', `${modelPrefix}.depth`, node.depth);
  }
  if (node.layout && hasOwn(node, 'layout') && !isBlockLayout(node.layout)) {
    space();
    b.openCompound('layout', `${modelPrefix}.layout`);
    emitLayoutHintInline(b, node.layout, modelPrefix);
    b.closeCompound();
  }
  if (node.transform && hasOwn(node, 'transform')) {
    const t = formatTransformText(node.transform);
    if (t) {
      space();
      b.openCompound('transform', `${modelPrefix}.transform`);
      emitTransform(b, node.transform, modelPrefix);
      b.closeCompound();
    }
  }
}

/** Emit inline-only props for block mode (no fill/stroke) */
function emitBlockInlineOnlyProps(b: AstTextBuilder, node: any, modelPrefix: string): void {
  let first = true;
  const space = () => { if (!first) b.write(' '); first = false; };

  if (node.style && hasOwn(node, 'style')) {
    space();
    b.write('@');
    b.writeNode(node.style, 'sigil', 'style', `${modelPrefix}.style`, node.style);
  }
  if (hasOwn(node, 'opacity') && node.opacity !== undefined) {
    space();
    b.writeNode('opacity', 'kwarg-key', 'opacity', `${modelPrefix}.opacity`, 'opacity');
    b.write('=');
    b.writeNode(String(node.opacity), 'kwarg-value', 'opacity', `${modelPrefix}.opacity`, node.opacity);
  }
  if (hasOwn(node, 'visible') && node.visible === false) {
    space();
    b.writeNode('visible', 'kwarg-key', 'visible', `${modelPrefix}.visible`, 'visible');
    b.write('=');
    b.writeNode('false', 'kwarg-value', 'visible', `${modelPrefix}.visible`, false);
  }
  if (hasOwn(node, 'depth') && node.depth !== undefined) {
    space();
    b.writeNode('depth', 'kwarg-key', 'depth', `${modelPrefix}.depth`, 'depth');
    b.write('=');
    b.writeNode(String(node.depth), 'kwarg-value', 'depth', `${modelPrefix}.depth`, node.depth);
  }
  if (node.layout && hasOwn(node, 'layout') && !isBlockLayout(node.layout)) {
    space();
    emitLayoutHintInline(b, node.layout, modelPrefix);
  }
  if (node.transform && hasOwn(node, 'transform')) {
    const t = formatTransformText(node.transform);
    if (t) {
      space();
      emitTransform(b, node.transform, modelPrefix);
    }
  }
}

/** Emit inline props excluding path-related props and transform (for connections) */
function emitInlinePropsWithoutPathAndTransform(b: AstTextBuilder, node: any, modelPrefix: string): void {
  let first = true;
  const space = () => { if (!first) b.write(' '); first = false; };

  if (node.style && hasOwn(node, 'style')) {
    space();
    b.write('@');
    b.writeNode(node.style, 'sigil', 'style', `${modelPrefix}.style`, node.style);
  }
  if (node.fill && hasOwn(node, 'fill')) {
    space();
    b.openCompound('fill', `${modelPrefix}.fill`);
    b.writeNode('fill', 'keyword', 'fill', `${modelPrefix}.fill`, 'fill');
    b.write(' ');
    emitColor(b, node.fill, 'fill', `${modelPrefix}.fill`);
    b.closeCompound();
  }
  if (node.stroke && hasOwn(node, 'stroke')) {
    space();
    b.openCompound('stroke', `${modelPrefix}.stroke`);
    b.writeNode('stroke', 'keyword', 'stroke', `${modelPrefix}.stroke`, 'stroke');
    b.write(' ');
    emitStroke(b, node.stroke, modelPrefix);
    b.closeCompound();
  }
  if (hasOwn(node, 'opacity') && node.opacity !== undefined) {
    space();
    b.writeNode('opacity', 'kwarg-key', 'opacity', `${modelPrefix}.opacity`, 'opacity');
    b.write('=');
    b.writeNode(String(node.opacity), 'kwarg-value', 'opacity', `${modelPrefix}.opacity`, node.opacity);
  }
  if (hasOwn(node, 'visible') && node.visible === false) {
    space();
    b.writeNode('visible', 'kwarg-key', 'visible', `${modelPrefix}.visible`, 'visible');
    b.write('=');
    b.writeNode('false', 'kwarg-value', 'visible', `${modelPrefix}.visible`, false);
  }
  if (hasOwn(node, 'depth') && node.depth !== undefined) {
    space();
    b.writeNode('depth', 'kwarg-key', 'depth', `${modelPrefix}.depth`, 'depth');
    b.write('=');
    b.writeNode(String(node.depth), 'kwarg-value', 'depth', `${modelPrefix}.depth`, node.depth);
  }
}

/** Emit inline props excluding path-related props (for explicit paths) */
function emitInlinePropsWithoutPath(b: AstTextBuilder, node: any, modelPrefix: string): void {
  let first = true;
  const space = () => { if (!first) b.write(' '); first = false; };

  if (node.style && hasOwn(node, 'style')) {
    space();
    b.write('@');
    b.writeNode(node.style, 'sigil', 'style', `${modelPrefix}.style`, node.style);
  }
  if (node.fill && hasOwn(node, 'fill')) {
    space();
    b.openCompound('fill', `${modelPrefix}.fill`);
    b.writeNode('fill', 'keyword', 'fill', `${modelPrefix}.fill`, 'fill');
    b.write(' ');
    emitColor(b, node.fill, 'fill', `${modelPrefix}.fill`);
    b.closeCompound();
  }
  if (node.stroke && hasOwn(node, 'stroke')) {
    space();
    b.openCompound('stroke', `${modelPrefix}.stroke`);
    b.writeNode('stroke', 'keyword', 'stroke', `${modelPrefix}.stroke`, 'stroke');
    b.write(' ');
    emitStroke(b, node.stroke, modelPrefix);
    b.closeCompound();
  }
  if (hasOwn(node, 'opacity') && node.opacity !== undefined) {
    space();
    b.writeNode('opacity', 'kwarg-key', 'opacity', `${modelPrefix}.opacity`, 'opacity');
    b.write('=');
    b.writeNode(String(node.opacity), 'kwarg-value', 'opacity', `${modelPrefix}.opacity`, node.opacity);
  }
  if (hasOwn(node, 'visible') && node.visible === false) {
    space();
    b.writeNode('visible', 'kwarg-key', 'visible', `${modelPrefix}.visible`, 'visible');
    b.write('=');
    b.writeNode('false', 'kwarg-value', 'visible', `${modelPrefix}.visible`, false);
  }
  if (hasOwn(node, 'depth') && node.depth !== undefined) {
    space();
    b.writeNode('depth', 'kwarg-key', 'depth', `${modelPrefix}.depth`, 'depth');
    b.write('=');
    b.writeNode(String(node.depth), 'kwarg-value', 'depth', `${modelPrefix}.depth`, node.depth);
  }
  if (node.transform && hasOwn(node, 'transform')) {
    const t = formatTransformText(node.transform);
    if (t) {
      space();
      b.openCompound('transform', `${modelPrefix}.transform`);
      emitTransform(b, node.transform, modelPrefix);
      b.closeCompound();
    }
  }
}

// ─── Plain Text Builders (for checking emptiness) ────────────────

function buildInlinePropsText(node: any): string {
  const parts: string[] = [];
  if (node.style && hasOwn(node, 'style')) parts.push(`@${node.style}`);
  if (node.fill && hasOwn(node, 'fill')) parts.push(`fill ${formatColorText(node.fill)}`);
  if (node.stroke && hasOwn(node, 'stroke')) {
    let result = formatColorText(node.stroke.color);
    if (node.stroke.width !== undefined) result += ` width=${node.stroke.width}`;
    parts.push(`stroke ${result}`);
  }
  if (hasOwn(node, 'opacity') && node.opacity !== undefined) parts.push(`opacity=${node.opacity}`);
  if (hasOwn(node, 'visible') && node.visible === false) parts.push('visible=false');
  if (hasOwn(node, 'depth') && node.depth !== undefined) parts.push(`depth=${node.depth}`);
  if (node.layout && hasOwn(node, 'layout') && !isBlockLayout(node.layout)) {
    const hint = formatLayoutHintInlineText(node.layout);
    if (hint) parts.push(hint);
  }
  if (node.transform && hasOwn(node, 'transform')) {
    const t = formatTransformText(node.transform);
    if (t) parts.push(t);
  }
  return parts.join(' ');
}

function buildBlockInlineOnlyPropsText(node: any): string {
  const parts: string[] = [];
  if (node.style && hasOwn(node, 'style')) parts.push(`@${node.style}`);
  if (hasOwn(node, 'opacity') && node.opacity !== undefined) parts.push(`opacity=${node.opacity}`);
  if (hasOwn(node, 'visible') && node.visible === false) parts.push('visible=false');
  if (hasOwn(node, 'depth') && node.depth !== undefined) parts.push(`depth=${node.depth}`);
  if (node.layout && hasOwn(node, 'layout') && !isBlockLayout(node.layout)) {
    const hint = formatLayoutHintInlineText(node.layout);
    if (hint) parts.push(hint);
  }
  if (node.transform && hasOwn(node, 'transform')) {
    const t = formatTransformText(node.transform);
    if (t) parts.push(t);
  }
  return parts.join(' ');
}

function buildInlinePropsWithoutPathAndTransformText(node: any): string {
  const parts: string[] = [];
  if (node.style && hasOwn(node, 'style')) parts.push(`@${node.style}`);
  if (node.fill && hasOwn(node, 'fill')) parts.push(`fill ${formatColorText(node.fill)}`);
  if (node.stroke && hasOwn(node, 'stroke')) {
    let result = formatColorText(node.stroke.color);
    if (node.stroke.width !== undefined) result += ` width=${node.stroke.width}`;
    parts.push(`stroke ${result}`);
  }
  if (hasOwn(node, 'opacity') && node.opacity !== undefined) parts.push(`opacity=${node.opacity}`);
  if (hasOwn(node, 'visible') && node.visible === false) parts.push('visible=false');
  if (hasOwn(node, 'depth') && node.depth !== undefined) parts.push(`depth=${node.depth}`);
  return parts.join(' ');
}

function buildInlinePropsWithoutPathText(node: any): string {
  const parts: string[] = [];
  if (node.style && hasOwn(node, 'style')) parts.push(`@${node.style}`);
  if (node.fill && hasOwn(node, 'fill')) parts.push(`fill ${formatColorText(node.fill)}`);
  if (node.stroke && hasOwn(node, 'stroke')) {
    let result = formatColorText(node.stroke.color);
    if (node.stroke.width !== undefined) result += ` width=${node.stroke.width}`;
    parts.push(`stroke ${result}`);
  }
  if (hasOwn(node, 'opacity') && node.opacity !== undefined) parts.push(`opacity=${node.opacity}`);
  if (hasOwn(node, 'visible') && node.visible === false) parts.push('visible=false');
  if (hasOwn(node, 'depth') && node.depth !== undefined) parts.push(`depth=${node.depth}`);
  if (node.transform && hasOwn(node, 'transform')) {
    const t = formatTransformText(node.transform);
    if (t) parts.push(t);
  }
  return parts.join(' ');
}

function formatLayoutHintInlineText(layout: any): string | null {
  const parts: string[] = [];
  for (const key of LAYOUT_HINT_KEYS) {
    if (layout[key] !== undefined) parts.push(`${key}=${layout[key]}`);
  }
  return parts.length > 0 ? `layout ${parts.join(' ')}` : null;
}

// ─── Block-Only Props Emission ───────────────────────────────────

function emitBlockOnlyProps(b: AstTextBuilder, node: any, depth: number, modelPrefix: string): void {
  const indent = '  '.repeat(depth);
  if (node.dash && hasOwn(node, 'dash')) {
    b.write(`\n${indent}`);
    b.openCompound('dash', `${modelPrefix}.dash`);
    emitDashBlock(b, node.dash, modelPrefix);
    b.closeCompound();
  }
  if (node.layout && hasOwn(node, 'layout') && isBlockLayout(node.layout)) {
    b.write(`\n${indent}`);
    b.openCompound('layout', `${modelPrefix}.layout`);
    emitLayout(b, node.layout, modelPrefix);
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
  b.writeNode(`${animate.duration}s`, 'value', 'duration', 'animate.duration', animate.duration);
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

      if (changeEntries.length === 1) {
        const [path, val] = changeEntries[0];
        b.write(`\n  `);
        b.writeNode(timeStr, 'value', `keyframes.${kfIdx}.time`, `animate.keyframes.${kfIdx}.time`, kf.time);
        b.write('  ');
        emitKeyframeChange(b, path, val, kfIdx, 0);
        if (kf.easing) {
          b.write(' easing=');
          b.writeNode(kf.easing, 'kwarg-value', `keyframes.${kfIdx}.easing`, `animate.keyframes.${kfIdx}.easing`, kf.easing);
        }
      } else {
        // Multiple changes: first on the time line, rest as continuation
        const [firstPath, firstVal] = changeEntries[0];
        b.write(`\n  `);
        b.writeNode(timeStr, 'value', `keyframes.${kfIdx}.time`, `animate.keyframes.${kfIdx}.time`, kf.time);
        b.write('  ');
        emitKeyframeChange(b, firstPath, firstVal, kfIdx, 0);
        if (kf.easing) {
          b.write(' easing=');
          b.writeNode(kf.easing, 'kwarg-value', `keyframes.${kfIdx}.easing`, `animate.keyframes.${kfIdx}.easing`, kf.easing);
        }
        for (let i = 1; i < changeEntries.length; i++) {
          const [path, val] = changeEntries[i];
          b.write('\n    ');
          emitKeyframeChange(b, path, val, kfIdx, i);
        }
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
