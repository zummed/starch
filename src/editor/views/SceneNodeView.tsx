import { useState } from 'react';
import type { NodeViewProps } from '../reactNodeView';

export function SceneNodeView({ node, contentDOM }: NodeViewProps & { contentDOM?: HTMLElement }) {
  const [collapsed, setCollapsed] = useState(false);
  const id = node.attrs.id as string;

  return (
    <div className={`scene-node ${collapsed ? 'collapsed' : ''}`}>
      <div className="scene-node-header">
        <span className="fold-marker" onClick={() => setCollapsed(prev => !prev)}>
          {collapsed ? '▶' : '▼'}
        </span>
        <span className="scene-node-id">{id}</span>
      </div>
      {!collapsed && <div data-content-hole="" />}
    </div>
  );
}
