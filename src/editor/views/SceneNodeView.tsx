import React, { useState } from 'react';
import { useNodeViewContext } from '@prosemirror-adapter/react';

export function SceneNodeView() {
  const { node, contentRef } = useNodeViewContext();
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
      {!collapsed && <div ref={contentRef} />}
    </div>
  );
}
