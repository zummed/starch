import { useState } from 'react';
import type { NodeViewProps } from '../reactNodeView';

export function StyleBlockView({ node }: NodeViewProps & { contentDOM?: HTMLElement }) {
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
      {!collapsed && <div data-content-hole="" />}
    </div>
  );
}

export function AnimateBlockView({ node }: NodeViewProps & { contentDOM?: HTMLElement }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="section-block">
      <div
        className={`section-header ${collapsed ? 'collapsed' : ''}`}
        onClick={() => setCollapsed(prev => !prev)}
      >
        animate
      </div>
      {!collapsed && <div data-content-hole="" />}
    </div>
  );
}

export function ImagesBlockView({ node }: NodeViewProps & { contentDOM?: HTMLElement }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="section-block">
      <div
        className={`section-header ${collapsed ? 'collapsed' : ''}`}
        onClick={() => setCollapsed(prev => !prev)}
      >
        images
      </div>
      {!collapsed && <div data-content-hole="" />}
    </div>
  );
}
