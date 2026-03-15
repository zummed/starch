import type {
  SceneObject,
  AnimConfig,
  BoxProps,
  CircleProps,
  LabelProps,
  TableProps,
  LineProps,
  PathProps,
  GroupProps,
  EasingName,
  Chapter,
  StarchEvent,
  StarchEventType,
  StarchEventHandler,
} from './types';
import { parseShape } from './schemas';
import { applyGroupLayouts } from '../engine/layout';

class AnimationBuilder {
  private config: AnimConfig;

  constructor(config: AnimConfig) {
    this.config = config;
  }

  at(
    time: number,
    target: string,
    prop: string,
    value: number | string | boolean,
    easing?: EasingName,
  ): this {
    this.config.keyframes.push({
      time,
      target,
      prop,
      value,
      easing: easing || 'linear',
    });
    return this;
  }

  chapter(time: number, id: string, title: string, description?: string): this {
    this.config.chapters.push({ id, time, title, description });
    return this;
  }
}

export class Scene {
  private _objects: Record<string, SceneObject> = {};
  private _animConfig: AnimConfig = {
    duration: 5,
    loop: true,
    keyframes: [],
    chapters: [],
  };
  private _listeners: Map<StarchEventType, Set<StarchEventHandler>> = new Map();

  // ── Object creation ─────────────────────────────

  box(id: string, props: Partial<BoxProps> & { w?: number; h?: number }): this {
    const inputKeys = new Set(Object.keys(props));
    const parsed = parseShape('box', props as Record<string, unknown>);
    this._objects[id] = { type: 'box', id, props: parsed as never, _inputKeys: inputKeys };
    return this;
  }

  circle(id: string, props: Partial<CircleProps> & { r?: number }): this {
    const inputKeys = new Set(Object.keys(props));
    const parsed = parseShape('circle', props as Record<string, unknown>);
    this._objects[id] = { type: 'circle', id, props: parsed as never, _inputKeys: inputKeys };
    return this;
  }

  label(id: string, props: Partial<LabelProps> & { text: string }): this {
    const inputKeys = new Set(Object.keys(props));
    const parsed = parseShape('label', props as Record<string, unknown>);
    this._objects[id] = { type: 'label', id, props: parsed as never, _inputKeys: inputKeys };
    return this;
  }

  table(id: string, props: Partial<TableProps> & { cols: string[] }): this {
    const inputKeys = new Set(Object.keys(props));
    const parsed = parseShape('table', props as Record<string, unknown>);
    this._objects[id] = { type: 'table', id, props: parsed as never, _inputKeys: inputKeys };
    return this;
  }

  line(id: string, props: Partial<LineProps>): this {
    const inputKeys = new Set(Object.keys(props));
    const parsed = parseShape('line', props as Record<string, unknown>);
    this._objects[id] = { type: 'line', id, props: parsed as never, _inputKeys: inputKeys };
    return this;
  }

  path(id: string, props: Partial<PathProps> & { points: Array<{ x: number; y: number }> }): this {
    const inputKeys = new Set(Object.keys(props));
    const parsed = parseShape('path', props as Record<string, unknown>);
    this._objects[id] = { type: 'path', id, props: parsed as never, _inputKeys: inputKeys };
    return this;
  }

  group(id: string, props: Partial<GroupProps> & { children?: string[] }): this {
    const inputKeys = new Set(Object.keys(props));
    const parsed = parseShape('group', props as Record<string, unknown>);
    this._objects[id] = { type: 'group', id, props: parsed as never, _inputKeys: inputKeys };
    // Mark children as belonging to this group
    const children = (parsed as Record<string, unknown>).children as string[] | undefined;
    if (children) {
      for (const childId of children) {
        if (this._objects[childId]) {
          this._objects[childId].groupId = id;
        }
      }
    }
    return this;
  }

  // ── Animation ───────────────────────────────────

  animate(opts: { duration: number; loop?: boolean }): AnimationBuilder {
    this._animConfig.duration = opts.duration;
    this._animConfig.loop = opts.loop ?? true;
    return new AnimationBuilder(this._animConfig);
  }

  // ── Events ──────────────────────────────────────

  on(type: StarchEventType, handler: StarchEventHandler): this {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type)!.add(handler);
    return this;
  }

  off(type: StarchEventType, handler: StarchEventHandler): this {
    this._listeners.get(type)?.delete(handler);
    return this;
  }

  emit(event: StarchEvent): void {
    this._listeners.get(event.type)?.forEach((handler) => handler(event));
  }

  // ── Accessors ───────────────────────────────────

  getObjects(): Record<string, SceneObject> {
    applyGroupLayouts(this._objects);
    return this._objects;
  }

  getAnimConfig(): AnimConfig {
    return this._animConfig;
  }

  getChapters(): Chapter[] {
    return this._animConfig.chapters;
  }
}
