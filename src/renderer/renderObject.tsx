import React from 'react';
import type { SceneObject } from '../core/types';
import { BoxRenderer } from './svg/BoxRenderer';
import { CircleRenderer } from './svg/CircleRenderer';
import { LabelRenderer } from './svg/LabelRenderer';
import { TableRenderer } from './svg/TableRenderer';
import { LineRenderer } from './svg/LineRenderer';
import { PathRenderer } from './svg/PathRenderer';
import { GroupRenderer } from './svg/GroupRenderer';

type RenderFn = (id: string, obj: SceneObject) => React.ReactNode;

export function createRenderObject(
  animatedProps: Record<string, Record<string, unknown>>,
  objects: Record<string, SceneObject>,
  debug: boolean,
): RenderFn {
  const renderObject: RenderFn = (id, obj) => {
    const p = (animatedProps[id] || obj.props) as Record<string, unknown>;

    const isVisible = (p.visible as boolean) ?? true;
    if (!isVisible && !debug) return null;

    const children = p.children as string[] | undefined;
    if (children && children.length > 0 && obj.type !== 'group') {
      return (
        <GroupRenderer
          key={id}
          props={p}
          objects={objects}
          allProps={animatedProps}
          renderObject={renderObject}
        />
      );
    }

    switch (obj.type) {
      case 'box':
        return <BoxRenderer key={id} props={p} />;
      case 'circle':
        return <CircleRenderer key={id} props={p} />;
      case 'label':
        return <LabelRenderer key={id} props={p} />;
      case 'table':
        return <TableRenderer key={id} props={p} />;
      case 'line':
        return (
          <LineRenderer
            key={id}
            id={id}
            props={p}
            objects={objects}
            allProps={animatedProps}
            debug={debug}
          />
        );
      case 'path':
        return <PathRenderer key={id} props={p} debug={debug} />;
      case 'group':
        return (
          <GroupRenderer
            key={id}
            props={p}
            objects={objects}
            allProps={animatedProps}
            renderObject={renderObject}
          />
        );
      default:
        return null;
    }
  };
  return renderObject;
}
