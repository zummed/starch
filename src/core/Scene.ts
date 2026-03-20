import type {
  SceneObject,
  AnimConfig,
  BoxProps,
  CircleProps,
  LabelProps,
  TableProps,
  LineProps,
  PathProps,
  EasingName,
  ObjectChanges,
  Chapter,
  StarchEvent,
  StarchEventType,
  StarchEventHandler,
} from './types';
import { parseShape } from './schemas';

class AnimationBuilder {
  private config: AnimConfig;

  constructor(config: AnimConfig) {
    this.config = config;
  }

  keyframe(
    time: number,
    changes: Record<string, ObjectChanges>,
    easing?: EasingName,
  ): this {
    this.config.keyframes.push({
      time,
      easing,
      changes,
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
  private _styles: Record<string, Record<string, unknown>> = {};
  private _nextOrder = 0;
  private _animConfig: AnimConfig = {
    duration: 5,
    loop: true,
    keyframes: [],
    chapters: [],
  };
  private _listeners: Map<StarchEventType, Set<StarchEventHandler>> = new Map();

  // ── Style definition ───────────────────────────

  defineStyle(name: string, props: Record<string, unknown>): this {
    this._styles[name] = props;
    return this;
  }

  // ── Object creation ─────────────────────────────

  box(id: string, props: Partial<BoxProps> & { w?: number; h?: number }): this {
    return this._addObject(id, 'box', props);
  }

  circle(id: string, props: Partial<CircleProps> & { r?: number }): this {
    return this._addObject(id, 'circle', props);
  }

  label(id: string, props: Partial<LabelProps> & { text: string }): this {
    return this._addObject(id, 'label', props);
  }

  table(id: string, props: Partial<TableProps> & { cols: string[] }): this {
    return this._addObject(id, 'table', props);
  }

  line(id: string, props: Partial<LineProps>): this {
    return this._addObject(id, 'line', props);
  }

  path(id: string, props: Partial<PathProps> & { points: Array<{ x: number; y: number }> }): this {
    return this._addObject(id, 'path', props);
  }

  private _addObject(id: string, type: string, props: Record<string, unknown>): this {
    const inputKeys = new Set(Object.keys(props));
    const parsed = parseShape(type as 'box', props);
    this._objects[id] = {
      type: type as 'box',
      id,
      props: parsed as never,
      _inputKeys: inputKeys,
      _definitionOrder: this._nextOrder++,
    };
    return this;
  }

  // ── Animation ───────────────────────────────────

  animate(opts: { duration: number; loop?: boolean; easing?: EasingName }): AnimationBuilder {
    this._animConfig.duration = opts.duration;
    this._animConfig.loop = opts.loop ?? true;
    this._animConfig.easing = opts.easing;
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

  getStyles(): Record<string, Record<string, unknown>> {
    return this._styles;
  }

  getChapters(): Chapter[] {
    return this._animConfig.chapters;
  }
}
