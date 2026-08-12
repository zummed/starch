/**
 * Tree-walking pass that measures text nodes every frame.
 * Stores _measured on text nodes for:
 *   - Multi-line SVG rendering (tspan)
 *   - Flex layout sizing
 *   - Viewport bounds estimation
 *
 * Templates use the measurer at parse time to size their geometry.
 * This pass owns _measured on text nodes and always re-runs so that
 * animated text content and updated measurements stay in sync.
 *
 * Optimisation: measurement results are cached per-node using a key
 * derived from (content, size, bold, mono, lineHeight, maxWidth).
 * The pass still walks the tree every frame, but skips the expensive
 * measurer call when inputs haven't changed.
 */
import type { Node } from '../types/node';
import type { TextMeasurer } from './measure';

const DEFAULT_PAD_X = 16;

/** Build a cheap cache key from measurement inputs. */
function measureKey(content: string, size: number | undefined, bold: boolean | undefined, mono: boolean | undefined, lineHeight: number | undefined, maxWidth: number | undefined): string {
  return `${content}\0${size ?? ''}\0${bold ? 1 : 0}\0${mono ? 1 : 0}\0${lineHeight ?? ''}\0${maxWidth ?? ''}`;
}

export function measureTextNodes(roots: Node[], measurer: TextMeasurer): void {
  for (const root of roots) {
    walkNode(root, measurer);
  }
}

/** Measure `node`'s text against `maxWidth`, reusing the cached result. */
function measureInto(node: Node, measurer: TextMeasurer, maxWidth: number | undefined): void {
  const t = node.text!;
  const key = measureKey(t.content, t.size, t.bold, t.mono, t.lineHeight, maxWidth);
  if ((node as any)._measureKey === key && node._measured) return;
  node._measured = measurer.measure(t.content, {
    size: t.size, bold: t.bold, mono: t.mono, lineHeight: t.lineHeight, maxWidth,
  });
  (node as any)._measureKey = key;
}

/**
 * Width the children of `node` wrap at, or undefined when `node` isn't a text
 * container. An explicit `_textMaxWidth` wins outright — a template that set
 * it knows its own padding, and it's the only source for containers whose
 * backing isn't a rect or ellipse (a halo-backed label has no backing shape
 * at all).
 */
function wrapWidth(node: Node): number | undefined {
  if (node._textMaxWidth !== undefined) return node._textMaxWidth;

  const padX = node._textPad?.x ?? DEFAULT_PAD_X;
  const rectChild = node.children.find(c => c.rect && c.rect.w > 0);
  if (rectChild) return rectChild.rect!.w - padX * 2;

  const ellipseChild = node.children.find(c => c.ellipse && c.ellipse.rx > 0);
  if (ellipseChild) return ellipseChild.ellipse!.rx * 2 * 0.7 - padX;

  return undefined;
}

function walkNode(node: Node, measurer: TextMeasurer): void {
  // Depth-first so parent shapes have up-to-date child measurements
  for (const child of node.children) {
    walkNode(child, measurer);
  }

  // Text nodes inside a container — wrap within the container's width
  const textChildren = node.children.filter(c => c.text);
  if (textChildren.length > 0) {
    const maxWidth = wrapWidth(node);
    if (maxWidth !== undefined) {
      if (maxWidth > 0) {
        for (const textChild of textChildren) {
          measureInto(textChild, measurer, maxWidth);
        }
      }
      return;
    }
  }

  // Standalone text node — measure natural width for flex layout / bounds
  if (node.text) {
    measureInto(node, measurer, node._textMaxWidth);
  }
}
