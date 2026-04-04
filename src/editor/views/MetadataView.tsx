import type { NodeViewProps } from '../reactNodeView';

export function MetadataView({ node }: NodeViewProps & { contentDOM?: HTMLElement }) {
  const key = node.attrs.key as string;

  return (
    <div className="metadata-line">
      <span className="key">{key}</span>{' '}
      <span data-content-hole="" />
    </div>
  );
}
