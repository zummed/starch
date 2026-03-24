import { DslBuilder } from './dslBuilder';
import { hslToName, rgbToName, isColor } from '../types/color';
import type { FormatHints } from '../dsl/formatHints';
import type { RenderResult } from './schemaSpan';

// ─── Types ────────────────────────────────────────────────────────

interface RendererOptions {
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

// ─── Effect Key Check ────────────────────────────────────────────

function isEffectKey(path: string): boolean {
  return !path.includes('.');
}

// ─── SchemaRenderer ──────────────────────────────────────────────

export class SchemaRenderer {
  private options!: RendererOptions;

  render(scene: any, formatHints: FormatHints, nodeFormats?: Record<string, 'inline' | 'block'>): RenderResult {
    this.options = { formatHints, nodeFormats };

    const sections: RenderResult[] = [];

    // Document metadata
    const metaResult = this.renderMetadata(scene);
    if (metaResult) sections.push(metaResult);

    // Images
    if (scene.images && Object.keys(scene.images).length > 0) {
      sections.push(this.renderImages(scene.images));
    }

    // Styles
    if (scene.styles && Object.keys(scene.styles).length > 0) {
      for (const [name, style] of Object.entries(scene.styles)) {
        sections.push(this.renderStyle(name, style));
      }
    }

    // Objects
    if (scene.objects && scene.objects.length > 0) {
      sections.push(this.renderObjects(scene.objects));
    }

    // Animation
    if (scene.animate) {
      sections.push(this.renderAnimate(scene.animate));
    }

    // Assemble sections with \n\n separators, adjusting span offsets
    return this.assembleSections(sections);
  }

  // ─── Section Assembly ────────────────────────────────────────────

  private assembleSections(sections: RenderResult[]): RenderResult {
    if (sections.length === 0) return { text: '\n', spans: [] };

    const allSpans: RenderResult['spans'] = [];
    let text = '';

    for (let i = 0; i < sections.length; i++) {
      if (i > 0) text += '\n\n';
      const offset = text.length;
      const section = sections[i];
      text += section.text;

      // Adjust span offsets
      for (const span of section.spans) {
        allSpans.push({
          ...span,
          from: span.from + offset,
          to: span.to + offset,
        });
      }
    }

    text += '\n';
    return { text, spans: allSpans };
  }

  // ─── Metadata ────────────────────────────────────────────────────

  private renderMetadata(scene: any): RenderResult | null {
    const metaLines: string[] = [];
    if (scene.name) metaLines.push(`name "${scene.name}"`);
    if (scene.description) metaLines.push(`description "${scene.description}"`);
    if (scene.background) metaLines.push(`background "${scene.background}"`);
    if (scene.viewport) metaLines.push(`viewport ${scene.viewport.width}x${scene.viewport.height}`);
    if (metaLines.length === 0) return null;
    // Metadata doesn't get spans (structural)
    return { text: metaLines.join('\n'), spans: [] };
  }

  // ─── Images ──────────────────────────────────────────────────────

  private renderImages(images: Record<string, string>): RenderResult {
    const b = new DslBuilder('images');
    b.write('images');
    for (const [k, v] of Object.entries(images)) {
      b.write(`\n  ${k}: `);
      b.writeSpan(`"${v}"`, `images.${k}`, `images.${k}`);
    }
    return b.build();
  }

  // ─── Styles ──────────────────────────────────────────────────────

  private renderStyle(name: string, style: any): RenderResult {
    const b = new DslBuilder('style');
    const modelPrefix = `styles.${name}`;

    b.write(`style ${name}`);

    if (style.fill) {
      b.write('\n  fill ');
      this.emitColor(b, style.fill, 'fill', `${modelPrefix}.fill`);
    }
    if (style.stroke) {
      b.write('\n  stroke ');
      this.emitStroke(b, style.stroke, modelPrefix);
    }
    if (style.dash) {
      b.write('\n  ');
      this.emitDashBlock(b, style.dash, modelPrefix);
    }

    // Other style properties
    const skip = new Set(['fill', 'stroke', 'dash', 'layout']);
    for (const [k, v] of Object.entries(style)) {
      if (skip.has(k)) continue;
      b.write(`\n  ${k}=`);
      b.writeSpan(this.formatValueText(v), k, `${modelPrefix}.${k}`);
    }

    if (style.layout) {
      b.write('\n  ');
      this.emitLayout(b, style.layout, modelPrefix);
    }

    return b.build();
  }

  // ─── Objects ─────────────────────────────────────────────────────

  private renderObjects(objects: any[]): RenderResult {
    const b = new DslBuilder('node');
    for (let i = 0; i < objects.length; i++) {
      if (i > 0) b.write('\n');
      this.renderNode(b, objects[i], 0, `objects.${objects[i].id}`);
    }
    return b.build();
  }

  // ─── Node Rendering ──────────────────────────────────────────────

  private renderNode(b: DslBuilder, node: any, depth: number, modelPrefix: string): void {
    const indent = '  '.repeat(depth);

    // Connection node
    if (isConnection(node)) {
      this.renderConnection(b, node, depth, modelPrefix);
      return;
    }

    // Explicit path node
    if (isExplicitPath(node)) {
      this.renderExplicitPath(b, node, depth, modelPrefix);
      return;
    }

    const isBlock = this.shouldRenderBlock(node);
    const needsBlockBody = hasBlockOnlyProps(node);

    if (isBlock) {
      this.renderBlockNode(b, node, depth, modelPrefix);
    } else {
      this.renderInlineNode(b, node, depth, modelPrefix);
      // Block-only props (dash, layout) always need indented lines
      if (needsBlockBody) {
        this.emitBlockOnlyProps(b, node, depth + 1, modelPrefix);
      }
    }

    // Children
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        b.write('\n');
        this.renderNode(b, child, depth + 1, `${modelPrefix}.${child.id}`);
      }
    }
  }

  private shouldRenderBlock(node: any): boolean {
    const id = node.id;
    if (this.options.nodeFormats?.[id] === 'inline') return false;
    if (this.options.nodeFormats?.[id] === 'block') return true;
    if (this.options.formatHints?.nodes[id]?.display === 'inline') return false;
    if (this.options.formatHints?.nodes[id]?.display === 'block') return true;
    return countProps(node) > 6;
  }

  // ─── Inline Node ─────────────────────────────────────────────────

  private renderInlineNode(b: DslBuilder, node: any, depth: number, modelPrefix: string): void {
    const indent = '  '.repeat(depth);
    b.write(`${indent}${node.id}`);

    const hasGeom = !!(node.rect || node.ellipse || node.text || node.image || node.camera !== undefined);

    // Build inline props to check if we have any
    const propsBuilder = new DslBuilder('node');
    this.emitInlineProps(propsBuilder, node, modelPrefix);
    const propsResult = propsBuilder.build();
    const propsStr = propsResult.text;

    if (hasGeom && propsStr) {
      b.write(': ');
      this.emitGeometry(b, node, modelPrefix);
      b.write(' ');
      // Re-emit inline props directly into main builder
      this.emitInlineProps(b, node, modelPrefix);
    } else if (hasGeom) {
      b.write(': ');
      this.emitGeometry(b, node, modelPrefix);
    } else if (propsStr) {
      b.write(': ');
      this.emitInlineProps(b, node, modelPrefix);
    } else {
      b.write(':');
    }
  }

  // ─── Block Node ──────────────────────────────────────────────────

  private renderBlockNode(b: DslBuilder, node: any, depth: number, modelPrefix: string): void {
    const indent = '  '.repeat(depth);
    const childIndent = '  '.repeat(depth + 1);
    const hasGeom = !!(node.rect || node.ellipse || node.text || node.image || node.camera !== undefined);

    b.write(`${indent}${node.id}`);

    // Build inline-only parts (no fill/stroke in block mode)
    const inlineOnlyBuilder = new DslBuilder('node');
    this.emitBlockInlineOnlyProps(inlineOnlyBuilder, node, modelPrefix);
    const inlineOnlyResult = inlineOnlyBuilder.build();
    const inlineSuffix = inlineOnlyResult.text;

    if (hasGeom) {
      b.write(': ');
      this.emitGeometry(b, node, modelPrefix);
      if (inlineSuffix) {
        b.write(' ');
        this.emitBlockInlineOnlyProps(b, node, modelPrefix);
      }
    } else if (inlineSuffix) {
      b.write(':');
      b.write(' ');
      this.emitBlockInlineOnlyProps(b, node, modelPrefix);
    } else {
      b.write(':');
    }

    // Block properties: fill, stroke
    if (node.fill && hasOwn(node, 'fill')) {
      b.write(`\n${childIndent}fill `);
      this.emitColor(b, node.fill, 'fill', `${modelPrefix}.fill`);
    }
    if (node.stroke && hasOwn(node, 'stroke')) {
      b.write(`\n${childIndent}stroke `);
      this.emitStroke(b, node.stroke, modelPrefix);
    }

    // Block-only props (dash, layout)
    this.emitBlockOnlyProps(b, node, depth + 1, modelPrefix);
  }

  // ─── Connection ──────────────────────────────────────────────────

  private renderConnection(b: DslBuilder, node: any, depth: number, modelPrefix: string): void {
    const indent = '  '.repeat(depth);
    const childIndent = '  '.repeat(depth + 1);

    b.write(`${indent}${node.id}: `);

    const route = node.path.route;
    for (let i = 0; i < route.length; i++) {
      if (i > 0) b.write(' -> ');
      this.emitPointRef(b, route[i], `path.route.${i}`, `${modelPrefix}.path.route.${i}`);
    }

    // Path modifiers
    const pathProps = node.path;
    if (pathProps.smooth) b.write(' smooth');
    if (pathProps.closed) b.write(' closed');
    if (pathProps.bend !== undefined) {
      b.write(' bend=');
      b.writeSpan(String(pathProps.bend), 'path.bend', `${modelPrefix}.path.bend`);
    }
    if (pathProps.radius !== undefined) {
      b.write(' radius=');
      b.writeSpan(String(pathProps.radius), 'path.radius', `${modelPrefix}.path.radius`);
    }
    if (pathProps.gap !== undefined) {
      b.write(' gap=');
      b.writeSpan(String(pathProps.gap), 'path.gap', `${modelPrefix}.path.gap`);
    }
    if (pathProps.fromGap !== undefined) {
      b.write(' fromGap=');
      b.writeSpan(String(pathProps.fromGap), 'path.fromGap', `${modelPrefix}.path.fromGap`);
    }
    if (pathProps.toGap !== undefined) {
      b.write(' toGap=');
      b.writeSpan(String(pathProps.toGap), 'path.toGap', `${modelPrefix}.path.toGap`);
    }
    if (pathProps.drawProgress !== undefined) {
      b.write(' drawProgress=');
      b.writeSpan(String(pathProps.drawProgress), 'path.drawProgress', `${modelPrefix}.path.drawProgress`);
    }

    // Inline props (no path, no transform for connections)
    const inlineProps = this.buildInlinePropsWithoutPathAndTransform(node, modelPrefix);
    if (inlineProps) {
      b.write(' ');
      this.emitInlinePropsWithoutPathAndTransform(b, node, modelPrefix);
    }

    // Block-only props (dash, layout) even on connections
    this.emitBlockOnlyProps(b, node, depth + 1, modelPrefix);
  }

  // ─── Explicit Path ───────────────────────────────────────────────

  private renderExplicitPath(b: DslBuilder, node: any, depth: number, modelPrefix: string): void {
    const indent = '  '.repeat(depth);
    const childIndent = '  '.repeat(depth + 1);

    b.write(`${indent}${node.id}: path `);

    const points = node.path.points;
    for (let i = 0; i < points.length; i++) {
      if (i > 0) b.write(' ');
      const p = points[i];
      b.write('(');
      b.writeSpan(String(p[0]), `path.points.${i}.0`, `${modelPrefix}.path.points.${i}.0`);
      b.write(',');
      b.writeSpan(String(p[1]), `path.points.${i}.1`, `${modelPrefix}.path.points.${i}.1`);
      b.write(')');
    }

    if (node.path.closed) b.write(' closed');
    if (node.path.smooth) b.write(' smooth');

    // Inline props (no path for explicit paths)
    const inlineProps = this.buildInlinePropsWithoutPath(node, modelPrefix);
    if (inlineProps) {
      b.write(' ');
      this.emitInlinePropsWithoutPath(b, node, modelPrefix);
    }

    // Block-only props
    this.emitBlockOnlyProps(b, node, depth + 1, modelPrefix);
  }

  // ─── Geometry Emission ───────────────────────────────────────────

  private emitGeometry(b: DslBuilder, node: any, modelPrefix: string): void {
    if (node.rect) {
      b.write('rect ');
      b.writeSpan(String(node.rect.w), 'rect.w', `${modelPrefix}.rect.w`);
      b.write('x');
      b.writeSpan(String(node.rect.h), 'rect.h', `${modelPrefix}.rect.h`);
      if (node.rect.radius !== undefined) {
        b.write(' radius=');
        b.writeSpan(String(node.rect.radius), 'rect.radius', `${modelPrefix}.rect.radius`);
      }
    } else if (node.ellipse) {
      b.write('ellipse ');
      b.writeSpan(String(node.ellipse.rx * 2), 'ellipse.rx', `${modelPrefix}.ellipse.rx`);
      b.write('x');
      b.writeSpan(String(node.ellipse.ry * 2), 'ellipse.ry', `${modelPrefix}.ellipse.ry`);
    } else if (node.text) {
      b.write('text ');
      b.writeSpan(`"${node.text.content}"`, 'text.content', `${modelPrefix}.text.content`);
      if (node.text.size !== undefined) {
        b.write(' size=');
        b.writeSpan(String(node.text.size), 'text.size', `${modelPrefix}.text.size`);
      }
      if (node.text.lineHeight !== undefined) {
        b.write(' lineHeight=');
        b.writeSpan(String(node.text.lineHeight), 'text.lineHeight', `${modelPrefix}.text.lineHeight`);
      }
      if (node.text.align !== undefined) {
        b.write(' align=');
        b.writeSpan(String(node.text.align), 'text.align', `${modelPrefix}.text.align`);
      }
      if (node.text.bold) b.write(' bold');
      if (node.text.mono) b.write(' mono');
    } else if (node.image) {
      b.write('image ');
      b.writeSpan(`"${node.image.src}"`, 'image.src', `${modelPrefix}.image.src`);
      b.write(' ');
      b.writeSpan(String(node.image.w), 'image.w', `${modelPrefix}.image.w`);
      b.write('x');
      b.writeSpan(String(node.image.h), 'image.h', `${modelPrefix}.image.h`);
      if (node.image.fit !== undefined) {
        b.write(' fit=');
        b.writeSpan(String(node.image.fit), 'image.fit', `${modelPrefix}.image.fit`);
      }
    } else if (node.camera !== undefined) {
      b.write('camera');
      const cam = node.camera;
      if (cam.look !== undefined) {
        b.write(' look=');
        b.writeSpan(this.formatValueText(cam.look), 'camera.look', `${modelPrefix}.camera.look`);
      }
      if (cam.zoom !== undefined) {
        b.write(' zoom=');
        b.writeSpan(String(cam.zoom), 'camera.zoom', `${modelPrefix}.camera.zoom`);
      }
      if (cam.ratio !== undefined) {
        b.write(' ratio=');
        b.writeSpan(String(cam.ratio), 'camera.ratio', `${modelPrefix}.camera.ratio`);
      }
      if (cam.active === true) b.write(' active');
    }
  }

  // ─── Color Emission ──────────────────────────────────────────────

  private emitColor(b: DslBuilder, color: any, schemaPath: string, modelPath: string): void {
    // String: named or hex — single span
    if (typeof color === 'string') {
      b.writeSpan(color, schemaPath, modelPath);
      return;
    }
    // Named + alpha
    if ('name' in color && 'a' in color && !('h' in color) && !('r' in color)) {
      b.writeSpan(color.name, `${schemaPath}.name`, `${modelPath}.name`);
      b.write(' a=');
      b.writeSpan(String(color.a), `${schemaPath}.a`, `${modelPath}.a`);
      return;
    }
    // Hex + alpha
    if ('hex' in color && 'a' in color) {
      b.writeSpan(color.hex, `${schemaPath}.hex`, `${modelPath}.hex`);
      b.write(' a=');
      b.writeSpan(String(color.a), `${schemaPath}.a`, `${modelPath}.a`);
      return;
    }
    // RGB
    if ('r' in color) {
      const name = rgbToName(color);
      if (name) {
        if (color.a !== undefined) {
          b.writeSpan(name, schemaPath, modelPath);
          b.write(' a=');
          b.writeSpan(String(color.a), `${schemaPath}.a`, `${modelPath}.a`);
        } else {
          b.writeSpan(name, schemaPath, modelPath);
        }
        return;
      }
      b.write('rgb ');
      b.writeSpan(String(color.r), `${schemaPath}.r`, `${modelPath}.r`);
      b.write(' ');
      b.writeSpan(String(color.g), `${schemaPath}.g`, `${modelPath}.g`);
      b.write(' ');
      b.writeSpan(String(color.b), `${schemaPath}.b`, `${modelPath}.b`);
      if (color.a !== undefined) {
        b.write(' a=');
        b.writeSpan(String(color.a), `${schemaPath}.a`, `${modelPath}.a`);
      }
      return;
    }
    // HSL
    if ('h' in color) {
      const name = hslToName({ h: color.h, s: color.s, l: color.l });
      if (name) {
        if (color.a !== undefined) {
          b.writeSpan(name, schemaPath, modelPath);
          b.write(' a=');
          b.writeSpan(String(color.a), `${schemaPath}.a`, `${modelPath}.a`);
        } else {
          b.writeSpan(name, schemaPath, modelPath);
        }
        return;
      }
      b.write('hsl ');
      b.writeSpan(String(color.h), `${schemaPath}.h`, `${modelPath}.h`);
      b.write(' ');
      b.writeSpan(String(color.s), `${schemaPath}.s`, `${modelPath}.s`);
      b.write(' ');
      b.writeSpan(String(color.l), `${schemaPath}.l`, `${modelPath}.l`);
      if (color.a !== undefined) {
        b.write(' a=');
        b.writeSpan(String(color.a), `${schemaPath}.a`, `${modelPath}.a`);
      }
      return;
    }
    // Fallback
    b.writeSpan(String(color), schemaPath, modelPath);
  }

  /** Format a color to plain text (no spans) — mirrors generator.ts formatColor */
  private formatColorText(color: any): string {
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

  private emitStroke(b: DslBuilder, stroke: any, modelPrefix: string): void {
    this.emitColor(b, stroke.color, 'stroke.color', `${modelPrefix}.stroke.color`);
    if (stroke.width !== undefined) {
      b.write(' width=');
      b.writeSpan(String(stroke.width), 'stroke.width', `${modelPrefix}.stroke.width`);
    }
  }

  // ─── Value Formatting ────────────────────────────────────────────

  private formatValueText(value: any): string {
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

  private emitPointRef(b: DslBuilder, ref: any, schemaPath: string, modelPath: string): void {
    if (typeof ref === 'string') {
      b.writeSpan(ref, schemaPath, modelPath);
      return;
    }
    if (Array.isArray(ref)) {
      if (ref.length === 2 && typeof ref[0] === 'number') {
        b.write('(');
        b.writeSpan(String(ref[0]), `${schemaPath}.0`, `${modelPath}.0`);
        b.write(',');
        b.writeSpan(String(ref[1]), `${schemaPath}.1`, `${modelPath}.1`);
        b.write(')');
        return;
      }
      if (ref.length === 3 && typeof ref[0] === 'string') {
        b.write('(');
        b.writeSpan(`"${ref[0]}"`, `${schemaPath}.0`, `${modelPath}.0`);
        b.write(',');
        b.writeSpan(String(ref[1]), `${schemaPath}.1`, `${modelPath}.1`);
        b.write(',');
        b.writeSpan(String(ref[2]), `${schemaPath}.2`, `${modelPath}.2`);
        b.write(')');
        return;
      }
      b.writeSpan(`(${ref.join(',')})`, schemaPath, modelPath);
      return;
    }
    b.writeSpan(String(ref), schemaPath, modelPath);
  }

  /** Format a point ref to plain text (no spans) — mirrors generator.ts formatPointRef */
  private formatPointRefText(ref: any): string {
    if (typeof ref === 'string') return ref;
    if (Array.isArray(ref)) {
      if (ref.length === 2 && typeof ref[0] === 'number') {
        return `(${ref[0]},${ref[1]})`;
      }
      if (ref.length === 3 && typeof ref[0] === 'string') {
        return `("${ref[0]}",${ref[1]},${ref[2]})`;
      }
      return `(${ref.join(',')})`;
    }
    return String(ref);
  }

  // ─── Transform Emission ──────────────────────────────────────────

  private emitTransform(b: DslBuilder, transform: any, modelPrefix: string): void {
    const hasX = transform.x !== undefined;
    const hasY = transform.y !== undefined;

    if (hasX && hasY) {
      b.write('at ');
      b.writeSpan(String(transform.x), 'transform.x', `${modelPrefix}.transform.x`);
      b.write(',');
      b.writeSpan(String(transform.y), 'transform.y', `${modelPrefix}.transform.y`);
    } else if (hasX) {
      b.write('at x=');
      b.writeSpan(String(transform.x), 'transform.x', `${modelPrefix}.transform.x`);
    } else if (hasY) {
      b.write('at y=');
      b.writeSpan(String(transform.y), 'transform.y', `${modelPrefix}.transform.y`);
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
      b.write(`${key}=`);
      b.writeSpan(this.formatValueText(transform[key]), schemaKey, `${modelPrefix}.${schemaKey}`);
    }
  }

  /** Check if a transform has anything to emit */
  private hasTransformContent(transform: any): boolean {
    return transform.x !== undefined || transform.y !== undefined ||
      transform.rotation !== undefined || transform.scale !== undefined ||
      transform.anchor !== undefined || transform.pathFollow !== undefined ||
      transform.pathProgress !== undefined;
  }

  /** Format transform to plain text — mirrors generator.ts formatTransform */
  private formatTransformText(transform: any): string {
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
    if (transform.anchor !== undefined) extras.push(`anchor=${this.formatValueText(transform.anchor)}`);
    if (transform.pathFollow !== undefined) extras.push(`pathFollow=${transform.pathFollow}`);
    if (transform.pathProgress !== undefined) extras.push(`pathProgress=${transform.pathProgress}`);

    if (s && extras.length > 0) return s + ' ' + extras.join(' ');
    if (s) return s;
    if (extras.length > 0) return extras.join(' ');
    return '';
  }

  // ─── Dash Emission ───────────────────────────────────────────────

  private emitDashBlock(b: DslBuilder, dash: any, modelPrefix: string): void {
    b.write('dash ');
    b.writeSpan(dash.pattern, 'dash.pattern', `${modelPrefix}.dash.pattern`);
    if (dash.length !== undefined) {
      b.write(' length=');
      b.writeSpan(String(dash.length), 'dash.length', `${modelPrefix}.dash.length`);
    }
    if (dash.gap !== undefined) {
      b.write(' gap=');
      b.writeSpan(String(dash.gap), 'dash.gap', `${modelPrefix}.dash.gap`);
    }
  }

  // ─── Layout Emission ─────────────────────────────────────────────

  private emitLayout(b: DslBuilder, layout: any, modelPrefix: string): void {
    b.write('layout');
    if (layout.type) {
      b.write(' ');
      b.writeSpan(layout.type, 'layout.type', `${modelPrefix}.layout.type`);
    }
    if (layout.direction) {
      b.write(' ');
      b.writeSpan(layout.direction, 'layout.direction', `${modelPrefix}.layout.direction`);
    }
    const skip = new Set(['type', 'direction']);
    for (const [k, v] of Object.entries(layout)) {
      if (skip.has(k)) continue;
      b.write(` ${k}=`);
      b.writeSpan(this.formatValueText(v), `layout.${k}`, `${modelPrefix}.layout.${k}`);
    }
  }

  private emitLayoutHintInline(b: DslBuilder, layout: any, modelPrefix: string): boolean {
    const parts: Array<{ key: string; value: any }> = [];
    for (const key of LAYOUT_HINT_KEYS) {
      if (layout[key] !== undefined) parts.push({ key, value: layout[key] });
    }
    if (parts.length === 0) return false;

    b.write('layout');
    for (const { key, value } of parts) {
      b.write(` ${key}=`);
      b.writeSpan(String(value), `layout.${key}`, `${modelPrefix}.layout.${key}`);
    }
    return true;
  }

  // ─── Inline Properties Emission ──────────────────────────────────

  private emitInlineProps(b: DslBuilder, node: any, modelPrefix: string): void {
    let first = true;
    const space = () => { if (!first) b.write(' '); first = false; };

    if (node.style && hasOwn(node, 'style')) {
      space();
      b.write('@');
      b.writeSpan(node.style, 'style', `${modelPrefix}.style`);
    }
    if (node.fill && hasOwn(node, 'fill')) {
      space();
      b.write('fill ');
      this.emitColor(b, node.fill, 'fill', `${modelPrefix}.fill`);
    }
    if (node.stroke && hasOwn(node, 'stroke')) {
      space();
      b.write('stroke ');
      this.emitStroke(b, node.stroke, modelPrefix);
    }
    if (hasOwn(node, 'opacity') && node.opacity !== undefined) {
      space();
      b.write('opacity=');
      b.writeSpan(String(node.opacity), 'opacity', `${modelPrefix}.opacity`);
    }
    if (hasOwn(node, 'visible') && node.visible === false) {
      space();
      b.write('visible=');
      b.writeSpan('false', 'visible', `${modelPrefix}.visible`);
    }
    if (hasOwn(node, 'depth') && node.depth !== undefined) {
      space();
      b.write('depth=');
      b.writeSpan(String(node.depth), 'depth', `${modelPrefix}.depth`);
    }
    if (node.layout && hasOwn(node, 'layout') && !isBlockLayout(node.layout)) {
      space();
      this.emitLayoutHintInline(b, node.layout, modelPrefix);
    }
    if (node.transform && hasOwn(node, 'transform')) {
      const t = this.formatTransformText(node.transform);
      if (t) {
        space();
        this.emitTransform(b, node.transform, modelPrefix);
      }
    }
  }

  /** Emit inline-only props for block mode (no fill/stroke) */
  private emitBlockInlineOnlyProps(b: DslBuilder, node: any, modelPrefix: string): void {
    let first = true;
    const space = () => { if (!first) b.write(' '); first = false; };

    if (node.style && hasOwn(node, 'style')) {
      space();
      b.write('@');
      b.writeSpan(node.style, 'style', `${modelPrefix}.style`);
    }
    if (hasOwn(node, 'opacity') && node.opacity !== undefined) {
      space();
      b.write('opacity=');
      b.writeSpan(String(node.opacity), 'opacity', `${modelPrefix}.opacity`);
    }
    if (hasOwn(node, 'visible') && node.visible === false) {
      space();
      b.write('visible=');
      b.writeSpan('false', 'visible', `${modelPrefix}.visible`);
    }
    if (hasOwn(node, 'depth') && node.depth !== undefined) {
      space();
      b.write('depth=');
      b.writeSpan(String(node.depth), 'depth', `${modelPrefix}.depth`);
    }
    if (node.layout && hasOwn(node, 'layout') && !isBlockLayout(node.layout)) {
      space();
      this.emitLayoutHintInline(b, node.layout, modelPrefix);
    }
    if (node.transform && hasOwn(node, 'transform')) {
      const t = this.formatTransformText(node.transform);
      if (t) {
        space();
        this.emitTransform(b, node.transform, modelPrefix);
      }
    }
  }

  /** Emit inline props excluding path-related props and transform (for connections) */
  private emitInlinePropsWithoutPathAndTransform(b: DslBuilder, node: any, modelPrefix: string): void {
    let first = true;
    const space = () => { if (!first) b.write(' '); first = false; };

    if (node.style && hasOwn(node, 'style')) {
      space();
      b.write('@');
      b.writeSpan(node.style, 'style', `${modelPrefix}.style`);
    }
    if (node.fill && hasOwn(node, 'fill')) {
      space();
      b.write('fill ');
      this.emitColor(b, node.fill, 'fill', `${modelPrefix}.fill`);
    }
    if (node.stroke && hasOwn(node, 'stroke')) {
      space();
      b.write('stroke ');
      this.emitStroke(b, node.stroke, modelPrefix);
    }
    if (hasOwn(node, 'opacity') && node.opacity !== undefined) {
      space();
      b.write('opacity=');
      b.writeSpan(String(node.opacity), 'opacity', `${modelPrefix}.opacity`);
    }
    if (hasOwn(node, 'visible') && node.visible === false) {
      space();
      b.write('visible=');
      b.writeSpan('false', 'visible', `${modelPrefix}.visible`);
    }
    if (hasOwn(node, 'depth') && node.depth !== undefined) {
      space();
      b.write('depth=');
      b.writeSpan(String(node.depth), 'depth', `${modelPrefix}.depth`);
    }
  }

  /** Build inline props text without path and transform (for checking emptiness) */
  private buildInlinePropsWithoutPathAndTransform(node: any, modelPrefix: string): string {
    const parts: string[] = [];
    if (node.style && hasOwn(node, 'style')) parts.push(`@${node.style}`);
    if (node.fill && hasOwn(node, 'fill')) parts.push(`fill ${this.formatColorText(node.fill)}`);
    if (node.stroke && hasOwn(node, 'stroke')) {
      let result = this.formatColorText(node.stroke.color);
      if (node.stroke.width !== undefined) result += ` width=${node.stroke.width}`;
      parts.push(`stroke ${result}`);
    }
    if (hasOwn(node, 'opacity') && node.opacity !== undefined) parts.push(`opacity=${node.opacity}`);
    if (hasOwn(node, 'visible') && node.visible === false) parts.push('visible=false');
    if (hasOwn(node, 'depth') && node.depth !== undefined) parts.push(`depth=${node.depth}`);
    return parts.join(' ');
  }

  /** Emit inline props excluding path-related props (for explicit paths) */
  private emitInlinePropsWithoutPath(b: DslBuilder, node: any, modelPrefix: string): void {
    let first = true;
    const space = () => { if (!first) b.write(' '); first = false; };

    if (node.style && hasOwn(node, 'style')) {
      space();
      b.write('@');
      b.writeSpan(node.style, 'style', `${modelPrefix}.style`);
    }
    if (node.fill && hasOwn(node, 'fill')) {
      space();
      b.write('fill ');
      this.emitColor(b, node.fill, 'fill', `${modelPrefix}.fill`);
    }
    if (node.stroke && hasOwn(node, 'stroke')) {
      space();
      b.write('stroke ');
      this.emitStroke(b, node.stroke, modelPrefix);
    }
    if (hasOwn(node, 'opacity') && node.opacity !== undefined) {
      space();
      b.write('opacity=');
      b.writeSpan(String(node.opacity), 'opacity', `${modelPrefix}.opacity`);
    }
    if (hasOwn(node, 'visible') && node.visible === false) {
      space();
      b.write('visible=');
      b.writeSpan('false', 'visible', `${modelPrefix}.visible`);
    }
    if (hasOwn(node, 'depth') && node.depth !== undefined) {
      space();
      b.write('depth=');
      b.writeSpan(String(node.depth), 'depth', `${modelPrefix}.depth`);
    }
    if (node.transform && hasOwn(node, 'transform')) {
      const t = this.formatTransformText(node.transform);
      if (t) {
        space();
        this.emitTransform(b, node.transform, modelPrefix);
      }
    }
  }

  /** Build inline props text without path (for checking emptiness) */
  private buildInlinePropsWithoutPath(node: any, modelPrefix: string): string {
    const parts: string[] = [];
    if (node.style && hasOwn(node, 'style')) parts.push(`@${node.style}`);
    if (node.fill && hasOwn(node, 'fill')) parts.push(`fill ${this.formatColorText(node.fill)}`);
    if (node.stroke && hasOwn(node, 'stroke')) {
      let result = this.formatColorText(node.stroke.color);
      if (node.stroke.width !== undefined) result += ` width=${node.stroke.width}`;
      parts.push(`stroke ${result}`);
    }
    if (hasOwn(node, 'opacity') && node.opacity !== undefined) parts.push(`opacity=${node.opacity}`);
    if (hasOwn(node, 'visible') && node.visible === false) parts.push('visible=false');
    if (hasOwn(node, 'depth') && node.depth !== undefined) parts.push(`depth=${node.depth}`);
    if (node.transform && hasOwn(node, 'transform')) {
      const t = this.formatTransformText(node.transform);
      if (t) parts.push(t);
    }
    return parts.join(' ');
  }

  // ─── Block-Only Props Emission ───────────────────────────────────

  private emitBlockOnlyProps(b: DslBuilder, node: any, depth: number, modelPrefix: string): void {
    const indent = '  '.repeat(depth);
    if (node.dash && hasOwn(node, 'dash')) {
      b.write(`\n${indent}`);
      this.emitDashBlock(b, node.dash, modelPrefix);
    }
    if (node.layout && hasOwn(node, 'layout') && isBlockLayout(node.layout)) {
      b.write(`\n${indent}`);
      this.emitLayout(b, node.layout, modelPrefix);
    }
  }

  // ─── Animation ───────────────────────────────────────────────────

  private renderAnimate(animate: any): RenderResult {
    const b = new DslBuilder('animate');

    // Header line
    b.write('animate ');
    b.writeSpan(`${animate.duration}s`, 'duration', 'animate.duration');
    if (animate.loop) b.write(' loop');
    if (animate.autoKey) b.write(' autoKey');
    if (animate.easing) {
      b.write(' easing=');
      b.writeSpan(animate.easing, 'easing', 'animate.easing');
    }

    // Chapters
    if (animate.chapters) {
      for (let i = 0; i < animate.chapters.length; i++) {
        const ch = animate.chapters[i];
        b.write(`\n  chapter `);
        b.writeSpan(`"${ch.name}"`, `chapters.${i}.name`, `animate.chapters.${i}.name`);
        b.write(' at ');
        b.writeSpan(String(ch.time), `chapters.${i}.time`, `animate.chapters.${i}.time`);
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
          b.writeSpan(timeStr, `keyframes.${kfIdx}.time`, `animate.keyframes.${kfIdx}.time`);
          b.write('  ');
          this.emitKeyframeChange(b, path, val, kfIdx, 0);
          if (kf.easing) {
            b.write(' easing=');
            b.writeSpan(kf.easing, `keyframes.${kfIdx}.easing`, `animate.keyframes.${kfIdx}.easing`);
          }
        } else {
          // Multiple changes: first on the time line, rest as continuation
          const [firstPath, firstVal] = changeEntries[0];
          b.write(`\n  `);
          b.writeSpan(timeStr, `keyframes.${kfIdx}.time`, `animate.keyframes.${kfIdx}.time`);
          b.write('  ');
          this.emitKeyframeChange(b, firstPath, firstVal, kfIdx, 0);
          if (kf.easing) {
            b.write(' easing=');
            b.writeSpan(kf.easing, `keyframes.${kfIdx}.easing`, `animate.keyframes.${kfIdx}.easing`);
          }
          for (let i = 1; i < changeEntries.length; i++) {
            const [path, val] = changeEntries[i];
            b.write('\n    ');
            this.emitKeyframeChange(b, path, val, kfIdx, i);
          }
        }
      }
    }

    return b.build();
  }

  private emitKeyframeChange(b: DslBuilder, path: string, val: any, kfIdx: number, changeIdx: number): void {
    const changePrefix = `animate.keyframes.${kfIdx}.changes.${changeIdx}`;

    // Effect: value is a string and path is a bare node ID (no dots)
    if (typeof val === 'string' && isEffectKey(path)) {
      b.writeSpan(path, `keyframes.${kfIdx}.changes.${changeIdx}.target`, changePrefix + '.target');
      b.write(' ');
      b.writeSpan(val, `keyframes.${kfIdx}.changes.${changeIdx}.effect`, changePrefix + '.effect');
      return;
    }

    // Effect with params: { effect: "flash", amplitude: 2, ... }
    if (typeof val === 'object' && val !== null && !Array.isArray(val) && 'effect' in val) {
      b.writeSpan(path, `keyframes.${kfIdx}.changes.${changeIdx}.target`, changePrefix + '.target');
      b.write(' ');
      b.writeSpan(val.effect, `keyframes.${kfIdx}.changes.${changeIdx}.effect`, changePrefix + '.effect');
      for (const [k, v] of Object.entries(val)) {
        if (k === 'effect') continue;
        b.write(` ${k}=`);
        b.writeSpan(this.formatValueText(v), `keyframes.${kfIdx}.changes.${changeIdx}.${k}`, `${changePrefix}.${k}`);
      }
      return;
    }

    // Color value
    if (isColor(val) && !isEffectKey(path)) {
      b.writeSpan(path, `keyframes.${kfIdx}.changes.${changeIdx}.path`, changePrefix + '.path');
      b.write(': ');
      this.emitColor(b, val, `keyframes.${kfIdx}.changes.${changeIdx}.value`, changePrefix + '.value');
      return;
    }

    // Property change with easing: { value, easing }
    if (typeof val === 'object' && val !== null && !Array.isArray(val) && 'value' in val && 'easing' in val) {
      b.writeSpan(path, `keyframes.${kfIdx}.changes.${changeIdx}.path`, changePrefix + '.path');
      b.write(': ');
      if (isColor(val.value)) {
        this.emitColor(b, val.value, `keyframes.${kfIdx}.changes.${changeIdx}.value`, changePrefix + '.value');
      } else {
        b.writeSpan(this.formatValueText(val.value), `keyframes.${kfIdx}.changes.${changeIdx}.value`, changePrefix + '.value');
      }
      b.write(' easing=');
      b.writeSpan(val.easing, `keyframes.${kfIdx}.changes.${changeIdx}.easing`, changePrefix + '.easing');
      return;
    }

    // Regular value
    b.writeSpan(path, `keyframes.${kfIdx}.changes.${changeIdx}.path`, changePrefix + '.path');
    b.write(': ');
    b.writeSpan(this.formatValueText(val), `keyframes.${kfIdx}.changes.${changeIdx}.value`, changePrefix + '.value');
  }
}
