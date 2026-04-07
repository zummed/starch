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
 */
import type { Node } from '../types/node';
import type { TextMeasurer } from './measure';

const DEFAULT_PAD_X = 16;

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
            textChild._measured = measurer.measure(t.content, {
              size: t.size, bold: t.bold, mono: t.mono, lineHeight: t.lineHeight, maxWidth,
            });
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
            textChild._measured = measurer.measure(t.content, {
              size: t.size, bold: t.bold, mono: t.mono, lineHeight: t.lineHeight, maxWidth,
            });
          }
        }
        return;
      }
    }
  }

  // Standalone text node — measure natural width for flex layout / bounds
  if (node.text) {
    node._measured = measurer.measure(node.text.content, {
      size: node.text.size,
      bold: node.text.bold,
      mono: node.text.mono,
      lineHeight: node.text.lineHeight,
    });
  }
}
