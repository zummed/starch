import { hslToName, rgbToName, isColor } from '../types/color';
import type { FormatHints } from './formatHints';

// ─── Types ────────────────────────────────────────────────────────

interface GeneratorOptions {
  nodeFormats?: Record<string, 'inline' | 'block'>;
  formatHints?: FormatHints;
}

// ─── Color Formatting ─────────────────────────────────────────────

function formatColor(color: any): string {
  // String: named or hex
  if (typeof color === 'string') return color;
  // Named + alpha
  if ('name' in color && 'a' in color && !('h' in color) && !('r' in color)) {
    return `${color.name} a=${color.a}`;
  }
  // Hex + alpha
  if ('hex' in color && 'a' in color) {
    return `${color.hex} a=${color.a}`;
  }
  // RGB
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
  // HSL
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

function formatStroke(stroke: any): string {
  let result = formatColor(stroke.color);
  if (stroke.width !== undefined) result += ` width=${stroke.width}`;
  return result;
}

// ─── Value Formatting ─────────────────────────────────────────────

function formatValue(value: any): string {
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

// ─── Point Ref Formatting ─────────────────────────────────────────

function formatPointRef(ref: any): string {
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

// ─── Property Count ───────────────────────────────────────────────

/** Count the number of property items a node has (excluding children and id). */
function countProps(node: any): number {
  let count = 0;
  const skip = new Set(['id', 'children']);
  for (const key of Object.keys(node)) {
    if (!skip.has(key)) count++;
  }
  return count;
}

// ─── Geometry Formatting ──────────────────────────────────────────

function formatGeometry(node: any): string {
  if (node.rect) {
    let s = `rect ${node.rect.w}x${node.rect.h}`;
    if (node.rect.radius !== undefined) s += ` radius=${node.rect.radius}`;
    return s;
  }
  if (node.ellipse) {
    return `ellipse ${node.ellipse.rx * 2}x${node.ellipse.ry * 2}`;
  }
  if (node.text) {
    let s = `text "${node.text.content}"`;
    if (node.text.size !== undefined) s += ` size=${node.text.size}`;
    if (node.text.lineHeight !== undefined) s += ` lineHeight=${node.text.lineHeight}`;
    if (node.text.align !== undefined) s += ` align=${node.text.align}`;
    if (node.text.bold) s += ` bold`;
    if (node.text.mono) s += ` mono`;
    return s;
  }
  if (node.image) {
    let s = `image "${node.image.src}" ${node.image.w}x${node.image.h}`;
    if (node.image.fit !== undefined) s += ` fit=${node.image.fit}`;
    return s;
  }
  if (node.camera !== undefined) {
    let s = 'camera';
    const cam = node.camera;
    if (cam.look !== undefined) s += ` look=${formatValue(cam.look)}`;
    if (cam.zoom !== undefined) s += ` zoom=${cam.zoom}`;
    if (cam.ratio !== undefined) s += ` ratio=${cam.ratio}`;
    if (cam.active === true) s += ` active`;
    return s;
  }
  return '';
}

// ─── Connection Check ─────────────────────────────────────────────

function isConnection(node: any): boolean {
  return node.path && node.path.route && Array.isArray(node.path.route);
}

function isExplicitPath(node: any): boolean {
  return node.path && node.path.points && Array.isArray(node.path.points) && !node.path.route;
}

// ─── Connection Formatting ────────────────────────────────────────

function formatConnection(node: any): string {
  const route = node.path.route;
  let s = route.map(formatPointRef).join(' -> ');

  // Path modifiers
  const pathProps = node.path;
  if (pathProps.smooth) s += ` smooth`;
  if (pathProps.closed) s += ` closed`;
  if (pathProps.bend !== undefined) s += ` bend=${pathProps.bend}`;
  if (pathProps.radius !== undefined) s += ` radius=${pathProps.radius}`;
  if (pathProps.gap !== undefined) s += ` gap=${pathProps.gap}`;
  if (pathProps.fromGap !== undefined) s += ` fromGap=${pathProps.fromGap}`;
  if (pathProps.toGap !== undefined) s += ` toGap=${pathProps.toGap}`;
  if (pathProps.drawProgress !== undefined) s += ` drawProgress=${pathProps.drawProgress}`;

  return s;
}

// ─── Explicit Path Formatting ─────────────────────────────────────

function formatExplicitPath(node: any): string {
  const points = node.path.points;
  let s = 'path ' + points.map((p: [number, number]) => `(${p[0]},${p[1]})`).join(' ');

  if (node.path.closed) s += ` closed`;
  if (node.path.smooth) s += ` smooth`;

  return s;
}

// ─── Properties that the parser handles inline vs block ───────────
// The parser's parseInlineProps handles: fill, stroke, at, @style, key=value, booleans
// The parser's parseBlockProperty handles: fill, stroke, layout, dash
// So: fill/stroke work both inline and block. layout/dash ONLY work as block props.

/**
 * Format properties that are safe for inline (single-line) rendering.
 * Excludes layout and dash which require block property syntax.
 */
function formatInlineProps(node: any): string {
  const parts: string[] = [];

  if (node.style) parts.push(`@${node.style}`);
  if (node.fill) parts.push(`fill ${formatColor(node.fill)}`);
  if (node.stroke) parts.push(`stroke ${formatStroke(node.stroke)}`);
  if (node.opacity !== undefined) parts.push(`opacity=${node.opacity}`);
  if (node.visible === false) parts.push(`visible=false`);
  if (node.depth !== undefined) parts.push(`depth=${node.depth}`);
  if (node.layout && !isBlockLayout(node.layout)) {
    const hint = formatLayoutHintInline(node.layout);
    if (hint) parts.push(hint);
  }
  if (node.transform) {
    const t = formatTransform(node.transform);
    if (t) parts.push(t);
  }

  return parts.join(' ');
}

/**
 * Format properties that must be rendered as indented block lines.
 * These are properties that the parser only handles via parseBlockProperty.
 */
function formatBlockOnlyProps(node: any, indent: string): string[] {
  const lines: string[] = [];
  if (node.dash) lines.push(`${indent}${formatDashBlock(node.dash)}`);
  if (node.layout && isBlockLayout(node.layout)) lines.push(`${indent}${formatLayout(node.layout)}`);
  return lines;
}

/**
 * In full block mode, emit fill/stroke as indented block properties too.
 */
function formatBlockVisualProps(node: any, indent: string): string[] {
  const lines: string[] = [];
  if (node.fill) lines.push(`${indent}fill ${formatColor(node.fill)}`);
  if (node.stroke) lines.push(`${indent}stroke ${formatStroke(node.stroke)}`);
  return lines;
}

const LAYOUT_HINT_KEYS = ['grow', 'order', 'alignSelf', 'slot'] as const;

function formatLayoutHintInline(layout: any): string | null {
  const parts: string[] = [];
  for (const key of LAYOUT_HINT_KEYS) {
    if (layout[key] !== undefined) parts.push(`${key}=${layout[key]}`);
  }
  return parts.length > 0 ? `layout ${parts.join(' ')}` : null;
}

/** A layout object that has type or direction (container layout) needs block rendering.
 *  A layout with only hint props (grow, order, alignSelf, slot) is emitted inline. */
function isBlockLayout(layout: any): boolean {
  return !!(layout.type || layout.direction || layout.gap !== undefined ||
    layout.justify || layout.align || layout.wrap !== undefined ||
    layout.padding !== undefined);
}

/** Check if a node has properties that require block rendering. */
function hasBlockOnlyProps(node: any): boolean {
  return !!(node.dash || (node.layout && isBlockLayout(node.layout)));
}

// ─── Transform Formatting ─────────────────────────────────────────

function formatTransform(transform: any): string {
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
    // No x or y, just other transform props — still need 'at' prefix for extras
    s = '';
  }

  const extras: string[] = [];
  if (transform.rotation !== undefined) extras.push(`rotation=${transform.rotation}`);
  if (transform.scale !== undefined) extras.push(`scale=${transform.scale}`);
  if (transform.anchor !== undefined) extras.push(`anchor=${formatValue(transform.anchor)}`);
  if (transform.pathFollow !== undefined) extras.push(`pathFollow=${transform.pathFollow}`);
  if (transform.pathProgress !== undefined) extras.push(`pathProgress=${transform.pathProgress}`);

  if (s && extras.length > 0) {
    return s + ' ' + extras.join(' ');
  }
  if (s) return s;
  if (extras.length > 0) return extras.join(' ');
  return '';
}

// ─── Dash Formatting ──────────────────────────────────────────────

/** Block form: `dash dashed length=10 gap=5` — used as indented block property. */
function formatDashBlock(dash: any): string {
  let s = `dash ${dash.pattern}`;
  if (dash.length !== undefined) s += ` length=${dash.length}`;
  if (dash.gap !== undefined) s += ` gap=${dash.gap}`;
  return s;
}

// ─── Layout Formatting ────────────────────────────────────────────

function formatLayout(layout: any): string {
  let s = 'layout';
  if (layout.type) s += ` ${layout.type}`;
  if (layout.direction) s += ` ${layout.direction}`;
  const skip = new Set(['type', 'direction']);
  for (const [k, v] of Object.entries(layout)) {
    if (!skip.has(k)) s += ` ${k}=${formatValue(v)}`;
  }
  return s;
}

// ─── Node Formatting ──────────────────────────────────────────────

function shouldRenderBlock(node: any, options?: GeneratorOptions): boolean {
  const id = node.id;
  // Explicit per-node format takes precedence
  if (options?.nodeFormats?.[id] === 'inline') return false;
  if (options?.nodeFormats?.[id] === 'block') return true;
  // FormatHints (from DSL parser)
  if (options?.formatHints?.nodes[id]?.display === 'inline') return false;
  if (options?.formatHints?.nodes[id]?.display === 'block') return true;
  // Heuristic fallback
  return countProps(node) > 4;
}

function formatNode(node: any, depth: number, options?: GeneratorOptions): string[] {
  const indent = '  '.repeat(depth);
  const childIndent = '  '.repeat(depth + 1);
  const lines: string[] = [];

  // Connection node
  if (isConnection(node)) {
    const connLine = `${indent}${node.id}: ${formatConnection(node)}`;
    const inlineProps = formatInlinePropsWithoutPathAndTransform(node);
    if (inlineProps) {
      lines.push(`${connLine} ${inlineProps}`);
    } else {
      lines.push(connLine);
    }
    // Block-only props (dash, layout) even on connections
    lines.push(...formatBlockOnlyProps(node, childIndent));
    return lines;
  }

  // Explicit path node
  if (isExplicitPath(node)) {
    const pathLine = `${indent}${node.id}: ${formatExplicitPath(node)}`;
    const inlineProps = formatInlinePropsWithoutPath(node);
    if (inlineProps) {
      lines.push(`${pathLine} ${inlineProps}`);
    } else {
      lines.push(pathLine);
    }
    lines.push(...formatBlockOnlyProps(node, childIndent));
    return lines;
  }

  const geom = formatGeometry(node);
  const isBlock = shouldRenderBlock(node, options);
  const needsBlockBody = hasBlockOnlyProps(node);

  if (isBlock) {
    // Block mode: geometry + inline-safe props on first line,
    // fill/stroke/dash/layout as indented block properties
    const inlineOnlyParts: string[] = [];
    if (node.style) inlineOnlyParts.push(`@${node.style}`);
    if (node.opacity !== undefined) inlineOnlyParts.push(`opacity=${node.opacity}`);
    if (node.visible === false) inlineOnlyParts.push(`visible=false`);
    if (node.depth !== undefined) inlineOnlyParts.push(`depth=${node.depth}`);
    if (node.layout && !isBlockLayout(node.layout)) {
      const hint = formatLayoutHintInline(node.layout);
      if (hint) inlineOnlyParts.push(hint);
    }
    if (node.transform) {
      const t = formatTransform(node.transform);
      if (t) inlineOnlyParts.push(t);
    }

    const inlineSuffix = inlineOnlyParts.length > 0 ? ' ' + inlineOnlyParts.join(' ') : '';

    if (geom) {
      lines.push(`${indent}${node.id}: ${geom}${inlineSuffix}`);
    } else if (inlineSuffix) {
      lines.push(`${indent}${node.id}:${inlineSuffix}`);
    } else {
      lines.push(`${indent}${node.id}:`);
    }

    // Block properties
    lines.push(...formatBlockVisualProps(node, childIndent));
    lines.push(...formatBlockOnlyProps(node, childIndent));
  } else {
    // Inline mode: everything inline-safe on one line
    const propsStr = formatInlineProps(node);
    if (geom && propsStr) {
      lines.push(`${indent}${node.id}: ${geom} ${propsStr}`);
    } else if (geom) {
      lines.push(`${indent}${node.id}: ${geom}`);
    } else if (propsStr) {
      lines.push(`${indent}${node.id}: ${propsStr}`);
    } else {
      lines.push(`${indent}${node.id}:`);
    }
    // Block-only props (dash, layout) always need indented lines
    if (needsBlockBody) {
      lines.push(...formatBlockOnlyProps(node, childIndent));
    }
  }

  // Children
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      lines.push(...formatNode(child, depth + 1, options));
    }
  }

  return lines;
}

/** Format inline props excluding path-related props (for connections). */
function formatInlinePropsWithoutPathAndTransform(node: any): string {
  const parts: string[] = [];

  if (node.style) parts.push(`@${node.style}`);
  if (node.fill) parts.push(`fill ${formatColor(node.fill)}`);
  if (node.stroke) parts.push(`stroke ${formatStroke(node.stroke)}`);
  if (node.opacity !== undefined) parts.push(`opacity=${node.opacity}`);
  if (node.visible === false) parts.push(`visible=false`);
  if (node.depth !== undefined) parts.push(`depth=${node.depth}`);

  return parts.join(' ');
}

/** Format inline props excluding path-related props (for explicit paths). */
function formatInlinePropsWithoutPath(node: any): string {
  const parts: string[] = [];

  if (node.style) parts.push(`@${node.style}`);
  if (node.fill) parts.push(`fill ${formatColor(node.fill)}`);
  if (node.stroke) parts.push(`stroke ${formatStroke(node.stroke)}`);
  if (node.opacity !== undefined) parts.push(`opacity=${node.opacity}`);
  if (node.visible === false) parts.push(`visible=false`);
  if (node.depth !== undefined) parts.push(`depth=${node.depth}`);
  if (node.transform) {
    const t = formatTransform(node.transform);
    if (t) parts.push(t);
  }

  return parts.join(' ');
}

// ─── Style Formatting ─────────────────────────────────────────────

function formatStyle(name: string, style: any): string[] {
  const lines: string[] = [`style ${name}`];
  if (style.fill) lines.push(`  fill ${formatColor(style.fill)}`);
  if (style.stroke) lines.push(`  stroke ${formatStroke(style.stroke)}`);
  if (style.dash) lines.push(`  ${formatDashBlock(style.dash)}`);

  // Other style properties
  const skip = new Set(['fill', 'stroke', 'dash', 'layout']);
  for (const [k, v] of Object.entries(style)) {
    if (skip.has(k)) continue;
    lines.push(`  ${k}=${formatValue(v)}`);
  }

  if (style.layout) lines.push(`  ${formatLayout(style.layout)}`);

  return lines;
}

// ─── Animation Formatting ─────────────────────────────────────────

function formatAnimate(animate: any): string[] {
  const lines: string[] = [];

  // Header line
  let header = `animate ${animate.duration}s`;
  if (animate.loop) header += ` loop`;
  if (animate.autoKey) header += ` autoKey`;
  if (animate.easing) header += ` easing=${animate.easing}`;
  lines.push(header);

  // Chapters
  if (animate.chapters) {
    for (const ch of animate.chapters) {
      lines.push(`  chapter "${ch.name}" at ${ch.time}`);
    }
  }

  // Keyframes
  if (animate.keyframes) {
    for (const kf of animate.keyframes) {
      const timeStr = kf.plus !== undefined ? `+${kf.plus}` : String(kf.time);
      const changeEntries = Object.entries(kf.changes || {});

      if (changeEntries.length === 0) continue;

      if (changeEntries.length === 1) {
        const [path, val] = changeEntries[0];
        const valStr = formatKeyframeChange(path, val);
        let line = `  ${timeStr}  ${valStr}`;
        if (kf.easing) line += ` easing=${kf.easing}`;
        lines.push(line);
      } else {
        // Multiple changes: first on the time line, rest as continuation
        const [firstPath, firstVal] = changeEntries[0];
        const firstStr = formatKeyframeChange(firstPath, firstVal);
        let firstLine = `  ${timeStr}  ${firstStr}`;
        if (kf.easing) firstLine += ` easing=${kf.easing}`;
        lines.push(firstLine);
        for (let i = 1; i < changeEntries.length; i++) {
          const [path, val] = changeEntries[i];
          lines.push(`    ${formatKeyframeChange(path, val)}`);
        }
      }
    }
  }

  return lines;
}

function isEffectKey(path: string): boolean {
  // Effect keys are bare node IDs (no dots), while property changes use dot-paths
  return !path.includes('.');
}

function formatKeyframeChange(path: string, val: any): string {
  // Effect: value is a string and path is a bare node ID (no dots)
  if (typeof val === 'string' && isEffectKey(path)) {
    return `${path} ${val}`;
  }

  // Effect with params: { effect: "flash", amplitude: 2, ... }
  if (typeof val === 'object' && val !== null && !Array.isArray(val) && 'effect' in val) {
    let s = `${path} ${val.effect}`;
    for (const [k, v] of Object.entries(val)) {
      if (k === 'effect') continue;
      s += ` ${k}=${formatValue(v)}`;
    }
    return s;
  }

  // Color value (string colors with dot-paths, or any Color object)
  if (isColor(val) && !isEffectKey(path)) {
    return `${path}: ${formatColor(val)}`;
  }

  // Property change with easing: { value, easing }
  if (typeof val === 'object' && val !== null && !Array.isArray(val) && 'value' in val && 'easing' in val) {
    const valStr = isColor(val.value) ? formatColor(val.value) : formatValue(val.value);
    return `${path}: ${valStr} easing=${val.easing}`;
  }

  // Regular value (including string property values with dot-paths)
  return `${path}: ${formatValue(val)}`;
}

// ─── Main Generator ───────────────────────────────────────────────

export function generateDsl(scene: any, options?: GeneratorOptions): string {
  const sections: string[] = [];

  // Document metadata
  const metaLines: string[] = [];
  if (scene.name) metaLines.push(`name "${scene.name}"`);
  if (scene.description) metaLines.push(`description "${scene.description}"`);
  if (scene.background) metaLines.push(`background "${scene.background}"`);
  if (scene.viewport) metaLines.push(`viewport ${scene.viewport.width}x${scene.viewport.height}`);
  if (metaLines.length > 0) sections.push(metaLines.join('\n'));

  // Images
  if (scene.images && Object.keys(scene.images).length > 0) {
    const imgLines = ['images'];
    for (const [k, v] of Object.entries(scene.images)) {
      imgLines.push(`  ${k}: "${v}"`);
    }
    sections.push(imgLines.join('\n'));
  }

  // Styles
  if (scene.styles && Object.keys(scene.styles).length > 0) {
    for (const [name, style] of Object.entries(scene.styles)) {
      sections.push(formatStyle(name, style).join('\n'));
    }
  }

  // Objects
  if (scene.objects && scene.objects.length > 0) {
    const objLines: string[] = [];
    for (const obj of scene.objects) {
      objLines.push(...formatNode(obj, 0, options));
    }
    sections.push(objLines.join('\n'));
  }

  // Animation
  if (scene.animate) {
    sections.push(formatAnimate(scene.animate).join('\n'));
  }

  return sections.join('\n\n') + '\n';
}
