import type { Node } from './v2/types/node';
import type { AnimConfig, Tracks, TrackKeyframe } from './v2/types/animation';
import type { Chapter, StarchEvent, StarchEventHandler, DiagramHandle } from './core/types';
import { Scene } from './core/Scene';
import { parseScene } from './v2/parser/parser';
import { buildTimeline } from './v2/animation/timeline';
import { evaluateAllTracks } from './v2/animation/evaluator';
import { applyTrackValues } from './v2/animation/applyTracks';
import { runLayout } from './v2/layout/registry';
import { registerStrategy } from './v2/layout/registry';
import { flexStrategy } from './v2/layout/flex';
import { absoluteStrategy } from './v2/layout/absolute';
import { computeViewBox, lerpViewBox, type ViewBox } from './v2/renderer/camera';
import { createCanvas } from './renderer/svg/dom/renderCanvas';
import { V2DomRenderer } from './v2/renderer/domRenderer';
import { getActiveChapter } from './engine/evaluator';
import { convertOldFormat } from './v2/parser/compat';
import JSON5 from 'json5';

// Register layout strategies
registerStrategy('flex', flexStrategy);
registerStrategy('absolute', absoluteStrategy);

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
  private _renderer: V2DomRenderer;

  private _nodes: Node[] = [];
  private _styles: Record<string, any> = {};
  private _animConfig: AnimConfig = { duration: 5, loop: true, keyframes: [], chapters: [] };
  private _tracks: Tracks = new Map();
  private _chapters: Chapter[] = [];

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
    this._renderer = new V2DomRenderer(this._canvas.content);
    this._container.appendChild(this._canvas.svg);

    if (options) {
      this._speed = options.speed ?? 1;
      this._debug = options.debug ?? false;
      this._scene = options.scene;
      this._onEvent = options.onEvent;
      this._onChapterEnter = options.onChapterEnter;
      this._onChapterExit = options.onChapterExit;

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
  get chapters(): Chapter[] { return this._chapters; }
  get activeChapter(): Chapter | undefined { return getActiveChapter(this._chapters, this._time); }

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
    this._lastChapter = getActiveChapter(this._chapters, this._time);
    this._render();
  }

  setSpeed(speed: number): void {
    this._speed = speed;
  }

  nextChapter(): void {
    const sorted = [...this._chapters].sort((a, b) => a.time - b.time);
    const next = sorted.find((ch) => ch.time > this._time + 0.01);
    if (next) {
      this.seek(next.time);
      this.play();
    }
  }

  prevChapter(): void {
    const sorted = [...this._chapters].sort((a, b) => b.time - a.time);
    const prev = sorted.find((ch) => ch.time < this._time - 0.1);
    if (prev) {
      this.seek(prev.time);
      this.play();
    }
  }

  goToChapter(id: string): void {
    const ch = this._chapters.find((c) => c.id === id);
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
    this._renderer.clear();
    this._canvas.svg.remove();
    this._listeners.clear();
  }

  // ── Internal ──

  private _viewport = { width: 800, height: 500 };

  private _loadDSL(dsl: string): void {
    try {
      // Try v2 format first
      const scene = parseScene(dsl);
      this._nodes = scene.nodes;
      this._styles = scene.styles;
      this._animConfig = scene.animate ?? { duration: 5, loop: true, keyframes: [], chapters: [] };
      this._chapters = this._animConfig.chapters?.map(c => ({ id: c.name, name: c.name, title: c.name, time: c.time })) ?? [];

      if (scene.background) {
        this._canvas.setBackground(scene.background);
      }
      if (scene.viewport) {
        if (typeof scene.viewport === 'string') {
          const match = scene.viewport.match(/^(\d+)[x:](\d+)$/);
          if (match) {
            this._viewport = { width: parseInt(match[1]), height: parseInt(match[2]) };
          }
        } else if (typeof scene.viewport === 'object') {
          this._viewport = scene.viewport as { width: number; height: number };
        }
      }
    } catch {
      // Try converting from v1 format
      try {
        const raw = JSON5.parse(dsl);
        const converted = convertOldFormat(raw);
        const scene = parseScene(JSON.stringify(converted));
        this._nodes = scene.nodes;
        this._styles = scene.styles;
        this._animConfig = scene.animate ?? { duration: 5, loop: true, keyframes: [], chapters: [] };
        this._chapters = this._animConfig.chapters?.map(c => ({ id: c.name, name: c.name, title: c.name, time: c.time })) ?? [];
      } catch {
        // Keep previous state on parse error
        return;
      }
    }
    this._rebuild();
  }

  private _loadScene(scene: Scene): void {
    // Convert v1 Scene to v2 by serializing and parsing through compat layer
    const objects = scene.getObjects();
    const styles = scene.getStyles();
    const animConfig = scene.getAnimConfig();

    const raw = {
      objects: Object.values(objects).map(obj => ({
        type: obj.type,
        id: obj.id,
        ...obj.props,
      })),
      styles,
      animate: animConfig,
    };

    try {
      const converted = convertOldFormat(raw);
      const parsed = parseScene(JSON.stringify(converted));
      this._nodes = parsed.nodes;
      this._styles = parsed.styles;
      this._animConfig = parsed.animate ?? { duration: 5, loop: true, keyframes: [], chapters: [] };
      this._chapters = this._animConfig.chapters?.map(c => ({ id: c.name, name: c.name, title: c.name, time: c.time })) ?? [];
    } catch {
      return;
    }
    this._rebuild();
  }

  private _rebuild(): void {
    this._tracks = buildTimeline(this._animConfig);
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
    const active = getActiveChapter(this._chapters, this._time);
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
    // Evaluate all tracks at current time
    const values = evaluateAllTracks(this._tracks, this._time);

    // Apply evaluated values to node tree (immutable)
    const animated = applyTrackValues(this._nodes, values);

    // Run layout pass
    runLayout(animated);

    // Render to DOM
    this._renderer.update(animated);

    // Camera
    const cameraNode = animated.find(n => n.camera);
    if (cameraNode) {
      const vb = computeViewBox(cameraNode, animated, {
        x: 0, y: 0,
        w: this._viewport.width,
        h: this._viewport.height,
      });
      this._canvas.setViewBox(vb.x, vb.y, vb.w, vb.h);
    } else {
      this._canvas.clearViewBox();
    }
  }
}
