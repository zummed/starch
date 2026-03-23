/**
 * DSL cursor-to-path mapping: given a cursor position in DSL text,
 * determine the model path and context for schema-driven completions/popups.
 *
 * Returns the same CursorContext interface as the JSON cursorPath module,
 * so consumers can work identically regardless of editor mode.
 */
import type { CursorContext } from './cursorPath';
import { tokenize } from '../dsl/tokenizer';
import type { Token } from '../dsl/types';

// ─── Known keyword sets ──────────────────────────────────────────

const GEOM_KEYWORDS = new Set([
  'rect', 'ellipse', 'text', 'image', 'camera', 'path',
]);

const DOC_KEYWORDS = new Set([
  'name', 'description', 'background', 'viewport', 'images', 'style', 'animate',
]);

const TEXT_BOOLEANS = new Set(['bold', 'mono']);
const PATH_BOOLEANS = new Set(['closed', 'smooth']);
const NODE_BOOLEANS = new Set(['active']);
const ALL_BOOLEANS = new Set([...TEXT_BOOLEANS, ...PATH_BOOLEANS, ...NODE_BOOLEANS]);

/** All keywords that are clickable node properties (not doc-level, not unknown). */
const CLICKABLE_PROPS = new Set([
  ...ALL_BOOLEANS,
  ...GEOM_KEYWORDS,
  'fill', 'stroke', 'opacity', 'visible', 'depth', 'slot',
]);

const TRANSFORM_PROPS = new Set(['rotation', 'scale', 'anchor', 'pathFollow', 'pathProgress', 'x', 'y']);
const TEXT_PROPS = new Set(['size', 'lineHeight', 'align', 'content', 'bold', 'mono']);
const RECT_PROPS = new Set(['w', 'h', 'radius']);
const ELLIPSE_PROPS = new Set(['rx', 'ry']);
const PATH_PROPS = new Set(['route', 'points', 'closed', 'smooth', 'bend', 'radius', 'gap', 'fromGap', 'toGap', 'drawProgress']);
const IMAGE_PROPS = new Set(['src', 'w', 'h', 'fit']);
const CAMERA_PROPS = new Set(['look', 'zoom', 'ratio', 'active']);

// ─── Section tracking ────────────────────────────────────────────

type Section = 'top' | 'node' | 'style' | 'animate' | 'images';

interface SectionInfo {
  section: Section;
  nodeId?: string;
  nodeIndex?: number;
  styleName?: string;
  geomType?: string;
}

/**
 * Get the DSL cursor context: map a position in DSL text to a JSON schema path.
 */
export function getDslCursorContext(text: string, cursorOffset: number): CursorContext {
  if (!text && cursorOffset <= 0) {
    // Empty document at start: top-level keyword position
    return { path: '', isPropertyName: true, prefix: '', currentKey: null };
  }
  if (!text) {
    return { path: '', isPropertyName: false, prefix: '', currentKey: null };
  }

  // Tokenize the full text (safely)
  let tokens: Token[];
  try {
    tokens = tokenize(text);
  } catch {
    return { path: '', isPropertyName: false, prefix: '', currentKey: null };
  }

  // Step 1: Determine which section we're in by walking tokens
  const sectionInfo = determineSectionAtCursor(tokens, cursorOffset);

  // Step 2: Analyze the current line text for immediate context
  const lineStart = text.lastIndexOf('\n', cursorOffset - 1) + 1;
  const lineTextToCursor = text.slice(lineStart, cursorOffset);

  // Step 3: Build the cursor context
  return buildContext(sectionInfo, lineTextToCursor, text, cursorOffset);
}

/**
 * Walk all tokens up to the cursor to determine which DSL section we're in.
 */
function determineSectionAtCursor(tokens: Token[], cursorOffset: number): SectionInfo {
  let section: Section = 'top';
  let nodeId: string | undefined;
  let nodeIndex = -1;
  let styleName: string | undefined;
  let geomType: string | undefined;
  let indentLevel = 0;

  // Track what's "active" at each indent level
  // Level 0 = top-level
  type Frame = { type: Section; nodeId?: string; nodeIndex?: number; styleName?: string; geomType?: string };
  const frameStack: Frame[] = [];
  let currentFrame: Frame = { type: 'top' };

  // Track whether the current node was defined on the current line (no indent yet)
  let inlineNodeId: string | undefined;
  let inlineNodeIndex: number | undefined;
  let inlineGeomType: string | undefined;

  // Preserve node info across a newline so an indent on the next line can still use it.
  // Cleared when anything other than indent follows.
  let pendingNodeId: string | undefined;
  let pendingNodeIndex: number | undefined;
  let pendingGeomType: string | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.offset >= cursorOffset) break;

    switch (tok.type) {
      case 'indent':
        indentLevel++;
        // Push the current inline node (or the one saved from the previous line) as a frame
        if (inlineNodeId !== undefined) {
          frameStack.push({ type: 'node', nodeId: inlineNodeId, nodeIndex: inlineNodeIndex, geomType: inlineGeomType });
          currentFrame = frameStack[frameStack.length - 1];
        } else if (pendingNodeId !== undefined) {
          frameStack.push({ type: 'node', nodeId: pendingNodeId, nodeIndex: pendingNodeIndex, geomType: pendingGeomType });
          currentFrame = frameStack[frameStack.length - 1];
        } else if (section === 'style' && styleName) {
          frameStack.push({ type: 'style', styleName });
          currentFrame = frameStack[frameStack.length - 1];
        } else if (section === 'animate') {
          frameStack.push({ type: 'animate' });
          currentFrame = frameStack[frameStack.length - 1];
        } else if (section === 'images') {
          frameStack.push({ type: 'images' });
          currentFrame = frameStack[frameStack.length - 1];
        } else {
          frameStack.push({ ...currentFrame });
          currentFrame = frameStack[frameStack.length - 1];
        }
        inlineNodeId = undefined;
        inlineNodeIndex = undefined;
        inlineGeomType = undefined;
        pendingNodeId = undefined;
        pendingNodeIndex = undefined;
        pendingGeomType = undefined;
        break;

      case 'dedent':
        indentLevel--;
        frameStack.pop();
        currentFrame = frameStack.length > 0 ? frameStack[frameStack.length - 1] : { type: 'top' };
        pendingNodeId = undefined;
        pendingNodeIndex = undefined;
        pendingGeomType = undefined;
        break;

      case 'newline':
        // When we go to a new line at the same indent level, an inline node definition ends
        // (unless it gets an indent on the next line — preserved via pending variables)
        pendingNodeId = inlineNodeId;
        pendingNodeIndex = inlineNodeIndex;
        pendingGeomType = inlineGeomType;
        inlineNodeId = undefined;
        inlineNodeIndex = undefined;
        inlineGeomType = undefined;
        break;

      case 'identifier': {
        const val = tok.value;

        // Top-level keywords (only at indent level 0 and no active frame)
        if (indentLevel === 0 && frameStack.length === 0) {
          if (val === 'style' && tokens[i + 1]?.type === 'identifier') {
            section = 'style';
            styleName = tokens[i + 1].value;
            continue;
          }
          if (val === 'animate') {
            section = 'animate';
            continue;
          }
          if (val === 'images') {
            section = 'images';
            continue;
          }
        }

        // Node definition: identifier followed by colon
        if (tokens[i + 1]?.type === 'colon' && tokens[i + 1]?.offset < cursorOffset) {
          const isTopLevel = indentLevel === 0 && frameStack.length === 0;
          const isInNode = currentFrame.type === 'node';

          if (isTopLevel && !DOC_KEYWORDS.has(val)) {
            nodeIndex++;
            section = 'node';
            nodeId = val;
            inlineNodeId = val;
            inlineNodeIndex = nodeIndex;
          } else if (isInNode) {
            // Child node
            inlineNodeId = val;
          }
        }

        // Geometry keyword (after a colon for a node)
        if (GEOM_KEYWORDS.has(val)) {
          if (inlineNodeId !== undefined) {
            inlineGeomType = val;
          }
          geomType = val;
        }
        break;
      }
    }
  }

  // Determine the final section info
  // If we're in an inline node (no indent yet), that takes precedence
  if (inlineNodeId !== undefined) {
    return {
      section: 'node',
      nodeId: inlineNodeId,
      nodeIndex: inlineNodeIndex,
      geomType: inlineGeomType || geomType,
    };
  }

  // If we have frames, use the current frame
  if (frameStack.length > 0) {
    return {
      section: currentFrame.type,
      nodeId: currentFrame.nodeId,
      nodeIndex: currentFrame.nodeIndex,
      styleName: currentFrame.styleName,
      geomType: currentFrame.geomType || geomType,
    };
  }

  // Top level
  if (section === 'animate') return { section: 'animate' };
  if (section === 'images') return { section: 'images' };
  if (section === 'style') return { section: 'style', styleName };

  return { section: 'top' };
}

/**
 * Build CursorContext by analyzing the current line text within the determined section.
 */
function buildContext(info: SectionInfo, lineTextToCursor: string, fullText: string, cursorOffset: number): CursorContext {
  const parts: string[] = [];
  let isPropertyName = false;
  let currentKey: string | null = null;

  // Extract prefix (partial word being typed)
  const wordMatch = lineTextToCursor.match(/[\w]+$/);
  const prefix = wordMatch ? wordMatch[0] : '';

  // Use raw line (not trimmed) for regex matching — trailing spaces matter
  const line = lineTextToCursor;

  // Detect immediate context from the line text
  const equalsMatch = line.match(/(\w+)\s*=\s*(\w*)$/);
  const fillStrokeMatch = !equalsMatch ? line.match(/\b(fill|stroke)\s+(\w*)$/) : null;
  const atTransformMatch = !equalsMatch && !fillStrokeMatch && /\bat\s+/.test(line);
  const atStyleMatch = !equalsMatch && /@(\w*)$/.test(line);
  const hasArrow = line.includes('->');

  // Detect if cursor is on a dimensions token (e.g., 55x100)
  const dimMatch = !equalsMatch && !fillStrokeMatch && detectDimensionsAtCursor(fullText, cursorOffset);
  // Detect if cursor is on a positional number (e.g., the 3rd number after "fill")
  const fillStrokeNumberMatch = !equalsMatch && detectFillStrokeNumber(fullText, cursorOffset);

  switch (info.section) {
    case 'top': {
      isPropertyName = true;
      break;
    }

    case 'node': {
      parts.push('objects');
      parts.push(String(info.nodeIndex ?? 0));

      if (dimMatch) {
        // Cursor is on a dimensions token like 55x100 — map to geometry w/h
        if (info.geomType === 'rect') {
          parts.push('rect');
          currentKey = dimMatch.half === 'w' ? 'w' : 'h';
          parts.push(currentKey);
        } else if (info.geomType === 'ellipse') {
          parts.push('ellipse');
          currentKey = dimMatch.half === 'w' ? 'rx' : 'ry';
          parts.push(currentKey);
        } else if (info.geomType === 'image') {
          parts.push('image');
          currentKey = dimMatch.half === 'w' ? 'w' : 'h';
          parts.push(currentKey);
        } else {
          isPropertyName = true;
        }
      } else if (fillStrokeNumberMatch) {
        // Cursor is on a number that's part of fill/stroke HSL values
        parts.push(fillStrokeNumberMatch.prop);
        currentKey = fillStrokeNumberMatch.component;
        parts.push(currentKey);
      } else if (equalsMatch) {
        const key = equalsMatch[1];
        currentKey = key;
        appendPropertyPath(parts, key, info.geomType);
      } else if (fillStrokeMatch) {
        parts.push(fillStrokeMatch[1]);
        currentKey = fillStrokeMatch[1];
      } else if (atTransformMatch) {
        parts.push('transform');
        currentKey = 'transform';
      } else if (atStyleMatch) {
        parts.push('style');
        currentKey = 'style';
      } else if (hasArrow) {
        parts.push('path');
        parts.push('route');
        currentKey = 'route';
      } else {
        // Cursor may be mid-word (e.g., clicking on "fi|ll" or "re|ct").
        // Extract the full word spanning the cursor position.
        const wordStart = lineTextToCursor.match(/(\w+)$/);
        const wordEnd = fullText.slice(cursorOffset).match(/^(\w*)/);
        const fullWord = (wordStart ? wordStart[1] : '') + (wordEnd ? wordEnd[1] : '');
        if (fullWord && CLICKABLE_PROPS.has(fullWord)) {
          appendPropertyPath(parts, fullWord, info.geomType);
          currentKey = fullWord;
        } else if (fullWord === 'at') {
          parts.push('transform');
          currentKey = 'transform';
        } else {
          isPropertyName = true;
        }
      }
      break;
    }

    case 'style': {
      parts.push('styles');
      if (info.styleName) parts.push(info.styleName);

      if (fillStrokeNumberMatch) {
        parts.push(fillStrokeNumberMatch.prop);
        currentKey = fillStrokeNumberMatch.component;
        parts.push(currentKey);
      } else if (equalsMatch) {
        parts.push(equalsMatch[1]);
        currentKey = equalsMatch[1];
      } else if (fillStrokeMatch) {
        parts.push(fillStrokeMatch[1]);
        currentKey = fillStrokeMatch[1];
      } else {
        isPropertyName = true;
      }
      break;
    }

    case 'animate': {
      parts.push('animate');

      if (equalsMatch) {
        parts.push(equalsMatch[1]);
        currentKey = equalsMatch[1];
      } else {
        isPropertyName = true;
      }
      break;
    }

    case 'images': {
      parts.push('images');
      isPropertyName = true;
      break;
    }
  }

  return {
    path: parts.join('.'),
    isPropertyName,
    prefix,
    currentKey,
  };
}

/**
 * Given a property key and the current geometry type, append the correct
 * sub-object path segments (e.g., "rect.radius", "transform.rotation").
 */
function appendPropertyPath(parts: string[], key: string, geomType?: string): void {
  if (TRANSFORM_PROPS.has(key)) {
    parts.push('transform', key);
  } else if (TEXT_PROPS.has(key)) {
    parts.push('text', key);
  } else if (RECT_PROPS.has(key) && (!geomType || geomType === 'rect')) {
    parts.push('rect', key);
  } else if (ELLIPSE_PROPS.has(key) && (!geomType || geomType === 'ellipse')) {
    parts.push('ellipse', key);
  } else if (PATH_PROPS.has(key)) {
    parts.push('path', key);
  } else if (IMAGE_PROPS.has(key) && (!geomType || geomType === 'image')) {
    parts.push('image', key);
  } else if (CAMERA_PROPS.has(key) && (!geomType || geomType === 'camera')) {
    parts.push('camera', key);
  } else {
    parts.push(key);
  }
}

/**
 * Detect if the cursor is on a dimensions token (e.g., "160x100").
 * Returns which half the cursor is in: 'w' (left of x) or 'h' (right of x).
 */
function detectDimensionsAtCursor(text: string, cursorOffset: number): { half: 'w' | 'h' } | null {
  // Search around cursor for a NxN pattern
  const start = Math.max(0, cursorOffset - 15);
  const end = Math.min(text.length, cursorOffset + 15);
  const region = text.slice(start, end);
  const localOffset = cursorOffset - start;

  // Find all dimension tokens in the region
  const re = /\d+x\d+/g;
  let m;
  while ((m = re.exec(region)) !== null) {
    const matchStart = m.index;
    const matchEnd = matchStart + m[0].length;
    if (localOffset >= matchStart && localOffset <= matchEnd) {
      const xPos = m[0].indexOf('x');
      const posInMatch = localOffset - matchStart;
      return { half: posInMatch <= xPos ? 'w' : 'h' };
    }
  }
  return null;
}

/**
 * Strip the model prefix from a path to get a schema-compatible path.
 * "objects.0.rect.w" -> "rect.w"
 * "styles.primary.fill.h" -> "fill.h"
 */
export function stripModelPrefix(path: string): string {
  const objMatch = path.match(/^objects\.\d+\.(.+)$/);
  if (objMatch) return objMatch[1];
  const styleMatch = path.match(/^styles\.[^.]+\.(.+)$/);
  if (styleMatch) return styleMatch[1];
  return path;
}

/**
 * Detect if the cursor is on one of the HSL number values after fill/stroke.
 * e.g., in "fill 210 70 45", clicking on "70" should resolve to fill.s
 */
function detectFillStrokeNumber(text: string, cursorOffset: number): { prop: string; component: string } | null {
  // Get the current line
  const lineStart = text.lastIndexOf('\n', cursorOffset - 1) + 1;
  const lineEnd = text.indexOf('\n', cursorOffset);
  const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
  const posInLine = cursorOffset - lineStart;

  // Match fill/stroke followed by numbers
  const re = /\b(fill|stroke)\s+(\d+)\s+(\d+)\s+(\d+)/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    const prop = m[1];
    // Find the positions of each number capture group
    let searchFrom = m.index + prop.length;

    // Find position of first number (h)
    const n1Start = line.indexOf(m[2], searchFrom);
    const n1End = n1Start + m[2].length;

    // Find position of second number (s)
    const n2Start = line.indexOf(m[3], n1End);
    const n2End = n2Start + m[3].length;

    // Find position of third number (l)
    const n3Start = line.indexOf(m[4], n2End);
    const n3End = n3Start + m[4].length;

    if (posInLine >= n1Start && posInLine <= n1End) {
      return { prop, component: 'h' };
    }
    if (posInLine >= n2Start && posInLine <= n2End) {
      return { prop, component: 's' };
    }
    if (posInLine >= n3Start && posInLine <= n3End) {
      return { prop, component: 'l' };
    }
  }
  return null;
}
