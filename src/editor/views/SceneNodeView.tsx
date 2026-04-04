import { buildInlineSummary } from './inlineSummary';
import type { NodeViewProps } from '../reactNodeView';

export function SceneNodeView({ node, view, getPos }: NodeViewProps & { contentDOM?: HTMLElement }) {
  const id = node.attrs.id as string;
  const display = node.attrs.display as string;
  const isInline = display === 'inline';

  const toggleDisplay = () => {
    const pos = getPos();
    if (pos === undefined) return;
    const newDisplay = isInline ? 'block' : 'inline';
    const tr = view.state.tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      display: newDisplay,
    });
    view.dispatch(tr);
  };

  return (
    <div className={`scene-node ${isInline ? 'inline' : 'block'}`}>
      <div className="scene-node-header">
        <span className="fold-marker" onClick={toggleDisplay}>
          {isInline ? '▶' : '▼'}
        </span>
        <span className="scene-node-id">{id}</span>
        {isInline && (
          <span className="scene-node-inline-summary">
            {buildInlineSummary(node)}
          </span>
        )}
      </div>
      {!isInline && <div data-content-hole="" />}
    </div>
  );
}
