import React, { useState } from 'react';
import { useNodeViewContext } from '@prosemirror-adapter/react';
import { detectSchemaType, getPropertySchema } from '../../types/schemaRegistry';
import { NodeSchema } from '../../types/node';

export function PropertySlotView() {
  const { node, contentRef } = useNodeViewContext();
  const [showWidget, setShowWidget] = useState(false);

  const key = node.attrs.key as string;
  const schemaPath = node.attrs.schemaPath as string;
  const schema = getPropertySchema(schemaPath, NodeSchema);
  const schemaType = schema ? detectSchemaType(schema) : 'unknown';

  return (
    <div className="property-slot">
      <span className="key">{key}</span>
      <span className="value" ref={contentRef} />
      {schemaType === 'color' && (
        <span
          className="color-swatch"
          style={{ background: node.textContent }}
          onClick={() => setShowWidget(prev => !prev)}
        />
      )}
    </div>
  );
}
