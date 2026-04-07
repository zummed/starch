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

function walkNode(node: Node, measurer: TextMeasurer): void {
  // Depth-first so parent shapes have up-to-date child measurements
  for (const child of node.children) {
    walkNode(child, measurer);
  }

  // Text nodes inside a shape — wrap within the shape's width
  if (node.children.length >= 2) {
    const textChildren = node.children.filter(c => c.text);

    if (textChildren.length > 0) {
      const rectChild = node.children.find(c => c.rect && c.rect.w > 0);
      if (rectChild) {
        const padX = node._textPad?.x ?? DEFAULT_PAD_X;
        const maxWidth = node._textMaxWidth ?? (rectChild.rect!.w - padX * 2);
        if (maxWidth > 0) {
          for (const textChild of textChildren) {
            const t = textChild.text!;
            const key = measureKey(t.content, t.size, t.bold, t.mono, t.lineHeight, maxWidth);
            if ((textChild as any)._measureKey === key && textChild._measured) continue;
            textChild._measured = measurer.measure(t.content, {
              size: t.size, bold: t.bold, mono: t.mono, lineHeight: t.lineHeight, maxWidth,
            });
            (textChild as any)._measureKey = key;
          }
        }
        return;
      }

      const ellipseChild = node.children.find(c => c.ellipse && c.ellipse.rx > 0);
      if (ellipseChild) {
        const padX = node._textPad?.x ?? DEFAULT_PAD_X;
        const maxWidth = node._textMaxWidth ?? (ellipseChild.ellipse!.rx * 2 * 0.7 - padX);
        if (maxWidth > 0) {
          for (const textChild of textChildren) {
            const t = textChild.text!;
            const key = measureKey(t.content, t.size, t.bold, t.mono, t.lineHeight, maxWidth);
            if ((textChild as any)._measureKey === key && textChild._measured) continue;
            textChild._measured = measurer.measure(t.content, {
              size: t.size, bold: t.bold, mono: t.mono, lineHeight: t.lineHeight, maxWidth,
            });
            (textChild as any)._measureKey = key;
          }
        }
        return;
      }
    }
  }

  // Standalone text node — measure natural width for flex layout / bounds
  if (node.text) {
    const key = measureKey(node.text.content, node.text.size, node.text.bold, node.text.mono, node.text.lineHeight, undefined);
    if ((node as any)._measureKey === key && node._measured) return;
    node._measured = measurer.measure(node.text.content, {
      size: node.text.size,
      bold: node.text.bold,
      mono: node.text.mono,
      lineHeight: node.text.lineHeight,
    });
    (node as any)._measureKey = key;
  }
}
