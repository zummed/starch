import React from 'react';
import { useNodeViewContext } from '@prosemirror-adapter/react';

export function MetadataView() {
  const { node, contentRef } = useNodeViewContext();
  const key = node.attrs.key as string;

  return (
    <div className="metadata-line">
      <span className="key">{key}</span>{' '}
      <span ref={contentRef} />
    </div>
  );
}
