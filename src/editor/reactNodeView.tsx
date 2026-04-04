/**
 * Lightweight React NodeView adapter for ProseMirror.
 *
 * Replaces @prosemirror-adapter/react, which is incompatible with React 19's
 * flushSync restrictions. Uses createRoot to mount React components into
 * ProseMirror's NodeView DOM elements.
 */
import { createRoot, type Root } from 'react-dom/client';
import { createElement, type ComponentType } from 'react';
import type { Node as PmNode } from 'prosemirror-model';
import type { EditorView, NodeView, Decoration, DecorationSource } from 'prosemirror-view';

/** Props passed to every React NodeView component. */
export interface NodeViewProps {
  node: PmNode;
  view: EditorView;
  getPos: () => number | undefined;
  selected: boolean;
}

type NodeViewFactory = (
  node: PmNode,
  view: EditorView,
  getPos: () => number | undefined,
  decorations: readonly Decoration[],
  innerDecorations: DecorationSource,
) => NodeView;

/**
 * Create a ProseMirror NodeView factory from a React component.
 *
 * The returned factory produces NodeViews that:
 *   - Mount a React component via createRoot (no flushSync)
 *   - Provide a `contentDOM` element for ProseMirror to manage child content
 *   - Re-render on node updates
 *   - Clean up the React root on destroy
 *
 * @param Component - React component that accepts NodeViewProps + children
 * @param opts.contentAs - HTML tag for the content container (default: 'div')
 * @param opts.atom - If true, there is no content hole (leaf node)
 */
export function reactNodeView(
  Component: ComponentType<NodeViewProps & { contentDOM?: HTMLElement }>,
  opts?: { contentAs?: string; atom?: boolean },
): NodeViewFactory {
  return (node, view, getPos) => {
    // Outer DOM element that ProseMirror manages.
    const dom = document.createElement('div');
    dom.setAttribute('data-node-type', node.type.name);

    // Content DOM where ProseMirror renders child nodes / text.
    let contentDOM: HTMLElement | undefined;
    if (!opts?.atom && !node.type.spec.atom) {
      contentDOM = document.createElement(opts?.contentAs ?? 'div');
      contentDOM.setAttribute('data-content', 'true');
    }

    let root: Root | null = createRoot(dom);
    let currentNode = node;
    let selected = false;

    function render() {
      if (!root) return;
      root.render(
        createElement(Component, {
          node: currentNode,
          view,
          getPos,
          selected,
          contentDOM,
        }),
      );
    }

    render();

    // After React renders, we need to append contentDOM into the React tree.
    // We use a MutationObserver to wait for the [data-content-hole] element.
    if (contentDOM) {
      const appendContent = () => {
        const hole = dom.querySelector('[data-content-hole]');
        if (hole && !hole.contains(contentDOM!)) {
          hole.appendChild(contentDOM!);
        }
      };

      // Try immediately (sync render might already have run)
      queueMicrotask(appendContent);

      // Also observe for async renders
      const observer = new MutationObserver(appendContent);
      observer.observe(dom, { childList: true, subtree: true });

      // Clean up observer after a reasonable time
      setTimeout(() => observer.disconnect(), 1000);
    }

    return {
      dom,
      contentDOM,

      update(updatedNode: PmNode): boolean {
        if (updatedNode.type !== currentNode.type) return false;
        currentNode = updatedNode;
        render();

        // Reattach or detach contentDOM after React re-renders.
        // When a node toggles between inline/block, the [data-content-hole]
        // element may appear or disappear.
        if (contentDOM) {
          queueMicrotask(() => {
            const hole = dom.querySelector('[data-content-hole]');
            if (hole && !hole.contains(contentDOM!)) {
              hole.appendChild(contentDOM!);
            } else if (!hole && contentDOM!.parentNode) {
              contentDOM!.remove();
            }
          });
        }

        return true;
      },

      selectNode() {
        selected = true;
        render();
      },

      deselectNode() {
        selected = false;
        render();
      },

      destroy() {
        if (root) {
          // Defer unmount to avoid React warnings about sync unmounting
          const r = root;
          root = null;
          setTimeout(() => r.unmount(), 0);
        }
      },

      // Let ProseMirror handle mutations inside the contentDOM.
      ignoreMutation(mutation: MutationRecord | { type: 'selection'; target: Node }) {
        if (!contentDOM) return true;
        // Selection mutations must NOT be ignored — ProseMirror needs them
        // to track cursor position from clicks.
        if (mutation.type === 'selection') return false;
        // DOM mutations inside contentDOM are ProseMirror's responsibility.
        if ('target' in mutation) return !contentDOM.contains(mutation.target);
        return true;
      },

      stopEvent() {
        return false;
      },
    };
  };
}
