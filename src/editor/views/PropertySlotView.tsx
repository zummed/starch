import { detectSchemaType, getPropertySchema } from '../../types/schemaRegistry';
import { NodeSchema } from '../../types/node';
import type { NodeViewProps } from '../reactNodeView';

export function PropertySlotView({ node }: NodeViewProps & { contentDOM?: HTMLElement }) {
  const key = node.attrs.key as string;
  const schemaPath = node.attrs.schemaPath as string;
  const schema = getPropertySchema(schemaPath, NodeSchema);
  const schemaType = schema ? detectSchemaType(schema) : 'unknown';

  return (
    <div className="property-slot">
      <span className="key">{key}</span>
      <span className="value" data-content-hole="" />
      {schemaType === 'color' && (
        <span
          className="color-swatch"
          style={{ background: node.textContent }}
        />
      )}
    </div>
  );
}
