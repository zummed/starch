import type { SceneObject, Chapter, AnimConfig, Tracks, StarchEvent, StarchEventHandler, DiagramHandle } from './core/types';
import { Scene } from './core/Scene';
import { parseDSL } from './parser/parser';
import { buildTimeline } from './engine/timeline';
import { createEvaluator, getActiveChapter } from './engine/evaluator';
import { computeRenderOrder } from './engine/renderOrder';
import { createCanvas } from './renderer/svg/dom/renderCanvas';
import { RenderDispatcher } from './renderer/svg/dom/renderObject';

export interface StarchDiagramOptions {
  dsl?: string;
  scene?: Scene;
  autoplay?: boolean;
  speed?: number;
  debug?: boolean;
  onEvent?: (event: StarchEvent) => void;
  onChapterEnter?: (event: StarchEvent) => void;
  onChapterExit?: (event: StarchEvent) => void;
}

export class StarchDiagram implements DiagramHandle {
  private _container: HTMLElement;
  private _canvas: ReturnType<typeof createCanvas>;
  private _dispatcher: RenderDispatcher;

  private _objects: Record<string, SceneObject> = {};
  private _animConfig: AnimConfig = { duration: 5, loop: true, keyframes: [], chapters: [] };
  private _tracks: Tracks = {};
  private _renderOrder: Array<[string, SceneObject]> = [];
  private _evaluator = createEvaluator();

  private _time = 0;
  private _playing = false;
  private _speed = 1;
  private _debug = false;
  private _lastChapter: Chapter | undefined = undefined;
  private _rafId: number | null = null;
  private _lastFrame = 0;

  private _scene: Scene | undefined;
  private _onEvent: StarchEventHandler | undefined;
  private _onChapterEnter: StarchEventHandler | undefined;
  private _onChapterExit: StarchEventHandler | undefined;
  private _listeners = new Map<string, Set<StarchEventHandler>>();

  constructor(container: HTMLElement, options?: StarchDiagramOptions) {
    this._container = container;
    this._canvas = createCanvas();
    this._dispatcher = new RenderDispatcher(this._canvas.content);
    this._container.appendChild(this._canvas.svg);

    if (options) {
      this._speed = options.speed ?? 1;
      this._debug = options.debug ?? false;
      this._scene = options.scene;
      this._onEvent = options.onEvent;
      this._onChapterEnter = options.onChapterEnter;
      this._onChapterExit = options.onChapterExit;
      this._dispatcher.setDebug(this._debug);

      if (options.scene) {
        this._loadScene(options.scene);
      } else if (options.dsl) {
        this._loadDSL(options.dsl);
      }

      if (options.autoplay) {
        this.play();
      }
    }
  }

  // ── Read-only state ──

  get time(): number { return this._time; }
  get duration(): number { return this._animConfig.duration ?? 5; }
  get playing(): boolean { return this._playing; }
  get speed(): number { return this._speed; }
  get chapters(): Chapter[] { return this._animConfig.chapters; }
  get activeChapter(): Chapter | undefined { return getActiveChapter(this._animConfig.chapters, this._time); }

  // ── Playback control ──

  play(): void {
    if (this._playing) return;
    this._playing = true;
    this._lastFrame = performance.now();
    this._scheduleFrame();
  }

  pause(): void {
    this._playing = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  seek(time: number): void {
    this._time = Math.max(0, Math.min(time, this._animConfig.duration ?? 5));
    this._evaluator.reset();
    this._lastChapter = getActiveChapter(this._animConfig.chapters, this._time);
    this._render();
  }

  setSpeed(speed: number): void {
    this._speed = speed;
  }

  nextChapter(): void {
    const sorted = [...this._animConfig.chapters].sort((a, b) => a.time - b.time);
    const next = sorted.find((ch) => ch.time > this._time + 0.01);
    if (next) {
      this.seek(next.time);
      this.play();
    }
  }

  prevChapter(): void {
    const sorted = [...this._animConfig.chapters].sort((a, b) => b.time - a.time);
    const prev = sorted.find((ch) => ch.time < this._time - 0.1);
    if (prev) {
      this.seek(prev.time);
      this.play();
    }
  }

  goToChapter(id: string): void {
    const ch = this._animConfig.chapters.find((c) => c.id === id);
    if (ch) {
      this.seek(ch.time);
      this.play();
    }
  }

  // ── Content ──

  setDSL(dsl: string): void {
    this._loadDSL(dsl);
    this._render();
  }

  setScene(scene: Scene): void {
    this._scene = scene;
    this._loadScene(scene);
    this._render();
  }

  setDebug(debug: boolean): void {
    this._debug = debug;
    this._dispatcher.setDebug(debug);
    this._render();
  }

  // ── Events ──

  on(type: string, handler: StarchEventHandler): void {
    let set = this._listeners.get(type);
    if (!set) {
      set = new Set();
      this._listeners.set(type, set);
    }
    set.add(handler);
  }

  off(type: string, handler: StarchEventHandler): void {
    this._listeners.get(type)?.delete(handler);
  }

  // ── Lifecycle ──

  destroy(): void {
    this.pause();
    this._dispatcher.clear();
    this._canvas.svg.remove();
    this._listeners.clear();
  }

  // ── Internal ──

  private _loadDSL(dsl: string): void {
    try {
      const result = parseDSL(dsl);
      this._objects = result.objects;
      this._animConfig = result.animConfig;
    } catch {
      // Keep previous state on parse error
      return;
    }
    this._rebuild();
  }

  private _loadScene(scene: Scene): void {
    this._objects = scene.getObjects();
    this._animConfig = scene.getAnimConfig();
    this._rebuild();
  }

  private _rebuild(): void {
    this._tracks = buildTimeline(this._animConfig, this._objects);
    this._evaluator.reset();
    const animatedProps = this._evaluator(this._objects, this._tracks, this._time);
    this._renderOrder = computeRenderOrder(this._objects, animatedProps);
  }

  private _scheduleFrame(): void {
    this._rafId = requestAnimationFrame((now) => this._tick(now));
  }

  private _tick(now: number): void {
    if (!this._playing) return;

    const dt = ((now - this._lastFrame) / 1000) * this._speed;
    this._lastFrame = now;

    const dur = this._animConfig.duration ?? 5;
    let next = this._time + dt;
    if (next >= dur) {
      if (this._animConfig.loop ?? true) {
        next = next % dur;
      } else {
        next = dur;
        this._playing = false;
      }
    }
    this._time = next;

    this._checkChapters();
    this._render();

    if (this._playing) {
      this._scheduleFrame();
    }
  }

  private _checkChapters(): void {
    const active = getActiveChapter(this._animConfig.chapters, this._time);
    const prev = this._lastChapter;

    if (active && active !== prev) {
      if (prev) {
        const exitEvent: StarchEvent = { type: 'chapterExit', chapter: prev, time: this._time };
        this._onChapterExit?.(exitEvent);
        this._onEvent?.(exitEvent);
        this._scene?.emit(exitEvent);
        this._emitToListeners('chapterExit', exitEvent);
      }
      const enterEvent: StarchEvent = { type: 'chapterEnter', chapter: active, time: this._time };
      this._onChapterEnter?.(enterEvent);
      this._onEvent?.(enterEvent);
      this._scene?.emit(enterEvent);
      this._emitToListeners('chapterEnter', enterEvent);

      if (this._playing && prev !== undefined) {
        this.pause();
      }
      this._lastChapter = active;
    }
  }

  private _emitToListeners(type: string, event: StarchEvent): void {
    const handlers = this._listeners.get(type);
    if (handlers) {
      for (const handler of handlers) handler(event);
    }
    const allHandlers = this._listeners.get('event');
    if (allHandlers) {
      for (const handler of allHandlers) handler(event);
    }
  }

  private _render(): void {
    const animatedProps = this._evaluator(this._objects, this._tracks, this._time);
    this._dispatcher.update(this._renderOrder, animatedProps, this._objects);
  }
}
