import React, { useState } from 'react';
import { useNodeViewContext } from '@prosemirror-adapter/react';

export function StyleBlockView() {
  const { node, contentRef } = useNodeViewContext();
  const [collapsed, setCollapsed] = useState(false);
  const name = node.attrs.name as string;

  return (
    <div className="section-block">
      <div
        className={`section-header ${collapsed ? 'collapsed' : ''}`}
        onClick={() => setCollapsed(prev => !prev)}
      >
        style {name}
      </div>
      {!collapsed && <div ref={contentRef} />}
    </div>
  );
}

export function AnimateBlockView() {
  const { node, contentRef } = useNodeViewContext();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="section-block">
      <div
        className={`section-header ${collapsed ? 'collapsed' : ''}`}
        onClick={() => setCollapsed(prev => !prev)}
      >
        animate
      </div>
      {!collapsed && <div ref={contentRef} />}
    </div>
  );
}

export function ImagesBlockView() {
  const { node, contentRef } = useNodeViewContext();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="section-block">
      <div
        className={`section-header ${collapsed ? 'collapsed' : ''}`}
        onClick={() => setCollapsed(prev => !prev)}
      >
        images
      </div>
      {!collapsed && <div ref={contentRef} />}
    </div>
  );
}
