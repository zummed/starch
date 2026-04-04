import { useState } from 'react';
import type { NodeViewProps } from '../reactNodeView';

export function CompoundSlotView({ node }: NodeViewProps & { contentDOM?: HTMLElement }) {
  const [expanded, setExpanded] = useState(true);
  const key = node.attrs.key as string;

  return (
    <div className="compound-slot">
      <div className="compound-header" onClick={() => setExpanded(prev => !prev)}>
        {key}
      </div>
      {expanded && <div data-content-hole="" />}
    </div>
  );
}
