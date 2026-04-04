import React from 'react';
import { useNodeViewContext } from '@prosemirror-adapter/react';

export function KeyframeBlockView() {
  const { node, contentRef } = useNodeViewContext();
  const time = node.attrs.time as number;

  return (
    <div className="keyframe-block">
      <div className="keyframe-header">{time}</div>
      <div ref={contentRef} />
    </div>
  );
}

export function KeyframeEntryView() {
  const { node, contentRef } = useNodeViewContext();
  const target = node.attrs.target as string;
  const property = node.attrs.property as string;

  return (
    <div className="keyframe-entry">
      <span className="target">{target}</span>.
      <span className="property">{property}</span>{' '}
      <span ref={contentRef} />
    </div>
  );
}
