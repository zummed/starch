import type { NodeViewProps } from '../reactNodeView';

export function KeyframeBlockView({ node }: NodeViewProps & { contentDOM?: HTMLElement }) {
  const time = node.attrs.time as number;
  const easing = node.attrs.easing as string;

  return (
    <div className="keyframe-block">
      <div className="keyframe-header">{time}{easing ? ` easing=${easing}` : ''}</div>
      <div data-content-hole="" />
    </div>
  );
}

export function KeyframeEntryView({ node }: NodeViewProps & { contentDOM?: HTMLElement }) {
  const target = node.attrs.target as string;
  const property = node.attrs.property as string;

  return (
    <div className="keyframe-entry">
      <span className="target">{target}</span>.
      <span className="property">{property}</span>{' '}
      <span data-content-hole="" />
    </div>
  );
}
