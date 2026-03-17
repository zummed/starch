import type { SceneObject } from '../../../core/types';
import { createBox, updateBox, type BoxHandles } from './renderBox';
import { createCircle, updateCircle, type CircleHandles } from './renderCircle';
import { createLabel, updateLabel, type LabelHandles } from './renderLabel';
import { createTable, updateTable, type TableHandles } from './renderTable';
import { createLine, updateLine, type LineHandles } from './renderLine';
import { createPath, updatePath, type PathHandles } from './renderPath';
import { createTextblock, updateTextblock, type TextblockHandles } from './renderTextblock';

export type RenderObjectFn = (id: string, obj: SceneObject) => SVGElement | null;

type AnyHandles =
  | { type: 'box'; handles: BoxHandles }
  | { type: 'circle'; handles: CircleHandles }
  | { type: 'label'; handles: LabelHandles }
  | { type: 'table'; handles: TableHandles }
  | { type: 'line'; handles: LineHandles }
  | { type: 'path'; handles: PathHandles }
  | { type: 'textblock'; handles: TextblockHandles };

function getRootElement(entry: AnyHandles): SVGElement {
  return entry.handles.root;
}

export class RenderDispatcher {
  private cache = new Map<string, AnyHandles>();
  private container: SVGGElement;
  private debug = false;

  constructor(container: SVGGElement) {
    this.container = container;
  }

  setDebug(debug: boolean): void {
    this.debug = debug;
  }

  update(
    renderOrder: Array<[string, SceneObject]>,
    animatedProps: Record<string, Record<string, unknown>>,
    objects: Record<string, SceneObject>,
  ): void {
    const seen = new Set<string>();

    for (const [id, obj] of renderOrder) {
      seen.add(id);
      const p = (animatedProps[id] || obj.props) as Record<string, unknown>;

      const isVisible = (p.visible as boolean) ?? true;
      if (!isVisible && !this.debug) {
        // Remove if cached
        const cached = this.cache.get(id);
        if (cached) {
          getRootElement(cached).remove();
          this.cache.delete(id);
        }
        continue;
      }

      const cached = this.cache.get(id);

      if (cached && cached.type === obj.type) {
        this.updateCached(cached, id, p, objects, animatedProps);
      } else {
        // Remove old element if type changed
        if (cached) {
          getRootElement(cached).remove();
          this.cache.delete(id);
        }
        const entry = this.createEntry(id, obj.type, p, objects, animatedProps);
        if (entry) {
          this.cache.set(id, entry);
          this.container.appendChild(getRootElement(entry));
        }
      }
    }

    // Remove objects no longer in render order
    for (const [id, entry] of this.cache) {
      if (!seen.has(id)) {
        getRootElement(entry).remove();
        this.cache.delete(id);
      }
    }

    // Reorder DOM children to match render order
    let prevEl: SVGElement | null = null;
    for (const [id] of renderOrder) {
      const entry = this.cache.get(id);
      if (!entry) continue;
      const el = getRootElement(entry);
      if (prevEl) {
        if (prevEl.nextSibling !== el) {
          this.container.insertBefore(el, prevEl.nextSibling);
        }
      } else {
        if (this.container.firstChild !== el) {
          this.container.insertBefore(el, this.container.firstChild);
        }
      }
      prevEl = el;
    }
  }

  clear(): void {
    for (const [, entry] of this.cache) {
      getRootElement(entry).remove();
    }
    this.cache.clear();
  }

  private createEntry(
    id: string,
    type: string,
    props: Record<string, unknown>,
    objects: Record<string, SceneObject>,
    allProps: Record<string, Record<string, unknown>>,
  ): AnyHandles | null {
    switch (type) {
      case 'box':
        return { type: 'box', handles: createBox(props) };
      case 'circle':
        return { type: 'circle', handles: createCircle(props) };
      case 'label':
        return { type: 'label', handles: createLabel(props) };
      case 'table':
        return { type: 'table', handles: createTable(props) };
      case 'line':
        return { type: 'line', handles: createLine(props, objects, allProps, this.debug) };
      case 'path':
        return { type: 'path', handles: createPath(props, this.debug) };
      case 'textblock':
        return { type: 'textblock', handles: createTextblock(props, allProps, id) };
      default:
        return null;
    }
  }

  private updateCached(
    entry: AnyHandles,
    id: string,
    props: Record<string, unknown>,
    objects: Record<string, SceneObject>,
    allProps: Record<string, Record<string, unknown>>,
  ): void {
    switch (entry.type) {
      case 'box':
        updateBox(entry.handles, props);
        break;
      case 'circle':
        updateCircle(entry.handles, props);
        break;
      case 'label':
        updateLabel(entry.handles, props);
        break;
      case 'table':
        updateTable(entry.handles, props);
        break;
      case 'line':
        updateLine(entry.handles, props, objects, allProps, this.debug);
        break;
      case 'path':
        updatePath(entry.handles, props, this.debug);
        break;
      case 'textblock':
        updateTextblock(entry.handles, props, allProps, id);
        break;
    }
  }
}
