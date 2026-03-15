import type {
  SceneObject,
  AnimConfig,
  BoxProps,
  CircleProps,
  TextProps,
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

  box(id: string, props: BoxProps): this {
    this._objects[id] = { type: 'box', id, props };
    return this;
  }

  circle(id: string, props: CircleProps): this {
    this._objects[id] = { type: 'circle', id, props };
    return this;
  }

  text(id: string, props: TextProps): this {
    this._objects[id] = { type: 'text', id, props };
    return this;
  }

  table(id: string, props: TableProps): this {
    this._objects[id] = { type: 'table', id, props };
    return this;
  }

  line(id: string, props: LineProps): this {
    this._objects[id] = { type: 'line', id, props };
    return this;
  }

  path(id: string, props: PathProps): this {
    this._objects[id] = { type: 'path', id, props };
    return this;
  }

  group(id: string, props: GroupProps): this {
    this._objects[id] = { type: 'group', id, props };
    // Mark children as belonging to this group
    for (const childId of props.children) {
      if (this._objects[childId]) {
        this._objects[childId].groupId = id;
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
    return this._objects;
  }

  getAnimConfig(): AnimConfig {
    return this._animConfig;
  }

  getChapters(): Chapter[] {
    return this._animConfig.chapters;
  }
}
