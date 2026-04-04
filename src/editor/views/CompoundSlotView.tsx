import React, { useState } from 'react';
import { useNodeViewContext } from '@prosemirror-adapter/react';

export function CompoundSlotView() {
  const { node, contentRef } = useNodeViewContext();
  const [expanded, setExpanded] = useState(true);
  const key = node.attrs.key as string;

  return (
    <div className="compound-slot">
      <div className="compound-header" onClick={() => setExpanded(prev => !prev)}>
        {key}
      </div>
      {expanded && <div ref={contentRef} />}
    </div>
  );
}
